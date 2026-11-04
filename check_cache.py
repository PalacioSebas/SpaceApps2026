"""
Revisa el estado de la caché de recortes FITS.
Uso (desde la carpeta del proyecto, con el entorno virtual activado):
    python check_cache.py
"""
import json
import time
from pathlib import Path

from src.config import CACHE_DIR

root = Path(CACHE_DIR)
print(f"Caché: {root.resolve()}\n")
for d in sorted(p for p in root.iterdir() if p.is_dir()):
    fits_on_disk = len(list(d.glob("*.fits")))
    mp = d / "manifest.json"
    if not mp.exists():
        print(f"{d.name:32s} fits_en_disco={fits_on_disk:2d}  SIN manifest -> se vuelve a descargar")
        continue
    manifest = json.loads(mp.read_text(encoding="utf-8"))
    frames = manifest.get("frames", [])
    valid = sum(Path(f["local_path"]).exists() for f in frames)
    age_h = (time.time() - mp.stat().st_mtime) / 3600
    verdict = "OK (carga desde disco)" if valid >= 2 else "INSUFICIENTE -> se vuelve a descargar en cada carga"
    print(f"{d.name:32s} fits_en_disco={fits_on_disk:2d} en_manifest={len(frames):2d} existentes={valid:2d} edad={age_h:5.1f} h  {verdict}")
