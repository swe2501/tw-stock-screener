import importlib.util
import pathlib
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("vix_chart", pathlib.Path(__file__).parents[1] / "api/chart.py")
chart = importlib.util.module_from_spec(spec)
spec.loader.exec_module(chart)


class VixIntradayTests(unittest.TestCase):
    def test_five_minute_ohlc_and_utc_timestamps(self):
        data = chart.parse_vix_intraday("20261022 9001500 29.24\n20261022 9000000 29.28\n20261022 9044500 29.10\n20261022 9050000 30.0", "2026-10-22")
        self.assertEqual(data[0], {"time": 1792630800, "open": 29.28, "high": 29.28, "low": 29.1, "close": 29.1})
        self.assertEqual(data[1]["time"] - data[0]["time"], 300)

    def test_invalid_other_day_and_out_of_session_rows_do_not_leak(self):
        text = "20261021 9000000 99\n20261022 8990000 99\n20261022 24000000 99\n20261022 13500000 99\n20261022 9000000 nan\n20261022 9010000 0\n20261022 9020000 -1\n20261022 13450000 30.31\n<html>unavailable</html>"
        data = chart.parse_vix_intraday(text, "2026-10-22")
        self.assertEqual(len(data), 1)
        self.assertEqual(data[0]["close"], 30.31)

    def test_bad_query_never_contacts_upstream(self):
        for query in ["code=TAIWANVIX", "code=TAIWANVIX&date=2026-99-22&interval=5m", "code=TAIWANVIX&date=2026-10-22&interval=1d"]:
            h = object.__new__(chart.handler)
            h.path = "/api/chart?" + query
            replies = []
            h._json = lambda code, data, **kw: replies.append(code)
            with patch.object(chart, "fetch_vix_intraday") as fetch:
                h.do_GET()
                fetch.assert_not_called()
            self.assertEqual(replies, [400])

    def test_empty_page_is_not_fabricated(self):
        self.assertEqual(chart.parse_vix_intraday("<html>No file</html>", "2026-10-22"), [])


if __name__ == "__main__":
    unittest.main()
