"""
Servidor FastAPI v2.0 conectado 100% a NASA/IPAC IRSA TAP/IBE y CDS Gaia/AllWISE.
"""

import logging
import time
from pathlib import Path
from typing import Dict, Any, List, Tuple
import numpy as np

from fastapi import FastAPI, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, Response
from fastapi.staticfiles import StaticFiles

from src.config import (
    STATIC_DIR,
    MANDATORY_TARGETS,
    REFERENCE_MOLECULES,
    DEFAULT_FOV_DEG,
)
from src.schemas import (
    ExploreResponse,
    TargetInfo,
    EpochFrame,
    AIDetection,
    SpectrumResponse,
    SpectrumPoint,
    MoleculeBand,
    SpectralDiagnosis,
)
from src.irsa_client import obtain_real_fits_for_coordinates
from src.pipeline import (
    build_common_target_wcs,
    load_and_clean_real_fits,
    align_coadd_and_diff,
    matrix_to_base64_png,
    extract_real_spectrum_at_coord,
)
from src.ai_detector import detect_anomalies_on_diff, classify_spectrum_molecules, _crossmatch_cached

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("spherex.api")

# Caché en memoria de respuestas /api/explore (misma región = respuesta instantánea)
_EXPLORE_CACHE: Dict[tuple, Any] = {}
_EXPLORE_CACHE_MAX = 16

app = FastAPI(
    title="Papastronomy v2.0 - NASA SPHEREx & IRSA Live Discovery API",
    description="Motor astrofísico conectado en vivo a NASA/IPAC IRSA (TAP + Cutout Service) y Gaia DR3 / AllWISE.",
    version="2.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/targets")
def get_mandatory_targets() -> Dict[str, List[Dict[str, Any]]]:
    """Devuelve los 5 objetos obligatorios de prueba del desafío de la NASA."""
    return {"MANDATORY_TARGETS": MANDATORY_TARGETS}


@app.get("/api/explore", response_model=ExploreResponse)
def explore_sky_region(
    ra: float = Query(133.795129, ge=0.0, le=360.0, description="Ascensión Recta en grados decimales (ICRS)"),
    dec: float = Query(-7.245147, ge=-90.0, le=90.0, description="Declinación en grados decimales (ICRS)"),
    fov: float = Query(DEFAULT_FOV_DEG, gt=0.005, le=1.0, description="Campo de visión (FoV) en grados"),
    refresh: bool = Query(False, description="Forzar re-descarga en vivo desde NASA/IPAC IRSA"),
) -> ExploreResponse:
    """
    Consulta en vivo NASA/IPAC IRSA (o lee los archivos .FITS reales ya descargados en caché),
    limpia la máscara FLAGS, sustrae el fondo con SEP, alinea las épocas con `reproject_interp`,
    calcula `coadd` y `diff`, y detecta dipolos/variables cruzándolos con Gaia DR3 y AllWISE.
    """
    cache_key = (round(ra, 5), round(dec, 5), round(fov, 4))
    if not refresh and cache_key in _EXPLORE_CACHE:
        logger.info("explore: respuesta servida desde caché en memoria %s", cache_key)
        return _EXPLORE_CACHE[cache_key]

    t0 = time.perf_counter()
    try:
        frames_meta, matched_meta, data_source, tap_query = obtain_real_fits_for_coordinates(
            ra, dec, fov_deg=fov, max_epochs=10, force_refresh=refresh
        )
        t_irsa = time.perf_counter()
        # Verificar que hay datos disponibles (P2-005: validación de datos)
        if not frames_meta:
            raise RuntimeError(f"No se encontraron datos para RA={ra:.4f}, Dec={dec:.4f}, FoV={fov}º")
        
        # Cargar y limpiar cada recorte; los que fallen se omiten
        cleaned_epochs: List[Dict[str, Any]] = []
        for fm in frames_meta[:10]:
            p = Path(fm["local_path"])
            if not p.exists():
                continue
            try:
                ep = load_and_clean_real_fits([p])
            except Exception as e:
                logger.warning("Se omite %s: %s", p.name, e)
                continue
            ep["cutout_url"] = fm.get("cutout_url", "")
            # el manifest de irsa_client trae obs_time y detector_band: tienen prioridad
            ep["obs_time"] = str(fm.get("obs_time") or ep.get("obs_time") or "")
            ep["detector"] = str(fm.get("detector_band") or ep.get("detector") or "")
            cleaned_epochs.append(ep)

        if not cleaned_epochs:
            raise RuntimeError("Ningun FITS pudo cargarse correctamente")
        t_load = time.perf_counter()

        target_wcs, shape_out = build_common_target_wcs(ra, dec, fov)
        
        # Verificar que WCS se construyó correctamente (P1-001)
        if target_wcs is None:
            logger.warning("No se pudo construir WCS para (%.4f, %.4f), FoV=%.3f", ra, dec, fov)
            raise HTTPException(status_code=503, detail="WCS invalido para estas coordenadas o campo de visión")

        aligned_imgs, aligned_flags, coadd_img, diff_img = align_coadd_and_diff(
            cleaned_epochs, target_wcs, shape_out
        )

        t_align = time.perf_counter()

        epoch_frames: List[EpochFrame] = []
        for idx, (ep_meta, al_img, al_flg) in enumerate(zip(cleaned_epochs, aligned_imgs, aligned_flags)):
            epoch_frames.append(
                EpochFrame(
                    index=idx,
                    obs_time=ep_meta["obs_time"],
                    detector=ep_meta["detector"],
                    wavelength_center_um=ep_meta["wavelength_center_um"],
                    cutout_url=ep_meta["cutout_url"],
                    image_base64=matrix_to_base64_png(al_img, mode="science"),
                    flags_base64=matrix_to_base64_png(al_flg, mode="flags"),
                    clean_pixels_pct=ep_meta["clean_pixels_pct"],
                )
            )

        coadd_b64 = matrix_to_base64_png(coadd_img, mode="science")
        diff_b64 = matrix_to_base64_png(diff_img, mode="diff")

        t_png = time.perf_counter()
        raw_detections = detect_anomalies_on_diff(
            diff_img, target_wcs, fov_deg=fov, epochs_meta=cleaned_epochs, threshold_sigma=4.0,
            do_crossmatch=False,  # el cruce con catálogos se pide aparte (/api/crossmatch) para no bloquear la carga
        )
        ai_detections = [AIDetection(**det) for det in raw_detections]

        target_info = TargetInfo(
            ra=round(ra, 6),
            dec=round(dec, 6),
            fov=round(fov, 4),
            total_frames=len(epoch_frames),
            matched_target_id=matched_meta["id"] if matched_meta else None,
            matched_target_name=matched_meta["name"] if matched_meta else None,
            matched_description=matched_meta["description"] if matched_meta else None,
            data_source=data_source,
            tap_query_executed=tap_query,
        )

        response = ExploreResponse(
            target_info=target_info,
            epochs=epoch_frames,
            coadd_image_base64=coadd_b64,
            diff_image_base64=diff_b64,
            ai_detections=ai_detections,
        )

        t_ai = time.perf_counter()
        logger.info(
            "explore %s tiempos(s): IRSA/caché-disco=%.2f carga FITS=%.2f alineación=%.2f PNGs=%.2f IA+catálogos=%.2f TOTAL=%.2f",
            cache_key, t_irsa - t0, t_load - t_irsa, t_align - t_load, t_png - t_align, t_ai - t_png, t_ai - t0,
        )
        if len(_EXPLORE_CACHE) >= _EXPLORE_CACHE_MAX:
            _EXPLORE_CACHE.pop(next(iter(_EXPLORE_CACHE)))
        _EXPLORE_CACHE[cache_key] = response
        return response
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Error procesando datos reales en /api/explore:")
        raise HTTPException(status_code=502, detail=f"Error comunicando con NASA/IPAC IRSA: {exc}") from exc


@app.get("/api/crossmatch")
def crossmatch_one(
    ra: float = Query(..., ge=0.0, le=360.0),
    dec: float = Query(..., ge=-90.0, le=90.0),
    radius: float = Query(14.0, gt=0.0, le=60.0, description="Radio de búsqueda en arcsec"),
) -> Dict[str, Any]:
    """Cruce en vivo con AllWISE / Gaia DR3 para UNA posición (con caché en memoria)."""
    return {"catalog_match": _crossmatch_cached(ra, dec, radius)}


@app.get("/api/spectrum", response_model=SpectrumResponse)
def get_point_spectrum(
    ra: float = Query(..., ge=0.0, le=360.0),
    dec: float = Query(..., ge=-90.0, le=90.0),
    center_ra: float | None = Query(None),
    center_dec: float | None = Query(None),
    fov: float = Query(DEFAULT_FOV_DEG, gt=0.005, le=1.0),
) -> SpectrumResponse:
    """
    Extrae la fotometría de apertura real y las longitudes de onda (vía `WCS key='W'` o headers calibrados)
    sobre todos los recortes .FITS reales descargados para esa región.
    """
    ref_ra = center_ra if center_ra is not None else ra
    ref_dec = center_dec if center_dec is not None else dec

    frames_meta, _, _, _ = obtain_real_fits_for_coordinates(ref_ra, ref_dec, fov_deg=fov, max_epochs=10)
    
    # Verificar que hay datos disponibles (P2-005: validación de datos)
    if not frames_meta:
        raise RuntimeError(f"No se encontraron datos para RA={ref_ra:.4f}, Dec={ref_dec:.4f}, FoV={fov}º")
    
    target_wcs, _ = build_common_target_wcs(ref_ra, ref_dec, fov)

    # Verificar que WCS se construyó correctamente (P1-001 - Endpoint /api/spectrum)
    if target_wcs is None:
        logger.warning("No se pudo construir WCS para (%.4f, %.4f), FoV=%.3f", ref_ra, ref_dec, fov)
        raise HTTPException(status_code=503, detail="WCS invalido para estas coordenadas o campo de visión")

    # Extraer fotometría en la coordenada seleccionada (ra, dec) proyectada sobre el WCS común (ref_ra, ref_dec)
    x_pix, y_pix, spectrum_raw = extract_real_spectrum_at_coord(ra, dec, frames_meta, target_wcs)
    diagnosis_raw = classify_spectrum_molecules(spectrum_raw)

    return SpectrumResponse(
        ra=round(ra, 6),
        dec=round(dec, 6),
        x_pix=x_pix,
        y_pix=y_pix,
        total_bands_sampled=len(spectrum_raw),
        spectrum=[SpectrumPoint(**pt) for pt in spectrum_raw],
        reference_molecules=[MoleculeBand(**m) for m in REFERENCE_MOLECULES],
        ai_diagnosis=SpectralDiagnosis(**diagnosis_raw),
    )


@app.get("/static/app.js")
def serve_app_js() -> Response:
    js_content = (STATIC_DIR / "app.js").read_text(encoding="utf-8")
    return Response(
        content=js_content,
        media_type="application/javascript; charset=utf-8",
        headers={
            "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
            "Pragma": "no-cache",
            "Expires": "0",
        },
    )


app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")


@app.get("/")
def serve_frontend() -> HTMLResponse:
    html_content = (STATIC_DIR / "index.html").read_text(encoding="utf-8")
    bust = int(time.time())
    html_content = html_content.replace("/static/app.js?v=2.4", f"/static/app.js?v={bust}")
    return HTMLResponse(
        content=html_content,
        headers={
            "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
            "Pragma": "no-cache",
            "Expires": "0",
        },
    )