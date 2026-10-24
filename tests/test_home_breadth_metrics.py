import importlib.util
import math
from pathlib import Path
import unittest
from unittest.mock import patch
spec = importlib.util.spec_from_file_location("breadth_screen", Path(__file__).resolve().parents[1] / "api/screen.py")
screen = importlib.util.module_from_spec(spec)
spec.loader.exec_module(screen)

class HomeBreadthTests(unittest.TestCase):
    def test_median_counts_missing_and_zero(self):
        r=screen._home_breadth_metrics([-10,-2,0,2,10,None,float("nan"),float("inf"),True,"3"],"2026-10-23")
        self.assertEqual(r["median_pct"],0)
        self.assertEqual(r["net_count"],0)
        self.assertEqual(r["sample_count"],5)
        self.assertEqual((r["up"],r["down"],r["flat"]),(2,2,1))
        self.assertEqual((r["up_limit"],r["down_limit"]),(1,1))
        self.assertEqual(screen._home_breadth_metrics([-4,2],"2026-10-23")["median_pct"],-1)
        self.assertIsNone(screen._home_breadth_metrics([],"2026-10-23"))
        self.assertIsNone(screen._home_breadth_metrics([0],None))
    def test_dates(self):
        for d in ["1151023","20261023","2026-10-23","115/10/23"]:
            self.assertEqual(screen._home_breadth_date(d),"2026-10-23")
        self.assertIsNone(screen._home_breadth_date("20260230"))
    def test_market_isolation_and_date_alignment(self):
        stocks={"a":{"close":90,"prev_close":100},"b":{"close":110,"prev_close":100},"missing":{"close":100,"prev_close":None},"zero":{"close":0,"prev_close":100}}
        quotes={"a":{"pct":-4,"trade_date":"2026-10-23","valid_change":True},"b":{"pct":-2,"trade_date":"2026-10-23","valid_change":True},"stale":{"pct":10,"trade_date":"2026-10-22","valid_change":True},"invalid":{"pct":0,"trade_date":"2026-10-23","valid_change":False}}
        with patch.object(screen,"_fetch_tpex_quotes",return_value=quotes): r=screen._home_breadth_details(stocks,"20261023")
        self.assertEqual(r["listed"]["sample_count"],2)
        self.assertEqual(r["listed"]["net_count"],0)
        self.assertEqual(r["otc"]["median_pct"],-3)
        self.assertEqual(r["otc"]["net_count"],-2)
        self.assertEqual(r["otc"]["sample_count"],2)

if __name__ == "__main__": unittest.main()
