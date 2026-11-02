"""
Diagnóstico de la extensión FLAGS de un recorte SPHEREx cacheado.
Uso (desde la carpeta del proyecto):
    python inspect_flags.py                       # usa el primer data/cache/*/real_epoch_*.fits
    python inspect_flags.py ruta/al/archivo.fits
Pega la salida completa en el chat.
"""
import sys
from pathlib import Path

import numpy as np
from astropy.io import fits

if len(sys.argv) > 1:
    path = Path(sys.argv[1])
else:
    found = sorted(Path("data/cache").glob("*/real_epoch_*.fits"))
    if not found:
        sys.exit("No hay FITS en data/cache/")
    path = found[0]
print("Archivo:", path)

with fits.open(path) as hdul:
    hdul.info()
    flags_hdu = next((h for h in hdul if h.name.upper() == "FLAGS"), None)
    if flags_hdu is None:
        sys.exit("Este FITS no tiene extensión FLAGS")

    print("\n--- Header de FLAGS (llaves no estructurales) ---")
    skip = {"XTENSION", "BITPIX", "NAXIS", "NAXIS1", "NAXIS2", "PCOUNT", "GCOUNT", "EXTNAME", "COMMENT", "HISTORY", ""}
    for card in flags_hdu.header.cards:
        if card.keyword not in skip:
            print(f"{card.keyword:10s} = {card.value!r}  / {card.comment}")

    flags = np.squeeze(np.array(flags_hdu.data)).astype(np.int64)
    n = flags.size
    print(f"\nTamaño: {flags.shape}, dtype original: {flags_hdu.data.dtype}")
    print(f"Píxeles con algún flag: {100 * np.mean(flags != 0):.1f}%  (limpios: {100 * np.mean(flags == 0):.1f}%)")

    print("\n--- Fracción de píxeles con cada bit activo ---")
    for bit in range(32):
        frac = np.mean((flags >> bit) & 1)
        if frac > 0:
            print(f"bit {bit:2d}: {100 * frac:5.1f}%")

    print("\n--- Píxeles limpios si ignoro un bit a la vez ---")
    for bit in range(32):
        if np.mean((flags >> bit) & 1) > 0:
            clean = np.mean((flags & ~(1 << bit)) == 0)
            print(f"ignorando bit {bit:2d}: limpios = {100 * clean:5.1f}%")
