"""Regresiones científicas y de portabilidad. Ejecutar con unittest discover."""

import base64
import json
from io import BytesIO
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch, Mock

import numpy as np
from PIL import Image
from fastapi.testclient import TestClient

from src import irsa_client, main, pipeline
from src.ai_detector import _compute_baseline_years, classify_spectrum_molecules, detect_anomalies_on_diff
from src.analysis import select_analysis_frames
from src.cache_utils import resolve_cached_path
from src.config import MANDATORY_TARGETS


class CacheTests(unittest.TestCase):
    def test_windows_manifest_resolves_in_linux(self):
        with TemporaryDirectory() as root:
            directory = Path(root)
            expected = directory / "real_epoch_00.fits"
            expected.touch()
            self.assertEqual(resolve_cached_path(r"C:\Users\Sebas\Nasa\real_epoch_00.fits", directory), expected)

    def test_relocated_cache_is_rejected_and_preserved(self):
        with TemporaryDirectory() as root:
            directory = Path(root)
            manifest = directory / "manifest.json"
            content = json.dumps({"original_source": "IRSA_SPHEREX_CACHE_FALLBACK", "frames": []})
            manifest.write_text(content)
            with self.assertRaises(ValueError):
                irsa_client._read_cached_manifest(manifest)
            self.assertEqual(manifest.read_text(), content)

    def test_missing_region_never_borrows_images_from_another_field(self):
        with TemporaryDirectory() as root:
            directory = Path(root)
            with self.assertRaises(irsa_client.NoCoverageError):
                irsa_client._build_fallback_fits_from_local_cache(10, 20, 0.05, directory, 10, "")
            self.assertEqual(list(directory.iterdir()), [])

    def test_cache_with_a_different_field_size_is_rejected(self):
        with TemporaryDirectory() as root:
            manifest = Path(root) / "manifest.json"
            manifest.write_text(json.dumps({"ra": 10, "dec": 20, "fov": 0.05, "frames": []}))
            with self.assertRaises(ValueError):
                irsa_client._read_cached_manifest(manifest, (10, 20, 0.1))


class ScienceTests(unittest.TestCase):
    def test_subday_baseline_is_not_replaced_by_six_months(self):
        value = _compute_baseline_years([{"obs_time": "60800.5"}, {"obs_time": "60800.6"}])
        self.assertAlmostEqual(value, 0.1 / 365.25, places=10)

    def test_iso_baseline_preserves_time_of_day(self):
        value = _compute_baseline_years([{"obs_time": "2025-05-01T00:00:00"}, {"obs_time": "2025-05-01T12:00:00"}])
        self.assertAlmostEqual(value, 0.5 / 365.25)

    def test_different_detectors_do_not_form_a_temporal_pair(self):
        frames = [
            dict(detector="D1", wavelength_center_um=1.1, bandwidth_um=0.03, obs_time="60800", clean_pixels_pct=90),
            dict(detector="D2", wavelength_center_um=1.1, bandwidth_um=0.03, obs_time="60801", clean_pixels_pct=99),
        ]
        self.assertEqual(len(select_analysis_frames(frames)), 1)

    def test_comparable_band_is_preferred_to_single_cleaner_frame(self):
        frames = [
            dict(detector="D1", wavelength_center_um=1.10, bandwidth_um=0.03, obs_time="60800", clean_pixels_pct=90),
            dict(detector="D1", wavelength_center_um=1.11, bandwidth_um=0.03, obs_time="60801", clean_pixels_pct=90),
            dict(detector="D2", wavelength_center_um=4.6, bandwidth_um=0.1, obs_time="60801", clean_pixels_pct=100),
        ]
        self.assertEqual(select_analysis_frames(frames), [0, 1])

    def test_disjoint_wavelengths_on_one_detector_are_not_subtracted(self):
        frames = [dict(detector="D1", wavelength_center_um=wl, bandwidth_um=0.03,
                       obs_time=str(60800 + i), clean_pixels_pct=90) for i, wl in enumerate([1.1, 1.3])]
        self.assertEqual(len(select_analysis_frames(frames)), 1)

    def test_flags_are_transparent_for_good_pixels_and_flipped(self):
        url = pipeline.matrix_to_base64_png(np.array([[0, 1], [0, 0]]), "flags")
        pixels = np.asarray(Image.open(BytesIO(base64.b64decode(url.split(",")[1]))))
        self.assertEqual(pixels[0, 1, 3], 0)
        self.assertGreater(pixels[1, 1, 3], 0)
        self.assertEqual(pixels[1, 0, 3], 0)

    def test_coadd_and_difference_use_only_comparable_frames(self):
        wcs, _ = pipeline.build_common_target_wcs(10, 20, 0.05)
        frames = [dict(image=np.full((8, 8), value), flags=np.zeros((8, 8)), wcs=wcs)
                  for value in [1, 3, 1000]]
        with patch.object(pipeline, "reproject_interp", side_effect=lambda source, *args, **kwargs: source[0]):
            _, _, coadd, diff = pipeline.align_coadd_and_diff(frames, wcs, (8, 8), analysis_indices=[0, 1])
        np.testing.assert_allclose(coadd, 2)
        self.assertTrue(np.isnan(diff).all())  # Sin PSF/fechas no se publica una resta sin calibrar.

    def test_fading_source_is_detected_as_a_negative_monopole(self):
        wcs, _ = pipeline.build_common_target_wcs(10, 20, 0.05)
        image = np.random.default_rng(42).normal(0, 1, (128, 128))
        image[64, 64] = -30
        detections = detect_anomalies_on_diff(image, wcs, 0.05, [], do_crossmatch=False)
        self.assertTrue(any(d["type"] == "VARIABLE_MONOPOLE" and d["x_pix"] == 64 and d["y_pix"] == 64 for d in detections))

    def test_all_masked_difference_has_no_anomalies(self):
        wcs, _ = pipeline.build_common_target_wcs(10, 20, 0.05)
        self.assertEqual(detect_anomalies_on_diff(np.full((128, 128), np.nan), wcs, 0.05, [], do_crossmatch=False), [])

    def test_low_signal_is_not_classified_as_a_cold_star(self):
        result = classify_spectrum_molecules([dict(wavelength_um=4.6, flux_mjy_sr=-2, flux_uncertainty=1)])
        self.assertIsNone(result["confidence"])
        self.assertIsNone(result["effective_temp_k_est"])
        self.assertEqual(result["detected_molecules"], [])

    def test_wavelength_is_evaluated_at_selected_native_pixel(self):
        wcs, _ = pipeline.build_common_target_wcs(10, 20, 0.05)
        coord = wcs.pixel_to_world(50, 55)
        spec_wcs = Mock()
        spec_wcs.pixel_to_world_values.return_value = (2.1, 0.05)
        frame = dict(wcs=wcs, data=np.ones((128, 128)), bad=np.zeros((128, 128), dtype=bool),
                     flux_unit="MJy/sr",
                     variance=np.ones((128, 128)), wavelength_center_um=1.8, bandwidth_um=0.04,
                     spectral_wcs=spec_wcs, obs_time="60800", detector="D3")
        with TemporaryDirectory() as root:
            path = Path(root) / "frame.fits"
            path.touch()
            with patch.object(pipeline, "_get_frame", return_value=frame):
                _, _, spectrum = pipeline.extract_real_spectrum_at_coord(coord.ra.deg, coord.dec.deg, [{"local_path": str(path)}], wcs)
        x, y = spec_wcs.pixel_to_world_values.call_args.args
        self.assertAlmostEqual(x, 50, places=6)
        self.assertAlmostEqual(y, 55, places=6)
        self.assertEqual(spectrum[0]["wavelength_um"], 2.1)


class ApiTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(main.app)
        main._EXPLORE_CACHE.clear()

    def test_invalid_spectrum_center_is_rejected(self):
        response = self.client.get("/api/spectrum", params=dict(ra=10, dec=20, center_dec=100))
        self.assertEqual(response.status_code, 422)

    def test_explore_reports_the_quality_of_a_calibrated_pair(self):
        from test_difference import star_field
        wcs, _ = pipeline.build_common_target_wcs(10, 20, 0.05)
        scale = 0.05 * 3600 / 128
        with TemporaryDirectory() as root:
            paths = [Path(root) / f"frame_{i}.fits" for i in range(2)]
            for path in paths:
                path.touch()
            frames = [{"local_path": str(path)} for path in paths]
            images = [star_field(1), star_field(2, gain=1.2, offset=8)]
            epochs = [dict(image=image, flags=np.zeros((128, 128)), wcs=wcs,
                           obs_time=str(60800 + i), detector="D1", wavelength_center_um=1.1,
                           bandwidth_um=0.03, clean_pixels_pct=100, flux_unit="MJy/sr",
                           psf_fwhm_arcsec=(i + 1) * 2.354820045 * scale)
                      for i, image in enumerate(images)]
            with patch.object(main, "obtain_real_fits_for_coordinates", return_value=(frames, None, "TEST", "")), \
                 patch.object(main, "load_and_clean_real_fits", side_effect=epochs):
                response = self.client.get("/api/explore", params=dict(ra=10, dec=20))
        self.assertEqual(response.status_code, 200, response.text[:200])
        info = response.json()["target_info"]
        self.assertTrue(info["difference_available"])
        self.assertEqual(info["difference_quality"]["status"], "gaussian_approximation")
        self.assertEqual(len(info["difference_quality"]["calibrations"]), 2)
        self.assertAlmostEqual(info["difference_quality"]["baseline_years"], 1 / 365.25)

    def test_no_coverage_has_a_useful_http_error(self):
        with patch.object(main, "obtain_real_fits_for_coordinates", side_effect=irsa_client.NoCoverageError("Sin cobertura")):
            for endpoint in ("/api/explore", "/api/spectrum"):
                response = self.client.get(endpoint, params=dict(ra=10, dec=20))
                self.assertEqual(response.status_code, 503)
                self.assertEqual(response.json()["detail"], "Sin cobertura")

    def test_crossmatch_network_failure_is_not_no_match(self):
        with patch.object(main, "_crossmatch_cached", side_effect=RuntimeError("Cruce incompleto")):
            response = self.client.get("/api/crossmatch", params=dict(ra=10, dec=20))
        self.assertEqual(response.status_code, 502)

    def test_catalog_failure_is_distinct_from_an_empty_catalog(self):
        with patch.object(main, "query_catalog_field", side_effect=RuntimeError("Timeout")):
            response = self.client.get("/api/catalog", params=dict(catalog="gaia", ra=10, dec=20))
        self.assertEqual(response.status_code, 502)
        with patch.object(main, "query_catalog_field", return_value={"catalog": "gaia", "sources": [], "truncated": False}):
            response = self.client.get("/api/catalog", params=dict(catalog="gaia", ra=10, dec=20))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["sources"], [])

    def test_five_preloaded_targets_work_without_network(self):
        with patch.object(irsa_client, "query_spherex_tap_live", side_effect=AssertionError("Unexpected network")):
            for target in MANDATORY_TARGETS:
                with self.subTest(target=target["id"]):
                    params = dict(ra=target["ra_deg"], dec=target["dec_deg"], fov=0.05, max_epochs=10)
                    response = self.client.get("/api/explore", params=params)
                    self.assertEqual(response.status_code, 200, response.text[:200])
                    data = response.json()
                    self.assertEqual(len(data["epochs"]), 10)
                    self.assertTrue(all(ep["bandwidth_um"] > 0 for ep in data["epochs"]))
                    spectrum = self.client.get("/api/spectrum", params=params)
                    self.assertEqual(spectrum.status_code, 200, spectrum.text[:200])
                    result = spectrum.json()
                    if target["id"] == "r_draconis":
                        # El centro puede quedar enmascarado: es correcto devolver cero puntos.
                        self.assertIsNone(result["ai_diagnosis"]["confidence"])
                    else:
                        self.assertGreater(len(result["spectrum"]), 0)


if __name__ == "__main__":
    unittest.main()
