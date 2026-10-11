import sys
import unittest
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "api"))
from pc_ratio import parse_ratio

HEADER = '<tr><th>日期</th><th>賣權成交量</th><th>買權成交量</th><th>買賣權成交量比率%</th><th>賣權未平倉量</th><th>買權未平倉量</th><th>買賣權未平倉量比率%</th></tr>'


def row(day, ratio="80.18", call="87,550"):
    return '<tr>' + ''.join('<td>' + v + '</td>' for v in [day, "130,442", "149,694", "87.14", "70,195", call, ratio]) + '</tr>'


class RatioTests(unittest.TestCase):
    def test_official_percentage_not_volume_ratio(self):
        result = parse_ratio(HEADER + row("2026/10/8"), date(2026, 10, 11))
        self.assertEqual(result["ratio_pct"], 80.18)
        self.assertEqual(result["trade_date"], "2026-10-08")

    def test_latest_valid_day_and_future_exclusion(self):
        result = parse_ratio(HEADER + row("2026/10/7") + row("2026/10/12") + row("2026/10/8"), date(2026, 10, 11))
        self.assertEqual(result["trade_date"], "2026-10-08")

    def test_bad_data_does_not_become_zero(self):
        for content in [row("2026/10/8"), HEADER + row("2026/10/8", "0"), HEADER + row("2026/10/8", call="0")]:
            with self.assertRaises(ValueError):
                parse_ratio(content, date(2026, 10, 11))
