"""Unidades espectrales: mismos píxeles y fotometría, metadatos siempre en µm."""

from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest.mock import patch

import numpy as np
from astropy.io import fits
import astropy.units as u
from astropy.wcs import WCS

from src import pipeline, timeline


def spectral_fixture(unit="um", bandwidth=0.03):
    """WCS alternativo en memoria, sin archivos ni dependencias de servicios."""
    scale = u.um.to(u.Unit(unit))
    image = fits.ImageHDU(np.zeros((8, 8), dtype=np.float32), name="IMAGE")
    for key, value in {
        "WCSAXESW": 2, "CTYPE1W": "WAVE", "CUNIT1W": unit,
        "CRPIX1W": 1.0, "CRVAL1W": 2.28 * scale, "CDELT1W": 0.01 * scale,
        "CTYPE2W": "LINEAR", "CUNIT2W": unit,
        "CRPIX2W": 1.0, "CRVAL2W": bandwidth * scale, "CDELT2W": 0.001 * scale,
    }.items():
        image.header[key] = value
    hdul = fits.HDUList([fits.PrimaryHDU(), image])
    return hdul, image, WCS(image.header, hdul, key="W", fix=False)


class SpectralUnitsTests(unittest.TestCase):
    def test_wcs_in_m_nm_and_um_describes_the_same_native_pixel(self):
        for unit in ("m", "nm", "um"):
            with self.subTest(unit=unit):
                hdul, image, swcs = spectral_fixture(unit)
                try:
                    values = pipeline._spectral_values_um(swcs, 2, 3)
                    np.testing.assert_allclose(values, (2.30, 0.033), rtol=1e-12)
                    inferred = pipeline._infer_wavelength(hdul, image, image.header, 2, 3)
                    np.testing.assert_allclose(inferred, values, rtol=1e-12)
                finally:
                    hdul.close()

    def test_quantity_values_supply_their_own_explicit_units(self):
        swcs = SimpleNamespace(pixel_to_world_values=lambda x, y: (2.28 * u.um, 30 * u.nm))
        np.testing.assert_allclose(pipeline._spectral_values_um(swcs, 0, 0), (2.28, 0.03))

    def test_missing_and_incompatible_units_are_not_guessed(self):
        for units in (None, [], ["", "um"], ["um", ""], ["um"]):
            with self.subTest(units=units):
                swcs = SimpleNamespace(world_axis_units=units, pixel_to_world_values=lambda x, y: (2.28, 0.03))
                with self.assertRaises(ValueError):
                    pipeline._spectral_values_um(swcs, 0, 0)
        for units in (["deg", "um"], ["um", "Hz"]):
            with self.subTest(units=units):
                swcs = SimpleNamespace(world_axis_units=units, pixel_to_world_values=lambda x, y: (2.28, 0.03))
                with self.assertRaises(u.UnitConversionError):
                    pipeline._spectral_values_um(swcs, 0, 0)

    def test_nonfinite_metadata_is_rejected(self):
        swcs = SimpleNamespace(world_axis_units=["um", "um"], pixel_to_world_values=lambda x, y: (np.nan, 0.03))
        with self.assertRaises(ValueError):
            pipeline._spectral_values_um(swcs, 0, 0)

    def test_present_invalid_native_wcs_does_not_fall_back_to_center_metadata(self):
        spatial, _ = pipeline.build_common_target_wcs(10, 20, 0.05)
        coord = spatial.pixel_to_world(50, 55)
        data = np.ones((128, 128), dtype=np.float32)
        path = Path(pipeline.__file__)
        for values, units in (
            ((np.nan, 0.03), ["um", "um"]),
            ((2.28, np.nan), ["um", "um"]),
            ((2.28, 0.03), ["deg", "um"]),
            ((2.28, 0.03), ["um", "Hz"]),
        ):
            with self.subTest(values=values, units=units):
                def native_values(x, y):
                    return values if np.isclose(x, 50) and np.isclose(y, 55) else (2.28, 0.03)

                swcs = SimpleNamespace(world_axis_units=units, pixel_to_world_values=native_values)
                frame = dict(
                    data=data, bad=np.zeros(data.shape, dtype=bool), cleaned_image=data,
                    flags_uint8=np.zeros(data.shape, dtype=np.uint8), clean_pixels_pct=100,
                    variance=data, wcs=spatial, spectral_wcs=swcs,
                    wavelength_center_um=4.5, bandwidth_um=0.04, flux_unit="MJy/sr",
                    psf_fwhm_arcsec=6.0, obs_time="60000", detector="D3",
                )
                with patch.object(pipeline, "_get_frame", return_value=frame):
                    with self.assertRaises(ValueError):
                        pipeline.load_and_clean_real_fits([path], ra=coord.ra.deg, dec=coord.dec.deg)
                    _, _, spectrum = pipeline.extract_real_spectrum_at_coord(
                        coord.ra.deg, coord.dec.deg, [{"local_path": str(path)}], spatial)
                self.assertEqual(spectrum, [], "No publicar la medición a la longitud de onda del centro")
                self.assertIsNone(timeline.measure_frame(frame, coord.ra.deg, coord.dec.deg))
                if units == ["um", "um"]:
                    valid_coord = spatial.pixel_to_world(51, 55)
                    with patch.object(pipeline, "_get_frame", return_value=frame):
                        _, _, valid = pipeline.extract_real_spectrum_at_coord(
                            valid_coord.ra.deg, valid_coord.dec.deg, [{"local_path": str(path)}], spatial)
                    self.assertEqual(len(valid), 1, "El píxel inválido no invalida otros píxeles medibles")
                    self.assertEqual(valid[0]["wavelength_um"], 2.28)
                    valid_timeline = timeline.measure_frame(frame, valid_coord.ra.deg, valid_coord.dec.deg)
                    self.assertIsNotNone(valid_timeline)
                    self.assertEqual(valid_timeline["wavelength_um"], 2.28)

                image = fits.ImageHDU(np.zeros((8, 8)), name="IMAGE")
                image.header["CENWAV"] = 4.5
                with fits.HDUList([fits.PrimaryHDU(), image]) as hdul:
                    with patch.object(pipeline, "WCS", return_value=swcs):
                        self.assertEqual(pipeline._infer_wavelength(hdul, image, image.header, 50, 55), (0.0, 0.0))
                    with patch.object(pipeline, "WCS", side_effect=ValueError("No spectral WCS")):
                        np.testing.assert_allclose(
                            pipeline._infer_wavelength(hdul, image, image.header, 50, 55), (4.5, 0.045),
                            err_msg="El fallback heredado sigue disponible cuando no se puede construir WCS")

    def test_explore_omits_only_the_frame_with_invalid_native_wcs(self):
        from src import main

        spatial, _ = pipeline.build_common_target_wcs(10, 20, 0.05)
        data = np.ones((128, 128), dtype=np.float32)
        bad = np.zeros(data.shape, dtype=bool)
        native = SimpleNamespace(world_axis_units=["um", "um"], pixel_to_world_values=lambda x, y: (2.28, 0.03))
        frame = dict(
            data=data, bad=bad, cleaned_image=data, flags_uint8=bad.astype(np.uint8),
            clean_pixels_pct=100, variance=data, wcs=spatial, spectral_wcs=native,
            wavelength_center_um=4.5, bandwidth_um=0.04, flux_unit="MJy/sr",
            psf_fwhm_arcsec=6.0, obs_time="60000", detector="D3",
        )
        invalid = {**frame, "spectral_wcs": SimpleNamespace(
            world_axis_units=["um", "um"], pixel_to_world_values=lambda x, y: (np.nan, 0.03))}
        invalid_path, valid_path = Path(pipeline.__file__), Path(main.__file__)
        frames = [dict(local_path=str(path), obs_time=str(60000 + index), detector_band="D3")
                  for index, path in enumerate((invalid_path, valid_path))]

        def align(epochs, target_wcs, shape_out, analysis_indices=None, diagnostics=None, analysis_groups=None):
            self.assertEqual(len(epochs), 1)
            diagnostics.update(analysis_frame_indices=[0], available=False, note="Solo una exposición válida",
                               baseline_years=0, target_fwhm_arcsec=6)
            return [data], [bad.astype(np.uint8)], data, np.full_like(data, np.nan)

        with patch.dict(main._EXPLORE_CACHE, {}, clear=True), \
             patch.object(main, "obtain_real_fits_for_coordinates", return_value=(frames, None, "OFFLINE_FIXTURE", "")), \
             patch.object(pipeline, "_get_frame", side_effect=lambda path: invalid if path == invalid_path else frame), \
             patch.object(main, "align_coadd_and_diff", side_effect=align), \
             patch.object(main, "matrix_to_base64_png", return_value="data:image/png;base64,AA=="):
            response = main.explore_sky_region(10, 20, 0.05, max_epochs=2, refresh=False, temporal_search=False)
        self.assertEqual(response.target_info.total_frames, 1)
        self.assertEqual(len(response.epochs), 1)
        self.assertEqual(response.epochs[0].wavelength_center_um, 2.28)
        self.assertAlmostEqual(response.epochs[0].bandwidth_um, 0.03)
        self.assertEqual(response.epochs[0].obs_time, "60001")

    def test_legacy_header_fallback_and_missing_width_estimate_are_preserved(self):
        for key in ("CENWAV", "WAVELENGTH", "WAVELENGTH_UM", "WAVELENGTH_CENTER_UM"):
            with self.subTest(key=key):
                image = fits.ImageHDU(np.zeros((8, 8)), name="IMAGE")
                image.header[key] = 1.1
                with fits.HDUList([fits.PrimaryHDU(), image]) as hdul:
                    np.testing.assert_allclose(pipeline._infer_wavelength(hdul, image, image.header, 0, 0), (1.1, 0.011))
        hdul, image, _ = spectral_fixture("nm", bandwidth=0)
        with hdul:
            np.testing.assert_allclose(pipeline._infer_wavelength(hdul, image, image.header, 0, 0), (2.28, 0.0228))

    def test_native_pixel_metadata_changes_no_image_or_photometry(self):
        spatial, _ = pipeline.build_common_target_wcs(10, 20, 0.05)
        coord = spatial.pixel_to_world(50, 55)
        hdul, _, spectral = spectral_fixture("nm")
        with hdul:
            data = np.ones((128, 128), dtype=np.float32)
            bad = np.zeros(data.shape, dtype=bool)
            frame = dict(
                data=data, bad=bad, cleaned_image=data.copy(), flags_uint8=bad.astype(np.uint8),
                clean_pixels_pct=100.0, variance=data.copy(), wcs=spatial,
                wavelength_center_um=2.78, bandwidth_um=0.085, spectral_wcs=spectral,
                flux_unit="MJy/sr", psf_fwhm_arcsec=6.0, obs_time="60000", detector="D3",
            )
            # Existing source path passes the existence check; the frame read itself is patched.
            # This creates no FITS files and never reads scientific arrays from disk.
            path = Path(pipeline.__file__)
            meta = [{"local_path": str(path)}]
            original = {key: frame[key].copy() for key in ("data", "bad", "cleaned_image", "flags_uint8", "variance")}
            with patch.object(pipeline, "_get_frame", return_value=frame):
                loaded = pipeline.load_and_clean_real_fits([path], ra=coord.ra.deg, dec=coord.dec.deg)
                _, _, spectrum = pipeline.extract_real_spectrum_at_coord(coord.ra.deg, coord.dec.deg, meta, spatial)
            measured = timeline.measure_frame(frame, coord.ra.deg, coord.dec.deg)
            baseline = {**frame, "spectral_wcs": None}
            with patch.object(pipeline, "_get_frame", return_value=baseline):
                _, _, before = pipeline.extract_real_spectrum_at_coord(coord.ra.deg, coord.dec.deg, meta, spatial)
            timeline_before = timeline.measure_frame(baseline, coord.ra.deg, coord.dec.deg)
            for result in (loaded, spectrum[0], measured):
                self.assertIsNotNone(result)
                wavelength = result.get("wavelength_um", result.get("wavelength_center_um"))
                self.assertAlmostEqual(wavelength, 2.78, places=10)
                self.assertAlmostEqual(result["bandwidth_um"], 0.085, places=10)
            self.assertIs(loaded["image"], frame["cleaned_image"])
            self.assertIs(loaded["flags"], frame["flags_uint8"])
            self.assertEqual(spectrum[0]["flux_mjy_sr"], before[0]["flux_mjy_sr"])
            self.assertEqual(spectrum[0]["flux_uncertainty"], before[0]["flux_uncertainty"])
            for key in ("flux", "unc", "snr", "mode", "centroid", "centroid_err_arcsec"):
                self.assertEqual(measured[key], timeline_before[key])
            for key, value in original.items():
                np.testing.assert_array_equal(frame[key], value)

    def test_real_wave_tab_fixtures_keep_their_existing_metadata(self):
        root = Path(__file__).resolve().parents[1] / "data" / "cache"
        files = []
        for target in ("barnards_star", "epsilon_indi_b", "r_draconis", "rw_aurigae", "wise_0855"):
            target_files = sorted((root / target).glob("real_epoch_*.fits"))
            if not target_files:
                self.skipTest("Requiere FITS precargados de los cinco objetivos; no se descargan en esta prueba")
            files.extend(target_files)
        signatures = {path: (path.stat().st_size, path.stat().st_mtime_ns) for path in files}
        for path in files:
            with self.subTest(path=str(path)), fits.open(path, mode="readonly", memmap=True) as hdul:
                image = pipeline._locate_image_hdu(hdul)
                swcs = pipeline._spectral_wcs(hdul, image.header)
                self.assertIsNotNone(swcs)
                self.assertEqual(swcs.world_axis_units, ["um", "um"])
                center = ((image.header["NAXIS1"] - 1) / 2, (image.header["NAXIS2"] - 1) / 2)
                for x, y in (center, (center[0] + 2, center[1] - 3)):
                    # Equivalent to the old .value extraction on the actual µm WAVE-TAB fixtures.
                    old = tuple(float(value.value) for value in swcs.pixel_to_world(x, y))
                    new = pipeline._spectral_values_um(swcs, x, y)
                    np.testing.assert_allclose(new, old, rtol=1e-12, atol=1e-14)
                np.testing.assert_allclose(
                    pipeline._infer_wavelength(hdul, image, image.header, *center),
                    pipeline._spectral_values_um(swcs, *center), rtol=1e-12, atol=1e-14,
                )
        self.assertEqual(signatures, {path: (path.stat().st_size, path.stat().st_mtime_ns) for path in files})


if __name__ == "__main__":
    unittest.main()
