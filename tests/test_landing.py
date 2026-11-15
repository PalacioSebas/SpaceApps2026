import json
import unittest

from fastapi.testclient import TestClient

from src import main
from src.config import STATIC_DIR

LANDING_DIR = STATIC_DIR / "landing"


class LandingTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(main.app)

    def test_main_serves_landing_with_fresh_assets(self):
        response = self.client.get("/main")
        self.assertEqual(response.status_code, 200)
        self.assertIn("text/html", response.headers["content-type"])
        self.assertIn("no-store", response.headers["cache-control"])
        self.assertIn('id="timeline"', response.text)
        for asset in ("landing.css", "landing.js"):
            bust = (LANDING_DIR / asset).stat().st_mtime_ns
            self.assertIn(f"/static/landing/{asset}?v={bust}", response.text)

    def test_landing_assets_are_served(self):
        for path in ("landing.css", "landing.js", "desarrollo.json"):
            with self.subTest(path=path):
                self.assertEqual(self.client.get(f"/static/landing/{path}").status_code, 200)

    def test_development_log_is_valid(self):
        data = json.loads((LANDING_DIR / "desarrollo.json").read_text(encoding="utf-8"))
        self.assertIsInstance(data["entradas"], list)
        for entry in data["entradas"]:
            with self.subTest(titulo=entry.get("titulo")):
                self.assertTrue(entry.get("titulo"))
                for image in entry.get("imagenes", []):
                    self.assertTrue(image.get("src") or image.get("pendiente"))
                    src = image.get("src", "")
                    if src and not src.startswith(("/", "http://", "https://")):
                        self.assertTrue((LANDING_DIR / src).is_file(), f"Falta la imagen {src}")


if __name__ == "__main__":
    unittest.main()
