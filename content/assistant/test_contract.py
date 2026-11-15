"""Regresiones del contenido portable; solo necesitan la biblioteca estándar.

Comprueban el catálogo y su validador, no el chat ni un futuro adaptador.
Los documentos alterados para probar errores viven únicamente en memoria.
"""

from copy import deepcopy
import importlib.util
import json
from pathlib import Path
import unittest
from unittest.mock import patch


ROOT = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location("assistant_content_validator", ROOT / "validate.py")
validator = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(validator)


class PortableContentTests(unittest.TestCase):
    def setUp(self):
        self.documents = {
            name: json.loads((ROOT / name).read_text(encoding="utf-8"))
            for name in ("catalog.json", "sources.json", "demo-scenarios.json")
        }
        self.entries = {entry["id"]: entry for entry in self.documents["catalog.json"]["entries"]}

    def applicable(self, entry_id, **states):
        """Evalúa solo las condiciones declaradas, sin simular el motor del chat."""
        return all(states.get(key) in options for key, options in self.entries[entry_id]["when"].items())

    def rejected(self, message):
        with patch.object(validator, "read", side_effect=lambda name: deepcopy(self.documents[name])):
            with self.assertRaisesRegex(ValueError, message):
                validator.validate_package()

    def test_current_package_is_valid(self):
        result = validator.validate_package()
        self.assertEqual(result["entries"], len(self.entries))

    def test_loading_or_missing_field_excludes_result_answers(self):
        for field in ("unknown", "none", "loading"):
            for entry_id in ("field_summary", "no_candidates", "candidate_motion", "photometry_ready"):
                with self.subTest(field=field, entry=entry_id):
                    self.assertFalse(self.applicable(
                        entry_id, field_state=field, comparison_state="available",
                        detection_state="none", candidate_state="selected",
                        candidate_kind="motion", photometry_state="ready",
                    ))

    def test_no_candidates_requires_a_completed_available_comparison(self):
        for comparison in ("unknown", "unavailable", "available"):
            for detections in ("unknown", "none", "present"):
                with self.subTest(comparison=comparison, detections=detections):
                    self.assertEqual(self.applicable(
                        "no_candidates", field_state="ready", comparison_state=comparison,
                        detection_state=detections,
                    ), comparison == "available" and detections == "none")

    def test_unknown_and_unavailable_comparisons_have_distinct_answers(self):
        for state, expected in (("unknown", "comparison_unknown"), ("unavailable", "comparison_unavailable")):
            for entry_id in ("comparison_unknown", "comparison_unavailable", "no_candidates"):
                with self.subTest(state=state, entry=entry_id):
                    self.assertEqual(self.applicable(
                        entry_id, field_state="ready", comparison_state=state, detection_state="none",
                    ), entry_id == expected)
        reason = self.entries["comparison_unavailable_reason"]
        self.assertIn("comparison_reason", reason["requires"])
        self.assertIn("comparison_unavailable", reason["fallback_ids"])

    def test_candidate_details_require_selection_and_reported_kind(self):
        for selection in ("none", "selected"):
            for kind in ("unknown", "motion", "variability"):
                for entry_id, expected_kind in (("candidate_motion", "motion"), ("candidate_variability", "variability")):
                    with self.subTest(selection=selection, kind=kind, entry=entry_id):
                        self.assertEqual(self.applicable(
                            entry_id, field_state="ready", candidate_state=selection, candidate_kind=kind,
                        ), selection == "selected" and kind == expected_kind)
                    self.assertIn("candidate_id", self.entries[entry_id]["requires"])
                    self.assertIn("candidate_generic", self.entries[entry_id]["fallback_ids"])

    def test_photometry_ready_empty_and_pending_are_distinct(self):
        for state in ("unknown", "loading", "empty", "ready"):
            expected = "photometry_ready" if state == "ready" else "photometry_empty" if state == "empty" else "photometry_pending"
            for entry_id in ("photometry_pending", "photometry_empty", "photometry_ready"):
                with self.subTest(state=state, entry=entry_id):
                    self.assertEqual(self.applicable(
                        entry_id, field_state="ready", photometry_state=state,
                    ), entry_id == expected)
        self.assertIn("measurement_unit", self.entries["photometry_ready"]["requires"])
        self.assertIn("photometry_generic", self.entries["photometry_ready"]["fallback_ids"])

    def test_counts_allow_zero_but_answers_require_supplied_values(self):
        values = self.documents["catalog.json"]["context_contract"]["values"]
        for name, entry_id in (("loaded_frame_count", "field_summary"),
                               ("candidate_count", "candidates_available"),
                               ("measurement_count", "photometry_ready")):
            with self.subTest(value=name):
                self.assertEqual(values[name]["type"], "integer")
                self.assertEqual(values[name]["minimum"], 0)
                self.assertNotIn("default", values[name], "Un dato ausente no tiene un cero por defecto")
                self.assertIn(name, self.entries[entry_id]["requires"])
                for answer in self.entries[entry_id]["answers"].values():
                    self.assertIn("{{" + name + "}}", answer["summary"] + answer["detail"])

    def test_duplicate_response_id_is_rejected(self):
        self.documents["catalog.json"]["entries"].append(deepcopy(self.entries["mission"]))
        self.rejected("ID duplicado")

    def test_broken_source_reference_is_rejected(self):
        self.entries["mission"]["source_ids"] = ["missing_source"]
        self.rejected("referencia desconocida missing_source")

    def test_unknown_state_value_is_rejected(self):
        self.entries["no_candidates"]["when"]["comparison_state"] = ["almost_ready"]
        self.rejected("valor de condición inválido")

    def test_variable_without_requirement_is_rejected(self):
        self.entries["mission"]["answers"]["simple"]["detail"] += " {{candidate_count}}"
        self.rejected("variables y requisitos no coinciden")

    def test_fallback_cycle_is_rejected(self):
        self.entries["field_generic"]["fallback_ids"] = ["field_summary"]
        self.rejected("Ciclo de alternativas")

    def test_action_that_runs_scientific_work_is_rejected(self):
        self.documents["catalog.json"]["actions"][0]["effect"] = "download_fits"
        self.rejected("efecto fuera del alcance")

    def test_action_without_explicit_click_is_rejected(self):
        self.documents["catalog.json"]["actions"][0]["requires_explicit_click"] = False
        self.rejected("falta interacción explícita")

    def test_official_reference_requires_its_scope_limit(self):
        source = next(s for s in self.documents["sources.json"]["sources"] if s["kind"] == "official_reference")
        source.pop("does_not_support")
        self.rejected("falta el límite de la referencia")


if __name__ == "__main__":
    unittest.main()
