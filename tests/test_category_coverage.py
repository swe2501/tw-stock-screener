import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("category_screen", Path(__file__).resolve().parents[1] / "api/screen.py")
screen = importlib.util.module_from_spec(spec)
spec.loader.exec_module(screen)

class Coverage(unittest.TestCase):
    def test_catalog_union_deduplicates_and_preserves_curated(self):
        screen._category_members_cache.update(ts=0, data=None)
        with patch.object(screen, "_fetch_theme_catalog", return_value={"themes": [{"name": "fixture concept", "codes": ["2330", "2330"]}]}):
            catalog = screen._category_members()
        self.assertEqual(catalog["fixture concept"], ["2330"])
        self.assertTrue(set(screen.THEME_MEMBERS).issubset(catalog))

    def test_one_member_and_more_than_forty_are_visible(self):
        quotes = {str(1000+i): {"close": 10, "pct": 1, "value": 100, "name": "fixture"} for i in range(45)}
        result = screen._theme_stats(quotes, {"single": ["1000"], "large": list(quotes)})
        self.assertEqual(result[0]["memberCount"], 1)
        self.assertEqual(len(result[1]["members"]), 45)
        self.assertEqual(result[1]["tradeValue"], 4500)

    def test_industry_excludes_non_equities_and_keeps_otc(self):
        with patch.object(screen, "_get_industry_map", return_value={"2330": "半導體業", "6488": "半導體業", "9999": "其他"}):
            result = screen._sectors_from([("2330", 110, 100, 1000), ("6488", 90, 100, 1000), ("0050", 100, 100, 1), ("9999", 10, 10, 1)], "2026-10-23")
        self.assertEqual(result["total"], 3)
        self.assertEqual(result["category_version"], 2)
        self.assertEqual(result["sectors"][0]["count"], 2)
        self.assertIn("其他業", [r["sector"] for r in result["sectors"]])

    def test_official_backup_has_both_markets(self):
        self.assertGreater(len(screen._STOCK_INDUSTRY), 1800)
        self.assertGreaterEqual(len(set(screen._STOCK_INDUSTRY.values())), 35)
        self.assertIn("2330", screen._STOCK_INDUSTRY)
        self.assertIn("6488", screen._STOCK_INDUSTRY)

    def test_membership_and_heatmap_caches_are_independent(self):
        with patch.object(screen, "SUPABASE_URL", ""), patch.object(screen, "_get_industry_map", return_value={"2330": "半導體業"}):
            screen._membership_cache = {}
            screen._load_stock_themes()
        self.assertIn("data", screen._themes_cache)

if __name__ == "__main__":
    unittest.main()
