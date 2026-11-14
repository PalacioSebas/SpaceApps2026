"""Regresiones de límites de memoria, invalidación y transferencia HTTP."""

import os
import base64
from io import BytesIO
import gzip
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch

import numpy as np
from PIL import Image
from astropy.table import Table
from fastapi.testclient import TestClient

from src import main, pipeline, irsa_client
from src.display_colors import colorize
from src.memory_cache import MemoryCache, retained_size


class MemoryTests(unittest.TestCase):
    def test_recently_used_entries_survive_eviction_and_oversized_values_do_not_flush_cache(self):
        cache = MemoryCache(10)
        cache.put("a", object(), size=4)
        cache.put("b", object(), size=4)
        self.assertIsNotNone(cache.get("a"))
        cache.put("c", object(), size=4)
        self.assertIsNone(cache.get("b"))
        self.assertFalse(cache.put("large", object(), size=11))
        self.assertIsNotNone(cache.get("a"))
        self.assertIsNotNone(cache.get("c"))
        self.assertEqual(cache.info()["bytes"], 8)

    def test_expired_responses_and_disabled_cache_do_not_return_values(self):
        clock = [0]
        cache = MemoryCache(10, ttl=5, clock=lambda: clock[0])
        cache.put("region", "value", size=4)
        clock[0] = 5
        self.assertIsNone(cache.get("region"))
        self.assertEqual(cache.info()["bytes"], 0)
        disabled = MemoryCache(0)
        self.assertFalse(disabled.put("region", "value"))
        self.assertIsNone(disabled.get("region"))

    def test_numpy_buffers_are_counted_once_for_shared_references(self):
        array = np.zeros(100_000, dtype=np.float32)
        size = retained_size([array, array])
        self.assertGreaterEqual(size, array.nbytes)
        self.assertLess(size, 2 * array.nbytes)

    def test_fits_replacement_invalidates_both_raw_and_aligned_data(self):
        with TemporaryDirectory() as directory:
            path = Path(directory) / "frame.fits"
            path.write_bytes(b"original")
            wcs, shape = pipeline.build_common_target_wcs(10, 20, .05)
            pipeline._FRAME_CACHE.clear()
            pipeline._REPROJECT_CACHE.clear()
            from astropy.io import fits
            for value in (1., 7.):
                header = wcs.to_header()
                header["BUNIT"] = "MJy/sr"
                fits.PrimaryHDU(np.full(shape, value), header).writeto(path, overwrite=True)
                # Asegurar un timestamp distinto incluso en sistemas con poca resolución.
                os.utime(path, ns=(int(value * 1e9), int(value * 1e9)))
                frame = pipeline._get_frame(path)
                self.assertEqual(float(np.median(frame["data"])), value)
                epochs = [dict(image=np.full(shape, value), flags=np.zeros(shape), wcs=wcs,
                               local_path=str(path))]
                aligned, _, _, _ = pipeline.align_coadd_and_diff(epochs, wcs, shape)
                self.assertAlmostEqual(float(np.nanmedian(aligned[0])), value)


class TransferTests(unittest.TestCase):
    def test_javascript_is_revalidated_and_gzip_preserves_content(self):
        client = TestClient(main.app)
        plain = client.get("/static/app.js", headers={"Accept-Encoding": "identity"})
        compressed = client.get("/static/app.js", headers={"Accept-Encoding": "gzip"})
        self.assertEqual(plain.status_code, 200)
        self.assertEqual(compressed.headers["Content-Encoding"], "gzip")
        self.assertEqual(plain.content, compressed.content)
        with client.stream("GET", "/static/app.js", headers={"Accept-Encoding": "gzip"}) as response:
            wire = b"".join(response.iter_raw())
        self.assertEqual(gzip.decompress(wire), plain.content)
        self.assertLess(len(wire), len(plain.content))
        cached = client.get("/static/app.js", headers={"If-None-Match": plain.headers["ETag"]})
        self.assertEqual(cached.status_code, 304)
        self.assertEqual(cached.content, b"")
        stale = client.get("/static/app.js", headers={"If-None-Match": '"outdated"'})
        self.assertEqual(stale.status_code, 200)

    def test_json_compression_preserves_api_results(self):
        client = TestClient(main.app)
        plain = client.get("/api/targets", headers={"Accept-Encoding": "identity"})
        compressed = client.get("/api/targets", headers={"Accept-Encoding": "gzip"})
        self.assertEqual(compressed.headers["Content-Encoding"], "gzip")
        self.assertEqual(plain.json(), compressed.json())
        self.assertIn("Accept-Encoding", compressed.headers["Vary"])


class DisplayAndDependencyTests(unittest.TestCase):
    def test_rendering_keeps_transparency_sign_and_input_data(self):
        values = np.array([[0., .5, 1., np.nan]])
        rgba = colorize(values, divergent=True)
        self.assertGreater(rgba[0, 0, 2], rgba[0, 0, 0])  # Negativo: azul.
        self.assertGreater(rgba[0, 2, 0], rgba[0, 2, 2])  # Positivo: rojo.
        np.testing.assert_array_equal(rgba[0, 3], [0, 0, 0, 0])
        self.assertTrue(np.isnan(values[0, 3]))
        self.assertEqual(values[0, 1], .5)

    def test_png_preserves_missing_coverage_saturated_holes_and_north_up(self):
        values = np.arange(81, dtype=float).reshape(9, 9)
        values[3:6, 3:6] = np.nan  # Núcleo sin mediciones: no reconstruir una estrella.
        values[0, 0] = np.inf
        values[-1, -1] = -np.inf
        original = values.copy()
        for mode in ("science", "diff"):
            with self.subTest(mode=mode):
                payload = pipeline.matrix_to_base64_png(values, mode).split(",", 1)[1]
                rgba = np.array(Image.open(BytesIO(base64.b64decode(payload))))
                np.testing.assert_array_equal(rgba[..., 3] > 0, np.flipud(np.isfinite(values)))
                if mode == "science":
                    self.assertGreater(rgba[0, 0, 0], rgba[-1, 1, 0])
                else:
                    self.assertGreater(rgba[0, 0, 0], rgba[0, 0, 2])
        np.testing.assert_array_equal(values, original)

    def test_empty_science_and_difference_png_are_transparent(self):
        for mode in ("science", "diff"):
            payload = pipeline.matrix_to_base64_png(np.full((8, 8), np.nan), mode).split(",", 1)[1]
            rgba = np.array(Image.open(BytesIO(base64.b64decode(payload))))
            self.assertFalse(rgba[..., 3].any())

    def test_tap_fallback_reads_astropy_tables_without_pandas_conversion(self):
        table = Table({"cutout_url": ["https://example/fits"], "obs_time": ["60800"],
                       "detector_band": ["D1"]})
        service = unittest.mock.Mock()
        service.search.return_value.to_table.return_value = table
        with patch.object(irsa_client, "_tap_service", return_value=service), \
             patch.object(irsa_client, "_IRSA_503_UNTIL", 0):
            records, _, source = irsa_client.query_spherex_tap_live(10, 20, .05)
        self.assertEqual(source, "IRSA_SPHEREX_TAP")
        self.assertEqual(records[0]["detector_band"], "D1")


if __name__ == "__main__":
    unittest.main()
