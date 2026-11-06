"""Verifica movimiento conocido, signos, coordenadas y la ruta FITS→API.

Son datos sintéticos de prueba; no se agregan a la caché astronómica.
"""

from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch

import numpy as np
from astropy.io import fits
from fastapi.testclient import TestClient
from scipy.ndimage import gaussian_filter

from src import main, pipeline
from src.ai_detector import detect_anomalies_on_diff
from src.difference import prepare_difference


OLD_POSITION = (72, 52)  # x, y
NEW_POSITION = (80, 52)


def gaussian_source(position, amplitude=50, sigma=1):
    y, x = np.indices((128, 128))
    return amplitude * np.exp(-((x-position[0])**2 + (y-position[1])**2) / (2*sigma**2))


def controlled_epochs(moving=True):
    images = []
    for index, sigma in enumerate((1, 2)):
        sources = np.zeros((128, 128))
        positions = [(y, x) for y in (28, 64, 100) for x in (28, 64, 100)]
        for n, (y, x) in enumerate(positions):
            sources[y, x] = 100 + 8*n
        x, y = NEW_POSITION if moving and index else OLD_POSITION
        sources[y, x] += 80
        gain, offset = (1, 0) if index == 0 else (1.2, 8)
        noise = np.random.default_rng(123+index).normal(0, 0.005, sources.shape)
        images.append(gain * gaussian_filter(sources, sigma) + offset + noise)
    return images


class DipoleTests(unittest.TestCase):
    def setUp(self):
        self.wcs, _ = pipeline.build_common_target_wcs(10, 20, 0.05)

    def detect(self, image):
        return detect_anomalies_on_diff(image, self.wcs, 0.05, [], do_crossmatch=False, baseline_years=0.5)

    def background(self):
        # Fondo acotado para aislar el comportamiento geométrico de estas pruebas.
        return np.random.default_rng(42).uniform(-1, 1, (128, 128))

    def test_known_shift_identifies_positive_and_negative_positions(self):
        image = self.background() + gaussian_source(NEW_POSITION) - gaussian_source(OLD_POSITION)
        detections = self.detect(image)
        self.assertEqual(len(detections), 1)
        dipole = detections[0]
        self.assertEqual(dipole["type"], "MOVING_DIPOLE")
        self.assertEqual((dipole["x_pix"], dipole["y_pix"]), NEW_POSITION)
        self.assertEqual((dipole["neg_x_pix"], dipole["neg_y_pix"]), OLD_POSITION)
        self.assertEqual(dipole["shift_pixels"], 8)
        self.assertEqual(dipole["proper_motion_arcsec_yr"], 22.5)
        coord = self.wcs.pixel_to_world(*NEW_POSITION)
        self.assertAlmostEqual(dipole["ra"], coord.ra.deg, places=5)
        self.assertAlmostEqual(dipole["dec"], coord.dec.deg, places=5)

    def test_reversing_time_reverses_the_dipole_direction(self):
        image = self.background() + gaussian_source(OLD_POSITION) - gaussian_source(NEW_POSITION)
        dipole = self.detect(image)[0]
        self.assertEqual(dipole["type"], "MOVING_DIPOLE")
        self.assertEqual((dipole["x_pix"], dipole["y_pix"]), OLD_POSITION)
        self.assertEqual((dipole["neg_x_pix"], dipole["neg_y_pix"]), NEW_POSITION)

    def test_isolated_brightening_is_a_monopole(self):
        detections = self.detect(self.background() + gaussian_source(NEW_POSITION))
        self.assertEqual(len(detections), 1)
        self.assertEqual(detections[0]["type"], "VARIABLE_MONOPOLE")

    def test_isolated_fading_is_a_monopole(self):
        detections = self.detect(self.background() - gaussian_source(OLD_POSITION))
        self.assertEqual(len(detections), 1)
        self.assertEqual(detections[0]["type"], "VARIABLE_MONOPOLE")

    def test_separation_beyond_search_radius_is_not_paired(self):
        image = self.background() + gaussian_source((100, 52)) - gaussian_source(OLD_POSITION)
        detections = self.detect(image)
        self.assertEqual(len(detections), 2)
        self.assertTrue(all(d["type"] == "VARIABLE_MONOPOLE" for d in detections))

    def test_masked_negative_lobe_cannot_form_a_dipole(self):
        image = self.background() + gaussian_source(NEW_POSITION) - gaussian_source(OLD_POSITION)
        image[47:58, 67:77] = np.nan
        detections = self.detect(image)
        self.assertFalse(any(d["type"] == "MOVING_DIPOLE" for d in detections))

    def test_opposite_hot_pixels_are_not_a_dipole(self):
        image = self.background()
        image[52, 72], image[52, 80] = -50, 50
        self.assertFalse(any(d["type"] == "MOVING_DIPOLE" for d in self.detect(image)))

    def test_highly_imbalanced_lobes_are_not_a_dipole(self):
        image = self.background() + gaussian_source(NEW_POSITION, 60) - gaussian_source(OLD_POSITION, 6)
        self.assertFalse(any(d["type"] == "MOVING_DIPOLE" for d in self.detect(image)))

    def test_line_artifacts_do_not_verify_a_compact_dipole(self):
        image = self.background()
        image[52, 69:76], image[52, 78:85] = -50, 50
        self.assertFalse(any(d["type"] == "MOVING_DIPOLE" for d in self.detect(image)))

    def test_supported_pair_reports_its_morphology(self):
        dipole = self.detect(self.background() + gaussian_source(NEW_POSITION) - gaussian_source(OLD_POSITION))[0]
        self.assertGreaterEqual(dipole["positive_support_pixels"], 3)
        self.assertGreaterEqual(dipole["negative_support_pixels"], 3)
        self.assertGreaterEqual(dipole["lobe_flux_balance"], .25)

    def test_calibration_preserves_a_moving_source_and_removes_a_static_one(self):
        for moving in (False, True):
            with self.subTest(moving=moving):
                metadata = [dict(flux_unit="MJy/sr", psf_fwhm_arcsec=sigma*2.354820045,
                                 obs_time=str(60800 + i*182.625)) for i, sigma in enumerate((1, 2))]
                result = prepare_difference(controlled_epochs(moving), metadata, [0, 1], 1)
                self.assertTrue(result.available, result.note)
                detections = self.detect(result.difference)
                if moving:
                    dipoles = [d for d in detections if d["type"] == "MOVING_DIPOLE"]
                    self.assertEqual(len(dipoles), 1)
                    self.assertEqual((dipoles[0]["x_pix"], dipoles[0]["y_pix"]), NEW_POSITION)
                    self.assertEqual((dipoles[0]["neg_x_pix"], dipoles[0]["neg_y_pix"]), OLD_POSITION)
                else:
                    # A 4σ puede haber picos aislados de ruido: no deben convertirse
                    # en un dipolo ni en un residuo significativo sobre la fuente.
                    self.assertFalse(any(d["type"] == "MOVING_DIPOLE" for d in detections))
                    self.assertLess(abs(result.difference[OLD_POSITION[1], OLD_POSITION[0]]), 0.08)


class FitsDipoleApiTests(unittest.TestCase):
    def test_real_fits_loading_reprojection_calibration_and_automatic_detection(self):
        main._EXPLORE_CACHE.clear()
        wcs, _ = pipeline.build_common_target_wcs(10, 20, 0.05)
        scale = 0.05*3600/128
        frames = []
        with TemporaryDirectory() as root:
            for index, image in enumerate(controlled_epochs()):
                header = wcs.to_header()
                header["BUNIT"] = "MJy/sr"
                header["PSF_FWHM"] = (index+1)*2.354820045*scale
                header["MJD-OBS"] = 60800 + index*182.625
                header["DETECTOR"] = "D1"
                header["CENWAV"] = 1.1
                path = Path(root) / f"synthetic_test_{index}.fits"
                fits.HDUList([fits.PrimaryHDU(), fits.ImageHDU(image.astype(np.float32), header, name="IMAGE"),
                              fits.ImageHDU(np.zeros((128, 128), dtype=np.int32), name="FLAGS"),
                              fits.ImageHDU(np.full((128, 128), 0.005**2, dtype=np.float32), name="VARIANCE")]).writeto(path)
                frames.append({"local_path": str(path)})
            with patch.object(main, "obtain_real_fits_for_coordinates", return_value=(frames, None, "CONTROLLED_SYNTHETIC_FITS", "")), \
                 patch.object(main, "detect_anomalies_on_diff", wraps=main.detect_anomalies_on_diff) as detector:
                response = TestClient(main.app).get("/api/explore", params={"ra": 10, "dec": 20})
            self.assertTrue(detector.called)
        self.assertEqual(response.status_code, 200, response.text[:300])
        data = response.json()
        self.assertTrue(data["target_info"]["difference_available"])
        dipoles = [d for d in data["ai_detections"] if d["type"] == "MOVING_DIPOLE"]
        self.assertEqual(len(dipoles), 1)
        self.assertEqual((dipoles[0]["x_pix"], dipoles[0]["y_pix"]), NEW_POSITION)
        self.assertEqual((dipoles[0]["neg_x_pix"], dipoles[0]["neg_y_pix"]), OLD_POSITION)
        self.assertAlmostEqual(dipoles[0]["proper_motion_arcsec_yr"], 22.5, places=2)
        main._EXPLORE_CACHE.clear()


if __name__ == "__main__":
    unittest.main()
