"""Pruebas de «Objetos que cambian» (src/motion.py y /api/changes): seguimiento temporal y brillo."""

import math
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch

import numpy as np
from astropy.wcs import WCS
from fastapi.testclient import TestClient

from src import main, motion, timeline

RA0, DEC0 = 150.0, 20.0
PIX_ARCSEC = 6.15
SIZE = 41
FOV = 0.06  # 216″: el análisis usa ±108″ alrededor del centro (el recorte cubre ±123″)
STATIC_STARS = [(-60.0, 40.0, 30.0), (55.0, 50.0, 25.0), (-50.0, -55.0, 40.0), (60.0, -45.0, 20.0)]
VISITS = (60800.0, 60920.0, 61040.0, 61165.0)  # ~1 año, 4 visitas
EXPOSURES = (0.0, 0.3, 0.6)


def make_wcs() -> WCS:
    wcs = WCS(naxis=2)
    wcs.wcs.ctype = ["RA---TAN", "DEC--TAN"]
    wcs.wcs.crval = [RA0, DEC0]
    wcs.wcs.crpix = [(SIZE + 1) / 2.0, (SIZE + 1) / 2.0]
    wcs.wcs.cdelt = [-PIX_ARCSEC / 3600.0, PIX_ARCSEC / 3600.0]
    return wcs


def make_field_frame(stars, seed=0, noise=0.02, wavelength=2.0, offset=(0.0, 0.0)):
    """Recorte sintético con varias estrellas gaussianas. ``offset`` simula el error de WCS de la imagen."""
    rng = np.random.default_rng(seed)
    yy, xx = np.mgrid[0:SIZE, 0:SIZE]
    data = np.ones((SIZE, SIZE), dtype=float)
    for east, north, amp in stars:
        cx = (SIZE - 1) / 2.0 - (east + offset[0]) / PIX_ARCSEC   # Este = x decreciente
        cy = (SIZE - 1) / 2.0 + (north + offset[1]) / PIX_ARCSEC
        data += amp * np.exp(-((xx - cx) ** 2 + (yy - cy) ** 2) / (2 * 0.7 ** 2))
    data = (data + rng.normal(0.0, noise, data.shape)).astype(np.float32)
    bad = np.zeros(data.shape, dtype=bool)
    return dict(
        data=data, bad=bad, cleaned_image=(data - 1.0).astype(np.float32),
        variance=np.full(data.shape, noise ** 2, dtype=np.float32), wcs=make_wcs(),
        wavelength_center_um=wavelength, bandwidth_um=0.05, spectral_wcs=None,
        flux_unit="MJy/sr", obs_time="", detector="",
    )


def offset_world(east, north):
    cos_dec = math.cos(math.radians(DEC0))
    return RA0 + east / 3600.0 / cos_dec, DEC0 + north / 3600.0


class SyntheticField:
    """Registra recortes sintéticos del campo y sustituye la lectura de FITS en timeline y motion."""

    def __init__(self, root: str):
        self.root = Path(root)
        self.frames = {}
        self.meta = []

    def add(self, mjd, stars, detector="SPHEREx-D3", **kwargs):
        path = self.root / f"frame_{len(self.meta):03d}.fits"
        path.touch()
        self.frames[str(path)] = make_field_frame(stars, seed=len(self.meta), **kwargs)
        self.meta.append({"local_path": str(path), "cutout_url": f"https://example.invalid/{path.name}",
                          "obs_time": str(mjd), "detector_band": detector})

    def get(self, path):
        return self.frames[str(Path(path))]

    def patched(self):
        return patch.multiple(timeline, _get_frame=self.get), patch.multiple(motion, _get_frame=self.get)

    def analyze(self, gaia=None, gaia_status="unavailable"):
        p1, p2 = self.patched()
        with p1, p2:
            return motion.analyze_field_changes(RA0, DEC0, FOV, self.meta, gaia, gaia_status)

    def timeline(self, ra, dec, field_object=None):
        p1, p2 = self.patched()
        with p1, p2:
            return timeline.compute_timeline(ra, dec, self.meta, fov_deg=FOV, field_object=field_object)


def build_field(root, mover_pm_arcsec_yr=0.0, variable_amps=None, wcs_errors=None, extra=None):
    """Campo con 4 estrellas fijas + una estrella central (que puede moverse o variar)."""
    sky = SyntheticField(root)
    t_mid = timeline.mjd_to_year(float(np.mean(VISITS)))
    k = 0
    for vi, visit in enumerate(VISITS):
        for dt in EXPOSURES:
            mjd = visit + dt
            north = mover_pm_arcsec_yr * (timeline.mjd_to_year(mjd) - t_mid)
            amp = variable_amps[vi] if variable_amps else 35.0
            stars = STATIC_STARS + [(0.0, north, amp)] + list(extra or [])
            offset = wcs_errors[k] if wcs_errors else (0.0, 0.0)
            sky.add(mjd, stars, offset=offset)
            k += 1
    return sky


# ----------------------------------------------------------------------------
class MotionFitTests(unittest.TestCase):
    def positions(self, norths, err=0.5):
        mjds = [60800.0, 60920.0, 61040.0, 61165.0][: len(norths)]
        return [{"visit_id": i, "mjd": m, "east_arcsec": 0.0, "north_arcsec": n, "uncertainty_arcsec": err,
                 "n_exposures": 3} for i, (m, n) in enumerate(zip(mjds, norths))]

    def test_linear_motion_is_recovered_with_direction(self):
        years = [(m - 60800.0) / 365.25 for m in (60800.0, 60920.0, 61040.0, 61165.0)]
        fit = motion.fit_linear_motion(self.positions([10.0 * y for y in years]))
        self.assertEqual(fit["status"], "moving")
        self.assertAlmostEqual(fit["pm_total_arcsec_yr"], 10.0, delta=0.05)
        self.assertAlmostEqual(fit["pm_dec_mas_yr"], 10000.0, delta=50.0)
        self.assertEqual(fit["direction"], "el norte")
        self.assertEqual(motion.motion_confidence(fit), "alta")

    def test_static_star_within_noise_is_static(self):
        fit = motion.fit_linear_motion(self.positions([0.2, -0.3, 0.1, -0.1]))
        self.assertEqual(fit["status"], "static")
        self.assertIsNone(motion.motion_confidence(fit))

    def test_single_visit_is_unknown(self):
        self.assertEqual(motion.fit_linear_motion(self.positions([0.0]))["status"], "unknown")

    def test_bad_fit_inflates_uncertainty(self):
        good = motion.fit_linear_motion(self.positions([0.0, 3.3, 6.6, 10.0]))
        noisy = motion.fit_linear_motion(self.positions([0.0, 8.0, -2.0, 10.0]))
        self.assertGreater(noisy["chi2_reduced"], 1.0)
        self.assertGreater(noisy["pm_uncertainty_arcsec_yr"], good["pm_uncertainty_arcsec_yr"])

    def test_direction_text_uses_position_angle(self):
        self.assertEqual(motion.direction_text(0.0, 1.0), "el norte")
        self.assertEqual(motion.direction_text(1.0, 0.0), "el este")
        self.assertEqual(motion.direction_text(-1.0, -1.0), "el sudoeste")


class FieldTrackingTests(unittest.TestCase):
    def test_static_field_reports_no_changes(self):
        with TemporaryDirectory() as root:
            res = build_field(root).analyze()
        self.assertEqual(res["n_visits"], 4)
        self.assertEqual(res["objects"], [])
        self.assertEqual(len(res["steady"]), 5)
        self.assertEqual(res["summary"]["status"], "steady")

    def test_moving_star_is_followed_across_all_dates(self):
        with TemporaryDirectory() as root:
            res = build_field(root, mover_pm_arcsec_yr=10.0).analyze()
        movers = [o for o in res["objects"] if o["kind"] in ("moving", "both")]
        self.assertEqual(len(movers), 1, res["objects"])
        m = movers[0]["motion"]
        self.assertAlmostEqual(m["pm_total_arcsec_yr"], 10.0, delta=1.5)
        self.assertEqual(m["direction"], "el norte")
        self.assertEqual(m["n_visits"], 4)
        self.assertIn("por año hacia el norte", m["sentence"])
        self.assertEqual(movers[0]["confidence"], "alta")
        # la apertura acompaña al objeto: su corrimiento no se informa como cambio de brillo
        self.assertNotIn(movers[0]["brightness"]["status"], ("variable", "possible"))
        # trayectoria: empieza al sur y termina al norte de la posición media
        self.assertLess(m["start_dec"], movers[0]["dec"])
        self.assertGreater(m["end_dec"], movers[0]["dec"])
        self.assertEqual(len(res["steady"]), 4)

    def test_per_exposure_wcs_errors_are_removed_by_relative_astrometry(self):
        rng = np.random.default_rng(7)
        errors = [tuple(rng.normal(0.0, 2.0, 2)) for _ in range(len(VISITS) * len(EXPOSURES))]
        # además, un desvío sistemático que crece con el tiempo: sin corrección parecería movimiento
        errors = [(e, n + 1.5 * (k // len(EXPOSURES))) for k, (e, n) in enumerate(errors)]
        with TemporaryDirectory() as root:
            res = build_field(root, wcs_errors=errors).analyze()
        self.assertGreaterEqual(res["astrometry"]["reference_stars"], 3)
        self.assertEqual([o for o in res["objects"] if o["kind"] in ("moving", "both")], [])

    def test_variable_star_is_reported_with_strict_comparison(self):
        with TemporaryDirectory() as root:
            res = build_field(root, variable_amps=[35.0, 60.0, 35.0, 60.0]).analyze()
        variables = [o for o in res["objects"] if o["kind"] in ("brightness", "both")]
        self.assertEqual(len(variables), 1, res["objects"])
        b = variables[0]["brightness"]
        self.assertEqual(b["status"], "variable")
        self.assertEqual(b["mode"], "strict")
        self.assertGreater(b["amplitude_pct"], 40.0)
        self.assertEqual(variables[0]["confidence"], "alta")
        self.assertEqual(variables[0]["motion"]["status"], "static")

    def test_constant_brightness_is_not_reported_as_change(self):
        with TemporaryDirectory() as root:
            res = build_field(root, variable_amps=[35.0, 36.0, 34.5, 35.5]).analyze()
        self.assertEqual(res["objects"], [])

    def test_variable_star_next_to_a_brighter_one_is_not_claimed(self):
        with TemporaryDirectory() as root:
            res = build_field(root, variable_amps=[20.0, 34.0, 20.0, 34.0], extra=[(15.0, 12.0, 60.0)]).analyze()
        self.assertEqual([o for o in res["objects"] if o["kind"] in ("brightness", "both")], [])
        blended = [o for o in res["steady"] if o["crowded"]]
        self.assertTrue(blended)

    def test_same_star_is_reported_once(self):
        with TemporaryDirectory() as root:
            res = build_field(root, mover_pm_arcsec_yr=10.0).analyze()
        everything = res["objects"] + res["steady"]
        for i, a in enumerate(everything):
            for b in everything[i + 1:]:
                sep = math.hypot(*motion._offsets_arcsec(a["ra"], a["dec"], b["ra"], b["dec"]))
                self.assertGreater(sep, motion.LINK_ARCSEC)

    def test_single_date_needs_more_dates(self):
        with TemporaryDirectory() as root:
            sky = SyntheticField(root)
            for dt in EXPOSURES:
                sky.add(60800.0 + dt, STATIC_STARS)
            res = sky.analyze()
        self.assertEqual(res["summary"]["status"], "insufficient")
        self.assertEqual(res["objects"], [])


class CatalogTests(unittest.TestCase):
    def test_gaia_positions_are_propagated_to_the_spherex_epoch(self):
        ra, dec = offset_world(0.0, 0.0)
        g = [{"id": "1", "ra": ra, "dec": dec - 0.0028, "mag": 9.0, "pmra": 0.0, "pmdec": 1000.0}]
        moved = motion.propagate_gaia(g, 2026.0)[0]
        self.assertAlmostEqual((moved["dec_epoch"] - g[0]["dec"]) * 3600.0, 10.0, delta=0.01)
        match = motion.match_gaia(ra, dec, motion.propagate_gaia(g, 2026.0))
        self.assertIsNotNone(match)
        self.assertAlmostEqual(match["pm_total_arcsec_yr"], 1.0, delta=1e-6)

    def test_brightest_gaia_source_within_one_pixel_wins(self):
        ra, dec = offset_world(0.0, 0.0)
        g = motion.propagate_gaia([
            {"id": "faint", "ra": ra, "dec": dec, "mag": 18.0, "pmra": None, "pmdec": None},
            {"id": "bright", "ra": ra, "dec": dec + 3.0 / 3600.0, "mag": 9.0, "pmra": None, "pmdec": None},
            {"id": "far", "ra": ra, "dec": dec + 20.0 / 3600.0, "mag": 5.0, "pmra": None, "pmdec": None},
        ], 2016.0)
        self.assertEqual(motion.match_gaia(ra, dec, g)["source_id"], "bright")

    def test_measured_and_catalog_motion_are_compared_not_merged(self):
        fit = {"pm_ra_mas_yr": -500.0, "pm_dec_mas_yr": 9100.0, "pm_uncertainty_arcsec_yr": 1.5}
        self.assertTrue(motion.compare_motion(fit, -802.0, 10362.0))
        self.assertFalse(motion.compare_motion(fit, 0.0, 0.0))
        self.assertIsNone(motion.compare_motion(fit, None, None))

    def test_planet_x_hypothesis_only_without_gaia_counterpart(self):
        with TemporaryDirectory() as root:
            sky = build_field(root, mover_pm_arcsec_yr=10.0)
            no_gaia = sky.analyze(gaia=[], gaia_status="ok")
            ra, dec = offset_world(0.0, 0.0)
            # posición Gaia en 2016.0 = posición media de SPHEREx menos 10″/año × (época media − 2016)
            mean_year = timeline.mjd_to_year(float(np.mean([float(m["obs_time"]) for m in sky.meta])))
            dec_2016 = dec - 10.0 * (mean_year - 2016.0) / 3600.0
            with_gaia = sky.analyze(gaia=[{"id": "7", "ra": ra, "dec": dec_2016, "mag": 11.0,
                                           "pmra": 0.0, "pmdec": 10000.0}], gaia_status="ok")
            unavailable = sky.analyze()
        mover = lambda res: next(o for o in res["objects"] if o["kind"] in ("moving", "both"))  # noqa: E731
        hyp = mover(no_gaia)["planet_x"]
        self.assertIsNotNone(hyp)
        self.assertIn("no una detección", hyp["note"])
        self.assertEqual(mover(no_gaia)["catalog"]["gaia_status"], "no_match")
        self.assertIsNone(mover(with_gaia)["planet_x"])
        self.assertTrue(mover(with_gaia)["catalog"]["gaia_agrees"])
        self.assertIsNone(mover(unavailable)["planet_x"])  # sin consultar Gaia no se puede afirmar «no catalogado»


class ConsistencyTests(unittest.TestCase):
    def test_timeline_uses_the_same_measurement_as_the_panel(self):
        with TemporaryDirectory() as root:
            sky = build_field(root, mover_pm_arcsec_yr=10.0)
            res = sky.analyze()
            obj = next(o for o in res["objects"] if o["kind"] in ("moving", "both"))
            tl = sky.timeline(obj["ra"] + 2.0 / 3600.0, obj["dec"], field_object=obj)
        self.assertEqual(tl["field_object_id"], obj["id"])
        self.assertEqual(tl["motion"]["source"], "field")
        self.assertEqual(tl["motion"]["status"], "moved")
        self.assertEqual(tl["motion"]["pm_arcsec_yr"], obj["motion"]["pm_total_arcsec_yr"])
        self.assertTrue(tl["tracking_applied"])
        self.assertEqual(tl["headline"]["status"], "moved")

    def test_aperture_cut_by_the_frame_edge_is_not_measured(self):
        fr = make_field_frame([(0.0, 0.0, 30.0)])
        edge_ra, edge_dec = offset_world(-(SIZE // 2) * PIX_ARCSEC + 3.0, 0.0)  # a ~0,5 px del borde
        self.assertIsNone(timeline.measure_frame(fr, edge_ra, edge_dec))
        self.assertIsNotNone(timeline.measure_frame(fr, *offset_world(0.0, 0.0)))


class ChangesEndpointTests(unittest.TestCase):
    def test_changes_endpoint_and_timeline_share_the_field_object(self):
        with TemporaryDirectory() as root:
            sky = build_field(root, mover_pm_arcsec_yr=10.0)
            p1, p2 = sky.patched()
            main._CHANGES_CACHE.clear()
            main._TIMELINE_CACHE.clear()
            with p1, p2, \
                    patch.object(main, "obtain_real_fits_for_coordinates", return_value=(sky.meta, None, "TEST", "")), \
                    patch.object(main, "collect_cached_frames", side_effect=lambda ra, dec, fov, frames: frames), \
                    patch.object(main, "query_catalog_field", return_value={"sources": []}):
                client = TestClient(main.app)
                res = client.get(f"/api/changes?ra={RA0}&dec={DEC0}&fov={FOV}")
                self.assertEqual(res.status_code, 200, res.text)
                data = res.json()
                mover = next(o for o in data["objects"] if o["kind"] == "moving")
                self.assertEqual(data["gaia_status"], "ok")
                self.assertIsNotNone(mover["stamps"])
                self.assertTrue(mover["stamps"]["before"]["image_base64"].startswith("data:image/png;base64,"))
                tl = client.get(f"/api/timeline?ra={mover['ra']}&dec={mover['dec']}&center_ra={RA0}"
                                f"&center_dec={DEC0}&fov={FOV}").json()
            main._CHANGES_CACHE.clear()
            main._TIMELINE_CACHE.clear()
        self.assertEqual(tl["field_object_id"], mover["id"])
        self.assertEqual(tl["motion"]["pm_arcsec_yr"], mover["motion"]["pm_total_arcsec_yr"])

    def test_invalid_coordinates_are_rejected(self):
        client = TestClient(main.app)
        self.assertEqual(client.get("/api/changes?ra=10&dec=200").status_code, 422)


if __name__ == "__main__":
    unittest.main()
