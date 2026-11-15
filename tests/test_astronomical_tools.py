"""VOTable exports use an isolated router and patched backend, without network/FITS."""

from io import BytesIO
import base64
import unittest
from unittest.mock import patch
from xml.etree import ElementTree

import numpy as np
from astropy.io.votable import parse
from fastapi import FastAPI
from fastapi.testclient import TestClient

from src.astronomical_tools import MAX_CATALOG_ROWS, router


class CatalogExportTests(unittest.TestCase):
    def setUp(self):
        self.app = FastAPI()
        self.app.include_router(router)
        self.client = TestClient(self.app)
        self.query = patch("src.astronomical_tools.query_catalog_field").start()
        self.addCleanup(patch.stopall)
        self.query.return_value = {"catalog": "gaia", "sources": [], "truncated": False, "service": "Test backend", "version": 2}

    def get_export(self, **params):
        return self.client.get("/api/tools/catalog.vot", params={"catalog": "gaia", "ra": 10, "dec": -20, "fov": 0.05, **params})

    def read(self, response):
        self.assertEqual(response.status_code, 200, response.text[:300])
        votable = parse(BytesIO(response.content), verify="exception")
        resource = votable.resources[0]
        return resource.tables[0].to_table(), resource, votable

    def metadata(self, resource):
        return {item.name: item.value for item in [*resource.params, *resource.infos]}

    def binary_id_masks(self, response):
        # Astropy's BINARY2 reader intentionally ignores null flags for string
        # columns (issue 8995). Verify the real serialized flags independently.
        root = ElementTree.fromstring(response.content)
        fields = [node for node in root.iter() if node.tag.endswith("}FIELD")]
        stream = next(node for node in root.iter() if node.tag.endswith("}STREAM"))
        data = base64.b64decode(stream.text or "")
        mask_bytes = (len(fields) + 7) // 8
        row_size = mask_bytes + sum(2 * int(field.attrib["arraysize"]) if field.attrib["datatype"] == "unicodeChar" else 8 for field in fields)
        return [bool(data[offset] & 0x80) for offset in range(0, len(data), row_size)]

    def test_empty_table_is_valid_and_metadata_does_not_claim_completeness(self):
        response = self.get_export()
        table, resource, _ = self.read(response)
        self.assertEqual(len(table), 0)
        self.assertEqual(table.colnames, ["source_id", "ra", "dec", "mag", "pmra", "pmdec"])
        metadata = self.metadata(resource)
        self.assertEqual(metadata["backend_service"], "Test backend")
        self.assertEqual(metadata["backend_truncated"], "false")
        self.assertEqual(metadata["completeness"], "not_verified")
        self.assertEqual(metadata["reference_epoch"], "not_supplied_by_backend")
        self.assertEqual(metadata["catalog_release"], "not_supplied_by_backend")
        self.assertEqual(metadata["astrometric_uncertainties"], "not_supplied_by_backend")
        self.assertEqual(metadata["rows_exported"], "0")
        self.assertEqual(response.headers["content-type"], "application/x-votable+xml")
        self.assertIn('filename="papastronomy_gaia_ra10.000000_dec-20.000000_fov0.050000.vot"', response.headers["content-disposition"])
        self.query.assert_called_once_with("gaia", 10.0, -20.0, 0.05)

    def test_exact_ids_units_ucds_and_optional_masks_round_trip(self):
        exact_id = 9223372036854775807
        self.query.return_value["sources"] = [
            {"id": str(exact_id), "ra": 0, "dec": 0, "mag": 0, "pmra": 0, "pmdec": None},
            {"id": exact_id - 1, "ra": 360, "dec": 90, "mag": None, "pmra": float("nan"), "pmdec": -12.5},
            {"id": float(exact_id), "ra": 10, "dec": -90, "mag": float("inf")},
        ]
        response = self.get_export()
        table, resource, _ = self.read(response)
        self.assertEqual(table["source_id"][0], str(exact_id))
        self.assertEqual(table["source_id"][1], str(exact_id - 1))
        self.assertEqual(table["source_id"][2], "", "A lossy floating identifier must not become an invented exact ID")
        self.assertEqual(self.binary_id_masks(response), [False, False, True])
        self.assertEqual(self.metadata(resource)["unavailable_identifier_rows"], "1")
        self.assertEqual(float(table["ra"][0]), 0)
        self.assertEqual(float(table["mag"][0]), 0)
        self.assertFalse(table["mag"].mask[0])
        self.assertTrue(table["mag"].mask[1])
        self.assertTrue(table["mag"].mask[2])
        self.assertTrue(table["pmra"].mask[1])
        self.assertTrue(table["pmdec"].mask[0])
        self.assertEqual(float(table["pmdec"][1]), -12.5)
        fields = {field.name: field for field in resource.tables[0].fields}
        self.assertEqual(fields["ra"].ucd, "pos.eq.ra;meta.main")
        self.assertEqual(fields["dec"].ucd, "pos.eq.dec;meta.main")
        self.assertEqual(str(table["ra"].unit), "deg")
        self.assertEqual(str(table["mag"].unit), "mag")
        self.assertEqual(str(table["pmra"].unit), "mas / yr")
        self.assertEqual(str(table["pmdec"].unit), "mas / yr")
        self.assertIsNot(table["pmra"], table["pmdec"])

    def test_invalid_coordinates_are_omitted_without_zero_substitution(self):
        self.query.return_value["sources"] = [
            {"id": "valid", "ra": 12, "dec": -3},
            {"id": "none", "ra": None, "dec": 0},
            {"id": "nan", "ra": float("nan"), "dec": 0},
            {"id": "inf", "ra": 0, "dec": float("inf")},
            {"id": "out_ra", "ra": -0.1, "dec": 0},
            {"id": "out_dec", "ra": 5, "dec": 90.1},
            {"id": "bad", "ra": "not a coordinate", "dec": 0},
            {"id": "bool", "ra": True, "dec": 0},
            None,
        ]
        response = self.get_export()
        table, resource, _ = self.read(response)
        self.assertEqual(len(table), 1)
        self.assertEqual(table["source_id"][0], "valid")
        self.assertEqual(table["ra"][0], 12)
        metadata = self.metadata(resource)
        self.assertEqual(metadata["invalid_position_rows_omitted"], "8")
        self.assertEqual(metadata["backend_rows_returned"], "9")

    def test_allwise_motion_is_labelled_apparent_and_service_is_escaped(self):
        self.query.return_value.update(service='Caché vecina <& "mirror">', truncated=True, sources=[
            {"id": "J1234+5678", "ra": 12.5, "dec": 56.7, "pmra": 2, "pmdec": 3},
        ])
        table, resource, _ = self.read(self.get_export(catalog="allwise"))
        metadata = self.metadata(resource)
        self.assertEqual(metadata["backend_service"], 'Caché vecina <& "mirror">')
        self.assertEqual(metadata["motion_kind"], "apparent_catalog_motion")
        self.assertEqual(metadata["backend_truncated"], "true")
        self.assertEqual({info.name: info.value for info in resource.infos}["QUERY_STATUS"], "OVERFLOW")
        for column in ("pmra", "pmdec"):
            self.assertIn("Apparent catalog motion", table[column].description)
            self.assertIn("not interchangeable with Gaia proper motion", table[column].description)

    def test_export_cap_is_explicit_and_does_not_mutate_backend_rows(self):
        sources = [{"id": str(index), "ra": 10, "dec": 20} for index in range(MAX_CATALOG_ROWS + 5)]
        self.query.return_value.update(sources=sources, truncated=False)
        table, resource, _ = self.read(self.get_export())
        metadata = self.metadata(resource)
        self.assertEqual(len(table), MAX_CATALOG_ROWS)
        self.assertEqual(len(sources), MAX_CATALOG_ROWS + 5)
        self.assertEqual(sources[0], {"id": "0", "ra": 10, "dec": 20})
        self.assertEqual(metadata["backend_truncated"], "false")
        self.assertEqual(metadata["export_cap_applied"], "true")
        self.assertEqual(metadata["backend_rows_returned"], str(MAX_CATALOG_ROWS + 5))
        self.assertEqual({info.name: info.value for info in resource.infos}["QUERY_STATUS"], "OVERFLOW")

    def test_absent_backend_metadata_remains_unknown(self):
        self.query.return_value = {"sources": [{"ra": 10, "dec": -20}]}
        response = self.get_export()
        table, resource, _ = self.read(response)
        metadata = self.metadata(resource)
        self.assertEqual(metadata["backend_truncated"], "not_supplied")
        self.assertEqual(metadata["backend_service"], "not_supplied")
        self.assertEqual(metadata["completeness"], "not_verified")
        self.assertEqual(table["source_id"][0], "")
        self.assertEqual(self.binary_id_masks(response), [True])

    def test_bounds_reject_before_catalog_query(self):
        for params in ({"catalog": "2mass"}, {"ra": -1}, {"ra": 360.1}, {"dec": -90.1}, {"dec": 91},
                       {"fov": 0.005}, {"fov": 1.01}, {"ra": "nan"}, {"fov": "inf"}):
            with self.subTest(params=params):
                self.assertEqual(self.get_export(**params).status_code, 422)
        self.query.assert_not_called()

    def test_backend_failure_returns_safe_502(self):
        self.query.side_effect = RuntimeError("private backend URL with sensitive details")
        response = self.get_export()
        self.assertEqual(response.status_code, 502)
        self.assertNotIn("private backend", response.text)
        self.assertIn("No se pudo exportar", response.json()["detail"])

    def test_malformed_backend_response_returns_safe_502(self):
        self.query.return_value = {"sources": "invalid"}
        response = self.get_export()
        self.assertEqual(response.status_code, 502)
        self.assertNotIn("Invalid backend", response.text)


if __name__ == "__main__":
    unittest.main()
