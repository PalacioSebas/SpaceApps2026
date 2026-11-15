"""Pruebas de la línea histórica (/api/timeline): visitas, brillo comparable, movimiento y textos."""

import base64
import math
from io import BytesIO
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch

import numpy as np
from PIL import Image
from astropy.wcs import WCS
from fastapi.testclient import TestClient

from src import irsa_client, main, timeline

RA0, DEC0 = 150.0, 20.0
PIX_ARCSEC = 6.15
SIZE = 41


def make_wcs() -> WCS:
    wcs = WCS(naxis=2)
    wcs.wcs.ctype = ["RA---TAN", "DEC--TAN"]
    wcs.wcs.crval = [RA0, DEC0]
    wcs.wcs.crpix = [(SIZE + 1) / 2.0, (SIZE + 1) / 2.0]
    wcs.wcs.cdelt = [-PIX_ARCSEC / 3600.0, PIX_ARCSEC / 3600.0]
    return wcs


def make_frame(amplitude=50.0, wavelength=2.0, east_arcsec=0.0, north_arcsec=0.0,
               saturated=False, seed=0, noise=0.02):
    """Recorte sintético: fuente gaussiana (FWHM ≈ 1,6 px) sobre fondo plano con ruido."""
    rng = np.random.default_rng(seed)
    yy, xx = np.mgrid[0:SIZE, 0:SIZE]
    cx = (SIZE - 1) / 2.0 - east_arcsec / PIX_ARCSEC   # Este = x decreciente
    cy = (SIZE - 1) / 2.0 + north_arcsec / PIX_ARCSEC
    sigma = 0.7
    data = 1.0 + amplitude * np.exp(-((xx - cx) ** 2 + (yy - cy) ** 2) / (2 * sigma ** 2))
    if saturated:
        data += amplitude * 0.02 * np.exp(-((xx - cx) ** 2 + (yy - cy) ** 2) / (2 * 6.0 ** 2))  # alas anchas
    data = (data + rng.normal(0.0, noise, data.shape)).astype(np.float32)
    bad = np.zeros(data.shape, dtype=bool)
    if saturated:
        bad |= np.hypot(xx - cx, yy - cy) <= 5.0
    return dict(
        data=data, bad=bad, cleaned_image=np.where(bad, 0.0, data - 1.0).astype(np.float32),
        variance=np.full(data.shape, noise ** 2, dtype=np.float32), wcs=make_wcs(),
        wavelength_center_um=wavelength, bandwidth_um=0.05, spectral_wcs=None,
        flux_unit="MJy/sr", obs_time="", detector="",
    )


class SyntheticSky:
    """Registra recortes sintéticos y sustituye la lectura de FITS."""

    def __init__(self, root: str):
        self.root = Path(root)
        self.frames = {}
        self.meta = []

    def add(self, mjd, detector="SPHEREx-D3", **kwargs):
        path = self.root / f"frame_{len(self.meta):03d}.fits"
        path.touch()
        self.frames[str(path)] = make_frame(seed=len(self.meta), **kwargs)
        self.meta.append({"local_path": str(path), "cutout_url": f"https://example.invalid/{path.name}",
                          "obs_time": str(mjd), "detector_band": detector})

    def get(self, path):
        return self.frames[str(Path(path))]

    def compute(self, ra=RA0, dec=DEC0, **kwargs):
        with patch.object(timeline, "_get_frame", side_effect=self.get):
            return timeline.compute_timeline(ra, dec, self.meta, **kwargs)


class VisitGroupingTests(unittest.TestCase):
    def test_long_campaign_groups_nearby_days_into_one_visit(self):
        ms = [{"mjd": m, "detector": "D1"} for m in (60800.1, 60801.9, 60802.5, 60990.0, 60991.0)]
        visits = timeline.group_visits(ms)
        self.assertEqual([v["n_exposures"] for v in visits], [3, 2])
        self.assertEqual([m["visit_id"] for m in ms], [0, 0, 0, 1, 1])
        self.assertEqual(visits[0]["label"], "6 may 2025")  # MJD 60801,5

    def test_short_campaign_uses_one_visit_per_day(self):
        ms = [{"mjd": m, "detector": "D1"} for m in (60800.1, 60800.9, 60801.2, 60803.7)]
        self.assertEqual([v["n_exposures"] for v in timeline.group_visits(ms)], [2, 1, 1])

    def test_detector_code_is_normalized(self):
        self.assertEqual(timeline.detector_code("SPHEREx-D3"), "D3")
        self.assertEqual(timeline.detector_code("3"), "D3")
        self.assertEqual(timeline.detector_code("d5"), "D5")

    def test_frame_selection_keeps_first_and_last_date_of_each_detector(self):
        frames = [{"local_path": f"a{i}", "obs_time": str(60800 + i), "detector_band": "SPHEREx-D1"} for i in range(40)]
        frames += [{"local_path": f"b{i}", "obs_time": str(60900 + i), "detector_band": "SPHEREx-D2"} for i in range(40)]
        chosen = timeline.select_frames_for_timeline(frames, limit=10)
        self.assertEqual(len(chosen), 10)
        times = {f["obs_time"] for f in chosen}
        self.assertTrue({"60800", "60839", "60900", "60939"} <= times)


class BrightnessTests(unittest.TestCase):
    def test_constant_source_is_reported_as_stable_with_strict_comparison(self):
        with TemporaryDirectory() as root:
            sky = SyntheticSky(root)
            for mjd in (60800.0, 60800.2, 60980.0, 60980.3, 61160.0, 61160.1):
                sky.add(mjd, amplitude=50.0, wavelength=2.00)
            result = sky.compute()
        series = result["series"][0]
        self.assertEqual((series["detector"], series["mode"], series["n_visits"]), ("D3", "strict", 3))
        self.assertEqual(series["status"], "stable")
        self.assertEqual(result["headline"]["status"], "stable")
        self.assertEqual(result["motion"]["status"], "static")
        self.assertEqual(result["default_detector"], "D3")

    def test_brightening_source_is_reported_in_plain_language(self):
        with TemporaryDirectory() as root:
            sky = SyntheticSky(root)
            for mjd in (60800.0, 60800.2, 60800.4):
                sky.add(mjd, amplitude=50.0, wavelength=2.00)
            for mjd in (60980.0, 60980.2, 60980.4):
                sky.add(mjd, amplitude=100.0, wavelength=2.01)
            result = sky.compute()
        series = result["series"][0]
        self.assertEqual(series["status"], "variable")
        self.assertAlmostEqual(series["change_pct"], 100.0, delta=8.0)
        self.assertEqual(result["headline"]["status"], "brightness_changed")
        self.assertIn("subió", result["headline"]["title"])

    def test_different_wavelengths_are_never_compared_as_strict(self):
        """Mismo detector pero λ 7 % distinta: solo el respaldo aproximado, y nunca afirma un cambio."""
        with TemporaryDirectory() as root:
            sky = SyntheticSky(root)
            for mjd in (60800.0, 60800.2, 60800.4):
                sky.add(mjd, amplitude=50.0, wavelength=2.00)
            for mjd in (60980.0, 60980.2, 60980.4):
                sky.add(mjd, amplitude=150.0, wavelength=2.14)
            result = sky.compute()
        series = result["series"][0]
        self.assertEqual(series["mode"], "approx")
        self.assertIn("Estimación aproximada", series["note"])
        self.assertNotEqual(series["status"], "variable")
        self.assertNotEqual(result["headline"]["status"], "brightness_changed")
        self.assertTrue(any("Estimación aproximada" in n for n in result["headline"]["notes"]))

    def test_detectors_are_kept_in_separate_series(self):
        with TemporaryDirectory() as root:
            sky = SyntheticSky(root)
            for mjd in (60800.0, 60980.0):
                sky.add(mjd, detector="SPHEREx-D2", amplitude=40.0, wavelength=1.30)
                sky.add(mjd + 0.1, detector="SPHEREx-D5", amplitude=80.0, wavelength=4.10)
            result = sky.compute()
        self.assertEqual([s["detector"] for s in result["series"]], ["D2", "D5"])
        self.assertTrue(all(s["mode"] == "strict" for s in result["series"]))

    def test_empty_sky_does_not_invent_changes(self):
        with TemporaryDirectory() as root:
            sky = SyntheticSky(root)
            for mjd in (60800.0, 60980.0, 61160.0):
                sky.add(mjd, amplitude=0.0, wavelength=2.00)
            result = sky.compute()
        self.assertEqual(result["series"][0]["status"], "faint")
        self.assertEqual(result["headline"]["status"], "faint")
        self.assertEqual(result["motion"]["status"], "unknown")

    def test_single_date_asks_for_a_second_one(self):
        with TemporaryDirectory() as root:
            sky = SyntheticSky(root)
            sky.add(60800.0, amplitude=50.0)
            sky.add(60800.3, amplitude=50.0)
            result = sky.compute()
        self.assertEqual(result["series"], [])
        self.assertEqual(result["headline"]["status"], "insufficient")
        self.assertEqual(len(result["stamps"]), 1)

    def test_saturated_core_uses_halo_photometry(self):
        with TemporaryDirectory() as root:
            sky = SyntheticSky(root)
            for mjd in (60800.0, 60802.0, 60804.0):
                sky.add(mjd, amplitude=4000.0, wavelength=2.00, saturated=True)
            result = sky.compute()
        series = result["series"][0]
        self.assertEqual(series["photometry"], "halo")
        self.assertIn("saturado", series["note"])
        self.assertEqual(series["status"], "stable")


class MotionTests(unittest.TestCase):
    def test_moving_source_is_detected_from_centroids(self):
        with TemporaryDirectory() as root:
            sky = SyntheticSky(root)
            for mjd in (60800.0, 60800.2, 60800.4):
                sky.add(mjd, amplitude=60.0, north_arcsec=-2.5)
            for mjd in (60982.6, 60982.8, 60983.0):
                sky.add(mjd, amplitude=60.0, north_arcsec=+2.5)
            result = sky.compute()
        motion = result["motion"]
        self.assertEqual(motion["status"], "moved")
        self.assertAlmostEqual(motion["shift_arcsec"], 5.0, delta=0.8)
        self.assertAlmostEqual(motion["pm_arcsec_yr"], 10.0, delta=1.8)
        self.assertGreater(motion["pm_dec_mas_yr"], 0)
        self.assertEqual(result["headline"]["status"], "moved")
        self.assertIn("se movió", result["headline"]["title"])
        # la apertura sigue a la fuente: su corrimiento no se informa como cambio de brillo
        self.assertEqual(result["series"][0]["status"], "stable")

    def test_stamps_are_north_up_and_share_scale(self):
        with TemporaryDirectory() as root:
            sky = SyntheticSky(root)
            sky.add(60800.0, amplitude=60.0, north_arcsec=18.0)   # fuente al norte del punto elegido
            sky.add(60980.0, amplitude=60.0, north_arcsec=18.0)
            result = sky.compute(stamp_fov_deg=0.03)
        self.assertEqual(len(result["stamps"]), 2)
        raw = base64.b64decode(result["stamps"][0]["image_base64"].split(",", 1)[1])
        img = np.asarray(Image.open(BytesIO(raw)))
        self.assertEqual(img.shape, (timeline.STAMP_PIXELS, timeline.STAMP_PIXELS))
        row, col = np.unravel_index(int(img.argmax()), img.shape)
        self.assertLess(row, timeline.STAMP_PIXELS / 2 - 3)             # norte = arriba
        self.assertAlmostEqual(col, timeline.STAMP_PIXELS / 2, delta=2)  # centrada en RA

    def test_known_fast_mover_reports_where_it_is_today(self):
        barnard = next(t for t in timeline.MANDATORY_TARGETS if t["id"] == "barnards_star")
        km = timeline.known_motion_for_point(barnard["ra_deg"], barnard["dec_deg"], 61000.0)
        self.assertIsNotNone(km)
        self.assertEqual(km["name"], "Barnard's Star")
        self.assertGreater(km["current_dec"], barnard["dec_deg"])           # se mueve hacia el norte
        self.assertAlmostEqual(km["offset_now_arcsec"], 10.39 * (2025.89 - 2000.0), delta=6.0)
        self.assertIsNone(timeline.known_motion_for_point(10.0, 20.0, 61000.0))

    def test_headline_explains_that_a_catalog_object_left_the_spot(self):
        barnard = next(t for t in timeline.MANDATORY_TARGETS if t["id"] == "barnards_star")
        with TemporaryDirectory() as root:
            sky = SyntheticSky(root)
            for mjd in (60900.0, 61270.0):
                sky.add(mjd, amplitude=0.0)
            for frame in sky.frames.values():
                frame["wcs"].wcs.crval = [barnard["ra_deg"], barnard["dec_deg"]]
            result = sky.compute(ra=barnard["ra_deg"], dec=barnard["dec_deg"])
        self.assertEqual(result["headline"]["status"], "moved_away")
        self.assertFalse(result["tracking_applied"])
        self.assertTrue(any("posición actual" in n for n in result["headline"]["notes"]))


class TimelineApiTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(main.app)
        main._TIMELINE_CACHE.clear()

    def test_invalid_coordinates_are_rejected(self):
        self.assertEqual(self.client.get("/api/timeline", params=dict(ra=10, dec=200)).status_code, 422)
        self.assertEqual(self.client.get("/api/timeline", params=dict(ra=10)).status_code, 422)

    def test_no_coverage_has_a_useful_http_error(self):
        with patch.object(main, "obtain_real_fits_for_coordinates",
                          side_effect=irsa_client.NoCoverageError("Sin cobertura")):
            response = self.client.get("/api/timeline", params=dict(ra=10, dec=20))
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json()["detail"], "Sin cobertura")

    def test_endpoint_returns_visits_series_stamps_and_headline(self):
        with TemporaryDirectory() as root:
            sky = SyntheticSky(root)
            for mjd in (60800.0, 60800.2, 60980.0, 60980.2):
                sky.add(mjd, amplitude=50.0, wavelength=2.00)
            with patch.object(main, "obtain_real_fits_for_coordinates", return_value=(sky.meta, None, "TEST", "")), \
                 patch.object(main, "collect_cached_frames", side_effect=lambda ra, dec, fov, frames: frames), \
                 patch.object(timeline, "_get_frame", side_effect=sky.get):
                response = self.client.get("/api/timeline", params=dict(ra=RA0, dec=DEC0))
        self.assertEqual(response.status_code, 200, response.text[:300])
        data = response.json()
        self.assertEqual(len(data["visits"]), 2)
        self.assertEqual(data["series"][0]["mode"], "strict")
        self.assertEqual(len(data["series"][0]["points"]), 2)
        self.assertTrue(data["stamps"][0]["image_base64"].startswith("data:image/png;base64,"))
        self.assertEqual(data["headline"]["status"], "stable")
        self.assertTrue(math.isclose(data["baseline_days"], 180.0, abs_tol=0.5))

    def test_real_cached_targets_never_claim_unsupported_changes(self):
        """Con los FITS reales en caché: la respuesta es válida y los 3 astros veloces avisan que se mudaron."""
        for target in timeline.MANDATORY_TARGETS:
            with self.subTest(target=target["id"]):
                params = dict(ra=target["ra_deg"], dec=target["dec_deg"], fov=0.05, max_epochs=10)
                try:
                    frames, *_ = irsa_client.obtain_real_fits_for_coordinates(
                        target["ra_deg"], target["dec_deg"], fov_deg=0.05, max_epochs=10)
                except Exception:
                    self.skipTest("Sin caché real de este objetivo")
                if not frames or not all(Path(f["local_path"]).is_file() for f in frames):
                    self.skipTest("Sin caché real de este objetivo")
                response = self.client.get("/api/timeline", params=params)
                self.assertEqual(response.status_code, 200, response.text[:300])
                data = response.json()
                self.assertGreaterEqual(len(data["visits"]), 2)
                self.assertGreater(len(data["stamps"]), 0)
                for series in data["series"]:
                    if series["mode"] != "strict":
                        self.assertNotEqual(series["status"], "variable")
                    else:
                        self.assertLessEqual(series["wavelength_span_pct"], 3.0 + 1e-6)
                if target.get("proper_motion"):
                    self.assertEqual(data["headline"]["status"], "moved_away")
                    self.assertGreater(data["known_motion"]["offset_now_arcsec"], 60.0)


if __name__ == "__main__":
    unittest.main()
