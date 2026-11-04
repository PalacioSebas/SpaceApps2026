"""
Rellena la caché de una región con paciencia (reintenta si IRSA está saturado),
para que luego la página cargue desde disco al instante.

Uso (desde la carpeta del proyecto, con el entorno virtual activado):
    python precache.py                       # R Draconis (248.167625, 66.754972)
    python precache.py RA DEC [FOV]          # otra región
"""
import logging
import sys
import time

from src.irsa_client import obtain_real_fits_for_coordinates

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")

ra, dec, fov = 248.167625, 66.754972, 0.05
if len(sys.argv) >= 3:
    ra, dec = float(sys.argv[1]), float(sys.argv[2])
if len(sys.argv) >= 4:
    fov = float(sys.argv[3])

TARGET_FRAMES = 8   # con esto se considera lista
ROUNDS = 6          # máximo de rondas
PAUSE_S = 30        # pausa entre rondas para no saturar a IRSA

print(f"Rellenando caché para RA={ra}, Dec={dec}, FoV={fov}\n")
for r in range(1, ROUNDS + 1):
    try:
        frames, _, source, _ = obtain_real_fits_for_coordinates(
            ra, dec, fov_deg=fov, max_epochs=10, force_refresh=True
        )
        n = len(frames)
    except Exception as exc:
        n = 0
        print(f"Ronda {r}: error -> {exc}")
    else:
        print(f"Ronda {r}: {n} recortes válidos ({source})")
    if n >= TARGET_FRAMES:
        print("\nListo: la región ya está en caché.")
        break
    if r < ROUNDS:
        print(f"  Pocos recortes; reintento en {PAUSE_S} s...")
        time.sleep(PAUSE_S)
else:
    print("\nNo se alcanzó el objetivo; la caché quedó con los recortes de la última ronda.")
