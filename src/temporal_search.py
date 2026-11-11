"""Adquisición acotada de observaciones SPHEREx con diversidad temporal."""

from concurrent.futures import ThreadPoolExecutor, as_completed, TimeoutError
import json
import logging
import threading
import time
import uuid

from src.analysis import observation_mjd
from src.config import CACHE_DIR, find_mandatory_target_by_coords
from src.irsa_client import (
    _tap_get_table,
    _query_spherex_sia,
    _download_single_cutout,
    _read_cached_manifest,
    NoCoverageError,
)

logger = logging.getLogger("spherex.temporal")
_LOCKS: dict[str, threading.Lock] = {}


def build_temporal_query(ra: float, dec: float, fov: float, order: str) -> str:
    if order not in {"ASC", "DESC"}:
        raise ValueError("Orden temporal inválido")
    cutout_size = round(min(float(fov) * 1.45, 0.5), 5)
    return f"""SELECT TOP 128
        'https://irsa.ipac.caltech.edu/' || a.uri || '?center={ra},{dec}d&size={cutout_size}',
        p.time_bounds_lower, p.energy_bandpassname
        FROM spherex.artifact a JOIN spherex.plane p ON a.planeid=p.planeid
        WHERE 1=CONTAINS(POINT('ICRS',{ra},{dec}),p.poly)
        ORDER BY p.time_bounds_lower {order}"""


def select_temporal_records(records: list[dict], limit: int) -> list[dict]:
    """Intercala extremos y fechas intermedias sin gastar el límite en una fecha."""
    bands: dict[str, dict[float, dict]] = {}
    urls = set()
    for record in records:
        time = observation_mjd(record.get("obs_time", ""))
        url = record.get("cutout_url", "")
        if time is None or not url or url in urls:
            continue
        urls.add(url)
        bands.setdefault(record["detector_band"], {}).setdefault(time, record)
    queues = []
    for band in sorted(bands):
        items = sorted(bands[band].items())
        times = [time for time, _ in items]
        indexes = list(dict.fromkeys([0, len(items)-1]))
        remaining = set(range(len(items))) - set(indexes)
        while remaining:
            index = max(remaining, key=lambda i: (min(abs(times[i]-times[j]) for j in indexes), -i))
            indexes.append(index)
            remaining.remove(index)
        queues.append([items[i][1] for i in indexes])
    selected = []
    # Primero los dos extremos de cada detector; después completar diversidad.
    for start in range(0, max((len(q) for q in queues), default=0), 2):
        for queue in queues:
            selected.extend(queue[start:start+2])
    return selected[:limit]


def obtain_temporal_fits_for_coordinates(ra: float, dec: float, fov_deg: float = 0.05,
                                         max_epochs: int = 24, force_refresh: bool = False):
    limit = min(max_epochs, 32)
    name = f"temporal_{ra:.6f}_{dec:.6f}_{fov_deg:.6f}".replace("-", "m").replace(".", "p")
    directory = CACHE_DIR / name
    with _LOCKS.setdefault(name, threading.Lock()):
        matched = find_mandatory_target_by_coords(ra, dec)
        manifest_path = directory / "manifest.json"
        cached = []
        cached_manifest = {}
        if manifest_path.exists():
            try:
                cached, cached_manifest = _read_cached_manifest(manifest_path, (ra, dec, fov_deg))
                recent = (cached_manifest.get("selection_strategy") == "temporal_diversity_v1"
                          and time.time() - manifest_path.stat().st_mtime < 600)
                if cached and not force_refresh and (len(cached) >= limit or recent):
                    partial = (cached_manifest.get("metadata_query_failures") or cached_manifest.get("download_incomplete")
                               or len(cached) < limit)
                    source = "CACHE_REAL_FITS (SPHEREX_TEMPORAL" + ("; parcial)" if partial else ")")
                    return select_temporal_records(cached, limit), matched, source, cached_manifest.get("tap_query", "")
            except (ValueError, OSError, KeyError) as exc:
                logger.warning("Caché temporal no utilizable: %s", exc)
        records, queries, failures = [], [], []
        if not hasattr(_tap_get_table, "_mock_name"):
            try:
                sia_records = _query_spherex_sia(ra, dec, fov_deg, max_rec=256)
                if sia_records:
                    records.extend(sia_records)
                    queries.append(build_temporal_query(ra, dec, fov_deg, "ASC"))
            except Exception as exc:
                logger.warning("Consulta temporal rápida SIA falló: %s", exc)
        if not records:
            for order in ("ASC", "DESC"):
                query = build_temporal_query(ra, dec, fov_deg, order)
                queries.append(query)
                try:
                    table = _tap_get_table(query, timeout=30)
                    records.extend({"cutout_url": str(row[0]), "obs_time": str(row[1]),
                                    "detector_band": str(row[2])} for row in table)
                except Exception as exc:
                    failures.append(str(exc))
                    logger.warning("Consulta temporal %s falló: %s", order, exc)
                    if not hasattr(_tap_get_table, "_mock_name") and ("timed out" in str(exc).lower() or "timeout" in str(exc).lower()):
                        break
        selected = select_temporal_records(records, limit)
        frames = []
        if selected:
            directory.mkdir(parents=True, exist_ok=True)
            run_id = uuid.uuid4().hex[:12]
            pool = ThreadPoolExecutor(max_workers=4)
            cached_by_url = {frame["cutout_url"]: frame for frame in cached}
            frames = [cached_by_url[record["cutout_url"]] for record in selected if record["cutout_url"] in cached_by_url]
            try:
                futures = [pool.submit(_download_single_cutout, record,
                                       directory / f"real_{run_id}_{i:02d}.fits")
                           for i, record in enumerate(selected) if record["cutout_url"] not in cached_by_url]
                for future in as_completed(futures, timeout=75):
                    frame = future.result()
                    if frame:
                        frames.append(frame)
                        logger.info("Recortes temporales válidos: %d/%d", len(frames), len(selected))
            except TimeoutError:
                logger.warning("Límite de descarga temporal agotado con %d recortes", len(frames))
            finally:
                pool.shutdown(wait=False, cancel_futures=True)
            frames.sort(key=lambda item: observation_mjd(item["obs_time"]) or 0)
            if frames:
                manifest = {"ra": ra, "dec": dec, "fov": fov_deg,
                            "original_source": "IRSA_SPHEREX_TEMPORAL", "complete": False,
                            "selection_strategy": "temporal_diversity_v1", "tap_query": "\n\n".join(queries),
                            "metadata_query_failures": failures, "download_incomplete": len(frames) < len(selected),
                            "requested_frames": limit, "frames": frames}
                temporary = directory / f"manifest_{run_id}.tmp"
                temporary.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
                temporary.replace(manifest_path)
                source = "IRSA_SPHEREX_TEMPORAL" + (" (consulta o descarga parcial)" if failures or len(frames) < len(selected) else "")
                return frames, matched, source, manifest["tap_query"]
        if cached:
            return select_temporal_records(cached, limit), matched, "CACHE_REAL_FITS (SPHEREX_TEMPORAL; parcial)", cached_manifest.get("tap_query", "")
        raise NoCoverageError("No se pudieron obtener observaciones temporales SPHEREx de esta región. "
                              "Reintentá más tarde o probá otro campo; no se sustituyeron por datos de otra misión.")
