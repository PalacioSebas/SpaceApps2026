"""Escenas controladas: verificar supresión de artefactos y conservación de variables."""

import unittest
from unittest.mock import patch

import numpy as np
from astropy.io import fits
from scipy.ndimage import gaussian_filter

from src.difference import match_gaussian_psf, prepare_difference
from src import pipeline


def star_field(sigma=1.0, gain=1.0, offset=0.0, variable_flux=0.0, one_star=False):
    impulses = np.zeros((128, 128))
    positions = [(64, 64)] if one_star else [(y, x) for y in (28, 64, 100) for x in (28, 64, 100)]
    for index, (y, x) in enumerate(positions):
        impulses[y, x] = 100 + index * 8
    impulses[64, 64] += variable_flux
    image = gaussian_filter(impulses, sigma)
    noise = np.random.default_rng(123 + int(sigma)).normal(0, 0.005, image.shape)
    return gain * image + offset + noise


def metadata(widths, times=None):
    return [dict(flux_unit="MJy/sr", psf_fwhm_arcsec=w * 2.354820045,
                 obs_time=str((times or list(range(len(widths))))[i] + 60800)) for i, w in enumerate(widths)]


class DifferenceTests(unittest.TestCase):
    def test_psf_gain_and_offset_changes_do_not_look_like_variables(self):
        early, late = star_field(1), star_field(2, gain=1.2, offset=8)
        result = prepare_difference([early, late], metadata([1, 2]), [0, 1], 1)
        self.assertTrue(result.available, result.note)
        self.assertLess(np.nanmax(np.abs(result.difference)), 0.08)
        self.assertLess(np.nanstd(result.difference), 0.015)
        fit = next(c for c in result.calibrations if not c["is_reference"])
        self.assertAlmostEqual(fit["scale"], 1.2, delta=0.02)
        self.assertAlmostEqual(fit["offset"], 8, delta=0.02)
        self.assertGreaterEqual(fit["reference_sources"], 3)

    def test_local_variable_is_preserved_by_the_field_calibration(self):
        early, late = star_field(1), star_field(2, gain=1.2, offset=8, variable_flux=80)
        result = prepare_difference([early, late], metadata([1, 2]), [0, 1], 1)
        self.assertTrue(result.available, result.note)
        self.assertGreater(result.difference[64, 64], 3)
        self.assertLess(abs(result.difference[28, 28]), 0.08)
        self.assertGreaterEqual(min(c["reference_sources"] for c in result.calibrations if not c["is_reference"]), 3)

    def test_one_variable_star_cannot_set_the_field_scale(self):
        images = [star_field(1, one_star=True), star_field(1, gain=1.5, one_star=True)]
        result = prepare_difference(images, metadata([1, 1]), [0, 1], 1)
        self.assertFalse(result.available)
        self.assertEqual(result.status, "insufficient_references")
        self.assertTrue(np.isnan(result.difference).all())

    def test_missing_psf_disables_difference(self):
        info = metadata([1, 1])
        info[1]["psf_fwhm_arcsec"] = None
        result = prepare_difference([star_field(), star_field()], info, [0, 1], 1)
        self.assertEqual(result.status, "missing_psf")
        self.assertFalse(result.available)

    def test_uncalibrated_units_disable_difference(self):
        info = metadata([1, 1])
        info[1]["flux_unit"] = "DN"
        result = prepare_difference([star_field(), star_field()], info, [0, 1], 1)
        self.assertEqual(result.status, "unsupported_units")

    def test_kernel_footprint_around_mask_is_not_reused(self):
        image = np.ones((64, 64))
        image[32, 32] = np.nan
        matched = match_gaussian_psf(image, 2, 4, 1)
        self.assertTrue(np.isnan(matched[32, 32]))
        self.assertTrue(np.isnan(matched[32, 33]))
        self.assertTrue(np.isnan(matched[0, 32]))
        self.assertAlmostEqual(matched[16, 16], 1)
        self.assertEqual(np.count_nonzero(np.isnan(image)), 1)

    def test_unknown_date_never_enters_a_temporal_half(self):
        info = metadata([1, 1])
        info[0]["obs_time"] = "unknown"
        result = prepare_difference([star_field(), star_field()], info, [0, 1], 1)
        self.assertFalse(result.available)
        self.assertEqual(result.status, "insufficient_epochs")

    def test_same_epoch_is_not_split_between_temporal_halves(self):
        images = [star_field()] * 3
        result = prepare_difference(images, metadata([1, 1, 1], [0, 0, 2]), [0, 1, 2], 1)
        self.assertTrue(result.available, result.note)
        self.assertAlmostEqual(result.baseline_years, 2 / 365.25)

    def test_no_common_coverage_disables_difference(self):
        images = [star_field(), star_field()]
        images[1][:] = np.nan
        result = prepare_difference(images, metadata([1, 1]), [0, 1], 1)
        self.assertFalse(result.available)
        self.assertTrue(np.isnan(result.difference).all())

    def test_reading_normalizes_brightness_and_variance_units(self):
        wcs, _ = pipeline.build_common_target_wcs(10, 20, 0.05)
        header = wcs.to_header()
        header["BUNIT"] = "Jy/sr"
        header["PSF_FWHM"] = 6
        hdul = fits.HDUList([fits.PrimaryHDU(), fits.ImageHDU(np.ones((8, 8)) * 1e6, header, name="IMAGE"),
                             fits.ImageHDU(np.ones((8, 8)) * 1e12, name="VARIANCE")])
        with patch.object(fits, "open", return_value=hdul):
            frame = pipeline._read_frame("not-used.fits")
        self.assertEqual(frame["flux_unit"], "MJy/sr")
        np.testing.assert_allclose(frame["data"], 1)
        np.testing.assert_allclose(frame["variance"], 1)


if __name__ == "__main__":
    unittest.main()
