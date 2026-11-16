"""
Pipeline de procesamiento de imágenes SPHEREx (versión corregida).

Contrato esperado por main.py:
  build_common_target_wcs(ra, dec, fov_deg)            -> (WCS, (ny, nx))
  load_and_clean_real_fits([path])                      -> dict (image, flags, wcs, metadatos)
  align_coadd_and_diff(epochs, target_wcs, shape_out)   -> (aligned_imgs, aligned_flags, coadd, diff)
  matrix_to_base64_png(matrix, mode)                    -> str base64 (mode: science | flags | diff)
  extract_real_spectrum_at_coord(ra, dec, frames_meta, target_wcs) -> (x_pix, y_pix, puntos)

Dependencias: astropy, numpy, matplotlib, reproject
    pip install astropy reproject matplotlib numpy
(NO instalar el paquete "fits" de PyPI: es otra cosa. Se usa astropy.io.fits).
"""

import base64
import logging
import os
import re
import tempfile
import threading
from functools import lru_cache
from io import BytesIO
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

os.environ.setdefault("MPLCONFIGDIR", str(Path(tempfile.gettempdir()) / "papastronomy" / "matplotlib"))

import matplotlib

matplotlib.use("Agg")  # backend sin GUI: necesario dentro de un servidor
from matplotlib import colormaps
import numpy as np
from PIL import Image
from astropy.io import fits
import astropy.units as u
from astropy.stats import sigma_clipped_stats
from astropy.wcs import WCS
from reproject import reproject_interp
from astropy.wcs.utils import proj_plane_pixel_scales
from scipy.ndimage import binary_dilation, distance_transform_edt, gaussian_filter, label

from src.difference import prepare_difference

logger = logging.getLogger("spherex.pipeline")

# Bits de FLAGS que invalidan un píxel. Se ignoran los puramente informativos:
#   bit 21 MP_SOURCE     = píxel asociado a una fuente conocida (¡es justo lo que queremos medir!)
#   bit 12 MP_FULLSAMPLE = hay historia de muestreo completa disponible
# El resto (transitorio, overflow, error, no funcional, hot/cold, no lineal, persistencia,
# outlier...) sigue invalidando el píxel.
BAD_FLAG_MASK = 0xFFFFFFFF & ~((1 << 21) | (1 << 12))  # sin MP_SOURCE ni MP_FULLSAMPLE

try:
    from src.config import DEFAULT_CUTOUT_PIXELS
except Exception:  # pragma: no cover
    DEFAULT_CUTOUT_PIXELS = 128  # app.js asume CUTOUT_NPIX = 128


# ----------------------------------------------------------------------------
# WCS común
# ----------------------------------------------------------------------------
def build_common_target_wcs(ra: float, dec: float, fov_deg: float) -> Tuple[WCS, Tuple[int, int]]:
    """WCS TAN centrado en (ra, dec); grilla fija de DEFAULT_CUTOUT_PIXELS² que cubre `fov_deg`."""
    npix = int(DEFAULT_CUTOUT_PIXELS)
    scale = fov_deg / npix  # grados por píxel

    wcs = WCS(naxis=2)
    wcs.wcs.ctype = ["RA---TAN", "DEC--TAN"]
    wcs.wcs.crval = [ra, dec]
    wcs.wcs.crpix = [(npix + 1) / 2.0, (npix + 1) / 2.0]
    wcs.wcs.cdelt = [-scale, scale]
    wcs.wcs.cunit = ["deg", "deg"]
    return wcs, (npix, npix)


# ----------------------------------------------------------------------------
# Lectura de un FITS de SPHEREx
# ----------------------------------------------------------------------------
def _find_hdu(hdul: fits.HDUList, name: str):
    for hdu in hdul:
        if hdu.name.upper() == name.upper():
            return hdu
    return None


def _locate_image_hdu(hdul: fits.HDUList):
    """HDU 'IMAGE' si existe; si no, el primero con datos 2D."""
    hdu = _find_hdu(hdul, "IMAGE")
    if hdu is not None and hdu.data is not None:
        return hdu
    for hdu in hdul:
        if hdu.data is not None and np.squeeze(hdu.data).ndim == 2:
            return hdu
    raise ValueError("El FITS no contiene ninguna imagen 2D")


def _spectral_values_um(spectral_wcs, x: float, y: float) -> Tuple[float, float]:
    """Evalúa centro/ancho en el píxel nativo y los convierte explícitamente a µm.

    La API numérica de WCS puede normalizar ejes a SI. Por eso sus valores
    se asocian a ``world_axis_units`` antes de extraer números para la API.
    No se adivinan unidades ausentes ni se convierten frecuencias en anchos
    de longitud de onda: ambos ejes deben expresar longitudes compatibles.
    """
    values = spectral_wcs.pixel_to_world_values(x, y)
    if len(values) != 2:
        raise ValueError("El WCS espectral debe devolver centro y ancho de banda")
    units = getattr(spectral_wcs, "world_axis_units", ())
    converted = []
    for axis, value in enumerate(values):
        if isinstance(value, u.Quantity):
            quantity = value
        else:
            try:
                unit = units[axis]
            except (IndexError, KeyError, TypeError) as exc:
                raise ValueError("El WCS espectral no declara las unidades de ambos ejes") from exc
            if not isinstance(unit, (str, u.UnitBase)) or not str(unit).strip():
                raise ValueError("El WCS espectral no declara las unidades de ambos ejes")
            quantity = u.Quantity(value, unit=unit)
        result = float(quantity.to_value(u.um))
        if not np.isfinite(result):
            raise ValueError("El WCS espectral devolvió un valor no finito")
        converted.append(result)
    return converted[0], converted[1]


def _infer_wavelength(hdul: fits.HDUList, img_hdu, header, x: float, y: float) -> Tuple[float, float]:
    """(longitud de onda µm, ancho de banda µm). Devuelve (0.0, 0.0) si no se puede."""
    # 1) WCS espectral (key='W') de SPHEREx
    try:
        # El WCS espectral no usa distorsión SIP; se quita para que astropy no avise en cada lectura
        spec_header = header.copy()
        for k in [k for k in spec_header if re.fullmatch(r"(A|B|AP|BP)_(ORDER|\d+_\d+)", k)]:
            del spec_header[k]
        spectral_wcs = WCS(spec_header, hdul, key="W", fix=False)
        spectral_wcs.sip = None
    except Exception:
        pass
    else:
        try:
            wl_value, bw_value = _spectral_values_um(spectral_wcs, x, y)
        except Exception:
            # A present WCS with an invalid value/unit at this pixel is not a
            # missing WCS: a header/center fallback would label the wrong sample.
            return 0.0, 0.0
        # Algunos FITS publican el centro espectral pero no el ancho de banda.
        # SPHEREx tiene una resolución aproximada R~100, por lo que usamos
        # Δλ≈λ/100 como estimación explícita en vez de mostrar cero.
        if bw_value <= 0 and wl_value > 0:
            bw_value = wl_value / 100.0
        return wl_value, bw_value
    # 2) llaves de header comunes
    for hdr in (img_hdu.header, hdul[0].header):
        for key in ("WAVELENGTH_CENTER_UM", "WAVELENGTH_UM", "WAVELENGTH", "CENWAV"):
            if key in hdr:
                try:
                    wl = float(hdr[key])
                    return wl, wl / 100.0  # ancho de banda aproximado (R~100)
                except (TypeError, ValueError):
                    continue
    return 0.0, 0.0


def _spectral_wcs(hdul: fits.HDUList, header) -> Optional[WCS]:
    """Conserva la tabla espectral en memoria para evaluar el píxel seleccionado."""
    try:
        header = header.copy()
        for key in [k for k in header if re.fullmatch(r"(A|B|AP|BP)_(ORDER|\d+_\d+)", k)]:
            del header[key]
        swcs = WCS(header, hdul, key="W", fix=False)
        swcs.sip = None
        return swcs
    except (ValueError, KeyError):
        return None


def _read_frame(path: Path) -> Dict[str, Any]:
    """Lee imagen, máscara de flags, varianza, WCS y metadatos de un recorte."""
    with fits.open(path) as hdul:
        img_hdu = _locate_image_hdu(hdul)
        data = np.squeeze(np.array(img_hdu.data, dtype=np.float32))
        # SPHEREx trae coeficientes SIP pero CTYPE sin "-SIP": se lo agregamos
        # (copia del header) para que astropy no emita el aviso en cada lectura.
        wcs_header = img_hdu.header.copy()
        if "A_ORDER" in wcs_header:
            for key in ("CTYPE1", "CTYPE2"):
                ctype = str(wcs_header.get(key, ""))
                if ctype and not ctype.endswith("-SIP"):
                    wcs_header[key] = ctype + "-SIP"
        wcs = WCS(wcs_header, naxis=2)

        flags_hdu = _find_hdu(hdul, "FLAGS")
        if flags_hdu is not None and flags_hdu.data is not None and np.squeeze(flags_hdu.data).shape == data.shape:
            bad = (np.squeeze(np.array(flags_hdu.data)).astype(np.int64) & BAD_FLAG_MASK) != 0
        else:
            bad = np.zeros(data.shape, dtype=bool)
        bad |= ~np.isfinite(data)

        var_hdu = _find_hdu(hdul, "VARIANCE")
        variance = None
        if var_hdu is not None and var_hdu.data is not None:
            v = np.squeeze(np.array(var_hdu.data, dtype=np.float32))
            if v.shape == data.shape:
                variance = v

        flux_unit = str(img_hdu.header.get("BUNIT", "")).strip()
        try:
            factor = u.Unit(flux_unit).to(u.MJy / u.sr)
        except (ValueError, u.UnitConversionError):
            factor = None
        if factor is not None:
            data = (data * factor).astype(np.float32)
            if variance is not None:
                variance = (variance * factor ** 2).astype(np.float32)
            flux_unit = "MJy/sr"
        try:
            psf_fwhm_arcsec = float(img_hdu.header["PSF_FWHM"])
        except (ValueError, TypeError, KeyError):
            psf_fwhm_arcsec = None

        wl, bw = _infer_wavelength(hdul, img_hdu, wcs_header, (data.shape[1] - 1) / 2, (data.shape[0] - 1) / 2)
        spectral_wcs = _spectral_wcs(hdul, wcs_header)

        obs_time = ""
        for hdr in (img_hdu.header, hdul[0].header):
            for key in ("OBS_TIME", "DATE-OBS", "MJD-OBS", "MIDMJD"):
                if hdr.get(key):
                    obs_time = str(hdr[key])
                    break
            if obs_time:
                break
        detector = str(img_hdu.header.get("DETECTOR", hdul[0].header.get("DETECTOR", "")) or "")
        version = str(hdul[0].header.get("VERSION", img_hdu.header.get("VERSION", "")) or "")
        fits_header = _summarize_fits_header(hdul, img_hdu)

    good = ~bad
    if good.any():
        _, median, _ = sigma_clipped_stats(data[good], sigma=3.0)
        cleaned_image = np.where(bad, 0.0, data - median).astype(np.float32)
    else:
        cleaned_image = np.zeros_like(data, dtype=np.float32)

    return {
        "data": data,
        "bad": bad,
        "cleaned_image": cleaned_image,
        "flags_uint8": bad.astype(np.uint8),
        "clean_pixels_pct": round(float(100.0 * good.mean()), 2),
        "variance": variance,
        "wcs": wcs,
        "obs_time": obs_time,
        "detector": detector,
        "version": version,
        "wavelength_center_um": wl,
        "bandwidth_um": bw,
        "spectral_wcs": spectral_wcs,
        "flux_unit": flux_unit,
        "psf_fwhm_arcsec": psf_fwhm_arcsec,
        "fits_header": fits_header,
    }


# Claves de la cabecera original que se muestran en el visor, en este orden.
FITS_HEADER_KEYS: Tuple[str, ...] = (
    "SIMPLE", "BITPIX", "NAXIS", "NAXIS1", "NAXIS2", "CTYPE1", "CTYPE2",
    "CRVAL1", "CRVAL2", "BUNIT", "TELESCOP", "INSTRUME", "DETECTOR", "DATE-OBS", "MJD-OBS",
)


def _summarize_fits_header(hdul: fits.HDUList, img_hdu) -> Dict[str, str]:
    """Copia literal de las claves principales de la cabecera, tal como vienen en el archivo.

    SIMPLE solo existe en la HDU primaria; el resto se toma de la HDU de imagen y,
    si falta ahí, de la primaria.
    """
    summary: Dict[str, str] = {}
    for key in FITS_HEADER_KEYS:
        for hdr in ((hdul[0].header,) if key == "SIMPLE" else (img_hdu.header, hdul[0].header)):
            if key not in hdr:
                continue
            value = hdr[key]
            if isinstance(value, bool):
                summary[key] = "T" if value else "F"
            elif isinstance(value, str):
                summary[key] = f"'{value.strip()}'"
            else:
                summary[key] = str(value)
            break
    return summary


@lru_cache(maxsize=256)
def _read_frame_cached(path_str: str, mtime: float) -> Dict[str, Any]:
    return _read_frame(Path(path_str))


def _get_frame(path: Path) -> Dict[str, Any]:
    """Lee un FITS una sola vez (se invalida si el archivo cambia). NO modificar los arrays devueltos."""
    p = Path(path)
    return _read_frame_cached(str(p), p.stat().st_mtime)


def load_and_clean_real_fits(fits_files: List[Path], ra: float | None = None,
                             dec: float | None = None) -> Dict[str, Any]:
    """
    Carga el primer FITS válido de la lista, enmascara flags/NaN y resta el fondo.
    Devuelve un dict con: image, flags, wcs, obs_time, detector,
    wavelength_center_um, clean_pixels_pct, local_path.
    """
    path = next((Path(f) for f in fits_files if Path(f).exists()), None)
    if path is None:
        raise FileNotFoundError(f"No se encontró ningún FITS válido en {fits_files}")

    frame = _get_frame(path)
    if "cleaned_image" in frame and "flags_uint8" in frame and "clean_pixels_pct" in frame:
        data = frame["cleaned_image"]
        flags_u8 = frame["flags_uint8"]
        clean_pct = frame["clean_pixels_pct"]
    else:
        data, bad = frame["data"], frame["bad"]
        good = ~bad
        if good.any():
            _, median, _ = sigma_clipped_stats(data[good], sigma=3.0)
            data = data - median
        # 0 (no NaN): la interpolación de reproject no debe propagar NaN a los vecinos.
        # La máscara viaja aparte en 'flags' y se reaplica después de alinear.
        data = np.where(bad, 0.0, data).astype(np.float32)
        flags_u8 = bad.astype(np.uint8)
        clean_pct = round(float(100.0 * good.mean()), 2)

    wavelength, bandwidth = frame["wavelength_center_um"], frame["bandwidth_um"]
    if ra is not None and dec is not None and frame["spectral_wcs"] is not None:
        x, y = frame["wcs"].all_world2pix([[ra, dec]], 0)[0]
        if np.isfinite(x) and np.isfinite(y):
            wl, bw = _spectral_values_um(frame["spectral_wcs"], x, y)
            if np.isfinite(wl) and np.isfinite(bw) and wl > 0 and bw > 0:
                wavelength, bandwidth = float(wl), float(bw)

    return {
        "image": data,
        "flags": flags_u8,
        "wcs": frame["wcs"],
        "obs_time": frame["obs_time"],
        "detector": frame["detector"],
        "version": frame.get("version", ""),
        "wavelength_center_um": wavelength,
        "bandwidth_um": bandwidth,
        "flux_unit": frame["flux_unit"],
        "psf_fwhm_arcsec": frame["psf_fwhm_arcsec"],
        "clean_pixels_pct": clean_pct,
        "fits_header": dict(frame.get("fits_header") or {}),
        "local_path": str(path),
    }


_REPROJECT_CACHE: Dict[Tuple[Any, ...], Tuple[np.ndarray, np.ndarray]] = {}
_REPROJECT_CACHE_MAX = 256
_REPROJECT_LOCK = threading.Lock()


# ----------------------------------------------------------------------------
# Alineación, coadd y diff
# ----------------------------------------------------------------------------
def align_coadd_and_diff(
    cleaned_epochs: List[Dict[str, Any]],
    target_wcs: WCS,
    shape_out: Tuple[int, int],
    analysis_indices: Optional[List[int]] = None,
    diagnostics: Optional[Dict[str, Any]] = None,
    analysis_groups: Optional[List[List[int]]] = None,
) -> Tuple[List[np.ndarray], List[np.ndarray], np.ndarray, np.ndarray]:
    """Reproyecta, iguala PSF y ajusta fotometría para la resta; expone su calidad."""
    if not cleaned_epochs:
        raise ValueError("No hay épocas para alinear")

    aligned_imgs: List[np.ndarray] = []
    aligned_flags: List[np.ndarray] = []
    is_mock_reproject = hasattr(reproject_interp, "_mock_name")
    wcs_sig = (
        round(float(target_wcs.wcs.crval[0]), 6),
        round(float(target_wcs.wcs.crval[1]), 6),
        round(float(target_wcs.wcs.cdelt[0]), 8),
        round(float(target_wcs.wcs.cdelt[1]), 8),
        shape_out,
    )

    for ep in cleaned_epochs:
        local_path = ep.get("local_path")
        cache_key = (local_path, wcs_sig) if (local_path and not is_mock_reproject) else None
        if cache_key is not None:
            with _REPROJECT_LOCK:
                cached_pair = _REPROJECT_CACHE.get(cache_key)
            if cached_pair is not None:
                aligned_imgs.append(cached_pair[0])
                aligned_flags.append(cached_pair[1])
                continue

        img = reproject_interp(
            (ep["image"], ep["wcs"]), target_wcs, shape_out=shape_out, return_footprint=False
        )
        flg = reproject_interp(
            (ep["flags"].astype(np.float32), ep["wcs"]),
            target_wcs,
            shape_out=shape_out,
            order="bilinear",
            return_footprint=False,
        )
        # fuera del recorte (NaN) o píxel enmascarado = malo
        mask = (np.nan_to_num(flg, nan=1.0) > 1e-6) | ~np.isfinite(img)
        al_img = np.where(np.isfinite(img) & ~mask, img, np.nan).astype(np.float32)
        al_flg = mask.astype(np.uint8)
        al_img.setflags(write=False)
        al_flg.setflags(write=False)
        if cache_key is not None:
            with _REPROJECT_LOCK:
                if len(_REPROJECT_CACHE) >= _REPROJECT_CACHE_MAX:
                    _REPROJECT_CACHE.pop(next(iter(_REPROJECT_CACHE)))
                _REPROJECT_CACHE[cache_key] = (al_img, al_flg)
        aligned_imgs.append(al_img)
        aligned_flags.append(al_flg)

    indices = analysis_indices if analysis_indices is not None else list(range(len(aligned_imgs)))
    arcsec_per_pixel = float(np.mean(proj_plane_pixel_scales(target_wcs)) * 3600)
    result = prepare_difference(aligned_imgs, cleaned_epochs, indices, arcsec_per_pixel)
    tried = {tuple(indices)}
    for group in (analysis_groups or [])[:8]:
        if result.available:
            break
        if tuple(group) in tried:
            continue
        tried.add(tuple(group))
        candidate = prepare_difference(aligned_imgs, cleaned_epochs, group, arcsec_per_pixel)
        if candidate.available:
            result, indices = candidate, group
    if diagnostics is not None:
        diagnostics.update(result.diagnostics(), available=result.available, note=result.note)
        diagnostics["analysis_frame_indices"] = indices
        diagnostics["groups_checked"] = len(tried)
    return aligned_imgs, aligned_flags, result.coadd, result.difference


# ----------------------------------------------------------------------------
# Curado cosmético de núcleos saturados y bordes reproyectados (solo display)
# ----------------------------------------------------------------------------
def _heal_science_for_display(arr: np.ndarray) -> np.ndarray:
    """
    Reconstruye suavemente:
    1) Núcleos estelares saturados (huecos NaN interiores rodeados por un halo brillante,
       como en R Draconis) mediante un domo radial gaussiano continuo.
    2) Huecos pequeños de rayos cósmicos / flags interiores por interpolación suave.
    3) Esquinas exteriores sin cobertura del recorte rotado para evitar escalones
       geométricos artificiales dentro del mosaico.
    """
    out = np.array(arr, dtype=np.float64, copy=True)
    isnan = ~np.isfinite(out)
    if not np.any(isnan) or np.all(isnan):
        return out

    finite_vals = out[~isnan]
    p25, p50 = np.percentile(finite_vals, [25.0, 50.0])
    mad_scale = float(np.median(np.abs(finite_vals - p50))) * 1.4826
    sky_level = float(p25)

    labeled, num_features = label(isnan)

    for cid in range(1, num_features + 1):
        comp = labeled == cid
        touches_border = (
            np.any(comp[0, :])
            or np.any(comp[-1, :])
            or np.any(comp[:, 0])
            or np.any(comp[:, -1])
        )
        if touches_border:
            continue

        ring = binary_dilation(comp, iterations=2) & (~isnan)
        if not np.any(ring):
            continue
        ring_vals = out[ring]
        ring_q65 = float(np.percentile(ring_vals, 65.0))
        ring_q90 = float(np.percentile(ring_vals, 90.0))
        hole_size = int(np.sum(comp))

        # Núcleo estelar saturado rodeado de halo brillante
        if 3 <= hole_size <= 1200 and ring_q65 > p50 + max(1.8 * mad_scale, 0.25):
            dist = distance_transform_edt(comp)
            max_d = max(float(np.max(dist)), 1.0)
            norm_d = dist / max_d
            peak_val = max(ring_q90 * 1.35, ring_q65 + 2.5 * mad_scale)
            profile = ring_q65 + (peak_val - ring_q65) * np.exp(-1.6 * (1.0 - norm_d) ** 2)
            out[comp] = profile[comp]
        else:
            out[comp] = float(np.median(ring_vals))

    # Suavizar transiciones en los parches interiores recién curados
    interior_healed = isnan & np.isfinite(out)
    if np.any(interior_healed):
        _, nearest_idx = distance_transform_edt(~np.isfinite(out), return_indices=True)
        temp_filled = out[tuple(nearest_idx)]
        smoothed_interior = gaussian_filter(temp_filled, sigma=1.6, mode="nearest")
        blend_zone = binary_dilation(interior_healed, iterations=1) & np.isfinite(out)
        out[blend_zone] = 0.72 * smoothed_interior[blend_zone] + 0.28 * out[blend_zone]

    # Extender suavemente el borde hacia las esquinas exteriores (fuera del FITS rotado)
    still_nan = ~np.isfinite(out)
    if np.any(still_nan):
        dist_ext, nearest_idx = distance_transform_edt(still_nan, return_indices=True)
        nearest_vals = out[tuple(nearest_idx)]
        smooth_ext = gaussian_filter(nearest_vals, sigma=5.0, mode="nearest")
        decay = np.exp(-dist_ext / 14.0)
        out[still_nan] = sky_level + (smooth_ext[still_nan] - sky_level) * decay[still_nan]

    return out


# ----------------------------------------------------------------------------
# Matriz -> PNG base64
# ----------------------------------------------------------------------------
def matrix_to_base64_png(matrix: np.ndarray, mode: str = "science") -> str:
    """mode: 'science' (stretch asinh), 'flags' (binario) o 'diff' (divergente, simétrico)."""
    arr = np.asarray(matrix, dtype=float)
    finite = arr[np.isfinite(arr)]

    if mode == "flags":
        # Máscara magenta semitransparente: los píxeles válidos no tapan la imagen.
        bad = np.nan_to_num(arr, nan=1.0) > 0
        rgba = np.zeros((*arr.shape, 4), dtype=np.uint8)
        rgba[bad] = [217, 70, 239, 150]
        buf = BytesIO()
        Image.fromarray(np.flipud(rgba)).save(buf, format="PNG")
        return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode("ascii")
    elif mode == "diff":
        lim = float(np.percentile(np.abs(finite), 99)) if finite.size else 1.0
        lim = lim or 1.0
        arr = np.nan_to_num(arr, nan=0.0)
        cmap_name, vmin, vmax = "RdBu_r", -lim, lim
    else:  # science
        if finite.size:
            arr = _heal_science_for_display(arr)
            healed_finite = arr[np.isfinite(arr)]
            p10, p22, p50 = np.percentile(healed_finite, [10.0, 22.0, 50.0])
            sky_level = float(p22)
            lower_sigma = max(float(p50 - p10) * 1.25, 0.38)
            mad = float(np.median(np.abs(healed_finite - p50))) * 1.4826
            sigma = max(lower_sigma, min(mad, lower_sigma * 2.4))
            z = np.clip((arr - sky_level) / sigma + 0.55, 0.0, None)
            arr = np.clip(np.arcsinh(z / 2.2) / np.arcsinh(14.0), 0.0, 1.0)
        else:
            arr = np.zeros_like(arr)
        cmap_name, vmin, vmax = "gray", 0.0, 1.0

    cmap = colormaps[cmap_name].with_extremes(bad=(0.0, 0.0, 0.0, 0.0))

    buf = BytesIO()
    normalized = np.ma.masked_invalid(np.clip((arr - vmin) / (vmax - vmin), 0, 1))
    rgba = cmap(normalized, bytes=True)
    Image.fromarray(np.flipud(rgba)).save(buf, format="PNG")
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode("utf-8")


# ----------------------------------------------------------------------------
# Espectro real por fotometría de apertura
# ----------------------------------------------------------------------------
def extract_real_spectrum_at_coord(
    ra: float,
    dec: float,
    frames_meta: List[Dict[str, Any]],
    target_wcs: WCS,
    aperture_pix: float = 2.0,
) -> Tuple[int, int, List[Dict[str, Any]]]:
    """Fotometría de apertura en (ra, dec) sobre cada recorte descargado."""
    xc, yc = target_wcs.wcs_world2pix([[ra, dec]], 0)[0]
    x_common = int(round(xc)) if np.isfinite(xc) else 0
    y_common = int(round(yc)) if np.isfinite(yc) else 0

    points: List[Dict[str, Any]] = []
    for fm in frames_meta:
        path = Path(fm["local_path"])
        if not path.exists():
            continue
        try:
            fr = _get_frame(path)
            if fr.get("flux_unit") != "MJy/sr":
                logger.warning("Se omite %s: unidades de brillo superficial no calibradas", path.name)
                continue
            x, y = fr["wcs"].all_world2pix([[ra, dec]], 0)[0]
            data, bad, var = fr["data"], fr["bad"], fr["variance"]
            ny, nx = data.shape
            if not (np.isfinite(x) and np.isfinite(y)) or not (0 <= x < nx and 0 <= y < ny):
                continue

            # Solo recorrer el entorno de apertura y anillo, no todo el detector.
            radius = aperture_pix * 3.5
            x0, x1 = max(0, int(x - radius)), min(nx, int(x + radius) + 2)
            y0, y1 = max(0, int(y - radius)), min(ny, int(y + radius) + 2)
            data, bad = data[y0:y1, x0:x1], bad[y0:y1, x0:x1]
            if var is not None:
                var = var[y0:y1, x0:x1]
            yy, xx = np.mgrid[y0:y1, x0:x1]
            r = np.hypot(xx - x, yy - y)
            ap = (r <= aperture_pix) & ~bad
            ann = (r > aperture_pix * 2) & (r <= aperture_pix * 3.5) & ~bad
            if ap.sum() == 0:
                continue

            bkg = float(np.median(data[ann])) if ann.sum() > 3 else 0.0
            flux = float(np.mean(data[ap]) - bkg)
            if var is not None and np.all(np.isfinite(var[ap]) & (var[ap] >= 0)):
                unc = float(np.sqrt(np.sum(var[ap])) / ap.sum())
            elif ann.sum() > 3:
                unc = float(np.std(data[ann]) / np.sqrt(ap.sum()))
            else:
                unc = 0.0

            wl, bw = fr["wavelength_center_um"], fr["bandwidth_um"]
            if fr["spectral_wcs"] is not None:
                wl, bw = _spectral_values_um(fr["spectral_wcs"], x, y)
            if not all(np.isfinite(v) for v in (wl, bw, flux, unc)) or wl <= 0:
                continue
            points.append(
                {
                    "obs_time": fr["obs_time"] or str(fm.get("obs_time", "")),
                    "detector": fr["detector"] or str(fm.get("detector_band", "")),
                    "wavelength_um": round(wl, 4),
                    "bandwidth_um": round(max(0.0, bw), 4),
                    "flux_mjy_sr": flux,
                    "flux_uncertainty": unc,
                    "x_pix_common": x_common,
                    "y_pix_common": y_common,
                }
            )
        except Exception as exc:  # un recorte malo no debe tumbar todo el espectro
            logger.warning("Se omite %s en el espectro: %s", path.name, exc)

    points.sort(key=lambda p: p["wavelength_um"])
    return x_common, y_common, points
