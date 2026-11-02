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
import re
import warnings
from functools import lru_cache
from io import BytesIO
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import matplotlib

matplotlib.use("Agg")  # backend sin GUI: necesario dentro de un servidor
import matplotlib.pyplot as plt
import numpy as np
from astropy.io import fits
from astropy.stats import sigma_clipped_stats
from astropy.wcs import WCS
from reproject import reproject_interp

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


def _infer_wavelength(hdul: fits.HDUList, img_hdu, header, x: float, y: float) -> Tuple[float, float]:
    """(longitud de onda µm, ancho de banda µm). Devuelve (0.0, 0.0) si no se puede."""
    # 1) WCS espectral (key='W') de SPHEREx
    try:
        # El WCS espectral no usa distorsión SIP; se quita para que astropy no avise en cada lectura
        spec_header = header.copy()
        for k in [k for k in spec_header if re.fullmatch(r"(A|B|AP|BP)_(ORDER|\d+_\d+)", k)]:
            del spec_header[k]
        spectral_wcs = WCS(spec_header, hdul, key="W", fix=False)
        wl, bw = spectral_wcs.pixel_to_world(x, y)
        return float(getattr(wl, "value", wl)), float(getattr(bw, "value", bw))
    except Exception:
        pass
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
            # TODO: si quieres ignorar flags informativos, aplica una máscara de bits aquí
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

        wl, bw = _infer_wavelength(hdul, img_hdu, wcs_header, data.shape[1] / 2.0, data.shape[0] / 2.0)

        obs_time = ""
        for hdr in (img_hdu.header, hdul[0].header):
            for key in ("OBS_TIME", "DATE-OBS", "MJD-OBS", "MIDMJD"):
                if hdr.get(key):
                    obs_time = str(hdr[key])
                    break
            if obs_time:
                break
        detector = str(img_hdu.header.get("DETECTOR", hdul[0].header.get("DETECTOR", "")) or "")

    return {
        "data": data,
        "bad": bad,
        "variance": variance,
        "wcs": wcs,
        "obs_time": obs_time,
        "detector": detector,
        "wavelength_center_um": wl,
        "bandwidth_um": bw,
    }


@lru_cache(maxsize=48)
def _read_frame_cached(path_str: str, mtime: float) -> Dict[str, Any]:
    return _read_frame(Path(path_str))


def _get_frame(path: Path) -> Dict[str, Any]:
    """Lee un FITS una sola vez (se invalida si el archivo cambia). NO modificar los arrays devueltos."""
    p = Path(path)
    return _read_frame_cached(str(p), p.stat().st_mtime)


def load_and_clean_real_fits(fits_files: List[Path]) -> Dict[str, Any]:
    """
    Carga el primer FITS válido de la lista, enmascara flags/NaN y resta el fondo.
    Devuelve un dict con: image, flags, wcs, obs_time, detector,
    wavelength_center_um, clean_pixels_pct, local_path.
    """
    path = next((Path(f) for f in fits_files if Path(f).exists()), None)
    if path is None:
        raise FileNotFoundError(f"No se encontró ningún FITS válido en {fits_files}")

    frame = _get_frame(path)
    data, bad = frame["data"], frame["bad"]

    good = ~bad
    if good.any():
        _, median, _ = sigma_clipped_stats(data[good], sigma=3.0)
        data = data - median
    # 0 (no NaN): la interpolación de reproject no debe propagar NaN a los vecinos.
    # La máscara viaja aparte en 'flags' y se reaplica después de alinear.
    data = np.where(bad, 0.0, data).astype(np.float32)

    return {
        "image": data,
        "flags": bad.astype(np.uint8),
        "wcs": frame["wcs"],
        "obs_time": frame["obs_time"],
        "detector": frame["detector"],
        "wavelength_center_um": frame["wavelength_center_um"],
        "clean_pixels_pct": round(float(100.0 * good.mean()), 2),
        "local_path": str(path),
    }


# ----------------------------------------------------------------------------
# Alineación, coadd y diff
# ----------------------------------------------------------------------------
def align_coadd_and_diff(
    cleaned_epochs: List[Dict[str, Any]],
    target_wcs: WCS,
    shape_out: Tuple[int, int],
) -> Tuple[List[np.ndarray], List[np.ndarray], np.ndarray, np.ndarray]:
    """Reproyecta cada época al WCS común y calcula coadd (mediana) y diff (mitad tardía - temprana)."""
    if not cleaned_epochs:
        raise ValueError("No hay épocas para alinear")

    aligned_imgs: List[np.ndarray] = []
    aligned_flags: List[np.ndarray] = []

    for ep in cleaned_epochs:
        img = reproject_interp(
            (ep["image"], ep["wcs"]), target_wcs, shape_out=shape_out, return_footprint=False
        )
        flg = reproject_interp(
            (ep["flags"].astype(np.float32), ep["wcs"]),
            target_wcs,
            shape_out=shape_out,
            order="nearest-neighbor",
            return_footprint=False,
        )
        # fuera del recorte (NaN) o píxel enmascarado = malo
        mask = np.nan_to_num(flg, nan=1.0) > 0.5
        aligned_imgs.append(np.where(np.isfinite(img) & ~mask, img, np.nan).astype(np.float32))
        aligned_flags.append(mask.astype(np.uint8))

    stack = np.stack(aligned_imgs)
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", RuntimeWarning)  # "All-NaN slice" en bordes
        coadd = np.nanmedian(stack, axis=0)
        n = len(aligned_imgs)
        if n >= 2:
            half = n // 2
            diff = np.nanmean(stack[half:], axis=0) - np.nanmean(stack[:half], axis=0)
        else:
            diff = np.zeros_like(coadd)

    # Un píxel enmascarado en CUALQUIER época (más un margen de 2 px) no entra en la resta:
    # si no, los bordes de la máscara producen falsos "dipolos".
    bad_any = np.any(np.stack(aligned_flags) > 0, axis=0)
    try:
        from scipy.ndimage import binary_dilation

        bad_any = binary_dilation(bad_any, iterations=2)
    except ImportError:
        pass
    diff = np.where(bad_any, np.nan, diff)

    return aligned_imgs, aligned_flags, coadd.astype(np.float32), diff.astype(np.float32)


# ----------------------------------------------------------------------------
# Matriz -> PNG base64
# ----------------------------------------------------------------------------
def matrix_to_base64_png(matrix: np.ndarray, mode: str = "science") -> str:
    """mode: 'science' (stretch asinh), 'flags' (binario) o 'diff' (divergente, simétrico)."""
    arr = np.asarray(matrix, dtype=float)
    finite = arr[np.isfinite(arr)]

    if mode == "flags":
        arr = (np.nan_to_num(arr, nan=1.0) > 0).astype(float)
        cmap_name, vmin, vmax = "gray", 0.0, 1.0
    elif mode == "diff":
        lim = float(np.percentile(np.abs(finite), 99)) if finite.size else 1.0
        lim = lim or 1.0
        cmap_name, vmin, vmax = "RdBu_r", -lim, lim
    else:  # science
        if finite.size:
            lo, hi = np.percentile(finite, [1.0, 99.5])
        else:
            lo, hi = 0.0, 1.0
        if hi <= lo:
            hi = lo + 1.0
        arr = np.arcsinh(np.clip((arr - lo) / (hi - lo), 0, None) * 10.0) / np.arcsinh(10.0)
        cmap_name, vmin, vmax = "gray", 0.0, 1.0

    cmap = plt.get_cmap(cmap_name).copy()
    cmap.set_bad("black")

    buf = BytesIO()
    plt.imsave(buf, arr, cmap=cmap, vmin=vmin, vmax=vmax, origin="lower", format="png")
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
            x, y = fr["wcs"].wcs_world2pix([[ra, dec]], 0)[0]
            data, bad, var = fr["data"], fr["bad"], fr["variance"]
            ny, nx = data.shape
            if not (np.isfinite(x) and np.isfinite(y)) or not (0 <= x < nx and 0 <= y < ny):
                continue

            yy, xx = np.indices(data.shape)
            r = np.hypot(xx - x, yy - y)
            ap = (r <= aperture_pix) & ~bad
            ann = (r > aperture_pix * 2) & (r <= aperture_pix * 3.5) & ~bad
            if ap.sum() == 0:
                continue

            bkg = float(np.median(data[ann])) if ann.sum() > 3 else 0.0
            flux = float(np.mean(data[ap]) - bkg)
            if var is not None:
                unc = float(np.sqrt(np.nansum(var[ap])) / ap.sum())
            elif ann.sum() > 3:
                unc = float(np.std(data[ann]) / np.sqrt(ap.sum()))
            else:
                unc = 0.0

            points.append(
                {
                    "obs_time": fr["obs_time"] or str(fm.get("obs_time", "")),
                    "detector": fr["detector"] or str(fm.get("detector_band", "")),
                    "wavelength_um": round(float(fr["wavelength_center_um"]), 4),
                    "bandwidth_um": round(float(fr["bandwidth_um"]), 4),
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
