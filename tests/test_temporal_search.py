from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch

import numpy as np
from astropy.table import Table
from fastapi.testclient import TestClient

from src import main, pipeline, temporal_search
from src.analysis import rank_analysis_groups, select_analysis_frames
from src.irsa_client import NoCoverageError
from test_difference import star_field


def epoch(wavelength, time, detector="D1", quality=95):
    return dict(wavelength_center_um=wavelength, bandwidth_um=0.03, obs_time=str(time),
                detector=detector, clean_pixels_pct=quality)


class TemporalSelectionTests(unittest.TestCase):
    def test_overlapping_groups_preserve_a_later_wider_baseline(self):
        epochs = [epoch(1.1, 60800), epoch(1.11, 60801), epoch(1.12, 60900)]
        self.assertEqual(select_analysis_frames(epochs), [1, 2])

    def test_longer_baseline_is_preferred_to_a_dense_single_day(self):
        epochs = [epoch(1.1, 60800), epoch(1.11, 60801), epoch(1.1, 60800.5),
                  epoch(2.1, 60800, "D2"), epoch(2.1, 61000, "D2")]
        self.assertEqual(select_analysis_frames(epochs), [3, 4])

    def test_fully_masked_frames_do_not_create_a_usable_pair(self):
        epochs = [epoch(1.1, 60800, quality=0), epoch(1.1, 60900, quality=0),
                  epoch(2.1, 60800, "D2")]
        self.assertEqual(select_analysis_frames(epochs), [2])

    def test_sampling_keeps_early_and_late_dates_on_each_detector(self):
        records = [dict(cutout_url=f"https://example/{band}/{t}", obs_time=str(60800+t), detector_band=band)
                   for band in ("D1", "D2", "D3", "D4", "D5", "D6") for t in range(20)]
        selected = temporal_search.select_temporal_records(records, 12)
        self.assertEqual(len(selected), 12)
        for band in ("D1", "D2", "D3", "D4", "D5", "D6"):
            self.assertEqual({r["obs_time"] for r in selected if r["detector_band"] == band}, {"60800", "60819"})

    def test_sampling_excludes_duplicate_urls_and_invalid_dates(self):
        records = [dict(cutout_url="a", obs_time="60800", detector_band="D1"),
                   dict(cutout_url="a", obs_time="60800", detector_band="D1"),
                   dict(cutout_url="b", obs_time="bad", detector_band="D1"),
                   dict(cutout_url="c", obs_time="60900", detector_band="D1")]
        self.assertEqual([r["cutout_url"] for r in temporal_search.select_temporal_records(records, 4)], ["a", "c"])

    def test_sampling_fills_a_non_multiple_budget(self):
        records = [dict(cutout_url=f"{band}/{t}", obs_time=str(60800+t), detector_band=band)
                   for band in ("D1", "D2", "D3") for t in range(20)]
        self.assertEqual(len(temporal_search.select_temporal_records(records, 13)), 13)

    def test_loaded_wavelength_is_evaluated_at_requested_sky_center(self):
        wcs, _ = pipeline.build_common_target_wcs(10, 20, .05)
        coord = wcs.pixel_to_world(50, 55)
        from unittest.mock import Mock
        spectral = Mock()
        spectral.pixel_to_world_values.return_value = (2.1, .05)
        frame = dict(data=np.ones((128, 128)), bad=np.zeros((128, 128), dtype=bool), wcs=wcs,
                     obs_time="60800", detector="D1", wavelength_center_um=1.8, bandwidth_um=.04,
                     flux_unit="MJy/sr", psf_fwhm_arcsec=6, spectral_wcs=spectral)
        with TemporaryDirectory() as root:
            path = Path(root) / "test.fits"
            path.touch()
            with patch.object(pipeline, "_get_frame", return_value=frame):
                loaded = pipeline.load_and_clean_real_fits([path], ra=coord.ra.deg, dec=coord.dec.deg)
        self.assertEqual(loaded["wavelength_center_um"], 2.1)
        self.assertEqual(loaded["bandwidth_um"], .05)
        x, y = spectral.pixel_to_world_values.call_args.args
        self.assertAlmostEqual(x, 50, places=6)
        self.assertAlmostEqual(y, 55, places=6)

    def test_second_comparable_group_is_tried_if_first_cannot_calibrate(self):
        wcs, _ = pipeline.build_common_target_wcs(10, 20, .05)
        images = [star_field(1), star_field(2)] * 2
        epochs = [dict(image=image, flags=np.zeros((128, 128)), wcs=wcs, obs_time=str(60800+i),
                       flux_unit="MJy/sr", psf_fwhm_arcsec=None if i < 2 else (i-1)*2.354820045)
                  for i, image in enumerate(images)]
        quality = {}
        with patch.object(pipeline, "reproject_interp", side_effect=lambda source, *args, **kwargs: source[0]):
            pipeline.align_coadd_and_diff(epochs, wcs, (128, 128), [0, 1], quality, [[0, 1], [2, 3]])
        self.assertTrue(quality["available"], quality["note"])
        self.assertEqual(quality["analysis_frame_indices"], [2, 3])
        self.assertEqual(quality["groups_checked"], 2)


class TemporalAcquisitionTests(unittest.TestCase):
    def test_downloaded_data_has_its_own_cache_and_is_reused(self):
        table = Table({"url": ["https://example/early", "https://example/late"],
                       "time": [60800., 61000.], "band": ["D1", "D1"]})
        def download(record, destination):
            destination.write_bytes(b"test")
            return dict(record, local_path=str(destination))
        with TemporaryDirectory() as root, patch.object(temporal_search, "CACHE_DIR", Path(root)), \
             patch.object(temporal_search, "_tap_get_table", return_value=table) as query, \
             patch.object(temporal_search, "_download_single_cutout", side_effect=download):
            frames, _, source, _ = temporal_search.obtain_temporal_fits_for_coordinates(10, 20, .1, 2)
            self.assertEqual(len(frames), 2)
            self.assertEqual(source, "IRSA_SPHEREX_TEMPORAL")
            self.assertTrue(all(Path(f["local_path"]).parent.name.startswith("temporal_") for f in frames))
            self.assertEqual(query.call_count, 2)
            reused, _, _, _ = temporal_search.obtain_temporal_fits_for_coordinates(10, 20, .1, 2)
            self.assertEqual(reused, frames)
            self.assertEqual(query.call_count, 2)

    def test_no_remote_data_raises_instead_of_using_another_mission(self):
        table = Table(names=["url", "time", "band"], dtype=[str, float, str])
        with TemporaryDirectory() as root, patch.object(temporal_search, "CACHE_DIR", Path(root)), \
             patch.object(temporal_search, "_tap_get_table", return_value=table):
            with self.assertRaises(NoCoverageError):
                temporal_search.obtain_temporal_fits_for_coordinates(10, 20, .1, 2)

    def test_refresh_reuses_immutable_fits_instead_of_downloading_again(self):
        table = Table({"url": ["https://example/early", "https://example/late"],
                       "time": [60800., 61000.], "band": ["D1", "D1"]})
        def download(record, destination):
            destination.write_bytes(b"test")
            return dict(record, local_path=str(destination))
        with TemporaryDirectory() as root, patch.object(temporal_search, "CACHE_DIR", Path(root)), \
             patch.object(temporal_search, "_tap_get_table", return_value=table) as query, \
             patch.object(temporal_search, "_download_single_cutout", side_effect=download) as fetch:
            temporal_search.obtain_temporal_fits_for_coordinates(10, 20, .1, 2)
            self.assertEqual(fetch.call_count, 2)
            temporal_search.obtain_temporal_fits_for_coordinates(10, 20, .1, 2, force_refresh=True)
            self.assertEqual(fetch.call_count, 2)
            self.assertEqual(query.call_count, 4)

    def test_recent_partial_download_is_reused_without_hammering_the_service(self):
        table = Table({"url": ["https://example/early", "https://example/late"],
                       "time": [60800., 61000.], "band": ["D1", "D1"]})
        def download(record, destination):
            if record["cutout_url"].endswith("late"):
                return None
            destination.write_bytes(b"test")
            return dict(record, local_path=str(destination))
        with TemporaryDirectory() as root, patch.object(temporal_search, "CACHE_DIR", Path(root)), \
             patch.object(temporal_search, "_tap_get_table", return_value=table) as query, \
             patch.object(temporal_search, "_download_single_cutout", side_effect=download):
            frames, _, source, _ = temporal_search.obtain_temporal_fits_for_coordinates(10, 20, .1, 2)
            self.assertEqual(len(frames), 1)
            self.assertIn("parcial", source)
            reused, _, source, _ = temporal_search.obtain_temporal_fits_for_coordinates(10, 20, .1, 2)
            self.assertEqual(frames, reused)
            self.assertIn("parcial", source)
            self.assertEqual(query.call_count, 2)
            stamp = next(Path(root).glob("*/manifest.json")).stat().st_mtime
            with patch.object(temporal_search.time, "time", return_value=stamp+601):
                temporal_search.obtain_temporal_fits_for_coordinates(10, 20, .1, 2)
            self.assertEqual(query.call_count, 4)

    def test_api_routes_temporal_exploration_without_using_standard_loader(self):
        main._EXPLORE_CACHE.clear()
        with patch.object(main, "obtain_temporal_fits_for_coordinates", side_effect=NoCoverageError("No temporal pair")) as temporal, \
             patch.object(main, "obtain_real_fits_for_coordinates") as standard:
            response = TestClient(main.app).get("/api/explore", params=dict(ra=10, dec=20, temporal_search=True))
        self.assertEqual(response.status_code, 503)
        temporal.assert_called_once()
        standard.assert_not_called()

    def test_spectrum_uses_the_same_temporal_cache(self):
        with patch.object(main, "obtain_temporal_fits_for_coordinates", side_effect=NoCoverageError("No temporal pair")) as temporal, \
             patch.object(main, "obtain_real_fits_for_coordinates") as standard:
            response = TestClient(main.app).get("/api/spectrum", params=dict(ra=10, dec=20, temporal_search=True))
        self.assertEqual(response.status_code, 503)
        temporal.assert_called_once()
        standard.assert_not_called()


if __name__ == "__main__":
    unittest.main()
