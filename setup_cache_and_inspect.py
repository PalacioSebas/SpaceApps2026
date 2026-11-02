"""
Inicializador de Producción v2.0:
1. Limpia cualquier archivo `.FITS` sintético viejo de la versión 1.0.
2. Se conecta en vivo a `https://irsa.ipac.caltech.edu/TAP` y descarga los recortes `.FITS`
   astronómicos reales para los 5 objetos obligatorios de la NASA (WISE 0855, Barnard's Star,
   Epsilon Indi B, RW Aurigae y R Draconis).
3. Inspecciona los headers reales descargados de la NASA y guarda `fits_structure.txt`.
"""

import shutil
from pathlib import Path
from astropy.io import fits

from src.config import BASE_DIR, CACHE_DIR, MANDATORY_TARGETS
from src.irsa_client import obtain_real_fits_for_coordinates


def main() -> None:
    print("=========================================================================")
    print("🌌 PAPASTRONOMY v2.0 - Descargador de Recortes .FITS Reales desde NASA IRSA")
    print("=========================================================================")

    # 1. Purgar archivos sintéticos antiguos (epoch_00.fits de la v1.0) para asegurar 100% datos reales
    for target in MANDATORY_TARGETS:
        tdir = CACHE_DIR / target["id"]
        if tdir.exists():
            old_synth = list(tdir.glob("epoch_*.fits"))
            if old_synth:
                print(f"[LIMPIEZA] Eliminando caché sintética v1.0 en {tdir.name}...")
                shutil.rmtree(tdir)

    first_real_fits: Path | None = None

    # 2. Descargar recortes .FITS reales desde NASA/IPAC IRSA para cada uno de los 5 objetos
    for target in MANDATORY_TARGETS:
        print(f"\n---> Consultando IRSA TAP y descargando FITS reales para: {target['name']} "
              f"(RA={target['ra_deg']}, Dec={target['dec_deg']})...")
        frames, _, source_label, _ = obtain_real_fits_for_coordinates(
            ra_deg=target["ra_deg"],
            dec_deg=target["dec_deg"],
            fov_deg=target["default_fov"],
            max_epochs=8,
            force_refresh=True,
        )
        print(f"     [OK] {len(frames)} archivos .FITS reales descargados desde {source_label}.")
        if first_real_fits is None and frames:
            first_real_fits = Path(frames[0]["local_path"])

    # 3. Exportar la estructura real del archivo FITS de la NASA en fits_structure.txt
    if first_real_fits and first_real_fits.exists():
        lines = [f"Archivo FITS Real de NASA/IPAC IRSA: {first_real_fits}", "=" * 75]
        with fits.open(first_real_fits) as hdul:
            for idx, hdu in enumerate(hdul):
                shape_s = str(hdu.data.shape) if hdu.data is not None else "None"
                dtype_s = str(hdu.data.dtype) if hdu.data is not None else "None"
                lines.append(f"HDU [{idx}] Name: {hdu.name:<12} | Type: {type(hdu).__name__:<16} | Shape: {shape_s:<12} | Dtype: {dtype_s}")
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