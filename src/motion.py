"""
Objetos que cambian: qué estrellas del campo se movieron o cambiaron de brillo.

Reemplaza a la resta de imágenes como método principal. En lugar de comparar dos
momentos, sigue a cada estrella a través de TODAS las fechas SPHEREx disponibles:

1. Encuentra las fuentes del campo en cada exposición (picos y núcleos saturados) y
   agrupa las detecciones que caen en el mismo lugar del cielo en fechas distintas.
2. Mide cada fuente en cada exposición con las MISMAS funciones que la línea histórica
   (``src.timeline.measure_frame``): centroide, fotometría de apertura o de halo.
3. Astrometría relativa: el desvío común de las estrellas fijas en cada exposición
   (error del WCS de esa imagen) se descuenta antes de medir movimientos.
4. Ajusta una recta posición–tiempo (mínimos cuadrados ponderados) y obtiene el
   movimiento en ″/año, su dirección y su incertidumbre.
5. Compara el brillo solo dentro del mismo detector y longitud de onda casi igual
   (``build_detector_series``), con el mismo criterio estadístico de la línea histórica.
6. Cruza con Gaia DR3 propagando sus posiciones (época 2016.0) a la fecha de SPHEREx, y
   con el catálogo fijo de objetivos con movimiento propio conocido.

El movimiento medido y el de catálogo se informan SIEMPRE por separado.
"""

from __future__ import annotations

import logging
import math
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Tuple

import numpy as np
from scipy.ndimage import label as label_regions, maximum_filter
from scipy.spatial import cKDTree

from src.analysis import observation_mjd
from src.config import MANDATORY_TARGETS
from src.pipeline import _get_frame
from src.timeline import (
    CENTROID_FLOOR_ARCSEC,
    CENTROID_MIN_SNR,
    MIN_AMPLITUDE_PCT,
    MOTION_MIN_BASELINE_DAYS,
    MOTION_MIN_SHIFT_ARCSEC,
    SPHEREX_PIXEL_ARCSEC,
    _fmt_num,
    _fmt_pct,
    _span_text,
    build_detector_series,
    build_stamp_wcs,
    detector_code,
    group_visits,
    known_motion_for_point,
    make_stamp,
    measure_all_frames,
    mjd_to_label,
    mjd_to_year,
    pick_default_series,
    select_frames_for_timeline,
    stamps_to_png,
)

logger = logging.getLogger("spherex.motion")

# --- Parámetros científicos ---------------------------------------------------
DETECT_SNR = 8.0                 # pico mínimo (σ del fondo) para proponer una fuente en una exposición
LINK_ARCSEC = 9.0                # ~1,5 píxeles SPHEREx: une detecciones de la misma fuente entre fechas
MIN_VISITS = 2                   # una fuente debe verse en al menos dos fechas
MIN_DETECTION_FRACTION = 0.3     # ...y en al menos el 30 % de las exposiciones que la cubren
MAX_OBJECTS = 24                 # fuentes más brillantes que se siguen (acota el tiempo de cálculo)
# Movimiento: significancia conjunta en 2D. 4σ ≈ p 3·10⁻⁴ por fuente (pocas falsas alarmas por campo).
MOTION_SIGNIFICANCE = 4.0
MOTION_HIGH_SIGNIFICANCE = 6.0
MOTION_MAX_CHI2_RED_HIGH = 4.0   # la recta debe explicar las fechas para dar confianza alta
# Astrometría relativa
REF_MIN_SNR = 12.0               # estrellas de referencia: brillantes...
REF_MAX_SIGNIFICANCE = 3.0       # ...y sin movimiento detectable en la primera pasada
REF_MIN_COUNT = 3                # mínimo de referencias en una exposición para corregirla
# Brillo
BRIGHTNESS_HIGH_P = 1e-6         # p-valor del χ² para confianza alta (además ≥ 3 fechas)
# Vecinas: con píxeles de 6″, una estrella comparable o más brillante a menos de ~4 píxeles
# contamina la apertura y el fondo (falsos cambios de brillo, centroides que tiemblan).
CROWDING_ARCSEC = 25.0
CROWDING_FLUX_RATIO = 0.5
# Cruce con catálogos
GAIA_EPOCH_YEAR = 2016.0
GAIA_MATCH_ARCSEC = 6.0          # 1 píxel SPHEREx
KNOWN_MATCH_ARCSEC = 15.0
PM_AGREEMENT_FRACTION = 0.30     # medido y catálogo "coinciden" si difieren < 30 % (o < 3σ)
# Miniaturas antes/después
CARD_STAMP_FOV_DEG = 0.015       # 54″ ≈ 9 píxeles SPHEREx
CARD_STAMP_PIXELS = 48

_DIRECTIONS = ["el norte", "el noreste", "el este", "el sudeste", "el sur", "el sudoeste", "el oeste", "el noroeste"]


# ----------------------------------------------------------------------------
# Geometría
# ----------------------------------------------------------------------------
def _offsets_arcsec(ra: float, dec: float, ref_ra: float, ref_dec: float) -> Tuple[float, float]:
    """(Este, Norte) en arcsec de (ra, dec) respecto de la referencia (proyección local)."""
    cos_dec = max(1e-6, math.cos(math.radians(ref_dec)))
    d_ra = ((ra - ref_ra + 540.0) % 360.0) - 180.0
    return d_ra * cos_dec * 3600.0, (dec - ref_dec) * 3600.0


def _from_offsets(east: float, north: float, ref_ra: float, ref_dec: float) -> Tuple[float, float]:
    cos_dec = max(1e-6, math.cos(math.radians(ref_dec)))
    return (ref_ra + east / 3600.0 / cos_dec) % 360.0, ref_dec + north / 3600.0


def direction_text(pm_east: float, pm_north: float) -> str:
    """Dirección en el cielo (ángulo de posición medido desde el norte hacia el este)."""
    pa = math.degrees(math.atan2(pm_east, pm_north)) % 360.0
    return _DIRECTIONS[int(((pa + 22.5) % 360.0) // 45.0)]


def position_angle_deg(pm_east: float, pm_north: float) -> float:
    return round(math.degrees(math.atan2(pm_east, pm_north)) % 360.0, 1)


# ----------------------------------------------------------------------------
# Ajuste de movimiento (compartido con la línea histórica)
# ----------------------------------------------------------------------------
def aggregate_visit_positions(measurements: List[Dict[str, Any]], ref_ra: float, ref_dec: float,
                              frame_offsets: Optional[Dict[str, Tuple[float, float]]] = None,
                              mjd_by_visit: Optional[Dict[int, float]] = None) -> List[Dict[str, Any]]:
    """
    Una posición por visita (mediana de las exposiciones) en arcsec (Este, Norte) respecto de
    la referencia, con su incertidumbre. ``frame_offsets[local_path]`` descuenta el desvío
    astrométrico común de cada exposición (astrometría relativa).
    """
    per_visit: Dict[int, List[Tuple[float, float, float]]] = {}
    base_err: Dict[int, float] = {}
    floor_err: Dict[int, float] = {}
    for m in measurements:
        if not m.get("centroid") or m.get("snr", 0.0) < CENTROID_MIN_SNR or "visit_id" not in m:
            continue
        east, north = _offsets_arcsec(m["centroid"][0], m["centroid"][1], ref_ra, ref_dec)
        if frame_offsets:
            off = frame_offsets.get(str(m.get("local_path", "")))
            if off is not None:
                east, north = east - off[0], north - off[1]
        vid = int(m["visit_id"])
        per_visit.setdefault(vid, []).append((east, north, float(m["mjd"])))
        base_err[vid] = max(base_err.get(vid, 0.0), float(m.get("centroid_err_arcsec", 1.0)))
        kind = "halo" if m.get("mode") == "halo" else "aperture"
        floor_err[vid] = max(floor_err.get(vid, 0.0), CENTROID_FLOOR_ARCSEC[kind])

    positions: List[Dict[str, Any]] = []
    for vid in sorted(per_visit):
        arr = np.asarray(per_visit[vid], dtype=float)
        east, north = float(np.median(arr[:, 0])), float(np.median(arr[:, 1]))
        err = base_err[vid] / math.sqrt(len(arr))
        if len(arr) >= 3:
            scatter = float(1.4826 * np.median(np.hypot(arr[:, 0] - east, arr[:, 1] - north)))
            err = max(err, scatter / math.sqrt(len(arr)))
        err = max(floor_err[vid], err)
        mjd = (mjd_by_visit or {}).get(vid, float(np.mean(arr[:, 2])))
        positions.append({
            "visit_id": vid, "mjd": float(mjd), "label": mjd_to_label(mjd),
            "east_arcsec": round(east, 2), "north_arcsec": round(north, 2),
            "uncertainty_arcsec": round(err, 2), "n_exposures": int(len(arr)),
        })
    positions.sort(key=lambda p: p["mjd"])
    return positions


def fit_linear_motion(positions: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Recta posición–tiempo por mínimos cuadrados ponderados, en cada eje (Este, Norte).
    Si la recta no explica las fechas (χ² reducido > 1), las incertidumbres se agrandan
    en √χ²_red (criterio conservador). Devuelve estado 'moving' | 'static' | 'unknown'.
    """
    result: Dict[str, Any] = {
        "status": "unknown", "n_visits": len(positions), "baseline_days": None,
        "pm_ra_mas_yr": None, "pm_dec_mas_yr": None, "pm_total_arcsec_yr": None,
        "pm_uncertainty_arcsec_yr": None, "significance": None, "chi2_reduced": None,
        "shift_arcsec": None, "shift_sigma": None, "position_angle_deg": None, "direction": None,
        "ref_mjd": None, "east0_arcsec": None, "north0_arcsec": None,
    }
    if len(positions) < 2:
        return result
    t = np.asarray([mjd_to_year(p["mjd"]) for p in positions], dtype=float)
    e = np.asarray([p["east_arcsec"] for p in positions], dtype=float)
    n = np.asarray([p["north_arcsec"] for p in positions], dtype=float)
    s = np.asarray([max(1e-3, p["uncertainty_arcsec"]) for p in positions], dtype=float)
    baseline_days = (positions[-1]["mjd"] - positions[0]["mjd"])
    result["baseline_days"] = round(baseline_days, 2)
    w = 1.0 / s ** 2
    t_ref = float(np.sum(w * t) / np.sum(w))
    dt = t - t_ref
    sxx = float(np.sum(w * dt ** 2))
    if sxx <= 0 or baseline_days <= 0:
        return result

    def axis(values: np.ndarray) -> Tuple[float, float, float]:
        mean = float(np.sum(w * values) / np.sum(w))
        slope = float(np.sum(w * dt * (values - mean)) / sxx)
        resid = values - (mean + slope * dt)
        return mean, slope, float(np.sum(w * resid ** 2))

    e0, mu_e, chi_e = axis(e)
    n0, mu_n, chi_n = axis(n)
    sigma_slope = math.sqrt(1.0 / sxx)
    dof = 2 * len(positions) - 4
    chi2_red = (chi_e + chi_n) / dof if dof > 0 else None
    if chi2_red is not None and chi2_red > 1.0:
        sigma_slope *= math.sqrt(chi2_red)
    mu_tot = math.hypot(mu_e, mu_n)
    significance = mu_tot / sigma_slope
    years = baseline_days / 365.25
    shift = mu_tot * years

    result.update({
        "pm_ra_mas_yr": round(1000.0 * mu_e, 0), "pm_dec_mas_yr": round(1000.0 * mu_n, 0),
        "pm_total_arcsec_yr": round(mu_tot, 2), "pm_uncertainty_arcsec_yr": round(sigma_slope, 2),
        "significance": round(significance, 2),
        "chi2_reduced": round(chi2_red, 2) if chi2_red is not None else None,
        "shift_arcsec": round(shift, 2), "shift_sigma": round(significance, 2),
        "ref_mjd": round((t_ref - 2000.0) * 365.25 + 51544.5, 4),
        "east0_arcsec": round(e0, 3), "north0_arcsec": round(n0, 3),
    })
    moving = (significance >= MOTION_SIGNIFICANCE and shift >= MOTION_MIN_SHIFT_ARCSEC
              and baseline_days >= MOTION_MIN_BASELINE_DAYS)
    if baseline_days < MOTION_MIN_BASELINE_DAYS:
        result["status"] = "unknown"
    else:
        result["status"] = "moving" if moving else "static"
    if moving:
        result["position_angle_deg"] = position_angle_deg(mu_e, mu_n)
        result["direction"] = direction_text(mu_e, mu_n)
    return result


def motion_confidence(fit: Dict[str, Any]) -> Optional[str]:
    if fit.get("status") != "moving":
        return None
    chi2_ok = fit.get("chi2_reduced") is not None and fit["chi2_reduced"] <= MOTION_MAX_CHI2_RED_HIGH
    if fit["significance"] >= MOTION_HIGH_SIGNIFICANCE and fit["n_visits"] >= 3 and chi2_ok:
        return "alta"
    return "media"


def model_offset(fit: Dict[str, Any], mjd: float) -> Tuple[float, float]:
    """Posición (Este, Norte) predicha por la recta en la fecha ``mjd``."""
    if fit.get("east0_arcsec") is None:
        return 0.0, 0.0
    dt = mjd_to_year(mjd) - mjd_to_year(fit["ref_mjd"])
    mu_e = (fit["pm_ra_mas_yr"] or 0.0) / 1000.0
    mu_n = (fit["pm_dec_mas_yr"] or 0.0) / 1000.0
    return fit["east0_arcsec"] + mu_e * dt, fit["north0_arcsec"] + mu_n * dt


# ----------------------------------------------------------------------------
# Detección de fuentes por exposición
# ----------------------------------------------------------------------------
def detect_frame_sources(fr: Dict[str, Any], center_ra: float, center_dec: float,
                         half_size_arcsec: float, snr_min: float = DETECT_SNR) -> List[Dict[str, Any]]:
    """Picos significativos y núcleos saturados de una exposición, dentro del campo pedido."""
    data, bad = fr["data"], fr["bad"]
    good = ~bad & np.isfinite(data)
    if good.sum() < 20:
        return []
    bkg = float(np.median(data[good]))
    noise = float(1.4826 * np.median(np.abs(data[good] - bkg))) or float(np.std(data[good]))
    if not np.isfinite(noise) or noise <= 0:
        return []
    filled = np.where(good, data, -np.inf)
    peaks = (filled == maximum_filter(filled, size=3, mode="constant", cval=-np.inf)) & good
    peaks &= (data - bkg) > snr_min * noise
    ys, xs = np.nonzero(peaks)
    found = [(float(x), float(y), float((data[y, x] - bkg) / noise), False) for y, x in zip(ys, xs)]

    # Núcleos saturados: manchas enmascaradas rodeadas de resplandor brillante (p. ej. Barnard).
    labels, n_lab = label_regions(bad)
    if n_lab:
        yy, xx = np.mgrid[0:data.shape[0], 0:data.shape[1]]
        for lab in range(1, n_lab + 1):
            blob = labels == lab
            if blob.sum() < 3:
                continue
            ring = (maximum_filter(blob, size=5) & ~blob) & good
            if ring.sum() < 4:
                continue
            excess = float((np.median(data[ring]) - bkg) / noise)
            if excess > snr_min:
                found.append((float(xx[blob].mean()), float(yy[blob].mean()), excess * 4.0, True))

    out: List[Dict[str, Any]] = []
    for x, y, snr, saturated in found:
        c_ra, c_dec = fr["wcs"].all_pix2world([[x, y]], 0)[0]
        if not (np.isfinite(c_ra) and np.isfinite(c_dec)):
            continue
        east, north = _offsets_arcsec(float(c_ra), float(c_dec), center_ra, center_dec)
        if abs(east) > half_size_arcsec or abs(north) > half_size_arcsec:
            continue
        out.append({"ra": float(c_ra), "dec": float(c_dec), "east": east, "north": north,
                    "snr": snr, "saturated": saturated})
    return out


def _frame_covers(fr: Dict[str, Any], ra: float, dec: float, margin_pix: float = 3.0) -> bool:
    x, y = fr["wcs"].all_world2pix([[ra, dec]], 0)[0]
    ny, nx = fr["data"].shape
    return bool(np.isfinite(x) and np.isfinite(y) and margin_pix <= x < nx - margin_pix
                and margin_pix <= y < ny - margin_pix)


def find_field_sources(frames: List[Dict[str, Any]], center_ra: float, center_dec: float,
                       fov_deg: float, visit_of: Callable[[float], int]) -> List[Dict[str, Any]]:
    """Agrupa las detecciones de todas las exposiciones en fuentes del cielo."""
    half = 0.5 * fov_deg * 3600.0
    dets: List[Dict[str, Any]] = []
    for idx, item in enumerate(frames):
        for d in detect_frame_sources(item["frame"], center_ra, center_dec, half):
            d.update({"frame_idx": idx, "visit_id": visit_of(item["mjd"])})
            dets.append(d)
    if not dets:
        return []
    pts = np.asarray([[d["east"], d["north"]] for d in dets], dtype=float)
    parent = list(range(len(dets)))

    def find(i: int) -> int:
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    for i, j in cKDTree(pts).query_pairs(LINK_ARCSEC):
        ri, rj = find(i), find(j)
        if ri != rj:
            parent[ri] = rj
    groups: Dict[int, List[int]] = {}
    for i in range(len(dets)):
        groups.setdefault(find(i), []).append(i)

    sources: List[Dict[str, Any]] = []
    for members in groups.values():
        visits = {dets[i]["visit_id"] for i in members}
        if len(visits) < MIN_VISITS:
            continue
        east = float(np.median(pts[members, 0]))
        north = float(np.median(pts[members, 1]))
        s_ra, s_dec = _from_offsets(east, north, center_ra, center_dec)
        frames_hit = {dets[i]["frame_idx"] for i in members}
        covering = sum(1 for item in frames if _frame_covers(item["frame"], s_ra, s_dec))
        if covering and len(frames_hit) < MIN_DETECTION_FRACTION * covering:
            continue
        sources.append({
            "ra": s_ra, "dec": s_dec, "n_detections": len(frames_hit), "n_covering": covering,
            "n_visits_detected": len(visits),
            "peak_snr": float(np.median([dets[i]["snr"] for i in members])),
            "saturated": sum(dets[i]["saturated"] for i in members) > len(members) / 2,
        })
    sources.sort(key=lambda s: -s["peak_snr"])
    return sources[:MAX_OBJECTS]


# ----------------------------------------------------------------------------
# Catálogos
# ----------------------------------------------------------------------------
def propagate_gaia(sources: List[Dict[str, Any]], epoch_year: float) -> List[Dict[str, Any]]:
    """Lleva las posiciones de Gaia DR3 (época 2016.0) a la época de las observaciones SPHEREx."""
    out = []
    dt = epoch_year - GAIA_EPOCH_YEAR
    for g in sources or []:
        try:
            ra, dec = float(g["ra"]), float(g["dec"])
        except (KeyError, TypeError, ValueError):
            continue
        pmra = g.get("pmra")
        pmdec = g.get("pmdec")
        has_pm = pmra is not None and pmdec is not None and np.isfinite(pmra) and np.isfinite(pmdec)
        if has_pm:
            ra_t, dec_t = _from_offsets(pmra / 1000.0 * dt, pmdec / 1000.0 * dt, ra, dec)
        else:
            ra_t, dec_t = ra, dec
        out.append({**g, "ra_epoch": ra_t, "dec_epoch": dec_t, "has_pm": bool(has_pm)})
    return out


def match_gaia(ra: float, dec: float, gaia_epoch: List[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    """La fuente Gaia más brillante a menos de 1 píxel SPHEREx de la posición (en la misma época)."""
    best = None
    for g in gaia_epoch:
        e, n = _offsets_arcsec(g["ra_epoch"], g["dec_epoch"], ra, dec)
        sep = math.hypot(e, n)
        if sep > GAIA_MATCH_ARCSEC:
            continue
        mag = g.get("mag") if g.get("mag") is not None else 99.0
        if best is None or mag < best[0]:
            best = (mag, sep, g)
    if best is None:
        return None
    _, sep, g = best
    pm_total = math.hypot(g["pmra"], g["pmdec"]) / 1000.0 if g["has_pm"] else None
    return {
        "source_id": str(g.get("id", "")), "g_mag": g.get("mag"),
        "separation_arcsec": round(sep, 2),
        "pm_ra_mas_yr": round(g["pmra"], 1) if g["has_pm"] else None,
        "pm_dec_mas_yr": round(g["pmdec"], 1) if g["has_pm"] else None,
        "pm_total_arcsec_yr": round(pm_total, 3) if pm_total is not None else None,
    }


def compare_motion(fit: Dict[str, Any], cat_pm_ra: Optional[float], cat_pm_dec: Optional[float]) -> Optional[bool]:
    """¿El movimiento medido coincide con el de catálogo? None si no se puede comparar."""
    if cat_pm_ra is None or cat_pm_dec is None or fit.get("pm_ra_mas_yr") is None:
        return None
    d = math.hypot(fit["pm_ra_mas_yr"] - cat_pm_ra, fit["pm_dec_mas_yr"] - cat_pm_dec) / 1000.0
    cat_tot = math.hypot(cat_pm_ra, cat_pm_dec) / 1000.0
    sigma = fit.get("pm_uncertainty_arcsec_yr") or 0.0
    return d <= max(3.0 * sigma, PM_AGREEMENT_FRACTION * cat_tot)


# ----------------------------------------------------------------------------
# Textos en lenguaje claro
# ----------------------------------------------------------------------------
def _brightness_summary(series: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    out: Dict[str, Any] = {"status": "insufficient", "confidence": None, "sentence": ""}
    if series is None:
        return out
    out.update({
        "status": series["status"], "detector": series["detector"], "mode": series["mode"],
        "photometry": series["photometry"], "reference_wavelength_um": series["reference_wavelength_um"],
        "wavelength_span_pct": series["wavelength_span_pct"], "n_visits": series["n_visits"],
        "baseline_days": series["baseline_days"], "change_pct": series.get("change_pct"),
        "change_sigma": series.get("change_sigma"), "amplitude_pct": series.get("amplitude_pct"),
        "p_value": series.get("variability_p_value"), "median_snr": round(series.get("median_snr") or 0.0, 1),
        "note": series.get("note", ""),
        "first_label": series["points"][0]["label"], "last_label": series["points"][-1]["label"],
    })
    span = _span_text(series["baseline_days"])
    if series["status"] == "variable":
        p = series.get("variability_p_value")
        out["confidence"] = "alta" if (p is not None and p < BRIGHTNESS_HIGH_P and series["n_visits"] >= 3) else "media"
        pct, sig = series.get("change_pct"), series.get("change_sigma")
        if pct is not None and sig is not None and abs(sig) >= 3.0 and abs(pct) >= MIN_AMPLITUDE_PCT[series["mode"]]:
            verb = "subió" if pct > 0 else "bajó"
            out["sentence"] = f"Su brillo infrarrojo {verb} un {_fmt_pct(pct)} % en {span}."
        else:
            out["sentence"] = f"Su brillo infrarrojo subió y bajó hasta un {_fmt_pct(series['amplitude_pct'])} % en {span}."
    elif series["status"] == "possible":
        out["confidence"] = "baja"
        out["sentence"] = (f"Podría haber cambiado de brillo (hasta ~{_fmt_pct(series['amplitude_pct'])} % en {span}), "
                           "pero se compararon colores infrarrojos parecidos, no idénticos.")
    elif series["status"] == "stable":
        limit = max(series.get("amplitude_pct") or 0.0, MIN_AMPLITUDE_PCT[series["mode"]])
        out["sentence"] = f"Brillo estable en {span} (variación menor a ~{_fmt_pct(limit)} %)."
    elif series["status"] == "faint":
        out["sentence"] = "Demasiado débil para medir cambios de brillo."
    return out


def _motion_sentence(fit: Dict[str, Any]) -> str:
    if fit["status"] == "blended":
        return "Tiene una estrella vecina muy cerca: su posición no se puede seguir con precisión."
    if fit["status"] == "moving":
        px = fit["shift_arcsec"] / SPHEREX_PIXEL_ARCSEC
        return (f"Se mueve unos {_fmt_num(fit['pm_total_arcsec_yr'])}″ por año hacia {fit['direction']}: "
                f"en {_span_text(fit['baseline_days'])} se corrió {_fmt_num(fit['shift_arcsec'])}″ "
                f"(≈ {_fmt_num(px)} píxeles de SPHEREx).")
    if fit["status"] == "static":
        limit = max(MOTION_MIN_SHIFT_ARCSEC, 3.0 * (fit.get("pm_uncertainty_arcsec_yr") or 0.0)
                    * (fit["baseline_days"] or 0.0) / 365.25)
        return f"No se movió de forma medible (menos de ~{_fmt_num(limit)}″ en {_span_text(fit['baseline_days'])})."
    return "Las fechas disponibles no alcanzan para medir movimiento."


def planet_x_hypothesis(fit: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """
    Hipótesis exploratoria: si todo el movimiento aparente fuera el reflejo de la órbita
    de la Tierra (paralaje de un objeto del Sistema Solar), la distancia sería del orden de
    2π · 206265″ / μ[″/año] UA. Es una cota de orden de magnitud, no una medición.
    """
    if fit.get("status") != "moving" or not fit.get("pm_total_arcsec_yr"):
        return None
    d_au = 2.0 * math.pi * 206265.0 / fit["pm_total_arcsec_yr"]
    return {
        "distance_au": float(f"{d_au:.2g}"),
        "note": ("Hipótesis exploratoria, no una detección ni una confirmación de un Planeta X: "
                 "supone que todo el movimiento aparente es el reflejo de la órbita de la Tierra. "
                 "Una estrella cercana o una enana marrón producen el mismo efecto."),
    }


def _confidence_rank(c: Optional[str]) -> int:
    return {"alta": 3, "media": 2, "baja": 1}.get(c or "", 0)


# ----------------------------------------------------------------------------
# Miniaturas antes / después
# ----------------------------------------------------------------------------
def _pick_stamp_frames(measurements: List[Dict[str, Any]], series: Optional[Dict[str, Any]]) -> Tuple[Optional[Dict[str, Any]], Optional[Dict[str, Any]]]:
    if not measurements:
        return None, None
    if series is not None:
        pool = [m for m in measurements if m["detector"] == series["detector"]]
        ref = series["reference_wavelength_um"]
        rank = lambda m: abs(m["wavelength_um"] - ref) / ref  # noqa: E731
    else:
        det = max({m["detector"] for m in measurements}, key=lambda d: sum(m["detector"] == d for m in measurements))
        pool = [m for m in measurements if m["detector"] == det]
        rank = lambda m: -abs(m.get("snr", 0.0))  # noqa: E731
    if not pool:
        return None, None
    first_v = min(m["visit_id"] for m in pool)
    last_v = max(m["visit_id"] for m in pool)
    if first_v == last_v:
        return None, None
    before = min((m for m in pool if m["visit_id"] == first_v), key=rank)
    after = min((m for m in pool if m["visit_id"] == last_v), key=rank)
    return before, after


def build_card_stamps(obj_ra: float, obj_dec: float, measurements: List[Dict[str, Any]],
                      series: Optional[Dict[str, Any]], fit: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    before, after = _pick_stamp_frames(measurements, series)
    if before is None or after is None:
        return None
    stamp_wcs = build_stamp_wcs(obj_ra, obj_dec, CARD_STAMP_FOV_DEG, npix=CARD_STAMP_PIXELS)
    try:
        arrs = [make_stamp(_get_frame(Path(m["local_path"])), stamp_wcs, npix=CARD_STAMP_PIXELS) for m in (before, after)]
    except Exception as exc:  # una miniatura no debe tumbar el análisis
        logger.warning("No se pudo generar la miniatura antes/después: %s", exc)
        return None
    pngs = stamps_to_png(arrs)
    out: Dict[str, Any] = {"fov_arcsec": round(CARD_STAMP_FOV_DEG * 3600.0, 1)}
    for key, m, png in (("before", before, pngs[0]), ("after", after, pngs[1])):
        if fit.get("east0_arcsec") is not None:
            e, n = model_offset(fit, m["mjd"])
        else:
            e, n = 0.0, 0.0
        out[key] = {
            "image_base64": png, "label": mjd_to_label(m["mjd"]), "mjd": round(m["mjd"], 4),
            "detector": m["detector"], "wavelength_um": round(m["wavelength_um"], 4),
            "cutout_url": m.get("cutout_url", ""),
            "east_arcsec": round(e, 2), "north_arcsec": round(n, 2),
        }
    return out


# ----------------------------------------------------------------------------
# Punto de entrada
# ----------------------------------------------------------------------------
def _load_frames(frames_meta: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    out, seen = [], set()
    for fm in select_frames_for_timeline(frames_meta):
        path = Path(str(fm.get("local_path", "")))
        if not path.is_file():
            continue
        try:
            fr = _get_frame(path)
        except Exception as exc:
            logger.warning("Se omite %s: %s", path.name, exc)
            continue
        if fr.get("flux_unit") != "MJy/sr":
            continue
        mjd = observation_mjd(str(fm.get("obs_time") or "")) or observation_mjd(str(fr.get("obs_time") or ""))
        if mjd is None:
            continue
        det = detector_code(fm.get("detector_band") or fr.get("detector"))
        key = (round(mjd, 4), det)
        if key in seen:
            continue
        seen.add(key)
        out.append({"frame": fr, "mjd": float(mjd), "detector": det, "local_path": str(path)})
    out.sort(key=lambda f: f["mjd"])
    return out


def _measure_source(src_ra: float, src_dec: float, frames_meta: List[Dict[str, Any]],
                    visit_of: Callable[[float], int],
                    track: Optional[Callable[[float], Tuple[float, float]]] = None) -> List[Dict[str, Any]]:
    ms = measure_all_frames(src_ra, src_dec, frames_meta, track=track)
    for m in ms:
        m["visit_id"] = visit_of(m["mjd"])
    return ms


def _frame_offsets_from_references(objs: List[Dict[str, Any]],
                                   use_fit: bool = True) -> Tuple[Dict[str, Tuple[float, float]], int]:
    """
    Desvío astrométrico común por exposición (error del WCS de esa imagen).
    ``use_fit=False`` (primera estimación): todas las estrellas brillantes respecto de su posición
    mediana; un desvío común aparece en todas, mientras que una estrella que se mueve de verdad queda
    en minoría y la mediana la descarta. ``use_fit=True``: solo estrellas fijas, respecto de su recta.
    """
    residuals: Dict[str, List[Tuple[float, float]]] = {}
    refs = 0
    for o in objs:
        fit = o["fit"]
        if use_fit and (fit.get("east0_arcsec") is None or (fit.get("significance") or 0.0) > REF_MAX_SIGNIFICANCE):
            continue
        good = [m for m in o["measurements"] if m.get("centroid") and m["mode"] == "aperture"
                and m.get("snr", 0.0) >= REF_MIN_SNR]
        if len(good) < 3:
            continue
        refs += 1
        offs = [_offsets_arcsec(m["centroid"][0], m["centroid"][1], o["ra"], o["dec"]) for m in good]
        if not use_fit:
            med_e = float(np.median([e for e, _ in offs]))
            med_n = float(np.median([n for _, n in offs]))
        for m, (e, n) in zip(good, offs):
            me, mn = model_offset(fit, m["mjd"]) if use_fit else (med_e, med_n)
            residuals.setdefault(str(m["local_path"]), []).append((e - me, n - mn))
    offsets = {}
    for key, vals in residuals.items():
        if len(vals) >= REF_MIN_COUNT:
            arr = np.asarray(vals, dtype=float)
            offsets[key] = (float(np.median(arr[:, 0])), float(np.median(arr[:, 1])))
    return offsets, refs


def _object_position(o: Dict[str, Any]) -> Tuple[float, float]:
    fit = o["fit"]
    if fit.get("east0_arcsec") is None:
        return o["ra"], o["dec"]
    return _from_offsets(fit["east0_arcsec"], fit["north0_arcsec"], o["ra"], o["dec"])


def _merge_same_star(objs: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Dos semillas que, al recentrar, terminan sobre la misma estrella cuentan como una sola."""
    def quality(o: Dict[str, Any]) -> Tuple[int, float]:
        return (sum(1 for m in o["measurements"] if m.get("centroid")), o["peak_snr"])

    kept: List[Dict[str, Any]] = []
    for o in sorted(objs, key=quality, reverse=True):
        ra, dec = _object_position(o)
        duplicate = False
        for k in kept:
            k_ra, k_dec = _object_position(k)
            if math.hypot(*_offsets_arcsec(ra, dec, k_ra, k_dec)) <= LINK_ARCSEC:
                duplicate = True
                break
        if not duplicate:
            kept.append(o)
    kept.sort(key=lambda o: -o["peak_snr"])
    return kept


def _flag_crowded(objs: List[Dict[str, Any]]) -> None:
    for o in objs:
        ra, dec = _object_position(o)
        o["crowded"] = False
        for p in objs:
            if p is o or p["peak_snr"] < CROWDING_FLUX_RATIO * o["peak_snr"]:
                continue
            p_ra, p_dec = _object_position(p)
            if math.hypot(*_offsets_arcsec(ra, dec, p_ra, p_dec)) <= CROWDING_ARCSEC:
                o["crowded"] = True
                break


def _official_target_name(ra: float, dec: float) -> Optional[str]:
    """Nombre de un objetivo oficial sin movimiento propio apreciable (p. ej. R Draconis) en esa posición."""
    for t in MANDATORY_TARGETS:
        if t.get("proper_motion"):
            continue
        if math.hypot(*_offsets_arcsec(ra, dec, t["ra_deg"], t["dec_deg"])) <= KNOWN_MATCH_ARCSEC:
            return t["name"]
    return None


def known_targets_in_field(center_ra: float, center_dec: float, fov_deg: float, mjd: float) -> List[Dict[str, Any]]:
    """Objetivos con movimiento propio de catálogo cuya posición prevista para ``mjd`` cae en el campo."""
    out = []
    half = 0.5 * fov_deg * 3600.0
    year = mjd_to_year(mjd)
    for t in MANDATORY_TARGETS:
        pm = t.get("proper_motion")
        if not pm:
            continue
        dt = year - float(pm["ref_epoch_year"])
        cur_ra, cur_dec = _from_offsets(float(pm["pm_ra_mas_yr"]) / 1000.0 * dt, float(pm["pm_dec_mas_yr"]) / 1000.0 * dt,
                                        t["ra_deg"], t["dec_deg"])
        e, n = _offsets_arcsec(cur_ra, cur_dec, center_ra, center_dec)
        if abs(e) <= half and abs(n) <= half:
            out.append({"name": t["name"], "ra": round(cur_ra, 6), "dec": round(cur_dec, 6),
                        "pm_total_arcsec_yr": round(math.hypot(pm["pm_ra_mas_yr"], pm["pm_dec_mas_yr"]) / 1000.0, 3),
                        "source": str(pm.get("source", "catálogo")), "object_id": None})
    return out


def _track_from_fit(fit: Dict[str, Any], ref_ra: float, ref_dec: float) -> Callable[[float], Tuple[float, float]]:
    def track(mjd: float) -> Tuple[float, float]:
        e, n = model_offset(fit, mjd)
        return _from_offsets(e, n, ref_ra, ref_dec)
    return track


def analyze_field_changes(center_ra: float, center_dec: float, fov_deg: float,
                          frames_meta: List[Dict[str, Any]],
                          gaia_sources: Optional[List[Dict[str, Any]]] = None,
                          gaia_status: str = "unavailable") -> Dict[str, Any]:
    """
    Analiza todas las exposiciones de la región y devuelve los objetos que cambian.
    ``gaia_sources``: filas de Gaia DR3 (ra, dec en 2016.0, pmra, pmdec, mag) o None si no se pudo
    consultar; ``gaia_status`` = 'ok' | 'unavailable'.
    """
    frames = _load_frames(frames_meta)
    mjds = [f["mjd"] for f in frames]
    visits = group_visits([{"mjd": f["mjd"], "detector": f["detector"]} for f in frames]) if frames else []
    visit_bounds = [(v["mjd_start"], v["mjd_end"], v["visit_id"]) for v in visits]
    mjd_by_visit = {v["visit_id"]: v["mjd_mid"] for v in visits}

    def visit_of(mjd: float) -> int:
        for start, end, vid in visit_bounds:
            if start - 1e-6 <= mjd <= end + 1e-6:
                return vid
        return min(visit_bounds, key=lambda b: abs(0.5 * (b[0] + b[1]) - mjd))[2] if visit_bounds else 0

    base: Dict[str, Any] = {
        "ra": round(center_ra, 6), "dec": round(center_dec, 6), "fov_deg": round(fov_deg, 5),
        "n_exposures": len(frames), "n_visits": len(visits),
        "baseline_days": round(visits[-1]["mjd_mid"] - visits[0]["mjd_mid"], 2) if len(visits) >= 2 else 0.0,
        "first_label": visits[0]["label"] if visits else None,
        "last_label": visits[-1]["label"] if visits else None,
        "visits": [{"visit_id": v["visit_id"], "label": v["label"], "mjd": round(v["mjd_mid"], 4),
                    "n_exposures": v["n_exposures"]} for v in visits],
        "gaia_status": gaia_status, "astrometry": {"reference_stars": 0, "corrected_exposures": 0},
        "objects": [], "steady": [], "n_sources": 0,
    }
    if len(visits) < 2:
        base["summary"] = {
            "status": "insufficient",
            "title": "Hace falta al menos una segunda fecha para comparar",
            "detail": ("SPHEREx observó este campo una sola vez. Probá «Buscar pares temporales» "
                       "para sumar fechas." if visits else "No hay exposiciones SPHEREx utilizables en este campo."),
            "notes": [],
        }
        base["known_targets"] = []
        return base

    sources = find_field_sources(frames, center_ra, center_dec, fov_deg, visit_of)
    base["n_sources"] = len(sources)

    # 1.ª pasada: medir cada fuente en todas las exposiciones y ajustar su recta.
    objs: List[Dict[str, Any]] = []
    for s in sources:
        ms = _measure_source(s["ra"], s["dec"], frames_meta, visit_of)
        if not ms:
            continue
        pos = aggregate_visit_positions(ms, s["ra"], s["dec"], mjd_by_visit=mjd_by_visit)
        objs.append({**s, "measurements": ms, "positions": pos, "fit": fit_linear_motion(pos)})
    objs = _merge_same_star(objs)
    _flag_crowded(objs)

    # Astrometría relativa: descontar el desvío común de cada exposición y reajustar
    # (1.ª estimación con todas las estrellas brillantes; luego solo con las fijas).
    offsets: Dict[str, Tuple[float, float]] = {}
    n_refs = 0
    for use_fit in (False, True, True):
        offsets, n_refs = _frame_offsets_from_references(objs, use_fit=use_fit)
        if not offsets:
            break
        for o in objs:
            o["positions"] = aggregate_visit_positions(o["measurements"], o["ra"], o["dec"], offsets, mjd_by_visit)
            o["fit"] = fit_linear_motion(o["positions"])
    base["astrometry"] = {"reference_stars": n_refs, "corrected_exposures": len(offsets)}

    # 2.ª pasada para los que se mueven: la apertura acompaña al objeto fecha a fecha.
    for o in objs:
        if o["fit"]["status"] == "moving":
            ms = _measure_source(o["ra"], o["dec"], frames_meta, visit_of, track=_track_from_fit(o["fit"], o["ra"], o["dec"]))
            if ms:
                o["measurements"] = ms
                o["positions"] = aggregate_visit_positions(ms, o["ra"], o["dec"], offsets, mjd_by_visit)
                o["fit"] = fit_linear_motion(o["positions"])

    mean_year = mjd_to_year(float(np.mean(mjds)))
    gaia_epoch = propagate_gaia(gaia_sources, mean_year) if gaia_sources is not None else None

    results: List[Dict[str, Any]] = []
    steady: List[Dict[str, Any]] = []
    for o in objs:
        fit = o["fit"]
        # El brillo de una estrella del campo solo se compara en exposiciones donde se la pudo
        # centrar: medir en un punto fijo con píxeles de 6″ convierte errores de WCS en falsos cambios.
        series_all = build_detector_series([m for m in o["measurements"] if m.get("centroid")])
        series = pick_default_series(series_all)
        bright = _brightness_summary(series)
        if o.get("crowded") and bright["status"] in ("variable", "possible"):
            bright.update({"status": "blended", "confidence": None,
                           "sentence": "Tiene una estrella vecina muy cerca: su brillo no se puede medir por separado."})
        if o.get("crowded") and fit["status"] == "moving" and (fit.get("significance") or 0.0) < MOTION_HIGH_SIGNIFICANCE:
            fit = {**fit, "status": "blended", "position_angle_deg": None, "direction": None}
        # Posición del objeto en la fecha media (centro de su recta).
        mean_mjd = float(np.mean(mjds))
        e_mid, n_mid = model_offset(fit, mean_mjd) if fit.get("east0_arcsec") is not None else (0.0, 0.0)
        obj_ra, obj_dec = _from_offsets(e_mid, n_mid, o["ra"], o["dec"])

        motion: Dict[str, Any] = {k: v for k, v in fit.items() if k not in ("east0_arcsec", "north0_arcsec")}
        motion["confidence"] = motion_confidence(fit)
        motion["sentence"] = _motion_sentence(fit)
        # Posiciones por visita relativas a la posición publicada del objeto (en la fecha media).
        motion["positions"] = [{**p, "east_arcsec": round(p["east_arcsec"] - e_mid, 2),
                                "north_arcsec": round(p["north_arcsec"] - n_mid, 2)} for p in o["positions"]]
        if fit.get("east0_arcsec") is not None:
            e0, n0 = model_offset(fit, visits[0]["mjd_mid"])
            e1, n1 = model_offset(fit, visits[-1]["mjd_mid"])
            motion["start_ra"], motion["start_dec"] = (round(v, 7) for v in _from_offsets(e0, n0, o["ra"], o["dec"]))
            motion["end_ra"], motion["end_dec"] = (round(v, 7) for v in _from_offsets(e1, n1, o["ra"], o["dec"]))
            motion["start_label"], motion["end_label"] = visits[0]["label"], visits[-1]["label"]

        # --- Catálogos (siempre separados de la medición) ---------------------
        catalog: Dict[str, Any] = {"gaia_status": gaia_status, "gaia": None, "known": None,
                                   "gaia_agrees": None, "known_agrees": None}
        if gaia_epoch is not None:
            catalog["gaia"] = match_gaia(obj_ra, obj_dec, gaia_epoch)
            if catalog["gaia"] is None:
                catalog["gaia_status"] = "no_match"
            elif catalog["gaia"].get("pm_ra_mas_yr") is not None:
                catalog["gaia_agrees"] = compare_motion(fit, catalog["gaia"]["pm_ra_mas_yr"], catalog["gaia"]["pm_dec_mas_yr"])
        km = known_motion_for_point(obj_ra, obj_dec, float(np.mean(mjds)))
        if km and km["offset_now_arcsec"] <= KNOWN_MATCH_ARCSEC:
            catalog["known"] = {"name": km["name"], "pm_ra_mas_yr": km["pm_ra_mas_yr"], "pm_dec_mas_yr": km["pm_dec_mas_yr"],
                                "pm_total_arcsec_yr": km["pm_total_arcsec_yr"], "source": km["source"],
                                "offset_arcsec": km["offset_now_arcsec"]}
            catalog["known_agrees"] = compare_motion(fit, km["pm_ra_mas_yr"], km["pm_dec_mas_yr"])

        moving = fit["status"] == "moving"
        changed = bright["status"] in ("variable", "possible")
        kind = "both" if (moving and changed) else "moving" if moving else "brightness" if changed else "steady"
        name = catalog["known"]["name"] if catalog["known"] else _official_target_name(obj_ra, obj_dec)
        planet_x = None
        if moving and catalog["gaia_status"] == "no_match" and catalog["known"] is None:
            planet_x = planet_x_hypothesis(fit)

        record = {
            "ra": round(obj_ra, 7), "dec": round(obj_dec, 7), "epoch_mjd": round(mean_mjd, 4),
            "kind": kind, "name": name,
            "saturated": bool(o.get("saturated")), "crowded": bool(o.get("crowded")),
            "peak_snr": round(o["peak_snr"], 1),
            "n_exposures": len(o["measurements"]),
            "motion": motion, "brightness": bright, "catalog": catalog, "planet_x": planet_x,
        }
        if kind == "steady":
            steady.append(record)
            continue
        record["confidence"] = max((motion["confidence"], bright["confidence"]), key=_confidence_rank)
        record["stamps"] = build_card_stamps(obj_ra, obj_dec, o["measurements"], series, fit)
        results.append(record)

    results.sort(key=lambda r: (-_confidence_rank(r["confidence"]), r["kind"] not in ("moving", "both"),
                                -(r["motion"].get("significance") or 0.0)))
    for i, r in enumerate(results, start=1):
        r["id"] = i
    for i, r in enumerate(steady, start=len(results) + 1):
        r["id"] = i
    base["objects"] = results
    base["steady"] = steady
    known = known_targets_in_field(center_ra, center_dec, fov_deg, float(np.mean(mjds)))
    for k in known:
        for r in results + steady:
            if math.hypot(*_offsets_arcsec(r["ra"], r["dec"], k["ra"], k["dec"])) <= KNOWN_MATCH_ARCSEC:
                k["object_id"] = r["id"]
                break
    base["known_targets"] = known
    base["summary"] = _field_summary(base)
    return base


def _followed(n: int) -> str:
    return "Se siguió 1 estrella" if n == 1 else f"Se siguieron {n} estrellas"


def _field_summary(res: Dict[str, Any]) -> Dict[str, Any]:
    objs = res["objects"]
    n_move = sum(o["kind"] in ("moving", "both") for o in objs)
    n_bright = sum(o["kind"] in ("brightness", "both") for o in objs)
    n_total = len(objs) + len(res["steady"])
    span = _span_text(res["baseline_days"])
    period = f"entre el {res['first_label']} y el {res['last_label']}"
    if n_total == 0:
        return {"status": "empty", "title": "No se encontraron estrellas lo bastante brillantes para seguir",
                "detail": f"SPHEREx observó este campo {period}, pero ninguna fuente supera el umbral de detección.",
                "notes": []}
    parts = []
    if n_move:
        parts.append(f"{n_move} se mueve{'n' if n_move > 1 else ''}")
    if n_bright:
        parts.append(f"{n_bright} cambi{'aron' if n_bright > 1 else 'ó'} de brillo")
    steady = len(res["steady"])
    if not parts:
        title = "No se ven cambios en este campo"
        detail = (f"{_followed(n_total)} {period} ({span}): "
                  f"{'ninguna se movió ni cambió' if n_total > 1 else 'no se movió ni cambió'} de brillo de forma medible.")
        status = "steady"
    else:
        title = " y ".join(parts).capitalize()
        detail = f"{_followed(n_total)} {period} ({span})."
        if steady:
            detail += f" {steady} sin cambios medibles."
        status = "changes"
    if res["baseline_days"] < 30:
        detail += " Las fechas abarcan poco tiempo: los movimientos lentos todavía no se pueden ver."
    notes = []
    for k in res.get("known_targets") or []:
        if k["object_id"] is None:
            notes.append(f"{k['name']} (según los catálogos se mueve {_fmt_num(k['pm_total_arcsec_yr'], 1)}″ por año) "
                         "debería estar en este campo, pero es demasiado débil para distinguirlo en estas exposiciones "
                         "de SPHEREx: no se puede medir su movimiento acá.")
    return {"status": status, "title": title, "detail": detail, "notes": notes}
