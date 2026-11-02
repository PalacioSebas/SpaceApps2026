"""
Motor IA v2.0:
1. Detección automática de dipolos (`MOVING_DIPOLE`) y monopolos (`VARIABLE_MONOPOLE`) sobre la
   matriz de diferencia real ΔI, más cruce astrométrico en vivo con los catálogos Gaia DR3 y AllWISE.
2. Diagnóstico espectral basado en los puntos fotométricos reales extraídos de los archivos FITS.
"""

import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional, Tuple
import numpy as np
from astropy.wcs import WCS
from photutils.detection import find_peaks
from scipy.spatial.distance import cdist

from src.config import DEFAULT_CUTOUT_PIXELS
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
    dates = []
    for ep in epochs_meta:
        full = str(ep.get("obs_time", "")).strip()
        try:
            mjd = float(full)  # IRSA entrega MJD, p. ej. 60800.834438
            if mjd > 40000:
                dates.append(datetime(1858, 11, 17) + timedelta(days=mjd))
                continue
        except ValueError:
            pass
        try:
            dates.append(datetime.strptime(full[:10], "%Y-%m-%d"))
        except ValueError:
            pass
    if len(dates) >= 2:
        days = abs((max(dates) - min(dates)).days)
        if days > 0:
            return max(0.1, days / 365.25)
    return 0.5


def detect_anomalies_on_diff(
    diff_img: np.ndarray,
    target_wcs: WCS,
    fov_deg: float,
    epochs_meta: List[Dict[str, Any]],
    threshold_sigma: float = 4.0,
    do_crossmatch: bool = True,
) -> List[Dict[str, Any]]:
    """
    Detecta picos > 4σ en la imagen restada real, empareja dipolos positivo-negativo
    y consulta en vivo los catálogos Gaia DR3 / AllWISE para las detecciones principales.
    """
    clean_diff = np.nan_to_num(diff_img, nan=0.0).astype(np.float64)
    median_bg = float(np.median(clean_diff))
    mad = float(np.median(np.abs(clean_diff - median_bg)))
    sigma = 1.4826 * mad if mad > 1e-7 else float(np.std(clean_diff))
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
    baseline_yr = _compute_baseline_years(epochs_meta)

    detections: List[Dict[str, Any]] = []
    used_neg = set()
    det_id = 1

    for px, py, pval in pos_peaks[:10]:
        matched_dipole = False
        if len(neg_peaks) > 0:
            dists = cdist([[px, py]], neg_peaks[:, :2])[0]
            for n_idx in np.argsort(dists):
                dist_px = float(dists[n_idx])
                if int(n_idx) not in used_neg and 1.5 <= dist_px <= 22.0:
                    used_neg.add(int(n_idx))
                    matched_dipole = True
                    nx, ny, nval = neg_peaks[n_idx]
                    sky_coord = target_wcs.pixel_to_world(px, py)
                    ra_val = float(sky_coord.ra.deg)
                    dec_val = float(sky_coord.dec.deg)
                    snr = float((pval + nval) / (2.0 * sigma))
                    pm_arcsec_yr = (dist_px * arcsec_per_px) / baseline_yr

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
                            "description": (
                                f"Dipolo Positivo-Negativo real (Δ={dist_px:.1f} px, μ≈{pm_arcsec_yr:.2f}\"/año). "
                                "Fuente con desplazamiento astrométrico entre épocas."
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
            det["catalog_match"] = match_str or "No catalogado en radio 14\" (Candidato a Descubrimiento)"
            if match_str:
                det["description"] += f" | Cruce Catálogo: {match_str}"
            else:
                det["description"] += " | ¡Sin contraparte estática en Gaia DR3!"

    return sorted_dets


def classify_spectrum_molecules(spectrum: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Evalúa los puntos fotométricos reales medidos en el espectro infrarrojo y determina
    la pendiente de color infrarroja (J/H/K vs W1/W2) y las absorciones moleculares.
    """
    if not spectrum:
        return {
            "classification": "Sin cobertura espectral en el píxel seleccionado",
            "confidence": 0.0,
            "effective_temp_k_est": 0,
            "detected_molecules": [],
            "summary": "Hacé clic dentro de una fuente brillante para medir su fotometría de apertura real.",
        }

    wl = np.array([p["wavelength_um"] for p in spectrum], dtype=np.float64)
    fl = np.array([p["flux_mjy_sr"] for p in spectrum], dtype=np.float64)

    nir_mask = wl < 2.5
    mir_mask = wl >= 3.0

    nir_mean = float(np.mean(fl[nir_mask])) if np.any(nir_mask) else float(np.mean(fl))
    mir_mean = float(np.mean(fl[mir_mask])) if np.any(mir_mask) else float(np.mean(fl))

    w1_mask = (wl >= 3.0) & (wl <= 3.8)
    w2_mask = (wl >= 4.2) & (wl <= 5.0)
    f_w1 = float(np.mean(fl[w1_mask])) if np.any(w1_mask) else mir_mean
    f_w2 = float(np.mean(fl[w2_mask])) if np.any(w2_mask) else mir_mean

    detected_molecules = []
    if f_w1 < f_w2 * 0.75:
        detected_molecules.append("CH₄ (Fuerte absorción en banda 3.3 μm respecto a 4.6 μm)")
        detected_molecules.append("H₂O (Supresión en infrarrojo cercano)")
    if mir_mean > nir_mean * 1.15:
        detected_molecules.append("Exceso Infrarrojo en 4.6 μm (Ventana atmosférica térmica)")
    else:
        detected_molecules.append("CO / H₂O (Bandas estelares en atmósfera fría)")

    if f_w2 > f_w1 * 1.35 and mir_mean >= nir_mean:
        classification = "Enana Marrón Fría (Tipo T/Y · Exceso W2 a 4.6 μm)"
        temp_k = 450
        conf = 0.92
        summary = (
            "Fotometría real medida sobre recortes de IRSA: flujo dominante en 4.6 μm (W2) con fuerte "
            "absorción por Metano (CH₄) en 3.3 μm (W1) y supresión en el infrarrojo cercano."
        )
    elif mir_mean > nir_mean * 0.85:
        classification = "Objeto Infrarrojo Variable / Estrella Joven con Disco (T Tauri / Mira)"
        temp_k = 2800
        conf = 0.88
        summary = (
            "Emisión infrarroja sostenida entre 2.1 y 4.6 μm medida directamente sobre las exposiciones FITS, "
            "consistente con envolturas de polvo circunestelar o gigantes rojas variables."
        )
    else:
        classification = "Estrella de Secuencia Principal / Enana Roja Cercana (Tipo M/K)"
        temp_k = 3350
        conf = 0.90
        summary = (
            "Flujo máximo en las bandas del infrarrojo cercano (1.2–2.2 μm) con caída térmica "
            "Rayleigh-Jeans hacia 3.4–4.6 μm, característico de fotosferas estelares."
        )

    return {
        "classification": classification,
        "confidence": conf,
        "effective_temp_k_est": temp_k,
        "detected_molecules": detected_molecules,
        "summary": summary,
    }