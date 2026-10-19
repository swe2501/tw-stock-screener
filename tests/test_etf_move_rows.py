import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from etf_move_rows import build_holdings_rows


class ETFMoveTests(unittest.TestCase):
    def test_new_removed_and_changed(self):
        data = {"stockHoldings": [{"stockCode": "2330", "shares": 120}, {"stockCode": "1301", "shares": 50}],
                "previousStockHoldings": [{"stockCode": "2330", "shares": 100}, {"stockCode": "2303", "shares": 30}]}
        rows = {r["stock_code"]: r for r in build_holdings_rows("0056", data, "2026-10-08")}
        self.assertEqual(rows["2330"]["delta_shares"], 20)
        self.assertEqual(rows["1301"]["delta_shares"], 50)
        self.assertEqual((rows["2303"]["shares"], rows["2303"]["delta_shares"]), (0, -30))

    def test_missing_previous_is_unknown(self):
        rows = build_holdings_rows("0056", {"stockHoldings": [{"stockCode": "2330", "shares": 100}]}, "2026-10-08")
        self.assertIsNone(rows[0]["delta_shares"])

    def test_empty_current_does_not_invent_removals(self):
        self.assertEqual(build_holdings_rows("0056", {"previousStockHoldings": [{"stockCode": "2330", "shares": 100}]}, "2026-10-08"), [])
