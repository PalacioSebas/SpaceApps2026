"""Medición reproducible local, sin consultas remotas ni cambios en los FITS.

Ejecutar con el Python del entorno: python scripts/benchmark_project.py
"""

import gzip
import json
import os
from pathlib import Path
import sys
import time
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
os.environ.setdefault("MPLCONFIGDIR", str(ROOT / ".matplotlib"))

started = time.perf_counter()
import numpy as np
from src import irsa_client, main, pipeline
from src.config import CACHE_DIR, MANDATORY_TARGETS
import_seconds = time.perf_counter() - started


def measure():
    image = np.random.default_rng(42).normal(size=(128, 128))
    image[15:25, 40:48] = np.nan
    started = time.perf_counter()
    images = [pipeline.matrix_to_base64_png(image, mode)
              for _ in range(10) for mode in ("science", "diff", "flags")]
    render_seconds = time.perf_counter() - started

    target = MANDATORY_TARGETS[0]
    frames, manifest = irsa_client._read_cached_manifest(CACHE_DIR / target["id"] / "manifest.json")
    main._EXPLORE_CACHE.clear()
    with patch.object(main, "obtain_real_fits_for_coordinates",
                      return_value=(frames, target, "LOCAL_BENCHMARK", manifest.get("tap_query", ""))):
        args = (target["ra_deg"], target["dec_deg"], target["default_fov"], 10, False, False)
        started = time.perf_counter()
        response = main.explore_sky_region(*args)
        cold_seconds = time.perf_counter() - started
        started = time.perf_counter()
        main.explore_sky_region(*args)
        warm_seconds = time.perf_counter() - started
    payload = response.model_dump_json().encode()
    peak_rss_mib = None
    if sys.platform == "linux":
        import resource
        peak_rss_mib = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024
    return dict(import_seconds=round(import_seconds, 4), render_30_png_seconds=round(render_seconds, 4),
                render_mean_url_bytes=sum(map(len, images)) // len(images),
                explore_cold_seconds=round(cold_seconds, 4), explore_warm_seconds=round(warm_seconds, 6),
                explore_json_bytes=len(payload), explore_gzip_bytes=len(gzip.compress(payload, compresslevel=5)),
                peak_rss_mib=round(peak_rss_mib, 2) if peak_rss_mib else None,
                optional_modules_loaded=[name for name in ("matplotlib", "pandas", "skimage", "astroquery")
                                         if name in sys.modules])


if __name__ == "__main__":
    print(json.dumps(measure(), indent=2))
