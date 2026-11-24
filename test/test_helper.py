"""Checks the Python helper against test/fixtures/sample. Needs Django and DRF installed.

    python -m unittest test/test_helper.py
"""
import json
import os
import subprocess
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
HELPER = os.path.join(HERE, "..", "python", "fetchlens_routes.py")
SAMPLE = os.path.join(HERE, "fixtures", "sample")


def run(root=SAMPLE, *extra):
    out = subprocess.run(
        [sys.executable, HELPER, "--root", root, *extra],
        capture_output=True, text=True, check=True,
    ).stdout
    return json.loads(out.strip().splitlines()[-1])


class HelperTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.data = run()
        cls.by_pattern = {r["pattern"]: r for r in cls.data["routes"]}

    def route(self, pattern):
        self.assertIn(pattern, self.by_pattern, sorted(self.by_pattern))
        return self.by_pattern[pattern]

    def test_loads_without_error(self):
        self.assertNotIn("error", self.data)

    def test_class_based_view_methods(self):
        r = self.route("api/v1/cart/")
        self.assertEqual(r["methods"], ["GET", "POST"])  # HEAD/OPTIONS are implicit, not listed
        self.assertEqual(r["name"], "shop:cart")
        self.assertTrue(r["file"].endswith("views.py"))

    def test_require_post_function_view(self):
        self.assertEqual(self.route("api/v1/checkout/")["methods"], ["POST"])

    def test_api_view_decorator(self):
        r = self.route("api/v1/profile/")
        self.assertEqual(r["methods"], ["GET", "PUT"])
        # the handler must point at the user's function, not at DRF internals
        self.assertTrue(r["file"].endswith(os.path.join("shop", "views.py")), r["file"])

    def test_viewset_actions_map_to_methods_and_lines(self):
        listing = self.route("api/v1/products/")
        self.assertEqual(listing["methods"], ["GET", "POST"])
        self.assertEqual(listing["handlers"]["GET"]["name"], "ProductViewSet.list")
        self.assertEqual(listing["handlers"]["POST"]["name"], "ProductViewSet.create")
        self.assertNotEqual(listing["handlers"]["GET"]["line"], listing["handlers"]["POST"]["line"])
        detail = self.route("api/v1/products/<pk>/")
        self.assertEqual(detail["methods"], ["GET"])

    def test_regex_route_is_flagged_and_regex_is_joined(self):
        r = self.route("api/v1/legacy/<year>/")
        self.assertTrue(r["isRegex"])
        self.assertTrue(r["regex"].startswith("^api/v1/"), r["regex"])

    def test_drf_format_suffix_duplicates_are_dropped(self):
        self.assertFalse([p for p in self.by_pattern if "format" in p or "^" in p or "$" in p], sorted(self.by_pattern))

    def test_project_routes_are_not_external(self):
        self.assertFalse(self.route("api/v1/cart/")["external"])

    def test_missing_settings_reports_an_error_instead_of_crashing(self):
        bad = run(SAMPLE, "--settings", "no.such.settings")
        self.assertIn("error", bad)


if __name__ == "__main__":
    unittest.main()
