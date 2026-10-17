import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("chart", Path(__file__).resolve().parents[1] / "api/chart.py")
chart = importlib.util.module_from_spec(spec)
spec.loader.exec_module(chart)


def quote(session, price, month="202610", day="20261016", **extra):
    return {"Contract": "TX", "Date": day, "ContractMonth(Week)": month,
            "TradingSession": session, "Last": price, **extra}


class SessionQuotesTest(unittest.TestCase):
    def test_same_near_month_and_separate_prices(self):
        rows = [quote("一般", "47,242"), quote("盤後", "47366"),
                quote("一般", "47386", "202611"), quote("盤後", "47400", "202611"),
                quote("一般", "99999", "202610/202611"), quote("一般", "88888", Contract="MTX")]
        out = chart._tx_session_quotes(rows)
        self.assertEqual(out["day"]["price"], 47242)
        self.assertEqual(out["night"]["price"], 47366)
        self.assertEqual(out["night"]["date"], "2026-10-16")
        self.assertEqual(out["day"]["contractMonth"], out["night"]["contractMonth"])

    def test_missing_session_cannot_fall_back_to_old_or_other_contract(self):
        rows = [quote("一般", "47242"), quote("夜盤", "47000", day="20261015"),
                quote("盤後", "47400", month="202611")]
        self.assertIsNone(chart._tx_session_quotes(rows)["night"])

    def test_invalid_quotes_dates_and_expired_contracts_are_discarded(self):
        rows = [quote("一般", value) for value in ["NULL", "-", "NaN", "Infinity", "0", "-1", None]]
        rows += [quote("一般", "40000", day="20261301"), quote("一般", "40000", month="202609"),
                 quote("一般", "40000", month="202613"), {}, None]
        self.assertEqual(chart._tx_session_quotes(rows), {"day": None, "night": None})

    def test_session_route_has_no_proxy_fallback_and_validates_parameters(self):
        handler = object.__new__(chart.handler)
        handler._json = lambda status, body, **kwargs: setattr(handler, "result", (status, body))
        with patch.object(chart, "fetch_tx_sessions", side_effect=RuntimeError("unavailable")), patch.object(chart, "fetch_chart") as other:
            handler.path = "/api/chart?code=TX%3DF&session=split"
            handler.do_GET()
            self.assertEqual(handler.result[0], 502)
            other.assert_not_called()
        for query in ["code=2330&session=split", "code=TX%3DF&session=night", "code=TX%3DF&session=split&interval=5m"]:
            handler.path = "/api/chart?" + query
            handler.do_GET()
            self.assertEqual(handler.result[0], 400)


if __name__ == "__main__":
    unittest.main()
