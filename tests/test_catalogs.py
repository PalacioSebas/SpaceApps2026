import json
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch, Mock

from astropy.table import Table, MaskedColumn
import numpy as np

from src import irsa_client


class CatalogTests(unittest.TestCase):
    def setUp(self):
        irsa_client._catalog_field_cached.cache_clear()

    def test_irsa_generic_column_names_are_parsed_in_select_order(self):
        rows = Table({"col_0": [1234567890123456789], "col_1": [10.0], "col_2": [20.0], "col_3": [13.2]})
        with patch.object(irsa_client, "_tap_get_table", return_value=rows):
            result = irsa_client.query_catalog_field("gaia", 10, 20, 0.05)
        self.assertEqual(result["service"], "IRSA TAP")
        self.assertEqual(result["sources"][0], {"id": "1234567890123456789", "ra": 10, "dec": 20, "mag": 13.2})

    def test_irsa_failure_uses_cds_without_inventing_sources(self):
        rows = Table({"AllWISE": ["J0000"], "RAJ2000": [10.0], "DEJ2000": [20.0], "W1mag": [12.5]})
        service = Mock()
        service.search.return_value.to_table.return_value = rows
        with patch.object(irsa_client, "_tap_get_table", side_effect=RuntimeError("Timeout")), \
             patch.object(irsa_client, "_tap_service", return_value=service):
            result = irsa_client.query_catalog_field("allwise", 10, 20, 0.05)
        self.assertEqual(result["service"], "CDS VizieR")
        self.assertEqual(result["sources"][0]["id"], "J0000")

    def test_empty_success_is_not_retried_as_an_error(self):
        rows = Table(names=["id", "ra", "dec", "mag"], dtype=[str, float, float, float])
        with patch.object(irsa_client, "_tap_get_table", return_value=rows), \
             patch.object(irsa_client, "_tap_service") as fallback:
            result = irsa_client.query_catalog_field("gaia", 10, 20, 0.05)
        self.assertEqual(result["sources"], [])
        fallback.assert_not_called()

    def test_masks_and_nonfinite_values_do_not_break_json(self):
        rows = Table({"id": [1, 2, 3], "ra": [10.0, np.nan, 11.0], "dec": [20.0] * 3,
                      "mag": MaskedColumn([0., 0., 0.], mask=[True, False, False])})
        with patch.object(irsa_client, "_tap_get_table", return_value=rows):
            result = irsa_client.query_catalog_field("gaia", 10, 20, 0.05)
        self.assertEqual(len(result["sources"]), 2)
        self.assertIsNone(result["sources"][0]["mag"])

    def test_both_services_failing_is_an_error(self):
        with patch.object(irsa_client, "_tap_get_table", side_effect=RuntimeError("Timeout")), \
             patch.object(irsa_client, "_tap_service", side_effect=RuntimeError("Timeout")):
            with self.assertRaises(RuntimeError):
                irsa_client.query_catalog_field("gaia", 10, 20, 0.05)

    def test_incremental_fits_download_reuses_cached_frames(self):
        with TemporaryDirectory() as root:
            cache_root = Path(root)
            region_dir = cache_root / "sky_10p0000_20p0000_0p050"
            region_dir.mkdir(parents=True)
            f0 = region_dir / "existing_0.fits"
            f0.write_bytes(b"fits0")
            manifest = {
                "ra": 10.0,
                "dec": 20.0,
                "fov": 0.05,
                "original_source": "IRSA_SPHEREX_TAP",
                "complete": False,
                "tap_query": "SELECT ...",
                "frames": [
                    {"local_path": str(f0), "cutout_url": "https://example/cutout0", "obs_time": "60800.1", "detector_band": "D1"}
                ],
            }
            (region_dir / "manifest.json").write_text(json.dumps(manifest), encoding="utf-8")
            records = [
                {"cutout_url": "https://example/cutout0", "obs_time": "60800.1", "detector_band": "D1"},
                {"cutout_url": "https://example/cutout1", "obs_time": "60801.1", "detector_band": "D1"},
            ]
            def fake_download(rec, dest):
                dest.write_bytes(b"fits1")
                return {**rec, "local_path": str(dest)}

            with patch.object(irsa_client, "CACHE_DIR", cache_root), \
                 patch.object(irsa_client, "query_spherex_tap_live", return_value=(records, "SELECT ...", "IRSA_SPHEREX_TAP")), \
                 patch.object(irsa_client, "_download_single_cutout", side_effect=fake_download) as dl_mock:
                frames, _, _, _ = irsa_client.obtain_real_fits_for_coordinates(10.0, 20.0, 0.05, max_epochs=2)
            self.assertEqual(len(frames), 2)
            self.assertEqual(dl_mock.call_count, 1)
            self.assertEqual(dl_mock.call_args.args[0]["cutout_url"], "https://example/cutout1")

    def test_iau_designation_and_star_planet_naming(self):
        desig = irsa_client.format_iau_designation(133.795129, -7.245147)
        self.assertEqual(desig, "SPHEREx J085510.8-071443")
        self.assertEqual(irsa_client.clean_astronomical_name("NAME Barnard's star"), "Barnard's Star")
        self.assertEqual(irsa_client.clean_astronomical_name("Barnard b"), "Barnard's Star b")
        category, kind, expl = irsa_client.translate_simbad_otype("BY*", "M4V", ["Barnard's Star b", "Barnard's Star c"])
        self.assertEqual(kind, "planet_host")
        self.assertIn("2 Exoplanetas", category)
        self.assertIn("Barnard's Star b", expl)


if __name__ == "__main__":
    unittest.main()
