"""Resta preliminar con PSF gaussiana común y referencias fotométricas.

La anchura PSF_FWHM de SPHEREx está en arcsec. No modelamos aquí la ePSF
espacial ni la covarianza introducida por reproyección y convolución.
"""

from dataclasses import dataclass, field
import warnings

import numpy as np
from scipy.ndimage import gaussian_filter, maximum_filter

from src.analysis import observation_mjd


@dataclass
class DifferenceResult:
    coadd: np.ndarray
    difference: np.ndarray
    available: bool = False
    status: str = "insufficient_epochs"
    note: str = "Sin dos fechas con bandas comparables."
    target_fwhm_arcsec: float | None = None
    baseline_years: float | None = None
    valid_pixels_pct: float = 0.0
    calibrations: list[dict] = field(default_factory=list)

    def diagnostics(self) -> dict:
        return {key: value for key, value in vars(self).items() if key not in ("coadd", "difference", "note", "available")}


def _noise(values: np.ndarray) -> float:
    median = np.median(values)
    return float(1.4826 * np.median(np.abs(values - median)))


def match_gaussian_psf(image: np.ndarray, source_fwhm: float, target_fwhm: float,
                       arcsec_per_pixel: float) -> np.ndarray:
    """Suaviza hacia la PSF más ancha; nunca deconvoluciona ni rellena máscaras."""
    sigma = np.sqrt(max(0.0, target_fwhm ** 2 - source_fwhm ** 2)) / (2.354820045 * arcsec_per_pixel)
    if sigma < 0.05:
        return np.asarray(image, dtype=np.float64).copy()
    radius = int(4 * sigma + 0.5)
    good = np.isfinite(image)
    result = gaussian_filter(np.where(good, image, 0.0).astype(np.float64), sigma,
                             mode="constant", cval=0, radius=radius)
    # Rechazar toda la huella del kernel alrededor de huecos y bordes.
    contaminated = maximum_filter((~good).astype(np.uint8), size=2 * radius + 1,
                                   mode="constant", cval=1) > 0
    result[contaminated] = np.nan
    return result


def _reference_sources(image: np.ndarray, fwhm_pixels: float) -> list[tuple[int, int]]:
    values = image[np.isfinite(image)]
    if values.size < 64:
        return []
    median, noise = float(np.median(values)), _noise(values)
    if noise <= 0:
        return []
    data = np.where(np.isfinite(image), image, -np.inf)
    separation = max(3, int(np.ceil(4 * fwhm_pixels)) | 1)
    peaks = (data == maximum_filter(data, size=separation)) & (data > median + 5 * noise)
    ys, xs = np.nonzero(peaks)
    order = np.argsort(-data[ys, xs])
    # Una meseta no debe contarse como varias referencias independientes.
    selected = []
    for index in order:
        y, x = int(ys[index]), int(xs[index])
        if all(np.hypot(y - yy, x - xx) > 4 * fwhm_pixels for yy, xx in selected):
            selected.append((y, x))
        if len(selected) == 40:
            break
    return selected


def _aperture_flux(image: np.ndarray, y: int, x: int, fwhm: float) -> float | None:
    radius = int(np.ceil(3 * fwhm))
    if y - radius < 0 or x - radius < 0 or y + radius >= image.shape[0] or x + radius >= image.shape[1]:
        return None
    stamp = image[y-radius:y+radius+1, x-radius:x+radius+1]
    yy, xx = np.mgrid[-radius:radius+1, -radius:radius+1]
    distance = np.hypot(xx, yy)
    aperture = distance <= 1.5 * fwhm
    annulus = (distance >= 2 * fwhm) & (distance <= 3 * fwhm)
    if not np.all(np.isfinite(stamp[aperture | annulus])):
        return None
    return float(np.sum(stamp[aperture] - np.median(stamp[annulus])))


def fit_relative_photometry(reference: np.ndarray, image: np.ndarray,
                            fwhm_pixels: float) -> dict:
    """Escala robusta por fuentes aisladas; requiere al menos tres referencias.

    Una única fuente variable no define la escala del campo. El ajuste no puede
    distinguir un cambio coherente de todas las fuentes de un cambio de ganancia.
    """
    ratios = []
    finite = image[np.isfinite(image)]
    noise = _noise(finite) if finite.size else 0.0
    for y, x in _reference_sources(reference, fwhm_pixels):
        ref_flux = _aperture_flux(reference, y, x, fwhm_pixels)
        flux = _aperture_flux(image, y, x, fwhm_pixels)
        # Error orientativo conservador para seleccionar referencias, no SNR final.
        min_flux = 5 * noise * np.sqrt(np.pi * (1.5 * fwhm_pixels) ** 2)
        if ref_flux is not None and flux is not None and ref_flux > 0 and flux > max(min_flux, 0):
            ratios.append(ref_flux / flux)
    ratios = np.asarray(ratios, dtype=float)
    if ratios.size < 3:
        raise ValueError("Menos de tres fuentes de referencia con señal y cobertura suficientes.")
    median = float(np.median(ratios))
    scatter = _noise(ratios)
    keep = np.abs(ratios - median) <= max(3 * scatter, 0.03 * median)
    ratios = ratios[keep]
    if ratios.size < 3:
        raise ValueError("Menos de tres referencias consistentes tras rechazar variables/atípicos.")
    scale = float(np.median(ratios))
    scatter = _noise(ratios) / scale
    if not 0.5 <= scale <= 2.0 or scatter > 0.15:
        raise ValueError("Escala o dispersión fotométrica fuera de los límites del ajuste preliminar.")
    overlap = np.isfinite(reference) & np.isfinite(image)
    offset = float(np.median(reference[overlap] - scale * image[overlap]))
    return {"scale": scale, "offset": offset, "reference_sources": int(ratios.size),
            "relative_scatter": float(scatter)}


def prepare_difference(images: list[np.ndarray], epochs: list[dict], indices: list[int],
                       arcsec_per_pixel: float) -> DifferenceResult:
    """Calibra un subconjunto comparable, conservando intactos los frames del visor."""
    stack = np.stack([images[i] for i in indices])
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", RuntimeWarning)
        coadd = np.nanmedian(stack, axis=0).astype(np.float32)
    result = DifferenceResult(coadd, np.full_like(coadd, np.nan))
    times = [observation_mjd(epochs[i].get("obs_time", "")) for i in indices]
    if len(indices) < 2 or any(t is None for t in times) or len(set(times)) < 2:
        return result
    if not all(epochs[i].get("flux_unit") == "MJy/sr" for i in indices):
        result.status, result.note = "unsupported_units", "Resta no disponible: faltan unidades de brillo superficial calibradas."
        return result
    widths = [epochs[i].get("psf_fwhm_arcsec") for i in indices]
    if any(w is None or not np.isfinite(w) or w <= 0 for w in widths):
        result.status, result.note = "missing_psf", "Resta no disponible: falta una anchura PSF válida en los FITS."
        return result
    target_width = max(widths)
    if not np.isfinite(arcsec_per_pixel) or arcsec_per_pixel <= 0 or target_width / arcsec_per_pixel > min(coadd.shape) / 8:
        result.status, result.note = "invalid_psf_scale", "Resta no disponible: la PSF no permite suficientes referencias en este recorte."
        return result
    result.target_fwhm_arcsec = float(target_width)
    matched = [match_gaussian_psf(images[i], width, target_width, arcsec_per_pixel)
               for i, width in zip(indices, widths)]
    reference_idx = max(range(len(matched)), key=lambda j: np.isfinite(matched[j]).sum())
    reference = matched[reference_idx]
    calibrated = []
    for j, image in enumerate(matched):
        try:
            fit = ({"scale": 1.0, "offset": 0.0, "reference_sources": 0, "relative_scatter": 0.0}
                   if j == reference_idx else fit_relative_photometry(reference, image, target_width / arcsec_per_pixel))
        except ValueError as exc:
            result.status, result.note = "insufficient_references", f"Resta no disponible: {exc}"
            return result
        result.calibrations.append({"frame_index": indices[j], "is_reference": j == reference_idx, **fit})
        calibrated.append(image * fit["scale"] + fit["offset"])
    # Partir por fechas distintas evita asignar una misma época a ambas mitades.
    distinct_times = sorted(set(times))
    boundary = distinct_times[len(distinct_times) // 2]
    early = [j for j, t in enumerate(times) if t < boundary]
    late = [j for j, t in enumerate(times) if t >= boundary]
    common = np.all(np.isfinite(calibrated), axis=0)
    if np.count_nonzero(common) < 64:
        result.status, result.note = "insufficient_overlap", "Resta no disponible: cobertura común insuficiente tras igualar la PSF."
        return result
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", RuntimeWarning)
        data = np.stack(calibrated)
        result.coadd = np.nanmedian(data, axis=0).astype(np.float32)
        difference = np.mean(data[late], axis=0) - np.mean(data[early], axis=0)
    result.difference = np.where(common, difference, np.nan).astype(np.float32)
    result.baseline_years = float((np.mean([times[j] for j in late]) - np.mean([times[j] for j in early])) / 365.25)
    result.valid_pixels_pct = round(float(100 * common.mean()), 2)
    result.available, result.status = True, "gaussian_approximation"
    result.note = (f"Resta preliminar: PSF gaussiana común de {target_width:.2f}″ y ajuste fotométrico por fuentes. "
                   f"Cobertura común: {result.valid_pixels_pct}%. Requiere validar ePSF y candidatos.")
    return result
