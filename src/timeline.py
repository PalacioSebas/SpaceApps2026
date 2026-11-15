"""
Línea histórica de un punto del cielo: cómo cambia con el tiempo.

A partir de los recortes .FITS reales de SPHEREx ya descargados para una región:

1. Mide cada exposición en la coordenada elegida (fotometría de apertura recentrada
   en el centroide de la fuente, o fotometría de halo si el núcleo está saturado).
2. Agrupa las exposiciones en *visitas* (fechas de observación).
3. Arma, por detector, una serie de brillo que solo compara longitudes de onda
   casi idénticas (modo ``strict``). Si no alcanza, usa un respaldo declarado
   (modo ``approx``) que descuenta la tendencia espectral del objeto.
4. Mide el corrimiento del centroide entre visitas (movimiento aparente).
5. Genera miniaturas norte-arriba centradas en el punto, con escala común por detector.
6. Redacta un resumen en lenguaje claro, sin inventar cambios que los datos no sostienen.

En SPHEREx la longitud de onda depende de la posición del objeto sobre el filtro
lineal variable (LVF): "mismo detector" NO implica "misma longitud de onda". Por eso
la comparación estricta exige Δλ/λ pequeño y el respaldo queda siempre rotulado.
"""

from __future__ import annotations

import base64
import io
import logging
import math
import re
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Tuple

import numpy as np
from astropy.wcs import WCS
from PIL import Image
from scipy.ndimage import label as label_regions, map_coordinates, maximum_filter
from scipy.stats import chi2 as chi2_dist

from src.analysis import observation_mjd
from src.config import CACHE_DIR, MANDATORY_TARGETS
from src.pipeline import _get_frame, _spectral_values_um

logger = logging.getLogger("spherex.timeline")

# --- Parámetros científicos ---------------------------------------------------
STRICT_WAVELENGTH_TOLERANCE = 0.03   # Δλ/λ máximo entre dos puntos de una serie estricta
APPROX_WAVELENGTH_TOLERANCE = 0.10   # ventana del respaldo "longitudes de onda cercanas"
APERTURE_PIX = 2.0                   # igual que /api/spectrum
CENTROID_MIN_SNR = 6.0               # pico mínimo para confiar en el centroide
CENTROID_MAX_OFFSET_PIX = 1.5        # no "saltar" a otra fuente vecina (~9″)
SATURATED_MAX_OFFSET_PIX = 3.0       # las estrellas saturadas son grandes: se tolera más corrimiento
# Error de posición por exposición (PSF submuestreada / centro de un halo saturado) y piso por visita
CENTROID_ERR_ARCSEC = {"aperture": 1.0, "halo": 2.5}
CENTROID_FLOOR_ARCSEC = {"aperture": 0.5, "halo": 1.2}
# Repetibilidad medida entre exposiciones de una misma noche sobre estrellas brillantes
# (campo de RW Aurigae, Δλ/λ ≤ 3 %): ~8 % por exposición. Baja con √N exposiciones.
SINGLE_EXPOSURE_SCATTER = {"strict": 0.08, "approx": 0.12}
SYSTEMATIC_FLOOR = {"strict": 0.03, "approx": 0.05}   # error relativo mínimo por visita
HALO_EXTRA_FLOOR = 0.05              # el halo de una estrella saturada es menos preciso
MIN_DETECTION_SNR = 5.0              # por debajo: "demasiado débil para medir"
VARIABILITY_P_VALUE = 0.0027         # ~3 sigma
MIN_AMPLITUDE_PCT = {"strict": 8.0, "approx": 15.0}
MOTION_MIN_SHIFT_ARCSEC = 2.5        # ~0,4 píxel SPHEREx (6.2″)
MOTION_MIN_SIGMA = 3.0
MOTION_MIN_BASELINE_DAYS = 20.0
TRACK_MATCH_ARCSEC = 12.0           # el punto elegido ES el objeto de catálogo si está así de cerca
MAX_FRAMES = 84
MAX_STAMPS = 72
STAMP_PIXELS = 48
DEFAULT_STAMP_FOV_DEG = 0.04         # 2.4′
SPHEREX_PIXEL_ARCSEC = 6.15

_MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"]


# ----------------------------------------------------------------------------
# Utilidades
# ----------------------------------------------------------------------------
def mjd_to_datetime(mjd: float) -> datetime:
    return datetime(1858, 11, 17) + timedelta(days=float(mjd))


def mjd_to_iso_date(mjd: float) -> str:
    return mjd_to_datetime(mjd).strftime("%Y-%m-%d")


def mjd_to_label(mjd: float) -> str:
    """Fecha corta legible en español: '12 may 2025'."""
    d = mjd_to_datetime(mjd)
    return f"{d.day} {_MESES[d.month - 1]} {d.year}"


def mjd_to_year(mjd: float) -> float:
    return 2000.0 + (float(mjd) - 51544.5) / 365.25


def detector_code(raw: Any) -> str:
    """Normaliza 'SPHEREx-D3', '3', 'D3' → 'D3'."""
    text = str(raw or "").strip()
    match = re.search(r"D\s*([1-6])", text, re.IGNORECASE)
    if match:
        return f"D{match.group(1)}"
    match = re.search(r"([1-6])\s*$", text)
    return f"D{match.group(1)}" if match else (text or "SPHEREx")


def _fmt_pct(value: float) -> str:
    value = abs(value)
    return f"{value:.0f}" if value >= 10 else f"{value:.1f}".replace(".", ",")


def _fmt_num(value: float, decimals: int = 1) -> str:
    return f"{value:.{decimals}f}".replace(".", ",")


def _span_text(days: float) -> str:
    if days >= 330:
        years = days / 365.25
        return "1 año" if years < 1.25 else f"{_fmt_num(years)} años"
    if days >= 50:
        return f"{round(days / 30.44)} meses"
    if days >= 1.5:
        return f"{round(days)} días"
    return f"{max(1, round(days * 24))} horas"


# ----------------------------------------------------------------------------
# Movimiento propio conocido (objetivos oficiales): sin red, solo catálogo fijo
# ----------------------------------------------------------------------------
def known_motion_for_point(ra: float, dec: float, mjd_now: float,
                           match_radius_arcsec: float = 25.0) -> Optional[Dict[str, Any]]:
    """
    Si el punto cae sobre la trayectoria (1950 → hoy) de un objetivo con movimiento
    propio de catálogo, devuelve su vector y su posición prevista para ``mjd_now``.
    """
    year_now = mjd_to_year(mjd_now)
    cos_dec = max(1e-6, math.cos(math.radians(dec)))
    best = None
    for target in MANDATORY_TARGETS:
        pm = target.get("proper_motion")
        if not pm:
            continue
        pm_ra, pm_dec = float(pm["pm_ra_mas_yr"]), float(pm["pm_dec_mas_yr"])
        ref_year = float(pm["ref_epoch_year"])
        # posición del punto respecto de la coordenada de catálogo, en arcsec (E, N)
        px = (ra - target["ra_deg"]) * cos_dec * 3600.0
        py = (dec - target["dec_deg"]) * 3600.0
        if math.hypot(px, py) > 3600.0:
            continue
        # segmento de la trayectoria entre 1950 y hoy (+1 año de margen)
        t0, t1 = 1950.0 - ref_year, year_now + 1.0 - ref_year
        vx, vy = pm_ra / 1000.0, pm_dec / 1000.0
        speed2 = vx * vx + vy * vy
        if speed2 <= 0:
            continue
        t = min(t1, max(t0, (px * vx + py * vy) / speed2))
        dist = math.hypot(px - vx * t, py - vy * t)
        if dist <= match_radius_arcsec and (best is None or dist < best[0]):
            dt_now = year_now - ref_year
            cur_ra = target["ra_deg"] + (vx * dt_now / 3600.0) / max(1e-6, math.cos(math.radians(target["dec_deg"])))
            cur_dec = target["dec_deg"] + vy * dt_now / 3600.0
            off_now = math.hypot((cur_ra - ra) * cos_dec * 3600.0, (cur_dec - dec) * 3600.0)
            best = (dist, {
                "name": target["name"],
                "pm_ra_mas_yr": pm_ra,
                "pm_dec_mas_yr": pm_dec,
                "pm_total_arcsec_yr": round(math.sqrt(speed2), 3),
                "ref_epoch_year": ref_year,
                "ref_ra": target["ra_deg"],
                "ref_dec": target["dec_deg"],
                "source": str(pm.get("source", "catálogo")),
                "current_ra": round(cur_ra % 360.0, 6),
                "current_dec": round(cur_dec, 6),
                "current_epoch_year": round(year_now, 2),
                "offset_now_arcsec": round(off_now, 1),
            })
    return best[1] if best else None


# ----------------------------------------------------------------------------
# Recolección de todos los recortes en caché de la región
# ----------------------------------------------------------------------------
def collect_cached_frames(ra: float, dec: float, fov: float,
                          primary_frames: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Une los recortes ya cargados en el visor con TODOS los que existan en la caché
    de la misma región (búsqueda normal y búsqueda temporal). No descarga nada.
    """
    from src import irsa_client  # import tardío: evita ciclos y facilita los tests

    merged: List[Dict[str, Any]] = []
    seen: set[str] = set()

    def add(frames: List[Dict[str, Any]]) -> None:
        for fm in frames:
            key = str(fm.get("cutout_url") or fm.get("local_path") or "")
            if key and key not in seen and Path(str(fm.get("local_path", ""))).is_file():
                seen.add(key)
                merged.append(fm)

    add(primary_frames)
    temporal_name = f"temporal_{ra:.6f}_{dec:.6f}_{fov:.6f}".replace("-", "m").replace(".", "p")
    candidates = []
    try:
        candidates.append(irsa_client._region_cache_folder(ra, dec, fov) / "manifest.json")
    except Exception as exc:  # pragma: no cover - defensivo
        logger.debug("Sin carpeta de caché regular: %s", exc)
    candidates.append(CACHE_DIR / temporal_name / "manifest.json")
    for manifest_path in candidates:
        if not manifest_path.exists():
            continue
        try:
            frames, _ = irsa_client._read_cached_manifest(manifest_path, (ra, dec, fov))
            add(frames)
        except Exception as exc:
            logger.debug("Manifest no utilizable para la línea histórica (%s): %s", manifest_path, exc)
    return merged


# ----------------------------------------------------------------------------
# Medición de una exposición
# ----------------------------------------------------------------------------
def _aperture_fractions(xx: np.ndarray, yy: np.ndarray, cx: float, cy: float, radius: float,
                        subsample: int = 5) -> np.ndarray:
    """Fracción de cada píxel dentro del círculo (submuestreo 5×5)."""
    offsets = (np.arange(subsample) + 0.5) / subsample - 0.5
    frac = np.zeros(xx.shape, dtype=float)
    near = np.hypot(xx - cx, yy - cy) <= radius + 1.0
    xs, ys = xx[near].astype(float), yy[near].astype(float)
    acc = np.zeros(xs.shape, dtype=float)
    for oy in offsets:
        for ox in offsets:
            acc += np.hypot(xs + ox - cx, ys + oy - cy) <= radius
    frac[near] = acc / (subsample * subsample)
    return frac


def measure_frame(fr: Dict[str, Any], ra: float, dec: float) -> Optional[Dict[str, Any]]:
    """
    Mide una exposición en (ra, dec). Devuelve None si el punto cae fuera del recorte
    o no hay píxeles útiles. Claves: flux (brillo superficial medio en la apertura, MJy/sr),
    unc, snr, mode ('aperture' | 'halo'), wavelength_um, bandwidth_um, centroid (ra, dec) o None.
    """
    if fr.get("flux_unit") != "MJy/sr":
        return None
    x, y = fr["wcs"].all_world2pix([[ra, dec]], 0)[0]
    data, bad, var = fr["data"], fr["bad"], fr.get("variance")
    ny, nx = data.shape
    if not (np.isfinite(x) and np.isfinite(y)) or not (0 <= x < nx and 0 <= y < ny):
        return None

    yy, xx = np.mgrid[0:ny, 0:nx]
    good = ~bad
    r = np.hypot(xx - x, yy - y)

    ann = (r > APERTURE_PIX * 2) & (r <= APERTURE_PIX * 3.5) & good
    if ann.sum() > 3:
        bkg = float(np.median(data[ann]))
        noise = float(1.4826 * np.median(np.abs(data[ann] - bkg))) or float(np.std(data[ann]))
    else:
        bkg, noise = 0.0, 0.0

    ap_all = r <= APERTURE_PIX
    ap = ap_all & good
    saturated = ap_all.sum() > 0 and ap.sum() < 0.5 * ap_all.sum()

    centroid_world = None
    cx, cy = x, y
    if not saturated and ap.sum() > 0 and noise > 0:
        # Centroide ponderado por flujo: sigue a la fuente si se corrió una fracción de píxel.
        win = (r <= 3.0) & good
        if win.sum() >= 5 and float(np.max(data[win]) - bkg) > CENTROID_MIN_SNR * noise:
            for radius in (2.5, 2.0, 2.0):
                rr = np.hypot(xx - cx, yy - cy)
                sel = (rr <= radius) & good
                w = np.clip(data[sel] - bkg, 0.0, None)
                if w.sum() <= 0:
                    break
                cx = float(np.sum(w * xx[sel]) / w.sum())
                cy = float(np.sum(w * yy[sel]) / w.sum())
            if math.hypot(cx - x, cy - y) <= CENTROID_MAX_OFFSET_PIX:
                c_ra, c_dec = fr["wcs"].all_pix2world([[cx, cy]], 0)[0]
                if np.isfinite(c_ra) and np.isfinite(c_dec):
                    centroid_world = (float(c_ra), float(c_dec))
            if centroid_world is None:
                cx, cy = x, y

    centroid_err = CENTROID_ERR_ARCSEC["aperture"]
    if saturated:
        # Núcleo saturado: se mide el resplandor (alas de la PSF) fuera de la zona enmascarada.
        # Posición: centro del resplandor alrededor de la mancha saturada (validado con
        # Barnard's Star: residuo ~2″ por exposición frente a su trayectoria de catálogo).
        hx, hy = x, y
        labels, _ = label_regions(bad)
        near_blob = labels[(r <= 4.0) & bad]
        if near_blob.size:
            blob = labels == np.bincount(near_blob).argmax()
            bx, by = float(xx[blob].mean()), float(yy[blob].mean())
            far0 = (np.hypot(xx - bx, yy - by) > 11.0) & good
            glow = (np.hypot(xx - bx, yy - by) <= 9.0) & good
            if far0.sum() >= 20 and glow.sum() >= 20:
                w = np.clip(data[glow] - float(np.median(data[far0])), 0.0, None)
                if w.sum() > 0:
                    gx, gy = float(np.sum(w * xx[glow]) / w.sum()), float(np.sum(w * yy[glow]) / w.sum())
                    if math.hypot(gx - x, gy - y) <= SATURATED_MAX_OFFSET_PIX:
                        hx, hy = gx, gy
                        c_ra, c_dec = fr["wcs"].all_pix2world([[gx, gy]], 0)[0]
                        if np.isfinite(c_ra) and np.isfinite(c_dec):
                            centroid_world = (float(c_ra), float(c_dec))
                            centroid_err = CENTROID_ERR_ARCSEC["halo"]
        rh = np.hypot(xx - hx, yy - hy)
        ring = (rh > 6.0) & (rh <= 9.0) & good
        far = (rh > 11.0) & good
        if ring.sum() < 20 or far.sum() < 20:
            return None
        far_bkg = float(np.median(data[far]))
        flux = float(np.median(data[ring]) - far_bkg)
        unc = float(1.2533 * np.std(data[ring]) / math.sqrt(ring.sum()))
        mode = "halo"
    else:
        if centroid_world is not None:
            r = np.hypot(xx - cx, yy - cy)
            ap = (r <= APERTURE_PIX) & good
            ann = (r > APERTURE_PIX * 2) & (r <= APERTURE_PIX * 3.5) & good
            if ann.sum() > 3:
                bkg = float(np.median(data[ann]))
        if ap.sum() == 0:
            return None
        # Suma dentro de la apertura con borde suavizado (cada píxel pesa por la fracción
        # que cae dentro del círculo). Con la PSF submuestreada de SPHEREx esto repite
        # ~2,5 veces mejor que promediar los píxeles enteros (medido sobre estrellas reales).
        frac = _aperture_fractions(xx, yy, cx, cy, APERTURE_PIX)
        inside = frac > 0
        if (inside & bad).any():
            return None  # un píxel enmascarado dentro de la apertura falsea la suma
        area = math.pi * APERTURE_PIX ** 2
        flux = float(np.sum(frac[inside] * (data[inside] - bkg)) / area)
        if var is not None and np.all(np.isfinite(var[inside]) & (var[inside] >= 0)):
            unc = float(np.sqrt(np.sum(frac[inside] ** 2 * var[inside])) / area)
        elif noise > 0:
            unc = float(noise * np.sqrt(np.sum(frac[inside] ** 2)) / area)
        else:
            unc = 0.0
        mode = "aperture"

    wl, bw = fr["wavelength_center_um"], fr["bandwidth_um"]
    if fr.get("spectral_wcs") is not None:
        try:
            wl, bw = _spectral_values_um(fr["spectral_wcs"], x, y)
        except Exception:
            # Do not replace an invalid native-pixel wavelength with the center.
            return None
    if not all(np.isfinite(v) for v in (wl, bw, flux, unc)) or wl <= 0:
        return None
    return {
        "flux": flux,
        "unc": max(0.0, unc),
        "snr": float(flux / unc) if unc > 0 else 0.0,
        "mode": mode,
        "wavelength_um": float(wl),
        "bandwidth_um": float(max(0.0, bw)),
        "centroid": centroid_world,
        "centroid_err_arcsec": centroid_err,
    }


def select_frames_for_timeline(frames_meta: List[Dict[str, Any]], limit: int = MAX_FRAMES) -> List[Dict[str, Any]]:
    """
    Si hay más recortes que el límite, conserva los que más separación temporal aportan
    dentro de cada detector (extremos primero), para acotar el tiempo de cálculo.
    """
    if len(frames_meta) <= limit:
        return list(frames_meta)
    by_det: Dict[str, List[Tuple[float, int]]] = {}
    undated: List[int] = []
    for idx, fm in enumerate(frames_meta):
        mjd = observation_mjd(str(fm.get("obs_time") or ""))
        if mjd is None:
            undated.append(idx)
        else:
            by_det.setdefault(detector_code(fm.get("detector_band")), []).append((mjd, idx))

    queues: List[List[int]] = []
    for det in sorted(by_det):
        items = sorted(by_det[det])
        times = [t for t, _ in items]
        order = list(dict.fromkeys([0, len(items) - 1]))
        # distancia de cada fecha a la más cercana ya elegida (muestreo "más lejano primero")
        nearest = [min(abs(t - times[j]) for j in order) for t in times]
        while len(order) < len(items):
            pick = max(range(len(items)), key=lambda i: (nearest[i], -i))
            if nearest[pick] <= 0 and pick in order:
                break
            order.append(pick)
            nearest = [min(d, abs(t - times[pick])) for d, t in zip(nearest, times)]
            nearest[pick] = -1.0
        for i in order:
            nearest[i] = -1.0
        order += [i for i in range(len(items)) if i not in set(order)]
        queues.append([items[i][1] for i in order])

    chosen: List[int] = []
    depth = 0
    while len(chosen) < limit and any(depth < len(q) for q in queues):
        for q in queues:
            if depth < len(q) and len(chosen) < limit:
                chosen.append(q[depth])
        depth += 1
    chosen += undated[: max(0, limit - len(chosen))]
    return [frames_meta[i] for i in sorted(chosen)]


def measure_all_frames(ra: float, dec: float, frames_meta: List[Dict[str, Any]],
                       track: Optional[Callable[[float], Tuple[float, float]]] = None) -> List[Dict[str, Any]]:
    """
    Mide cada recorte y descarta duplicados (misma fecha, detector y λ).
    Si se pasa ``track(mjd) -> (ra, dec)``, la apertura acompaña al objeto en movimiento.
    """
    out: List[Dict[str, Any]] = []
    seen: set[Tuple[float, str, float]] = set()
    for fm in select_frames_for_timeline(frames_meta):
        path = Path(str(fm.get("local_path", "")))
        if not path.exists():
            continue
        try:
            fr = _get_frame(path)
            mjd = observation_mjd(str(fm.get("obs_time") or "")) or observation_mjd(str(fr.get("obs_time") or ""))
            if mjd is None:
                continue
            m_ra, m_dec = track(mjd) if track is not None else (ra, dec)
            m = measure_frame(fr, m_ra, m_dec)
            if m is None:
                continue
            det = detector_code(fm.get("detector_band") or fr.get("detector"))
            key = (round(mjd, 4), det, round(m["wavelength_um"], 4))
            if key in seen:
                continue
            seen.add(key)
            m.update({"mjd": float(mjd), "detector": det, "cutout_url": str(fm.get("cutout_url", "")),
                      "local_path": str(path)})
            out.append(m)
        except Exception as exc:  # un recorte malo no debe tumbar la línea histórica
            logger.warning("Se omite %s en la línea histórica: %s", path.name, exc)
    out.sort(key=lambda p: p["mjd"])
    return out


# ----------------------------------------------------------------------------
# Visitas
# ----------------------------------------------------------------------------
def group_visits(measurements: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Agrupa exposiciones cercanas en el tiempo. Con campañas largas (> 45 días) una
    visita junta todo lo que esté a menos de 3 días; con campañas cortas, cada día (UTC).
    Asigna 'visit_id' a cada medición.
    """
    if not measurements:
        return []
    mjds = sorted(m["mjd"] for m in measurements)
    long_campaign = (mjds[-1] - mjds[0]) > 45.0
    visits: List[Dict[str, Any]] = []
    for m in sorted(measurements, key=lambda p: p["mjd"]):
        if long_campaign:
            new_visit = not visits or m["mjd"] - visits[-1]["mjd_end"] > 3.0
        else:  # campaña corta: una visita por día (UTC)
            new_visit = not visits or math.floor(m["mjd"]) != math.floor(visits[-1]["mjd_end"])
        if new_visit:
            visits.append({"visit_id": len(visits), "mjd_start": m["mjd"], "mjd_end": m["mjd"], "_items": []})
        visits[-1]["mjd_end"] = m["mjd"]
        visits[-1]["_items"].append(m)
        m["visit_id"] = visits[-1]["visit_id"]
    for v in visits:
        items = v.pop("_items")
        v["mjd_mid"] = float(np.mean([m["mjd"] for m in items]))
        v["date_iso"] = mjd_to_iso_date(v["mjd_mid"])
        v["label"] = mjd_to_label(v["mjd_mid"])
        v["n_exposures"] = len(items)
        v["detectors"] = sorted({m["detector"] for m in items})
    return visits


# ----------------------------------------------------------------------------
# Series de brillo por detector
# ----------------------------------------------------------------------------
def _aggregate_visit(points: List[Dict[str, Any]], values: List[float], mode: str,
                     extra_floor: float = 0.0) -> Dict[str, Any]:
    vals = np.asarray(values, dtype=float)
    uncs = np.asarray([p["unc"] for p in points], dtype=float)
    if np.all(uncs > 0):
        w = 1.0 / uncs ** 2
        flux = float(np.sum(w * vals) / np.sum(w))
        unc = float(math.sqrt(1.0 / np.sum(w)))
    else:
        flux, unc = float(np.mean(vals)), 0.0
    if len(vals) >= 3:
        unc = max(unc, float(np.std(vals, ddof=1) / math.sqrt(len(vals))))
    floor_rel = max(SYSTEMATIC_FLOOR[mode], SINGLE_EXPOSURE_SCATTER[mode] / math.sqrt(len(vals))) + extra_floor
    unc = float(math.hypot(unc, floor_rel * abs(flux)))
    return {
        "visit_id": points[0]["visit_id"],
        "mjd": float(np.mean([p["mjd"] for p in points])),
        "flux_mjy_sr": flux,
        "flux_uncertainty": unc,
        "n_exposures": len(points),
        "wavelength_um": float(np.mean([p["wavelength_um"] for p in points])),
        "cutout_url": max(points, key=lambda p: p["snr"])["cutout_url"],
    }


def _series_statistics(points: List[Dict[str, Any]], mode: str) -> Dict[str, Any]:
    flux = np.asarray([p["flux_mjy_sr"] for p in points], dtype=float)
    unc = np.asarray([p["flux_uncertainty"] for p in points], dtype=float)
    stats: Dict[str, Any] = {
        "change_pct": None, "change_sigma": None, "amplitude_pct": None,
        "variability_p_value": None, "median_snr": 0.0, "status": "insufficient",
    }
    if len(points) < 2:
        return stats
    safe = np.where(unc > 0, unc, np.nan)
    snr = np.abs(flux) / safe
    stats["median_snr"] = float(np.nanmedian(snr)) if np.isfinite(snr).any() else 0.0
    if stats["median_snr"] < MIN_DETECTION_SNR or np.median(flux) <= 0:
        stats["status"] = "faint"
        return stats

    median = float(np.median(flux))
    d_fl = float(flux[-1] - flux[0])
    s_fl = float(math.hypot(unc[-1], unc[0]))
    stats["change_pct"] = round(100.0 * d_fl / abs(flux[0]), 2) if flux[0] > 0 else None
    stats["change_sigma"] = round(d_fl / s_fl, 2) if s_fl > 0 else None
    stats["amplitude_pct"] = round(100.0 * float(flux.max() - flux.min()) / abs(median), 2)

    if np.all(unc > 0):
        w = 1.0 / unc ** 2
        mean = float(np.sum(w * flux) / np.sum(w))
        chi2 = float(np.sum(((flux - mean) / unc) ** 2))
        p_value = float(chi2_dist.sf(chi2, len(points) - 1))
        stats["variability_p_value"] = p_value
        variable = p_value < VARIABILITY_P_VALUE and stats["amplitude_pct"] >= MIN_AMPLITUDE_PCT[mode]
    else:
        variable = False
    if variable:
        # El respaldo aproximado compara colores distintos: puede sugerir, no afirmar.
        stats["status"] = "variable" if mode == "strict" else "possible"
    else:
        stats["status"] = "stable"
    return stats


def build_detector_series(measurements: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Una serie temporal por detector, estricta si es posible y aproximada si no."""
    by_det: Dict[str, List[Dict[str, Any]]] = {}
    for m in measurements:
        by_det.setdefault(m["detector"], []).append(m)

    series: List[Dict[str, Any]] = []
    for det in sorted(by_det):
        pts_all = by_det[det]
        # no mezclar fotometría de apertura con fotometría de halo
        n_halo = sum(1 for p in pts_all if p["mode"] == "halo")
        phot_mode = "halo" if n_halo > len(pts_all) / 2 else "aperture"
        pts = [p for p in pts_all if p["mode"] == phot_mode]
        if len({p["visit_id"] for p in pts}) < 2:
            continue
        extra_floor = HALO_EXTRA_FLOOR if phot_mode == "halo" else 0.0

        def best_window(tolerance: float) -> List[Dict[str, Any]]:
            """Mejor grupo de puntos cuya λ difiere a lo sumo `tolerance` y cubre ≥ 2 visitas."""
            best: List[Dict[str, Any]] = []
            best_score: Tuple[Any, ...] = (0,)
            for anchor in pts:
                ref = anchor["wavelength_um"]
                group = [p for p in pts if 0.0 <= (p["wavelength_um"] - ref) / ref <= tolerance]
                visit_ids = {p["visit_id"] for p in group}
                if len(visit_ids) < 2:
                    continue
                mjds = [p["mjd"] for p in group]
                score = (len(visit_ids), max(mjds) - min(mjds), len(group),
                         float(np.median([abs(p["snr"]) for p in group])))
                if score > best_score:
                    best_score, best = score, group
            return best

        # --- Modo estricto: λ casi idéntica (la física es directa) ------------
        used = best_window(STRICT_WAVELENGTH_TOLERANCE)
        if used:
            mode = "strict"
            values = [p["flux"] for p in used]
            ref_wl = float(np.median([p["wavelength_um"] for p in used]))
            note = ""
        else:
            # --- Respaldo declarado: λ cercanas del mismo detector, descontando
            #     la pendiente espectral del objeto dentro de esa ventana ---------
            mode = "approx"
            used = best_window(APPROX_WAVELENGTH_TOLERANCE) or pts
            wls = np.asarray([p["wavelength_um"] for p in used], dtype=float)
            fluxes = np.asarray([p["flux"] for p in used], dtype=float)
            ref_wl = float(np.median(wls))
            if len(np.unique(np.round(wls, 4))) >= 3:
                slope, intercept = np.polyfit(wls, fluxes, 1)
            else:
                slope, intercept = 0.0, float(np.mean(fluxes))
            values = list(fluxes - (slope * wls + intercept) + (slope * ref_wl + intercept))
            note = "Estimación aproximada: longitudes de onda cercanas en el mismo detector"
        wl_span = (max(p["wavelength_um"] for p in used) - min(p["wavelength_um"] for p in used)) / ref_wl

        by_visit: Dict[int, List[int]] = {}
        for idx, p in enumerate(used):
            by_visit.setdefault(p["visit_id"], []).append(idx)
        points = [
            _aggregate_visit([used[i] for i in idxs], [values[i] for i in idxs], mode, extra_floor)
            for _, idxs in sorted(by_visit.items())
        ]
        points.sort(key=lambda p: p["mjd"])
        for p in points:
            p["date_iso"] = mjd_to_iso_date(p["mjd"])
            p["label"] = mjd_to_label(p["mjd"])
        stats = _series_statistics(points, mode)
        if phot_mode == "halo":
            halo_note = "Centro saturado: se mide el resplandor alrededor de la estrella"
            note = f"{halo_note}. {note}" if note else halo_note
        series.append({
            "detector": det,
            "mode": mode,
            "photometry": phot_mode,
            "reference_wavelength_um": round(ref_wl, 4),
            "wavelength_span_pct": round(100.0 * wl_span, 2),
            "n_visits": len(points),
            "baseline_days": round(points[-1]["mjd"] - points[0]["mjd"], 2),
            "points": points,
            "note": note,
            **stats,
        })
    return series


def pick_default_series(series: List[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    """Prefiere: fuente detectada, comparación estricta, apertura, más visitas, más tiempo, más SNR."""
    if not series:
        return None
    return max(series, key=lambda s: (
        s["status"] in ("variable", "possible", "stable"),
        s["mode"] == "strict",
        s["photometry"] == "aperture",
        min(s["n_visits"], 6),
        s["baseline_days"],
        s["median_snr"],
    ))


# ----------------------------------------------------------------------------
# Movimiento medido por centroides
# ----------------------------------------------------------------------------
def measure_motion(measurements: List[Dict[str, Any]], visits: List[Dict[str, Any]],
                   ra: float, dec: float) -> Dict[str, Any]:
    cos_dec = max(1e-6, math.cos(math.radians(dec)))
    per_visit: Dict[int, List[Tuple[float, float]]] = {}
    base_err: Dict[int, float] = {}
    floor_err: Dict[int, float] = {}
    for m in measurements:
        if m.get("centroid") and m["snr"] >= CENTROID_MIN_SNR:
            c_ra, c_dec = m["centroid"]
            d_ra = ((c_ra - ra + 540.0) % 360.0) - 180.0
            vid = m["visit_id"]
            per_visit.setdefault(vid, []).append((d_ra * cos_dec * 3600.0, (c_dec - dec) * 3600.0))
            base_err[vid] = max(base_err.get(vid, 0.0), float(m.get("centroid_err_arcsec", 1.0)))
            kind = "halo" if m["mode"] == "halo" else "aperture"
            floor_err[vid] = max(floor_err.get(vid, 0.0), CENTROID_FLOOR_ARCSEC[kind])

    positions: List[Dict[str, Any]] = []
    mjd_by_visit = {v["visit_id"]: v["mjd_mid"] for v in visits}
    for vid in sorted(per_visit):
        arr = np.asarray(per_visit[vid], dtype=float)
        east, north = float(np.median(arr[:, 0])), float(np.median(arr[:, 1]))
        err = base_err[vid] / math.sqrt(len(arr))
        if len(arr) >= 3:
            scatter = float(1.4826 * np.median(np.hypot(arr[:, 0] - east, arr[:, 1] - north)))
            err = max(err, scatter / math.sqrt(len(arr)))
        err = max(floor_err[vid], err)
        positions.append({
            "visit_id": vid, "mjd": mjd_by_visit.get(vid, 0.0),
            "east_arcsec": round(east, 2), "north_arcsec": round(north, 2),
            "uncertainty_arcsec": round(err, 2), "n_exposures": int(len(arr)),
        })

    result: Dict[str, Any] = {
        "status": "unknown", "shift_arcsec": None, "shift_sigma": None, "baseline_days": None,
        "pm_arcsec_yr": None, "pm_ra_mas_yr": None, "pm_dec_mas_yr": None, "positions": positions,
    }
    if len(positions) < 2:
        return result
    first, last = positions[0], positions[-1]
    baseline = last["mjd"] - first["mjd"]
    d_e, d_n = last["east_arcsec"] - first["east_arcsec"], last["north_arcsec"] - first["north_arcsec"]
    shift = math.hypot(d_e, d_n)
    sigma = shift / math.hypot(first["uncertainty_arcsec"], last["uncertainty_arcsec"])
    result.update({"shift_arcsec": round(shift, 2), "shift_sigma": round(sigma, 2), "baseline_days": round(baseline, 2)})
    moved = (shift >= MOTION_MIN_SHIFT_ARCSEC and sigma >= MOTION_MIN_SIGMA
             and baseline >= MOTION_MIN_BASELINE_DAYS)
    result["status"] = "moved" if moved else "static"
    if moved:
        years = baseline / 365.25
        result["pm_arcsec_yr"] = round(shift / years, 2)
        result["pm_ra_mas_yr"] = round(1000.0 * d_e / years, 0)
        result["pm_dec_mas_yr"] = round(1000.0 * d_n / years, 0)
    return result


# ----------------------------------------------------------------------------
# Miniaturas
# ----------------------------------------------------------------------------
def build_stamp_wcs(ra: float, dec: float, fov_deg: float, npix: int = STAMP_PIXELS) -> WCS:
    wcs = WCS(naxis=2)
    wcs.wcs.ctype = ["RA---TAN", "DEC--TAN"]
    wcs.wcs.crval = [ra, dec]
    wcs.wcs.crpix = [(npix + 1) / 2.0, (npix + 1) / 2.0]
    scale = fov_deg / npix
    wcs.wcs.cdelt = [-scale, scale]  # Este a la izquierda, Norte arriba
    return wcs


def make_stamp(fr: Dict[str, Any], stamp_wcs: WCS, npix: int = STAMP_PIXELS) -> np.ndarray:
    """Recorte norte-arriba (fila 0 = norte) con el fondo restado; NaN donde no hay dato."""
    jj, ii = np.meshgrid(np.arange(npix), np.arange(npix))
    world = stamp_wcs.wcs_pix2world(np.column_stack([jj.ravel(), ii.ravel()]), 0)
    pix = fr["wcs"].all_world2pix(world, 0)
    x, y = pix[:, 0], pix[:, 1]
    image = fr["cleaned_image"]
    ny, nx = image.shape
    inside = np.isfinite(x) & np.isfinite(y) & (x >= -0.5) & (x <= nx - 0.5) & (y >= -0.5) & (y <= ny - 0.5)
    xs, ys = np.where(inside, x, 0.0), np.where(inside, y, 0.0)
    vals = map_coordinates(image.astype(np.float32), [ys, xs], order=1, mode="nearest")
    bad = fr["bad"][np.clip(np.rint(ys).astype(int), 0, ny - 1), np.clip(np.rint(xs).astype(int), 0, nx - 1)]
    vals = np.where(inside & ~bad, vals, np.nan).reshape(npix, npix)
    # Píxeles enmascarados (núcleo saturado, rayos cósmicos): se rellenan con el máximo vecino
    # para que una estrella saturada se vea como un disco brillante y no como un agujero negro.
    masked = (inside & bad).reshape(npix, npix)
    for _ in range(10):
        holes = masked & ~np.isfinite(vals)
        if not holes.any():
            break
        grown = maximum_filter(np.where(np.isfinite(vals), vals, -np.inf), size=5, mode="nearest")
        fill = holes & np.isfinite(grown)
        if not fill.any():
            break
        vals[fill] = grown[fill]
    return np.flipud(vals)  # FITS: y crece hacia el norte → invertir filas


def stamps_to_png(stamps: List[np.ndarray]) -> List[str]:
    """Convierte un grupo de miniaturas a PNG con la MISMA escala (brillos comparables)."""
    finite = np.concatenate([s[np.isfinite(s)].ravel() for s in stamps]) if stamps else np.array([])
    if finite.size == 0:
        lo, hi = 0.0, 1.0
    else:
        med = float(np.median(finite))
        sigma = float(1.4826 * np.median(np.abs(finite - med))) or 1e-6
        lo = med - 1.5 * sigma
        hi = max(float(np.percentile(finite, 99.8)), med + 8.0 * sigma)
    out = []
    for s in stamps:
        norm = np.clip((np.nan_to_num(s, nan=lo) - lo) / max(hi - lo, 1e-9), 0.0, 1.0)
        img = np.arcsinh(norm * 12.0) / np.arcsinh(12.0)
        buf = io.BytesIO()
        Image.fromarray((img * 255.0).astype(np.uint8), mode="L").save(buf, format="PNG", optimize=True)
        out.append("data:image/png;base64," + base64.b64encode(buf.getvalue()).decode("ascii"))
    return out


def build_stamps(measurements: List[Dict[str, Any]], series: List[Dict[str, Any]],
                 ra: float, dec: float, stamp_fov_deg: float) -> List[Dict[str, Any]]:
    ref_wl = {s["detector"]: s["reference_wavelength_um"] for s in series}
    cos_dec = max(1e-6, math.cos(math.radians(dec)))
    chosen: Dict[Tuple[int, str], Dict[str, Any]] = {}
    for m in measurements:
        key = (m["visit_id"], m["detector"])
        cur = chosen.get(key)
        if m["detector"] in ref_wl:
            rank = -abs(m["wavelength_um"] - ref_wl[m["detector"]])
        else:
            rank = abs(m["snr"])
        if cur is None or rank > cur["_rank"]:
            chosen[key] = {**m, "_rank": rank}

    # Si hay demasiadas, priorizar detectores con serie temporal y repartir en el tiempo.
    items = sorted(chosen.values(), key=lambda m: (m["detector"] not in ref_wl, m["detector"], m["mjd"]))
    items = items[:MAX_STAMPS]

    stamp_wcs = build_stamp_wcs(ra, dec, stamp_fov_deg)
    by_det: Dict[str, List[Tuple[Dict[str, Any], np.ndarray]]] = {}
    for m in items:
        try:
            arr = make_stamp(_get_frame(Path(m["local_path"])), stamp_wcs)
        except Exception as exc:
            logger.warning("No se pudo generar la miniatura de %s: %s", Path(m["local_path"]).name, exc)
            continue
        by_det.setdefault(m["detector"], []).append((m, arr))

    out: List[Dict[str, Any]] = []
    for det, pairs in by_det.items():
        pngs = stamps_to_png([arr for _, arr in pairs])
        for (m, _), png in zip(pairs, pngs):
            stamp = {
                "visit_id": m["visit_id"], "detector": det, "mjd": m["mjd"],
                "date_iso": mjd_to_iso_date(m["mjd"]), "label": mjd_to_label(m["mjd"]),
                "wavelength_um": round(m["wavelength_um"], 4), "cutout_url": m["cutout_url"],
                "image_base64": png, "centroid_east_arcsec": None, "centroid_north_arcsec": None,
            }
            if m.get("centroid"):
                d_ra = ((m["centroid"][0] - ra + 540.0) % 360.0) - 180.0
                stamp["centroid_east_arcsec"] = round(d_ra * cos_dec * 3600.0, 2)
                stamp["centroid_north_arcsec"] = round((m["centroid"][1] - dec) * 3600.0, 2)
            out.append(stamp)
    out.sort(key=lambda s: (s["detector"], s["mjd"]))
    return out


# ----------------------------------------------------------------------------
# Resumen en lenguaje claro
# ----------------------------------------------------------------------------
def build_headline(visits: List[Dict[str, Any]], default_series: Optional[Dict[str, Any]],
                   motion: Dict[str, Any], known_motion: Optional[Dict[str, Any]],
                   fov_deg: float) -> Dict[str, Any]:
    notes: List[str] = []
    span_days = (visits[-1]["mjd_mid"] - visits[0]["mjd_mid"]) if len(visits) >= 2 else 0.0
    period = (f"entre el {visits[0]['label']} y el {visits[-1]['label']}" if len(visits) >= 2 else "")

    brightness_title = brightness_detail = ""
    brightness_status = "insufficient"
    s = default_series
    if s is not None:
        period = f"entre el {s['points'][0]['label']} y el {s['points'][-1]['label']}"
        brightness_status = s["status"]
        s_span = _span_text(s["baseline_days"])
        if s["status"] == "variable":
            pct, sig = s.get("change_pct"), s.get("change_sigma")
            if pct is not None and sig is not None and abs(sig) >= 3.0 and abs(pct) >= MIN_AMPLITUDE_PCT[s["mode"]]:
                verb = "subió" if pct > 0 else "bajó"
                brightness_title = f"Cambió su brillo: {verb} un {_fmt_pct(pct)} %"
                brightness_detail = f"Su brillo infrarrojo {verb} un {_fmt_pct(pct)} % en {s_span}."
            else:
                brightness_title = f"Su brillo cambió hasta un {_fmt_pct(s['amplitude_pct'])} %"
                brightness_detail = (f"Su brillo infrarrojo subió y bajó hasta un {_fmt_pct(s['amplitude_pct'])} % "
                                     f"a lo largo de {s_span}.")
        elif s["status"] == "possible":
            brightness_title = "Podría haber cambiado su brillo (estimación aproximada)"
            brightness_detail = (f"La estimación sugiere una variación de hasta ~{_fmt_pct(s['amplitude_pct'])} % en {s_span}, "
                                 "pero compara colores infrarrojos parecidos y no idénticos: hace falta repetir "
                                 "la misma banda para confirmarlo.")
        elif s["status"] == "stable":
            limit = max(s.get("amplitude_pct") or 0.0, MIN_AMPLITUDE_PCT[s["mode"]])
            brightness_title = "Su brillo se mantuvo estable"
            brightness_detail = (f"En {s_span} su brillo infrarrojo no cambió de forma medible "
                                 f"(variación menor a ~{_fmt_pct(limit)} %).")
        elif s["status"] == "faint":
            brightness_title = "Acá no hay una fuente lo bastante brillante para medir cambios"
            brightness_detail = ("En este punto la señal es muy débil frente al ruido, así que no se puede "
                                 "decir si su brillo cambió.")
        if s["note"]:
            notes.append(s["note"] + ".")

    if motion["status"] == "moved":
        status = "moved"
        title = "Este objeto se movió entre fechas"
        detail = (f"Se corrió unos {_fmt_num(motion['shift_arcsec'])}″ en {_span_text(motion['baseline_days'])} "
                  f"(≈ {_fmt_num(motion['pm_arcsec_yr'])}″ por año).")
        if known_motion and abs(motion["pm_arcsec_yr"] - known_motion["pm_total_arcsec_yr"]) \
                <= 0.35 * known_motion["pm_total_arcsec_yr"]:
            detail += (f" Coincide con el movimiento de catálogo de {known_motion['name']} "
                       f"({_fmt_num(known_motion['pm_total_arcsec_yr'], 1)}″ por año).")
        if brightness_status in ("variable", "possible", "stable") and brightness_detail:
            detail += " " + brightness_detail
    elif not visits:
        status, title = "insufficient", "Todavía no hay datos para ver cambios en este lugar"
        detail = "SPHEREx no tiene mediciones utilizables en este punto. Probá sobre una estrella o fuente visible."
    elif len(visits) < 2 or s is None:
        status, title = "insufficient", "Hace falta al menos una segunda fecha para comparar"
        detail = (f"SPHEREx observó este lugar solo el {visits[0]['label']}." if len(visits) < 2 else
                  f"Hay {len(visits)} fechas, pero ninguna repite el mismo detector para comparar el brillo.")
        detail += " Probá «Buscar pares temporales» o «Sincronizar nuevas entregas IRSA» para sumar fechas."
    elif brightness_status == "variable":
        status, title, detail = "brightness_changed", brightness_title, brightness_detail
    elif brightness_status == "possible":
        status, title, detail = "possible_change", brightness_title, brightness_detail
    elif brightness_status == "stable":
        status, title = "stable", "No se ven cambios medibles en este lugar"
        detail = brightness_detail
        if motion["status"] == "static":
            detail += " Tampoco se movió de su lugar."
    else:
        status, title, detail = "faint", brightness_title, brightness_detail

    if known_motion:
        km = known_motion
        far_now = km["offset_now_arcsec"] > max(15.0, 0.35 * fov_deg * 3600.0)
        if far_now and status in ("faint", "insufficient", "stable"):
            years = max(1.0, km["current_epoch_year"] - km["ref_epoch_year"])
            status = "moved_away"
            title = f"{km['name']} ya no está en este punto: se mudó"
            detail = (f"Según los catálogos avanza {_fmt_num(km['pm_total_arcsec_yr'], 1)}″ por año: en "
                      f"{round(years)} años se alejó unos {_fmt_num(km['offset_now_arcsec'] / 60.0)}′ de esta "
                      "coordenada. Las imágenes históricas de abajo muestran su recorrido.")
        notes.append(
            f"Según los catálogos, {km['name']} se desplaza {_fmt_num(km['pm_total_arcsec_yr'], 2)}″ por año: "
            "las imágenes históricas muestran ese recorrido a lo largo de décadas."
        )
        if far_now:
            notes.append(
                f"Hoy {km['name']} está a unos {_fmt_num(km['offset_now_arcsec'] / 60.0)}′ de este punto; "
                "usá «Ir a su posición actual» para verlo en los datos de SPHEREx."
            )
    if span_days and span_days < 30 and status in ("stable", "faint"):
        notes.append(f"Las fechas disponibles abarcan solo {_span_text(span_days)}: "
                     "los cambios lentos todavía no se pueden ver.")

    technical = ""
    if s is not None:
        mode_txt = "comparación estricta" if s["mode"] == "strict" else "estimación aproximada"
        technical = (f"Detector {s['detector']} · λ ≈ {s['reference_wavelength_um']:.3f} µm "
                     f"(Δλ/λ {s['wavelength_span_pct']:.1f} %) · {s['n_visits']} fechas · {mode_txt}")
        if s.get("change_sigma") is not None:
            technical += f" · primera→última: {s['change_sigma']:+.1f}σ"
    return {"status": status, "title": title, "detail": detail, "period": period,
            "notes": notes, "technical": technical}


# ----------------------------------------------------------------------------
# Punto de entrada
# ----------------------------------------------------------------------------
def compute_timeline(ra: float, dec: float, frames_meta: List[Dict[str, Any]],
                     fov_deg: float = 0.05, stamp_fov_deg: Optional[float] = None) -> Dict[str, Any]:
    # Fecha "actual" de los datos: la última exposición disponible.
    frame_mjds = [m for m in (observation_mjd(str(fm.get("obs_time") or "")) for fm in frames_meta) if m is not None]
    mjd_now = max(frame_mjds) if frame_mjds else 61000.0
    known_motion = known_motion_for_point(ra, dec, mjd_now)

    # Si el punto elegido es un objeto veloz de catálogo, la apertura lo acompaña fecha a fecha:
    # así su corrimiento no se confunde con un cambio de brillo.
    track = None
    if known_motion and known_motion["offset_now_arcsec"] <= TRACK_MATCH_ARCSEC:
        km = known_motion

        def track(mjd: float) -> Tuple[float, float]:
            dt = mjd_to_year(mjd) - km["ref_epoch_year"]
            t_dec = km["ref_dec"] + km["pm_dec_mas_yr"] / 1000.0 * dt / 3600.0
            t_ra = km["ref_ra"] + (km["pm_ra_mas_yr"] / 1000.0 * dt / 3600.0) / max(
                1e-6, math.cos(math.radians(km["ref_dec"])))
            return t_ra % 360.0, t_dec

    measurements = measure_all_frames(ra, dec, frames_meta, track=track)
    visits = group_visits(measurements)
    series = build_detector_series(measurements)
    default_series = pick_default_series(series)
    motion = measure_motion(measurements, visits, ra, dec)
    stamp_fov = float(stamp_fov_deg or min(fov_deg, DEFAULT_STAMP_FOV_DEG))
    stamps = build_stamps(measurements, series, ra, dec, stamp_fov)
    headline = build_headline(visits, default_series, motion, known_motion, fov_deg)
    for sr in series:
        for p in sr["points"]:
            p["flux_mjy_sr"] = round(p["flux_mjy_sr"], 5)
            p["flux_uncertainty"] = round(p["flux_uncertainty"], 5)
            p["wavelength_um"] = round(p["wavelength_um"], 4)
    return {
        "ra": round(ra, 6),
        "dec": round(dec, 6),
        "total_exposures": len(measurements),
        "baseline_days": round(visits[-1]["mjd_mid"] - visits[0]["mjd_mid"], 2) if len(visits) >= 2 else 0.0,
        "visits": visits,
        "series": series,
        "default_detector": default_series["detector"] if default_series else None,
        "motion": motion,
        "known_motion": known_motion,
        "tracking_applied": track is not None,
        "stamps": stamps,
        "stamp_fov_deg": round(stamp_fov, 5),
        "headline": headline,
    }
