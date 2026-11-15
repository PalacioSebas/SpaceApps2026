"""
Motor IA v2.0:
1. Detección automática de dipolos (`MOVING_DIPOLE`) y monopolos (`VARIABLE_MONOPOLE`) sobre la
   matriz de diferencia real ΔI, más cruce astrométrico en vivo con los catálogos Gaia DR3 y AllWISE.
2. Diagnóstico espectral basado en los puntos fotométricos reales extraídos de los archivos FITS.
"""

import time
from concurrent.futures import ThreadPoolExecutor
from typing import List, Dict, Any, Optional, Tuple
import numpy as np
from astropy.wcs import WCS
from photutils.detection import find_peaks
from scipy.spatial.distance import cdist
from scipy.ndimage import label

from src.config import DEFAULT_CUTOUT_PIXELS
from src.analysis import observation_mjd
from src.irsa_client import crossmatch_catalog_sources_live, format_iau_designation


# Caché de cruces con catálogos: {(ra, dec, radio): (instante, resultado)}.
# Los aciertos se guardan 1 h; los "sin coincidencia" (o fallo de red) solo 10 min.
_XMATCH_CACHE: Dict[Tuple[float, float, float], Tuple[float, Optional[str]]] = {}
_XMATCH_TTL_HIT_S = 3600.0
_XMATCH_TTL_MISS_S = 600.0


def _crossmatch_cached(ra: float, dec: float, radius_arcsec: float) -> Optional[str]:
    key = (round(ra, 4), round(dec, 4), radius_arcsec)
    cached = _XMATCH_CACHE.get(key)
    if cached is not None:
        stamp, value = cached
        ttl = _XMATCH_TTL_HIT_S if value else _XMATCH_TTL_MISS_S
        if time.time() - stamp < ttl:
            return value
    value = crossmatch_catalog_sources_live(ra, dec, radius_arcsec=radius_arcsec)
    _XMATCH_CACHE[key] = (time.time(), value)
    return value


def _compute_baseline_years(epochs_meta: List[Dict[str, Any]]) -> float:
    """Calcula el intervalo temporal en años entre la primera y la última exposición real."""
    dates = [observation_mjd(ep.get("obs_time", "")) for ep in epochs_meta]
    dates = [date for date in dates if date is not None and np.isfinite(date)]
    return (max(dates) - min(dates)) / 365.25 if len(dates) >= 2 else 0.0


# Dos marcas a menos de ~2 píxeles de SPHEREx (6,15″ c/u) no se pueden separar como fuentes
# distintas con la PSF del instrumento: se consideran la misma estrella.
SAME_SOURCE_RADIUS_ARCSEC = 12.0


def _detection_points(det: Dict[str, Any]) -> List[Tuple[float, float]]:
    """Posiciones de una detección en la grilla común: lóbulo positivo y, si existe, el negativo."""
    points = [(float(det["x_pix"]), float(det["y_pix"]))]
    if det.get("neg_x_pix") is not None and det.get("neg_y_pix") is not None:
        points.append((float(det["neg_x_pix"]), float(det["neg_y_pix"])))
    return points


def merge_same_source_detections(detections: List[Dict[str, Any]], link_px: float) -> List[Dict[str, Any]]:
    """
    Agrupa (enlace simple) las detecciones cuyas posiciones están a menos de `link_px` píxeles
    y deja una por grupo: el dipolo más significativo si lo hay (explica los dos lóbulos),
    si no, la marca de mayor SNR.
    """
    n = len(detections)
    if n < 2:
        return list(detections)
    parent = list(range(n))

    def find(i: int) -> int:
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    points = [_detection_points(d) for d in detections]
    for i in range(n):
        for j in range(i + 1, n):
            if any(np.hypot(xa - xb, ya - yb) <= link_px for xa, ya in points[i] for xb, yb in points[j]):
                parent[find(i)] = find(j)

    groups: Dict[int, List[int]] = {}
    for i in range(n):
        groups.setdefault(find(i), []).append(i)

    merged: List[Dict[str, Any]] = []
    for members in groups.values():
        best = max(members, key=lambda i: (detections[i]["type"] == "MOVING_DIPOLE", detections[i]["snr_score"]))
        det = dict(detections[best])
        if len(members) > 1:
            det["description"] = (f"{det['description']} Agrupa {len(members)} picos de la misma fuente "
                                  f"(< {SAME_SOURCE_RADIUS_ARCSEC:.0f}\").")
        merged.append(det)
    return merged


def _lobe_features(image: np.ndarray, x: float, y: float, sign: int,
                   sigma: float, radius: int) -> Optional[Dict[str, float]]:
    """Morfología del núcleo conectado; un píxel aislado no verifica movimiento."""
    x, y = int(x), int(y)
    if min(x, y) < radius or x + radius >= image.shape[1] or y + radius >= image.shape[0]:
        return None
    stamp = sign * image[y-radius:y+radius+1, x-radius:x+radius+1]
    if not np.all(np.isfinite(stamp)):
        return None
    peak = float(stamp[radius, radius])
    regions, _ = label(stamp > max(2 * sigma, 0.2 * peak), structure=np.ones((3, 3)))
    center_label = regions[radius, radius]
    if center_label == 0:
        return None
    core = regions == center_label
    support = int(core.sum())
    if support < 3:
        return None
    yy, xx = np.nonzero(core)
    weights = stamp[core]
    flux = float(weights.sum())
    dx, dy = xx - np.average(xx, weights=weights), yy - np.average(yy, weights=weights)
    covariance = np.array([[np.average(dx*dx, weights=weights), np.average(dx*dy, weights=weights)],
                           [np.average(dx*dy, weights=weights), np.average(dy*dy, weights=weights)]])
    eigenvalues = np.linalg.eigvalsh(covariance)
    if eigenvalues[0] <= 0 or eigenvalues[1] > 9 * eigenvalues[0]:
        return None  # núcleos lineales/artefactos no verifican una PSF compacta
    return {"flux": flux, "width": float(np.sqrt(eigenvalues.sum())), "support": support}


def detect_anomalies_on_diff(
    diff_img: np.ndarray,
    target_wcs: WCS,
    fov_deg: float,
    epochs_meta: List[Dict[str, Any]],
    threshold_sigma: float = 4.0,
    do_crossmatch: bool = True,
    baseline_years: Optional[float] = None,
    psf_fwhm_pixels: Optional[float] = None,
) -> List[Dict[str, Any]]:
    """
    Detecta picos > 4σ en la imagen restada real, empareja dipolos positivo-negativo
    y consulta en vivo los catálogos Gaia DR3 / AllWISE para las detecciones principales.
    """
    valid = np.asarray(diff_img, dtype=np.float64)[8:-8, 8:-8]
    valid = valid[np.isfinite(valid)]
    if valid.size == 0:
        return []
    median_bg = float(np.median(valid))
    mad = float(np.median(np.abs(valid - median_bg)))
    sigma = 1.4826 * mad if mad > 1e-7 else float(np.std(valid))
    clean_diff = np.where(np.isfinite(diff_img), diff_img - median_bg, 0.0)
    if sigma <= 1e-8:
        return []

    margin = 8
    masked_diff = clean_diff.copy()
    masked_diff[:margin, :] = 0.0
    masked_diff[-margin:, :] = 0.0
    masked_diff[:, :margin] = 0.0
    masked_diff[:, -margin:] = 0.0

    pos_table = find_peaks(masked_diff, threshold=threshold_sigma * sigma, box_size=7)
    neg_table = find_peaks(-masked_diff, threshold=threshold_sigma * sigma, box_size=7)

    pos_peaks = (
        np.array([[float(r["x_peak"]), float(r["y_peak"]), float(r["peak_value"])] for r in pos_table])
        if pos_table is not None and len(pos_table) > 0
        else np.empty((0, 3))
    )
    neg_peaks = (
        np.array([[float(r["x_peak"]), float(r["y_peak"]), float(r["peak_value"])] for r in neg_table])
        if neg_table is not None and len(neg_table) > 0
        else np.empty((0, 3))
    )

    if len(pos_peaks) > 0:
        pos_peaks = pos_peaks[np.argsort(-pos_peaks[:, 2])]

    arcsec_per_px = (fov_deg * 3600.0) / float(DEFAULT_CUTOUT_PIXELS)
    baseline_yr = baseline_years if baseline_years is not None else _compute_baseline_years(epochs_meta)
    radius = min(8, max(3, int(np.ceil(psf_fwhm_pixels or 3))))
    feature_image = np.where(np.isfinite(diff_img), diff_img - median_bg, np.nan)
    pos_features = [_lobe_features(feature_image, px, py, 1, sigma, radius) for px, py, _ in pos_peaks]
    neg_features = [_lobe_features(feature_image, nx, ny, -1, sigma, radius) for nx, ny, _ in neg_peaks]

    detections: List[Dict[str, Any]] = []
    used_neg = set()
    det_id = 1

    # Margen extra de picos: varios pueden ser la misma fuente y se fusionan más abajo.
    for p_idx, (px, py, pval) in enumerate(pos_peaks[:20]):
        matched_dipole = False
        if len(neg_peaks) > 0 and pos_features[p_idx] is not None:
            dists = cdist([[px, py]], neg_peaks[:, :2])[0]
            candidates = []
            for n_idx, negative in enumerate(neg_features):
                if negative is None or n_idx in used_neg or not 1.5 <= dists[n_idx] <= 22:
                    continue
                positive = pos_features[p_idx]
                flux_balance = min(positive["flux"], negative["flux"]) / max(positive["flux"], negative["flux"])
                width_balance = min(positive["width"], negative["width"]) / max(positive["width"], negative["width"])
                if flux_balance < 0.25 or width_balance < 0.5:
                    continue
                # Priorizar lóbulos consistentes, en lugar de elegir solo el más próximo.
                score = flux_balance * width_balance / (1 + 0.25 * dists[n_idx] / 22)
                candidates.append((score, n_idx, flux_balance))
            for _, n_idx, flux_balance in sorted(candidates, reverse=True):
                dist_px = float(dists[n_idx])
                if int(n_idx) not in used_neg and 1.5 <= dist_px <= 22.0:
                    used_neg.add(int(n_idx))
                    matched_dipole = True
                    nx, ny, nval = neg_peaks[n_idx]
                    sky_coord = target_wcs.pixel_to_world(px, py)
                    ra_val = float(sky_coord.ra.deg)
                    dec_val = float(sky_coord.dec.deg)
                    snr = float((pval + nval) / (2.0 * sigma))
                    shift_arcsec = float(dist_px * arcsec_per_px)
                    pm_arcsec_yr = shift_arcsec / baseline_yr if baseline_yr > 0 else 0.0
                    delta_r_au = (
                        max(0.02, 2.0 * float(np.sin(min(np.pi / 2.0, np.pi * baseline_yr))))
                        if baseline_yr > 0 else 1.0
                    )
                    helio_au = round(float(206265.0 * delta_r_au / max(shift_arcsec, 0.1)), 1) if shift_arcsec > 0 else None

                    detections.append(
                        {
                            "id": det_id,
                            "type": "MOVING_DIPOLE",
                            "x_pix": round(px, 2),
                            "y_pix": round(py, 2),
                            "neg_x_pix": round(float(nx), 2),
                            "neg_y_pix": round(float(ny), 2),
                            "ra": round(ra_val, 6),
                            "dec": round(dec_val, 6),
                            "snr_score": round(snr, 2),
                            "shift_pixels": round(dist_px, 2),
                            "shift_arcsec": round(shift_arcsec, 2),
                            "proper_motion_arcsec_yr": round(pm_arcsec_yr, 2),
                            "heliocentric_dist_au_est": helio_au,
                            "catalog_match": None,
                            "iau_designation": format_iau_designation(ra_val, dec_val),
                            "object_category": "Astro en Movimiento (Estrella Cercana / Enana Marrón / Cuerpo en Órbita)",
                            "user_explanation": (
                                f"Este objeto se desplazó {dist_px:.1f} píxeles entre dos fechas de observación "
                                f"(velocidad aparente ≈ {pm_arcsec_yr:.2f}\"/año). En la resta deja una huella oscura "
                                "donde estaba antes y una brillante en su posición actual."
                            ),
                            "positive_support_pixels": int(pos_features[p_idx]["support"]),
                            "negative_support_pixels": int(neg_features[n_idx]["support"]),
                            "lobe_flux_balance": round(float(flux_balance), 3),
                            "description": (
                                f"Candidato a dipolo positivo-negativo (Δ={dist_px:.1f} px, μ≈{pm_arcsec_yr:.2f}\"/año). "
                                f"Núcleos compactos compatibles; balance de flujo {flux_balance:.2f}. "
                                "Requiere validación astrométrica y fotométrica."
                            ),
                        }
                    )
                    det_id += 1
                    break

        if not matched_dipole:
            sky_coord = target_wcs.pixel_to_world(px, py)
            ra_val = float(sky_coord.ra.deg)
            dec_val = float(sky_coord.dec.deg)
            snr = float(pval / sigma)
            detections.append(
                {
                    "id": det_id,
                    "type": "VARIABLE_MONOPOLE",
                    "x_pix": round(px, 2),
                    "y_pix": round(py, 2),
                    "neg_x_pix": None,
                    "neg_y_pix": None,
                    "ra": round(ra_val, 6),
                    "dec": round(dec_val, 6),
                    "snr_score": round(snr, 2),
                    "shift_pixels": 0.0,
                    "proper_motion_arcsec_yr": 0.0,
                    "catalog_match": None,
                    "iau_designation": format_iau_designation(ra_val, dec_val),
                    "object_category": "Estrella Variable (Aumento de Brillo)",
                    "user_explanation": (
                        f"Este astro permaneció fijo en el mismo lugar del cielo pero aumentó su brillo "
                        f"de forma notable ({snr:.1f}σ) entre las dos observaciones comparadas."
                    ),
                    "description": (
                        f"Monopolo de Variabilidad Fotométrica ({snr:.1f}σ) sin desplazamiento espacial."
                    ),
                }
            )
            det_id += 1

    # Una fuente que pierde brillo deja un monopolo negativo y también es variable.
    for n_idx, (nx, ny, nval) in enumerate(neg_peaks):
        if n_idx in used_neg:
            continue
        coord = target_wcs.pixel_to_world(nx, ny)
        ra_neg = float(coord.ra.deg)
        dec_neg = float(coord.dec.deg)
        snr_neg = float(nval / sigma)
        detections.append({
            "id": det_id, "type": "VARIABLE_MONOPOLE",
            "x_pix": float(nx), "y_pix": float(ny), "neg_x_pix": None, "neg_y_pix": None,
            "ra": round(ra_neg, 6), "dec": round(dec_neg, 6),
            "snr_score": round(snr_neg, 2), "shift_pixels": 0.0,
            "proper_motion_arcsec_yr": 0.0, "catalog_match": None,
            "iau_designation": format_iau_designation(ra_neg, dec_neg),
            "object_category": "Estrella Variable (Disminución de Brillo)",
            "user_explanation": (
                f"Este astro permaneció fijo en el cielo pero su brillo disminuyó de forma notable "
                f"({snr_neg:.1f}σ) entre la observación antigua y la más reciente."
            ),
            "description": "Candidato variable con disminución de brillo; verificar PSF y fotometría.",
        })
        det_id += 1

    # Una misma estrella deja varios picos en la resta (núcleo saturado, residuos de PSF, anillos).
    # Se agrupan las marcas cercanas y se conserva una sola por fuente.
    link_px = max(SAME_SOURCE_RADIUS_ARCSEC / arcsec_per_px, 1.5 * float(psf_fwhm_pixels or 0.0), 4.0)
    detections = merge_same_source_detections(detections, link_px)
    sorted_dets = sorted(detections, key=lambda d: d["snr_score"], reverse=True)[:6]
    # Cruzar con Gaia DR3 y AllWISE en vivo las 3 detecciones más significativas
    for idx, det in enumerate(sorted_dets, start=1):
        det["id"] = idx

    # Las consultas de red a IRSA/CDS se hacen en paralelo (antes eran secuenciales)
    top = sorted_dets[:3]
    if top and do_crossmatch:
        with ThreadPoolExecutor(max_workers=len(top)) as pool:
            matches = list(pool.map(lambda d: _crossmatch_cached(d["ra"], d["dec"], 14.0), top))
        for det, match_str in zip(top, matches):
            det["catalog_match"] = match_str or "Sin coincidencia en radio 14\"; requiere revisión"
            if match_str:
                det["description"] += f" | Cruce Catálogo: {match_str}"
            else:
                det["description"] += " | Sin contraparte en el radio consultado; no confirma movimiento."

    return sorted_dets


def classify_spectrum_molecules(spectrum: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Evalúa el continuo fotométrico NIR+MIR, estima T_eff equivalente de cuerpo negro
    y detecta cobertura o caídas de flujo en las bandas moleculares de referencia (H₂O, CH₄, CO).

    Exige cobertura en NIR y MIR con SNR > 3 para evitar clasificar ruido o una sola banda.
    """
    result: Dict[str, Any] = {
        "classification": "Cobertura o señal insuficiente",
        "confidence": None,
        "effective_temp_k_est": None,
        "detected_molecules": [],
        "summary": "Se necesitan mediciones con señal significativa en el infrarrojo cercano y medio. "
                   "Las franjas moleculares del gráfico son referencias, no detecciones.",
    }
    significant = [
        p for p in spectrum
        if np.isfinite(p["wavelength_um"])
        and np.isfinite(p["flux_mjy_sr"])
        and np.isfinite(p.get("flux_uncertainty", 0))
        and p.get("flux_uncertainty", 0) > 0
        and p["flux_mjy_sr"] > 3 * p["flux_uncertainty"]
    ]
    nir = [p["flux_mjy_sr"] for p in significant if 0.75 <= p["wavelength_um"] < 2.5]
    mir = [p["flux_mjy_sr"] for p in significant if 3.0 <= p["wavelength_um"] <= 5.0]
    if not nir or not mir:
        return result

    ratio = float(np.mean(mir) / np.mean(nir))
    nir_wls = [float(p["wavelength_um"]) for p in significant if 0.75 <= p["wavelength_um"] < 2.5]
    mir_wls = [float(p["wavelength_um"]) for p in significant if 3.0 <= p["wavelength_um"] <= 5.0]
    wl_nir_mean = float(np.mean(nir_wls))
    wl_mir_mean = float(np.mean(mir_wls))

    wls = np.array([float(p["wavelength_um"]) for p in significant], dtype=float)
    fluxes = np.array([float(p["flux_mjy_sr"]) for p in significant], dtype=float)
    uncs = np.array([max(float(p["flux_uncertainty"]), 1e-6) for p in significant], dtype=float)

    # Temperatura de color equivalente de Planck B_nu(lambda, T) consistente con la relación MIR/NIR
    t_grid = np.geomspace(220.0, 9500.0, 240)
    exp_nir = np.clip(14387.77 / (wl_nir_mean * t_grid), 1e-3, 500.0)
    exp_mir = np.clip(14387.77 / (wl_mir_mean * t_grid), 1e-3, 500.0)
    b_nir = (wl_nir_mean ** -3.0) / np.expm1(exp_nir)
    b_mir = (wl_mir_mean ** -3.0) / np.expm1(exp_mir)
    model_ratios = b_mir / np.maximum(b_nir, 1e-300)
    best_idx = int(np.argmin(np.abs(np.log(np.maximum(model_ratios, 1e-30)) - np.log(max(ratio, 1e-30)))))
    best_t = float(t_grid[best_idx])

    exponent = np.clip(14387.77 / (wls * best_t), 1e-3, 500.0)
    b_nu = (wls ** -3.0) / np.expm1(exponent)
    b_norm = b_nu / max(float(np.max(b_nu)), 1e-30)
    scale = float(np.median(fluxes / np.maximum(b_norm, 1e-12)))
    best_model = scale * b_norm

    temp_est = int(round(best_t, -1))
    snrs = fluxes / uncs
    median_snr = float(np.median(snrs))
    count_factor = min(len(significant) / 8.0, 1.0)
    snr_factor = min(median_snr / 25.0, 1.0)
    rel_err = float(np.median(np.abs(fluxes - best_model) / np.maximum(fluxes, 1e-6)))
    r2_factor = float(np.clip(1.0 - 0.5 * rel_err, 0.2, 1.0))
    confidence = round(float(np.clip(0.48 + 0.20 * count_factor + 0.16 * snr_factor + 0.12 * r2_factor, 0.50, 0.95)), 2)

    # Evaluación de bandas moleculares H2O (2.6-3.3 um), CH4 (3.2-3.6 um) y CO (4.5-4.9 um)
    mol_windows = [
        ("H₂O (2.6–3.3 µm)", 2.6, 3.3),
        ("CH₄ (3.2–3.6 µm)", 3.2, 3.6),
        ("CO (4.5–4.9 µm)", 4.5, 4.9),
    ]
    detected_molecules: List[str] = []
    for label_mol, wl_min, wl_max in mol_windows:
        in_band = [
            (idx, p) for idx, p in enumerate(significant)
            if wl_min <= float(p["wavelength_um"]) <= wl_max
        ]
        if in_band:
            meas_mean = float(np.mean([p["flux_mjy_sr"] for _, p in in_band]))
            cont_mean = float(np.mean([best_model[idx] for idx, _ in in_band]))
            if cont_mean > 0 and meas_mean < 0.88 * cont_mean:
                detected_molecules.append(f"Absorción {label_mol}")
            else:
                detected_molecules.append(f"Muestreo {label_mol}")

    if not detected_molecules:
        if ratio > 1.15:
            detected_molecules.append("Continuo frío IR (compatible con CH₄/H₂O)")
        else:
            detected_molecules.append("Continuo fotométrico NIR+MIR")

    if ratio > 1.15:
        result["classification"] = "Fuente fría / Flujo dominante en IR medio"
    elif ratio < 0.85:
        result["classification"] = "Fuente estelar / Flujo dominante en IR cercano"
    else:
        result["classification"] = "Continuo intermedio NIR/MIR"

    result["confidence"] = confidence
    result["effective_temp_k_est"] = temp_est
    result["detected_molecules"] = detected_molecules
    result["summary"] = (
        f"Relación MIR/NIR ≈ {ratio:.2f} en {len(significant)} canales con SNR > 3 "
        f"(T_eq ajuste Planck ≈ {temp_est} K). "
        "Estimación fotométrica preliminar sobre recortes SPHEREx multi-época."
    )
    return result
