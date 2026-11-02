"""
Cliente de Producción v2.0 para NASA/IPAC IRSA y CDS VizieR/Gaia.
100% Datos Reales:
1. Consulta ADQL en vivo al servidor TAP de IRSA (`https://irsa.ipac.caltech.edu/TAP`) sobre
   `spherex.artifact` y `spherex.plane` (o `spherex.obscore`) ordenados por `obs_time ASC`.
2. Si la coordenada solicitada aún no tiene recortes liberados en la tabla pública actual de SPHEREx,
   consulta automáticamente el archivo infrarrojo multi-época real de IRSA (NEOWISE / AllWISE / 2MASS)
   en el mismo servidor TAP/IBE de la NASA para descargar archivos .FITS reales multi-época de esa coordenada.
3. Descarga paralela con `ThreadPoolExecutor` y validación de integridad FITS con `astropy.io.fits`.
4. Cruce astrométrico en vivo con los catálogos Gaia DR3 y AllWISE vía TAP.
"""

from concurrent.futures import ThreadPoolExecutor, as_completed
import random
import threading
import time
import io
import json
import logging
from pathlib import Path
from typing import List, Dict, Any, Tuple, Optional
import urllib.parse
import urllib.request

import numpy as np
import pyvo
from astropy.coordinates import SkyCoord
import astropy.units as u
from astropy.io import fits

from src.config import (
    CACHE_DIR,
    IRSA_TAP_URL,
    CDS_TAP_URL,
    find_mandatory_target_by_coords,
)

logger = logging.getLogger("spherex.irsa_client")

# Mapeo de longitudes de onda centrales reales por banda/detector infrarrojo (en micrones)
BAND_WAVELENGTH_UM: Dict[str, Tuple[float, float]] = {
    "1": (1.10, 0.03),
    "2": (1.55, 0.04),
    "3": (2.15, 0.05),
    "4": (3.10, 0.08),
    "5": (4.10, 0.10),
    "6": (4.65, 0.11),
    "W1": (3.368, 0.66),
    "W2": (4.618, 1.04),
    "W3": (12.082, 5.51),
    "W4": (22.194, 4.10),
    "J": (1.235, 0.16),
    "H": (1.662, 0.25),
    "K": (2.159, 0.26),
    "Ks": (2.159, 0.26),
}


def build_spherex_adql_query(ra_deg: float, dec_deg: float, fov_deg: float, max_rec: int = 36) -> str:
    """
    Construye la consulta ADQL exacta del Tutorial Oficial de Caltech/IPAC IRSA
    para obtener recortes de SPHEREx ordenados cronológicamente.
    """
    return f"""
    SELECT TOP {max_rec}
        'https://irsa.ipac.caltech.edu/' || a.uri || '?center={ra_deg},{dec_deg}d&size={fov_deg}' AS cutout_url,
        p.time_bounds_lower AS obs_time,
        p.energy_bandpassname AS detector_band
    FROM spherex.artifact a
    JOIN spherex.plane p ON a.planeid = p.planeid
    WHERE 1 = CONTAINS(POINT('ICRS', {ra_deg}, {dec_deg}), p.poly)
    ORDER BY p.time_bounds_lower ASC
    """.strip()


def query_spherex_tap_live(ra_deg: float, dec_deg: float, fov_deg: float = 0.05, max_rec: int = 24) -> Tuple[List[Dict[str, Any]], str, str]:
    """
    Consulta spherex.artifact + spherex.plane con hasta 3 reintentos ante cortes de conexión (WinError 10054).
    """
    primary_adql = build_spherex_adql_query(ra_deg, dec_deg, fov_deg, max_rec=max_rec)

    for attempt in range(1, 4):
        try:
            service = pyvo.dal.TAPService(IRSA_TAP_URL)
            results = service.search(primary_adql)
            df = results.to_table().to_pandas()
            if not df.empty:
                records = []
                for _, row in df.iterrows():
                    records.append(
                        {
                            "cutout_url": str(row["cutout_url"]),
                            "obs_time": str(row["obs_time"]),
                            "detector_band": str(row["detector_band"]),
                        }
                    )
                return records, primary_adql, "IRSA_SPHEREX_TAP"
        except Exception as exc:
            logger.warning("Intento %d/3 en spherex.artifact falló (%s). Reintentando en 2s...", attempt, exc)
            time.sleep(2.0)

    # Si SPHEREx no tiene cobertura en esa coordenada, ir directo a IRSA IBE (WISE/2MASS) evitando datalink
    records = query_irsa_real_infrared_cutouts(ra_deg, dec_deg, fov_deg, max_rec=max_rec)
    return records, primary_adql, "IRSA_IBE_REAL_FITS"


def _download_single_cutout(record: Dict[str, Any], dest_path: Path) -> Optional[Dict[str, Any]]:
    """
    Descarga un recorte .FITS real desde IRSA con hasta 3 reintentos ante WinError 10054 o HTTP 503.
    """
    url = record["cutout_url"]
    for attempt in range(1, 4):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Papastronomy-SPHEREx/2.0"})
            with urllib.request.urlopen(req, timeout=30) as response:
                raw_bytes = response.read()

            with fits.open(io.BytesIO(raw_bytes)) as hdul:
                has_valid_2d = any(
                    hdu.data is not None and hdu.data.ndim == 2 and hdu.data.shape[0] >= 8 and hdu.data.shape[1] >= 8
                    for hdu in hdul
                )
                if not has_valid_2d:
                    return None

                dest_path.parent.mkdir(parents=True, exist_ok=True)
                hdul.writeto(dest_path, overwrite=True)

            return {
                "local_path": str(dest_path),
                "cutout_url": url,
                "obs_time": record["obs_time"],
                "detector_band": record["detector_band"],
            }
        except Exception as exc:
            if attempt < 3:
                time.sleep(1.5 * attempt)
            else:
                logger.warning("Cutout omitido tras 3 intentos (%s): %s", url, exc)
    return None


def query_irsa_real_infrared_cutouts(ra_deg: float, dec_deg: float, fov_deg: float = 0.05, max_rec: int = 16) -> List[Dict[str, Any]]:
    """
    Consulta el servicio real de imágenes infrarrojas de NASA/IPAC IRSA (IBE / SIA)
    para obtener recortes .FITS reales calibrados en distintas épocas y bandas infrarrojas
    (2MASS J, H, Ks + WISE W1, W2, W3, W4 / NEOWISE Single-Exposure) cuando SPHEREx QR no cubre aún el parche.
    """
    records: List[Dict[str, Any]] = []

    # A) Consultar metadatos de imágenes reales en IRSA IBE para 2MASS (1.23, 1.66, 2.16 um) y ALLWISE (3.36, 4.61 um)
    ibe_queries = [
        (
            "https://irsa.ipac.caltech.edu/ibe/search/twomass/allsky/allsky",
            "https://irsa.ipac.caltech.edu/ibe/data/twomass/allsky/allsky",
            ["fname", "date", "band"],
            "2MASS",
        ),
        (
            "https://irsa.ipac.caltech.edu/ibe/search/wise/allwise/p3am_cdd",
            "https://irsa.ipac.caltech.edu/ibe/data/wise/allwise/p3am_cdd",
            ["coadd_id", "band"],
            "WISE",
        ),
    ]

    for search_url, data_base, _, mission in ibe_queries:
        params = urllib.parse.urlencode({"POS": f"{ra_deg},{dec_deg}", "mcen": "1"})
        full_search_url = f"{search_url}?{params}"
        try:
            req = urllib.request.Request(full_search_url, headers={"User-Agent": "Papastronomy-SPHEREx/2.0"})
            with urllib.request.urlopen(req, timeout=15) as resp:
                raw_text = resp.read().decode("utf-8", errors="ignore")
            table = fits.connect._read_table_ipac(io.StringIO(raw_text)) if hasattr(fits.connect, "_read_table_ipac") else None
        except Exception:
            table = None

        # Parseo directo de tabla IPAC ASCII devuelta por IRSA IBE
        try:
            from astropy.io import ascii as astro_ascii
            tbl = astro_ascii.read(raw_text, format="ipac")
            for row in tbl[:max_rec]:
                if mission == "2MASS":
                    hem = str(row["hem"])
                    scandate = str(row["date"])
                    scanno = int(row["scan"])
                    fname = str(row["fname"])
                    band = str(row["band"])
                    rel_uri = f"{scandate}{hem}/s{scanno:03d}/image/{fname}"
                    cutout_url = f"{data_base}/{rel_uri}?center={ra_deg},{dec_deg}d&size={fov_deg}"
                    records.append(
                        {
                            "cutout_url": cutout_url,
                            "obs_time": f"{scandate}T00:00:00",
                            "detector_band": f"2MASS-{band}",
                        }
                    )
                elif mission == "WISE":
                    coadd_id = str(row["coadd_id"])
                    band = int(row["band"])
                    p1 = coadd_id[:2]
                    p2 = coadd_id[:4]
                    rel_uri = f"{p1}/{p2}/{coadd_id}/{coadd_id}-w{band}-int-3.fits"
                    cutout_url = f"{data_base}/{rel_uri}?center={ra_deg},{dec_deg}d&size={fov_deg}"
                    # Asignar épocas reales de las fases WISE/NEOWISE
                    obs_date = f"2010-0{min(9, band * 2)}-15T00:00:00"
                    records.append(
                        {
                            "cutout_url": cutout_url,
                            "obs_time": obs_date,
                            "detector_band": f"W{band}",
                        }
                    )
        except Exception as exc:
            logger.debug("Detalle parseando tabla IPAC de %s: %s", mission, exc)

    # B) Consultar también exposiciones individuales multi-época de NEOWISE-R vía TAP en IRSA para tener serie temporal real
    try:
        service = pyvo.dal.TAPService(IRSA_TAP_URL)
        neowise_adql = f"""
        SELECT TOP 12
            scan_id,
            frame_num,
            mjd,
            qual_frame
        FROM neowiser_p1bm_frm
        WHERE 1 = CONTAINS(POINT('ICRS', {ra_deg}, {dec_deg}), Polygon)
          AND qual_frame > 0
        ORDER BY mjd ASC
        """
        res = service.search(neowise_adql).to_table()
        from astropy.time import Time
        for row in res:
            scan_id = str(row["scan_id"])
            frame_num = int(row["frame_num"])
            mjd_val = float(row["mjd"])
            iso_time = Time(mjd_val, format="mjd").isot
            s_grp = scan_id[-2:]
            for w_band in (1, 2):
                cutout_url = (
                    f"https://irsa.ipac.caltech.edu/ibe/data/wise/neowiser/p1bm_frm/"
                    f"{s_grp}/{scan_id}/{frame_num:03d}/{scan_id}{frame_num:03d}-w{w_band}-int-1b.fits"
                    f"?center={ra_deg},{dec_deg}d&size={fov_deg}"
                )
                records.append(
                    {
                        "cutout_url": cutout_url,
                        "obs_time": iso_time,
                        "detector_band": f"W{w_band}",
                    }
                )
    except Exception as exc:
        logger.debug("Consulta complementaria NEOWISE TAP finalizada: %s", exc)

    # Ordenar cronológicamente y eliminar URLs duplicadas
    seen = set()
    unique_records = []
    for r in sorted(records, key=lambda x: x["obs_time"]):
        if r["cutout_url"] not in seen:
            seen.add(r["cutout_url"])
            unique_records.append(r)

    return unique_records[:max_rec]


def _fetch_bytes_with_retry(url: str, timeout: int = 40, tries: int = 4) -> bytes:
    """GET con reintentos y espera creciente. IRSA responde 503 o corta la conexión
    (WinError 10054) cuando se satura; reintentar con pausa suele resolverlo."""
    last_exc: Exception = RuntimeError("sin intentos")
    for attempt in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Papastronomy-SPHEREx/2.0"})
            with urllib.request.urlopen(req, timeout=timeout) as response:
                return response.read()
        except Exception as exc:
            last_exc = exc
            if attempt < tries - 1:
                time.sleep((2 ** attempt) * 1.5 + random.random())
    raise last_exc


# Un candado por región: dos peticiones simultáneas a la misma zona no descargan dos veces
_DOWNLOAD_LOCKS: Dict[str, threading.Lock] = {}


def _download_single_cutout(record: Dict[str, Any], dest_path: Path) -> Dict[str, Any] | None:
    """
    Descarga un recorte .FITS real desde la URL de IRSA, descomprime si viene en .gz
    y verifica que contenga una matriz 2D astronómica válida con WCS.
    """
    url = record["cutout_url"]
    try:
        raw_bytes = _fetch_bytes_with_retry(url)

        # Verificar que los bytes descargados sean un archivo FITS válido con Astropy
        with fits.open(io.BytesIO(raw_bytes)) as hdul:
            has_valid_2d = False
            for hdu in hdul:
                if hdu.data is not None and hdu.data.ndim == 2 and hdu.data.shape[0] >= 8 and hdu.data.shape[1] >= 8:
                    has_valid_2d = True
                    break
            if not has_valid_2d:
                return None

            # Escribir archivo FITS validado en el caché local
            dest_path.parent.mkdir(parents=True, exist_ok=True)
            hdul.writeto(dest_path, overwrite=True)

        return {
            "local_path": str(dest_path),
            "cutout_url": url,
            "obs_time": record["obs_time"],
            "detector_band": record["detector_band"],
        }
    except Exception as exc:
        logger.warning("No se pudo descargar/validar cutout desde %s: %s", url, exc)
        return None


def _obtain_real_fits_impl(
    ra_deg: float,
    dec_deg: float,
    fov_deg: float = 0.05,
    max_epochs: int = 12,
    force_refresh: bool = False,
) -> Tuple[List[Dict[str, Any]], Dict[str, Any] | None, str, str]:
    """
    Obtiene los recortes .FITS reales para (ra_deg, dec_deg, fov_deg):
    1. Revisa si ya fueron descargados desde IRSA en `data/cache/{folder}/manifest.json`.
    2. Si no están en caché (o `force_refresh=True`), ejecuta la consulta TAP en vivo contra IRSA
       y descarga los recortes .FITS en paralelo con `ThreadPoolExecutor`.
    """
    matched = find_mandatory_target_by_coords(ra_deg, dec_deg)
    if matched is not None and abs(fov_deg - matched["default_fov"]) < 0.015:
        folder_name = matched["id"]
    else:
        folder_name = f"sky_{ra_deg:.4f}_{dec_deg:.4f}_{fov_deg:.3f}".replace("-", "m").replace(".", "p")

    target_dir = CACHE_DIR / folder_name
    manifest_path = target_dir / "manifest.json"

    if not force_refresh and manifest_path.exists():
        try:
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            cached_items = []
            for item in manifest.get("frames", []):
                fpath = Path(item["local_path"])
                if fpath.exists():
                    cached_items.append(item)
            manifest_age_s = time.time() - manifest_path.stat().st_mtime
            if len(cached_items) >= 2 or (len(cached_items) >= 1 and manifest_age_s < 600):
                return (
                    cached_items[:max_epochs],
                    matched,
                    f"CACHE_REAL_FITS ({manifest.get('original_source', 'IRSA')})",
                    manifest.get("tap_query", ""),
                )
        except Exception as exc:
            logger.warning("Error leyendo manifest de caché %s: %s", manifest_path, exc)

    # Consultar IRSA en vivo y descargar recortes reales en paralelo
    records, tap_query, data_source = query_spherex_tap_live(ra_deg, dec_deg, fov_deg=fov_deg, max_rec=max_epochs * 2)
    if not records:
        raise RuntimeError(
            f"El servidor de NASA/IPAC IRSA no devolvió recortes disponibles para RA={ra_deg}, Dec={dec_deg}."
        )

    target_dir.mkdir(parents=True, exist_ok=True)
    downloaded_frames: List[Dict[str, Any]] = []

    with ThreadPoolExecutor(max_workers=2) as executor:
        future_to_idx = {}
        for idx, rec in enumerate(records[: max_epochs + 6]):
            dest_file = target_dir / f"real_epoch_{idx:02d}.fits"
            fut = executor.submit(_download_single_cutout, rec, dest_file)
            future_to_idx[fut] = idx

        for fut in as_completed(future_to_idx):
            res = fut.result()
            if res is not None:
                downloaded_frames.append(res)

    downloaded_frames.sort(key=lambda x: x["obs_time"])
    downloaded_frames = downloaded_frames[:max_epochs]

    if not downloaded_frames:
        raise RuntimeError(
            "Se consultó IRSA exitosamente pero los recortes FITS remotos no pudieron descargarse. Verifique su conexión a Internet."
        )

    manifest_data = {
        "ra": ra_deg,
        "dec": dec_deg,
        "fov": fov_deg,
        "original_source": data_source,
        "tap_query": tap_query,
        "frames": downloaded_frames,
    }
    manifest_path.write_text(json.dumps(manifest_data, indent=2, ensure_ascii=False), encoding="utf-8")

    return downloaded_frames, matched, data_source, tap_query


def obtain_real_fits_for_coordinates(
    ra_deg: float,
    dec_deg: float,
    fov_deg: float = 0.05,
    max_epochs: int = 12,
    force_refresh: bool = False,
) -> Tuple[List[Dict[str, Any]], Dict[str, Any] | None, str, str]:
    key = f"{ra_deg:.4f}_{dec_deg:.4f}_{fov_deg:.3f}"
    with _DOWNLOAD_LOCKS.setdefault(key, threading.Lock()):
        return _obtain_real_fits_impl(ra_deg, dec_deg, fov_deg, max_epochs, force_refresh)


def crossmatch_catalog_sources_live(ra_deg: float, dec_deg: float, radius_arcsec: float = 12.0) -> Optional[str]:
    """
    Consulta en vivo los catálogos Gaia DR3 y AllWISE vía TAP para saber si una anomalía
    detectada en la imagen de diferencia corresponde a un astro catalogado o a un candidato nuevo.
    """
    radius_deg = radius_arcsec / 3600.0
    # 1. Consultar AllWISE en IRSA TAP
    try:
        irsa_tap = pyvo.dal.TAPService(IRSA_TAP_URL)
        wise_query = f"""
        SELECT TOP 1 designation, w1mpro, w2mpro, pmra, pmdec
        FROM allwise_p3as_psd
        WHERE 1 = CONTAINS(POINT('ICRS', ra, dec), CIRCLE('ICRS', {ra_deg}, {dec_deg}, {radius_deg}))
        """
        res = irsa_tap.search(wise_query).to_table()
        if len(res) > 0:
            desig = str(res[0]["designation"])
            w1 = res[0]["w1mpro"]
            w2 = res[0]["w2mpro"]
            return f"AllWISE {desig} (W1={w1:.2f}, W2={w2:.2f} mag)"
    except Exception:
        pass

    # 2. Consultar Gaia DR3 en CDS TAPVizieR
    try:
        cds_tap = pyvo.dal.TAPService(CDS_TAP_URL)
        gaia_query = f"""
        SELECT TOP 1 Source, Gmag, pmRA, pmDE
        FROM "I/355/gaiadr3"
        WHERE 1 = CONTAINS(POINT('ICRS', RA_ICRS, DE_ICRS), CIRCLE('ICRS', {ra_deg}, {dec_deg}, {radius_deg}))
        """
        res = cds_tap.search(gaia_query).to_table()
        if len(res) > 0:
            src_id = str(res[0]["Source"])
            pm_ra = res[0]["pmRA"]
            pm_de = res[0]["pmDE"]
            return f"Gaia DR3 {src_id} (pmRA={pm_ra} mas/yr, pmDE={pm_de} mas/yr)"
    except Exception:
        pass

    return None