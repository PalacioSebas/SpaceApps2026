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


if __name__ == "__main__":
    unittest.main()
