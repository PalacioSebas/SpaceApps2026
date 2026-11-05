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
from concurrent.futures import TimeoutError as FuturesTimeout
import random
import threading
import time
import io
import json
import logging
import uuid
from functools import lru_cache
from pathlib import Path
from typing import List, Dict, Any, Tuple, Optional
import urllib.parse
import urllib.request

import pyvo
import numpy as np
import requests
from astropy.io import fits

from src.cache_utils import resolve_cached_path
from src.config import (
    CACHE_DIR,
    IRSA_TAP_URL,
    CDS_TAP_URL,
    find_mandatory_target_by_coords,
)

logger = logging.getLogger("spherex.irsa_client")


class _TimedSession(requests.Session):
    def __init__(self, timeout=12):
        super().__init__()
        self.default_timeout = timeout

    def request(self, method, url, **kwargs):
        kwargs.setdefault("timeout", self.default_timeout)
        return super().request(method, url, **kwargs)


def _tap_service(url: str):
    return pyvo.dal.TAPService(url, session=_TimedSession())


def _tap_get_table(query: str, timeout=12):
    # TAP permite GET para consultas síncronas. PyVO valida QUERY_STATUS y errores
    # del VOTable antes de aceptar una respuesta como un catálogo vacío.
    url = IRSA_TAP_URL + "/sync?" + urllib.parse.urlencode({
        "REQUEST": "doQuery", "LANG": "ADQL", "FORMAT": "votable", "QUERY": query,
    })
    with _TimedSession(timeout=timeout) as session:
        return pyvo.dal.TAPResults.from_result_url(url, session=session).to_table()


@lru_cache(maxsize=64)
def _catalog_field_cached(catalog: str, ra: float, dec: float, fov: float, time_bucket: int):
    if catalog not in {"gaia", "allwise"}:
        raise ValueError("Catálogo desconocido")
    irsa_spec = (
        ("gaia_dr3_source", "source_id, ra, dec, phot_g_mean_mag", "ra", "dec") if catalog == "gaia"
        else ("allwise_p3as_psd", "designation, ra, dec, w1mpro", "ra", "dec")
    )
    cds_spec = (
        ('"I/355/gaiadr3"', "Source, RA_ICRS, DE_ICRS, Gmag", "RA_ICRS", "DE_ICRS") if catalog == "gaia"
        else ('"II/328/allwise"', "AllWISE, RAJ2000, DEJ2000, W1mag", "RAJ2000", "DEJ2000")
    )
    radius = fov / np.sqrt(2)
    errors = []
    for service, spec in (("IRSA TAP", irsa_spec), ("CDS VizieR", cds_spec)):
        table, columns, ra_col, dec_col = spec
        query = f"""SELECT TOP 2000 {columns} FROM {table}
            WHERE 1 = CONTAINS(POINT('ICRS', {ra_col}, {dec_col}),
            CIRCLE('ICRS', {ra}, {dec}, {radius}))"""
        try:
            rows = (_tap_get_table(query) if service == "IRSA TAP"
                    else _tap_service(CDS_TAP_URL).search(query).to_table())
            if len(rows.colnames) != 4:
                raise ValueError("El catálogo no devolvió las cuatro columnas solicitadas")
            sources = []
            # IRSA puede publicar nombres genéricos col_0... en el VOTable.
            # El orden de las cuatro columnas lo fija el SELECT anterior.
            for row in rows:
                source_id, ra_value, dec_value, mag_value = row
                if np.ma.is_masked(ra_value) or np.ma.is_masked(dec_value):
                    continue
                source_ra, source_dec = float(ra_value), float(dec_value)
                if not np.isfinite(source_ra) or not np.isfinite(source_dec):
                    continue
                mag = None if np.ma.is_masked(mag_value) else float(mag_value)
                sources.append({
                    "id": str(source_id), "ra": source_ra, "dec": source_dec,
                    "mag": mag if mag is not None and np.isfinite(mag) else None,
                })
            return {"catalog": catalog, "sources": sources, "truncated": len(rows) >= 2000, "service": service}
        except Exception as exc:
            logger.warning("Consulta %s en %s falló: %s", catalog, service, exc)
            errors.append(f"{service}: {exc}")
    raise RuntimeError("Catálogo no disponible en IRSA ni CDS: " + "; ".join(errors))


def query_catalog_field(catalog: str, ra: float, dec: float, fov: float) -> Dict[str, Any]:
    return _catalog_field_cached(catalog, ra, dec, fov, int(time.time() // 600))

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


# True = IRSA ordena las filas por fecha en el servidor (más lento; devuelve las N más antiguas).
# False = IRSA devuelve las primeras N que encuentre; igual se ordenan por fecha después de descargar.
TAP_SORT_BY_TIME = False


def build_spherex_adql_query(ra_deg: float, dec_deg: float, fov_deg: float, max_rec: int = 36) -> str:
    """
    Construye la consulta ADQL exacta del Tutorial Oficial de Caltech/IPAC IRSA
    para obtener recortes de SPHEREx ordenados cronológicamente.
    """
    order_clause = "ORDER BY p.time_bounds_lower ASC" if TAP_SORT_BY_TIME else ""
    return f"""
    SELECT TOP {max_rec}
        'https://irsa.ipac.caltech.edu/' || a.uri || '?center={ra_deg},{dec_deg}d&size={fov_deg}' AS cutout_url,
        p.time_bounds_lower AS obs_time,
        p.energy_bandpassname AS detector_band
    FROM spherex.artifact a
    JOIN spherex.plane p ON a.planeid = p.planeid
    WHERE 1 = CONTAINS(POINT('ICRS', {ra_deg}, {dec_deg}), p.poly)
    {order_clause}
    """.strip()


# Candado global para serializar consultas TAP a IRSA y evitar bloqueos 503 / WinError 10054 por concurrencia
_IRSA_TAP_LOCK = threading.Lock()
_IRSA_503_UNTIL: float = 0.0


def query_spherex_tap_live(ra_deg: float, dec_deg: float, fov_deg: float = 0.05, max_rec: int = 24) -> Tuple[List[Dict[str, Any]], str, str]:
    """
    Consulta spherex.artifact + spherex.plane con serialización y circuit-breaker ante HTTP 503 o WinError 10054.
    """
    global _IRSA_503_UNTIL
    primary_adql = build_spherex_adql_query(ra_deg, dec_deg, fov_deg, max_rec=max_rec)

    if time.time() >= _IRSA_503_UNTIL:
        for attempt in range(1, 3):
            try:
                t_tap = time.perf_counter()
                with _IRSA_TAP_LOCK:
                    service = _tap_service(IRSA_TAP_URL)
                    results = service.search(primary_adql)
                    df = results.to_table().to_pandas()
                logger.info("TAP spherex: %.1f s, %d filas (intento %d)", time.perf_counter() - t_tap, len(df), attempt)
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
                break
            except Exception as exc:
                err_str = str(exc)
                logger.warning("Intento %d/2 en spherex.artifact falló (%s).", attempt, exc)
                if "503" in err_str or "Service Unavailable" in err_str:
                    _IRSA_503_UNTIL = time.time() + 30.0
                    break
                if attempt < 2:
                    time.sleep(1.5)

    # Si SPHEREx no tiene cobertura o IRSA TAP dio 503, intentar IRSA IBE (WISE/2MASS)
    records = query_irsa_real_infrared_cutouts(ra_deg, dec_deg, fov_deg, max_rec=max_rec)
    return records, primary_adql, "IRSA_IBE_REAL_FITS"


def query_irsa_real_infrared_cutouts(ra_deg: float, dec_deg: float, fov_deg: float = 0.05, max_rec: int = 16) -> List[Dict[str, Any]]:
    """
    Consulta el servicio real de imágenes infrarrojas de NASA/IPAC IRSA (IBE / SIA)
    para obtener recortes .FITS reales calibrados en distintas épocas y bandas infrarrojas
    (2MASS J, H, Ks + WISE W1, W2, W3, W4 / NEOWISE Single-Exposure) cuando SPHEREx QR no cubre aún el parche.
    """
    records: List[Dict[str, Any]] = []

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
        raw_text = ""
        try:
            req = urllib.request.Request(full_search_url, headers={"User-Agent": "Papastronomy-SPHEREx/2.0"})
            with urllib.request.urlopen(req, timeout=8) as resp:
                raw_text = resp.read().decode("utf-8", errors="ignore")
        except Exception as exc:
            logger.debug("IBE %s no disponible (%s)", mission, exc)
            continue

        if not raw_text.strip():
            continue

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
                            "obs_time": "",  # se toma DATE-OBS/MJD del FITS, no de la ruta
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
                    records.append(
                        {
                            "cutout_url": cutout_url,
                            "obs_time": "",  # las bandas no representan fechas diferentes
                            "detector_band": f"W{band}",
                        }
                    )
        except Exception as exc:
            logger.debug("Detalle parseando tabla IPAC de %s: %s", mission, exc)

    # B) Consultar NEOWISE-R solo si el servidor TAP no está en estado 503
    if time.time() >= _IRSA_503_UNTIL:
        try:
            with _IRSA_TAP_LOCK:
                service = _tap_service(IRSA_TAP_URL)
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

    seen = set()
    unique_records = []
    for r in sorted(records, key=lambda x: x["obs_time"]):
        if r["cutout_url"] not in seen:
            seen.add(r["cutout_url"])
            unique_records.append(r)

    return unique_records[:max_rec]


def _fetch_bytes_with_retry(url: str, timeout: int = 12, tries: int = 3) -> bytes:
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


class NoCoverageError(RuntimeError):
    """No hay observaciones verificables de la región solicitada."""


def _read_cached_manifest(manifest_path: Path, region: tuple | None = None) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    # Versiones anteriores trasladaban imágenes de otros campos. No son observaciones
    # de esta coordenada: conservar los archivos, pero excluirlos del análisis.
    if "FALLBACK" in str(manifest.get("original_source", "")).upper():
        raise ValueError("Caché antigua con astrometría modificada; requiere datos originales de IRSA")
    if region is not None and any(
        abs(float(manifest.get(key, float("inf"))) - expected) > 1e-6
        for key, expected in zip(("ra", "dec", "fov"), region)
    ):
        raise ValueError("El centro o tamaño de esta caché no coincide con la región solicitada")
    frames = []
    for item in manifest.get("frames", []):
        path = resolve_cached_path(item.get("local_path", ""), manifest_path.parent)
        if path.is_file():
            frames.append({**item, "local_path": str(path)})
    return frames, manifest


def _build_fallback_fits_from_local_cache(
    ra_deg: float, dec_deg: float, fov_deg: float, target_dir: Path,
    max_epochs: int, tap_query: str,
) -> Tuple[List[Dict[str, Any]], str]:
    """Usa solo la caché original de esta región; nunca modifica la astrometría."""
    manifest_path = target_dir / "manifest.json"
    if manifest_path.exists():
        try:
            frames, manifest = _read_cached_manifest(manifest_path, (ra_deg, dec_deg, fov_deg))
            if frames:
                return frames[:max_epochs], f"CACHE_REAL_FITS ({manifest.get('original_source', 'IRSA')}; parcial)"
        except (OSError, ValueError, KeyError) as exc:
            logger.warning("Caché no utilizable %s: %s", manifest_path, exc)
    raise NoCoverageError(
        f"IRSA no devolvió recortes utilizables para RA={ra_deg:.5f}, Dec={dec_deg:.5f}, "
        f"FoV={fov_deg}°. No hay caché original de esta región. Probá un objetivo precargado o reintentá."
    )


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
    3. Si el servidor de IRSA responde 503 Service Unavailable o corta la conexión (WinError 10054),
       utiliza únicamente observaciones originales de la misma región ya presentes en caché.
    """
    matched = find_mandatory_target_by_coords(ra_deg, dec_deg)
    if (matched is not None and abs(ra_deg - matched["ra_deg"]) < 1e-6
            and abs(dec_deg - matched["dec_deg"]) < 1e-6
            and abs(fov_deg - matched["default_fov"]) < 1e-6):
        folder_name = matched["id"]
    else:
        folder_name = f"sky_{ra_deg:.4f}_{dec_deg:.4f}_{fov_deg:.3f}".replace("-", "m").replace(".", "p")

    target_dir = CACHE_DIR / folder_name
    manifest_path = target_dir / "manifest.json"

    if not force_refresh and manifest_path.exists():
        try:
            cached_items, manifest = _read_cached_manifest(manifest_path, (ra_deg, dec_deg, fov_deg))
            # La caché satisface la petición si contiene la cantidad solicitada
            # o si el manifest confirma que IRSA ya agotó los datos disponibles.
            # Antes cualquier manifest con >=2 FITS devolvía inmediatamente los
            # primeros 10, por lo que el botón "Cargar hasta 102" nunca ampliaba
            # una caché creada por la carga inicial.
            if cached_items and (len(cached_items) >= max_epochs or bool(manifest.get("complete", False))):
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
        logger.warning(
            "IRSA no devolvió recortes en vivo para RA=%s, Dec=%s (posible HTTP 503); activando respaldo FITS local.",
            ra_deg,
            dec_deg,
        )
        fallback_frames, fb_source = _build_fallback_fits_from_local_cache(
            ra_deg, dec_deg, fov_deg, target_dir, max_epochs, tap_query
        )
        return fallback_frames, matched, fb_source, tap_query

    target_dir.mkdir(parents=True, exist_ok=True)
    downloaded_frames: List[Dict[str, Any]] = []
    download_id = uuid.uuid4().hex[:12]

    DOWNLOAD_BUDGET_S = 45.0
    n_total = len(records[: max_epochs + 6])
    executor = ThreadPoolExecutor(max_workers=4)
    try:
        future_to_idx = {}
        for idx, rec in enumerate(records[: max_epochs + 6]):
            # Una descarga que termine tarde no debe sobrescribir un FITS ya publicado.
            dest_file = target_dir / f"real_{download_id}_epoch_{idx:02d}.fits"
            fut = executor.submit(_download_single_cutout, rec, dest_file)
            future_to_idx[fut] = idx

        done_count = 0
        try:
            for fut in as_completed(future_to_idx, timeout=DOWNLOAD_BUDGET_S):
                done_count += 1
                res = fut.result()
                if res is not None:
                    downloaded_frames.append(res)
                logger.info("Descarga IRSA: %d/%d procesados, %d válidos", done_count, n_total, len(downloaded_frames))
                if len(downloaded_frames) >= max_epochs:
                    break
        except FuturesTimeout:
            logger.warning(
                "Presupuesto de %.0f s agotado: se continúa con %d recortes (%d/%d intentos terminados)",
                DOWNLOAD_BUDGET_S, len(downloaded_frames), done_count, n_total,
            )
    finally:
        executor.shutdown(wait=False, cancel_futures=True)

    downloaded_frames.sort(key=lambda x: x["obs_time"])
    downloaded_frames = downloaded_frames[:max_epochs]

    if not downloaded_frames:
        logger.warning(
            "Descarga de recortes desde IRSA incompleta (%d válidos); completando con respaldo FITS local.",
            len(downloaded_frames),
        )
        fallback_frames, fb_source = _build_fallback_fits_from_local_cache(
            ra_deg, dec_deg, fov_deg, target_dir, max_epochs, tap_query
        )
        return fallback_frames, matched, fb_source, tap_query

    manifest_data = {
        "ra": ra_deg,
        "dec": dec_deg,
        "fov": fov_deg,
        "original_source": data_source,
        # Solo marcamos la consulta como completa si todas las filas devueltas
        # entraron en el límite solicitado y fueron descargadas correctamente.
        # Así una carga inicial de 10 no bloquea luego una ampliación a 102.
        "complete": len(records) <= max_epochs and len(downloaded_frames) >= len(records),
        "tap_query": tap_query,
        "frames": downloaded_frames,
    }
    temporary_manifest = target_dir / f"manifest_{download_id}.tmp"
    temporary_manifest.write_text(json.dumps(manifest_data, indent=2, ensure_ascii=False), encoding="utf-8")
    temporary_manifest.replace(manifest_path)

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
    Prioriza CDS TAPVizieR para no saturar el servidor TAP de IRSA durante descargas de recortes.
    """
    radius_deg = radius_arcsec / 3600.0
    errors = []

    # 1. Consultar Gaia DR3 en CDS TAPVizieR (no compite con IRSA TAP)
    try:
        cds_tap = _tap_service(CDS_TAP_URL)
        gaia_query = f"""
        SELECT TOP 1 Source, Gmag, pmRA, pmDE
        FROM "I/355/gaiadr3"
        WHERE 1 = CONTAINS(POINT('ICRS', RA_ICRS, DE_ICRS), CIRCLE('ICRS', {ra_deg}, {dec_deg}, {radius_deg}))
        ORDER BY DISTANCE(POINT('ICRS', RA_ICRS, DE_ICRS), POINT('ICRS', {ra_deg}, {dec_deg}))
        """
        res = cds_tap.search(gaia_query).to_table()
        if len(res) > 0:
            src_id = str(res[0]["Source"])
            pm_ra = res[0]["pmRA"]
            pm_de = res[0]["pmDE"]
            return f"Gaia DR3 {src_id} (pmRA={pm_ra} mas/yr, pmDE={pm_de} mas/yr)"
    except Exception as exc:
        errors.append(str(exc))

    # 2. Consultar AllWISE en IRSA TAP solo si IRSA no está en estado 503 y el lock está libre
    if time.time() >= _IRSA_503_UNTIL and not _IRSA_TAP_LOCK.locked():
        try:
            with _IRSA_TAP_LOCK:
                irsa_tap = _tap_service(IRSA_TAP_URL)
                wise_query = f"""
                SELECT TOP 1 designation, w1mpro, w2mpro, pmra, pmdec
                FROM allwise_p3as_psd
                WHERE 1 = CONTAINS(POINT('ICRS', ra, dec), CIRCLE('ICRS', {ra_deg}, {dec_deg}, {radius_deg}))
                ORDER BY DISTANCE(POINT('ICRS', ra, dec), POINT('ICRS', {ra_deg}, {dec_deg}))
                """
                res = irsa_tap.search(wise_query).to_table()
            if len(res) > 0:
                desig = str(res[0]["designation"])
                w1 = res[0]["w1mpro"]
                w2 = res[0]["w2mpro"]
                return f"AllWISE {desig} (W1={w1:.2f}, W2={w2:.2f} mag)"
        except Exception as exc:
            errors.append(str(exc))
    else:
        errors.append("IRSA temporalmente ocupado o no disponible")

    if errors:
        raise RuntimeError("Cruce incompleto: no se pudo verificar Gaia DR3 y AllWISE")
    return None
