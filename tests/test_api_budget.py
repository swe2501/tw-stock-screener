import importlib.util
import json
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("api_budget", ROOT / "scripts/check_api_budget.py")
budget = importlib.util.module_from_spec(spec)
spec.loader.exec_module(budget)


class ApiBudgetTest(unittest.TestCase):
    def test_repo_is_within_twelve_and_search_has_no_separate_function(self):
        paths = budget.check()
        self.assertEqual(len(paths), 12)
        self.assertIn("api/prices.py", paths)
        self.assertNotIn("api/site_search.py", paths)

    def test_thirteenth_entry_is_rejected_but_static_files_do_not_count(self):
        with TemporaryDirectory() as temp:
            root = Path(temp)
            (root / "api").mkdir()
            (root / "assets").mkdir()
            config = {"builds": [{"src": "api/*.py", "use": "@vercel/python"},
                                  {"src": "assets/**", "use": "@vercel/static"}]}
            (root / "vercel.json").write_text(json.dumps(config))
            for i in range(12):
                (root / f"api/f{i}.py").write_text("# fixture")
                (root / f"assets/a{i}.js").write_text("// static")
            self.assertEqual(len(budget.check(root)), 12)
            (root / "api/new.py").write_text("# thirteenth fixture")
            with self.assertRaisesRegex(ValueError, "13/12"):
                budget.check(root)

    def test_unknown_build_model_fails_instead_of_claiming_zero_functions(self):
        with TemporaryDirectory() as temp:
            root = Path(temp)
            for config in ({}, {"builds": [{"src": "api/*.js", "use": "@vercel/node"}]}):
                (root / "vercel.json").write_text(json.dumps(config))
                with self.assertRaises(ValueError):
                    budget.check(root)


if __name__ == "__main__":
    unittest.main()
