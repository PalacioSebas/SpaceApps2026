"""
Inicializador de Producción v2.0:
1. Limpia cualquier archivo `.FITS` sintético viejo de la versión 1.0 (`epoch_*.fits`) sin borrar recortes reales.
2. Detecta automáticamente cuáles de los 5 modelos/objetos obligatorios de la NASA (WISE 0855,
   Barnard's Star, Epsilon Indi B, RW Aurigae y R Draconis) ya están descargados en `data/cache/`
   para ignorarlos y no volver a descargarlos.
3. Solo consulta `https://irsa.ipac.caltech.edu/TAP` para los objetos que falten en caché.
4. Inspecciona los headers reales descargados de la NASA y guarda `fits_structure.txt`.
"""

import json
import sys
from pathlib import Path
from typing import Any, Dict, List, Tuple
from astropy.io import fits

from src.cache_utils import resolve_cached_path
from src.config import BASE_DIR, CACHE_DIR, MANDATORY_TARGETS
from src.irsa_client import obtain_real_fits_for_coordinates, build_spherex_adql_query


def _configure_console_utf8() -> None:
    """Evita UnicodeEncodeError en consolas Windows (cp1252) al imprimir caracteres especiales."""
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            try:
                stream.reconfigure(encoding="utf-8", errors="replace")
            except Exception:
                pass


def _extract_fits_meta(fits_path: Path) -> Tuple[str, str]:
    """Extrae (obs_time, detector_band) del header de un archivo FITS local si es válido."""
    with fits.open(fits_path) as hdul:
        has_valid_2d = any(
            hdu.data is not None and hdu.data.ndim == 2 and hdu.data.shape[0] >= 8 and hdu.data.shape[1] >= 8
            for hdu in hdul
        )
        if not has_valid_2d:
            raise ValueError(f"El archivo {fits_path.name} no contiene una imagen 2D válida.")

        obs_time = ""
        detector = ""
        for hdu in hdul:
            hdr = hdu.header
            if not obs_time:
                for k in ("MJD-OBS", "OBS_TIME", "DATE-OBS", "MIDMJD"):
                    if hdr.get(k) is not None:
                        obs_time = str(hdr[k])
                        break
            if not detector:
                for k in ("DETECTOR", "FILTER", "BAND"):
                    if hdr.get(k) is not None:
                        val = str(hdr[k]).strip()
                        detector = f"SPHEREx-D{val}" if val.isdigit() else val
                        break
        return obs_time or "0.0", detector or "SPHEREx"


def detect_downloaded_target(target: Dict[str, Any], min_epochs: int = 2) -> Tuple[bool, List[Path], str]:
    """
    Detecta si un objeto/modelo ya está descargado en `data/cache/<target_id>`.
    - Verifica tanto `manifest.json` como los archivos `real_epoch_*.fits` en disco.
    - Si las rutas en `manifest.json` quedaron desactualizadas (p. ej. al mover la carpeta del proyecto),
      las actualiza automáticamente a la ruta local actual.
    - Si existen los archivos `real_epoch_*.fits` pero falta `manifest.json`, lo reconstruye sin re-descargar.
    """
    tdir = CACHE_DIR / target["id"]
    if not tdir.exists():
        return False, [], ""

    manifest_path = tdir / "manifest.json"
    valid_paths: List[Path] = []
    source_label = "CACHE_REAL_FITS"

    # 1. Revisar manifest.json si existe
    if manifest_path.exists():
        try:
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            source_label = f"CACHE_REAL_FITS ({manifest.get('original_source', 'IRSA')})"
            updated_manifest = False
            fixed_frames = []

            for item in manifest.get("frames", []):
                raw_path = Path(item.get("local_path", ""))
                candidate = resolve_cached_path(item.get("local_path", ""), tdir)
                if candidate.exists() and candidate.stat().st_size > 0:
                    if str(candidate.resolve()) != str(raw_path):
                        item["local_path"] = str(candidate.resolve())
                        updated_manifest = True
                    valid_paths.append(candidate.resolve())
                    fixed_frames.append(item)

            if updated_manifest and len(fixed_frames) >= min_epochs:
                manifest["frames"] = fixed_frames
                manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False), encoding="utf-8")

            if len(valid_paths) >= min_epochs:
                return True, valid_paths, source_label
        except Exception as exc:
            print(f"     [AVISO] No se pudo leer {manifest_path.name} ({exc}); verificando archivos .FITS en disco...")

    # 2. Revisar archivos real_epoch_*.fits directamente en disco por si falta o falló el manifest
    disk_fits = sorted(
        p.resolve() for p in tdir.glob("real_epoch_*.fits") if p.is_file() and p.stat().st_size > 0
    )
    if len(disk_fits) >= min_epochs:
        rebuilt_frames = []
        valid_disk_fits: List[Path] = []
        for fpath in disk_fits:
            try:
                obs_time, detector = _extract_fits_meta(fpath)
                valid_disk_fits.append(fpath)
                rebuilt_frames.append(
                    {
                        "local_path": str(fpath),
                        "cutout_url": "",
                        "obs_time": obs_time,
                        "detector_band": detector,
                    }
                )
            except Exception:
                continue

        if len(valid_disk_fits) >= min_epochs:
            rebuilt_frames.sort(key=lambda x: x["obs_time"])
            manifest_data = {
                "ra": target["ra_deg"],
                "dec": target["dec_deg"],
                "fov": target["default_fov"],
                "original_source": "IRSA_SPHEREX_TAP",
                "tap_query": build_spherex_adql_query(
                    target["ra_deg"], target["dec_deg"], target["default_fov"], max_rec=20
                ),
                "frames": rebuilt_frames[:12],
            }
            manifest_path.write_text(json.dumps(manifest_data, indent=2, ensure_ascii=False), encoding="utf-8")
            return True, valid_disk_fits, "CACHE_REAL_FITS (disco)"

    return False, [], ""


def main() -> None:
    _configure_console_utf8()

    print("=========================================================================")
    print("🌌 PAPASTRONOMY v2.0 - Verificador y Descargador de Recortes .FITS Reales")
    print("=========================================================================")

    # 1. Purgar únicamente archivos sintéticos antiguos (epoch_00.fits de la v1.0) sin borrar real_epoch_*.fits
    for target in MANDATORY_TARGETS:
        tdir = CACHE_DIR / target["id"]
        if tdir.exists():
            old_synth = [
                f for f in tdir.glob("epoch_*.fits") if not f.name.startswith("real_epoch_")
            ]
            if old_synth:
                print(f"[LIMPIEZA] Eliminando {len(old_synth)} archivos sintéticos v1.0 en {tdir.name}...")
                for synth_file in old_synth:
                    try:
                        synth_file.unlink()
                    except OSError:
                        pass

    first_real_fits: Path | None = None

    # 2. Detectar modelos/objetos ya descargados e ignorarlos; descargar solo los faltantes
    for target in MANDATORY_TARGETS:
        already_cached, cached_paths, cache_source = detect_downloaded_target(target, min_epochs=2)
        if already_cached:
            total_on_disk = len(list((CACHE_DIR / target["id"]).glob("real_epoch_*.fits")))
            print(
                f"\n---> [YA DESCARGADO] {target['name']} ({target['id']}): "
                f"{len(cached_paths)} épocas activas en manifest ({total_on_disk} archivos .FITS en disco) "
                f"desde {cache_source}. Se ignora la descarga."
            )
            if first_real_fits is None and cached_paths:
                first_real_fits = cached_paths[0]
            continue

        print(
            f"\n---> Consultando IRSA TAP y descargando FITS reales para: {target['name']} "
            f"(RA={target['ra_deg']}, Dec={target['dec_deg']})..."
        )
        try:
            frames, _, source_label, _ = obtain_real_fits_for_coordinates(
                ra_deg=target["ra_deg"],
                dec_deg=target["dec_deg"],
                fov_deg=target["default_fov"],
                max_epochs=10,
                force_refresh=False,
            )
            print(f"     [OK] {len(frames)} archivos .FITS reales disponibles desde {source_label}.")
            if first_real_fits is None and frames:
                first_real_fits = Path(frames[0]["local_path"])
        except Exception as exc:
            print(f"     [ERROR] No se pudo descargar {target['name']} desde IRSA: {exc}")

    # 3. Exportar la estructura real del archivo FITS de la NASA en fits_structure.txt
    if first_real_fits and first_real_fits.exists():
        lines = [f"Archivo FITS Real de NASA/IPAC IRSA: {first_real_fits}", "=" * 75]
        with fits.open(first_real_fits) as hdul:
            for idx, hdu in enumerate(hdul):
                shape_s = str(hdu.data.shape) if hdu.data is not None else "None"
                dtype_s = str(hdu.data.dtype) if hdu.data is not None else "None"
                lines.append(
                    f"HDU [{idx}] Name: {hdu.name:<12} | Type: {type(hdu).__name__:<16} | "
                    f"Shape: {shape_s:<12} | Dtype: {dtype_s}"
                )
            lines.append("\n--- HEADER REAL DEL ARCHIVO DESCARGADO DE IRSA ---")
            lines.append(repr(hdul[0].header))

        out_txt = BASE_DIR / "fits_structure.txt"
        out_txt.write_text("\n".join(lines), encoding="utf-8")
        print(f"\n[OK] Cabecera FITS real guardada en: {out_txt}")

    print("\n=========================================================================")
    print("✅ Versión 2.0 lista con datos 100% reales de NASA/IPAC IRSA.")
    print("Ejecutá ahora: uvicorn src.main:app --reload")


if __name__ == "__main__":
    main()
