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
from src.irsa_client import crossmatch_catalog_sources_live


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

    for p_idx, (px, py, pval) in enumerate(pos_peaks[:10]):
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
                    pm_arcsec_yr = (dist_px * arcsec_per_px) / baseline_yr if baseline_yr > 0 else 0.0

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
                            "proper_motion_arcsec_yr": round(pm_arcsec_yr, 2),
                            "catalog_match": None,
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
        detections.append({
            "id": det_id, "type": "VARIABLE_MONOPOLE",
            "x_pix": float(nx), "y_pix": float(ny), "neg_x_pix": None, "neg_y_pix": None,
            "ra": round(float(coord.ra.deg), 6), "dec": round(float(coord.dec.deg), 6),
            "snr_score": round(float(nval / sigma), 2), "shift_pixels": 0.0,
            "proper_motion_arcsec_yr": 0.0, "catalog_match": None,
            "description": "Candidato variable con disminución de brillo; verificar PSF y fotometría.",
        })
        det_id += 1

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
    """Describe colores medidos sin inventar confianza, temperatura o moléculas.

    Las reglas de color no son un modelo entrenado ni una medición de absorción.
    Exigir cobertura y SNR evita clasificar ruido o una sola banda.
    """
    result = {
        "classification": "Cobertura o señal insuficiente",
        "confidence": None,
        "effective_temp_k_est": None,
        "detected_molecules": [],
        "summary": "Se necesitan mediciones con señal significativa en el infrarrojo cercano y medio. "
                   "Las franjas moleculares del gráfico son referencias, no detecciones.",
    }
    significant = [p for p in spectrum if
        np.isfinite(p["wavelength_um"]) and np.isfinite(p["flux_mjy_sr"])
        and np.isfinite(p.get("flux_uncertainty", 0))
        and p.get("flux_uncertainty", 0) > 0
        and p["flux_mjy_sr"] > 3 * p["flux_uncertainty"]]
    nir = [p["flux_mjy_sr"] for p in significant if 0.75 <= p["wavelength_um"] < 2.5]
    mir = [p["flux_mjy_sr"] for p in significant if 3 <= p["wavelength_um"] <= 5]
    if not nir or not mir:
        return result
    ratio = float(np.mean(mir) / np.mean(nir))
    result["classification"] = (
        "Flujo dominante en infrarrojo medio" if ratio > 1.15
        else "Flujo dominante en infrarrojo cercano" if ratio < 0.85
        else "Flujos cercanos y medios similares"
    )
    result["summary"] = (
        f"Relación de brillo medio/cercano ≈ {ratio:.2f} en puntos con SNR > 3. "
        "Descripción preliminar de color: no determina tipo estelar, temperatura ni composición. "
        "Las exposiciones pueden provenir de distintas fechas."
    )
    return result
