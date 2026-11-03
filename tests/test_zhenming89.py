import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "api"))
import screen  # noqa: E402


def day(i):
    return f"2026-{1 + i // 28:02d}-{1 + i % 28:02d}"


def build(closes, vols=None, opens=None):
    bars = []
    for i, c in enumerate(closes):
        o = opens[i] if opens and opens[i] is not None else c
        hi, lo = max(o, c) * 1.005, min(o, c) * 0.995
        v = vols[i] if vols else 1000
        bars.append((day(i), o, hi, lo, c, v))
    return bars


def box_closes(n=70, lo=100.0, hi=108.0):
    return [lo + (hi - lo) * ((i % 10) / 9) for i in range(n)]


class Zhenming8Tests(unittest.TestCase):
    def setUp(self):
        self.base = box_closes()            # 箱型 100～108，振幅 8%

    def test_false_breakdown_reclaimed_within_21_days(self):
        closes = self.base + [99.0, 98.5, 97.0, 98.0]       # 跌破下緣 100 四天
        opens = [None] * len(closes)
        closes.append(103.0); opens.append(99.0)            # 今天長紅 ≥3% 站回
        vols = [1000] * (len(closes) - 1) + [2500]
        z = screen.zhenming8_at(build(closes, vols, opens), 10)
        self.assertIsNotNone(z)
        self.assertEqual(z["lower"], 100.0)
        self.assertEqual(z["days"], 4)
        self.assertEqual(z["target1"], 108.0)
        self.assertGreater(z["vol_ratio"], 2)

    def test_amplitude_limit(self):
        closes = self.base + [99.0, 98.5]
        opens = [None] * len(closes)
        closes.append(103.0); opens.append(99.0)
        vols = [1000] * (len(closes) - 1) + [2500]
        self.assertIsNone(screen.zhenming8_at(build(closes, vols, opens), 5))

    def test_too_late_reclaim_fails(self):
        closes = self.base + [99.0] * 22
        opens = [None] * len(closes)
        closes.append(103.0); opens.append(99.0)
        vols = [1000] * (len(closes) - 1) + [2500]
        self.assertIsNone(screen.zhenming8_at(build(closes, vols, opens), 10))

    def test_needs_volume(self):
        closes = self.base + [99.0, 98.5]
        opens = [None] * len(closes)
        closes.append(103.0); opens.append(99.0)
        self.assertIsNone(screen.zhenming8_at(build(closes, None, opens), 10))


class Zhenming9Tests(unittest.TestCase):
    def setUp(self):
        self.base = box_closes()

    def test_low_volume_breakout_falls_back(self):
        closes = self.base + [109.5, 110.0, 109.0, 106.0]   # 量縮突破 108，今天跌回
        vols = [1000] * len(self.base) + [900, 800, 800, 1500]
        z = screen.zhenming9_at(build(closes, vols), 10)
        self.assertIsNotNone(z)
        self.assertEqual(z["upper"], 108.0)
        self.assertEqual(z["days"], 3)
        self.assertEqual(z["target"], 100.0)

    def test_high_volume_breakout_is_not_false(self):
        closes = self.base + [109.5, 110.0, 106.0]
        vols = [1000] * len(self.base) + [2500, 800, 1500]
        self.assertIsNone(screen.zhenming9_at(build(closes, vols), 10))

    def test_still_above_upper_fails(self):
        closes = self.base + [109.5, 110.0, 109.0]
        vols = [1000] * len(self.base) + [900, 800, 800]
        self.assertIsNone(screen.zhenming9_at(build(closes, vols), 10))

    def test_amp_param_validation(self):
        self.assertIsNone(screen.zm89_amp("abc"))
        self.assertIsNone(screen.zm89_amp(80))
        self.assertEqual(screen.zm89_amp("12.5"), 12.5)
        r = screen.screen({"zhenming8": {"enabled": True, "amp": 0}})
        self.assertIn("error", r)


if __name__ == "__main__":
    unittest.main()


class BoxDaysTests(unittest.TestCase):
    def test_box_days_param(self):
        self.assertEqual(screen.zm89_box_days(None), 60)
        self.assertEqual(screen.zm89_box_days(240), 240)
        self.assertIsNone(screen.zm89_box_days(241))
        self.assertIsNone(screen.zm89_box_days(19))
        self.assertIsNone(screen.zm89_box_days(30.5))
        r = screen.screen({"zhenming9": {"enabled": True, "amp": 10, "box_days": 300}})
        self.assertIn("整理期間", r.get("error", ""))

    def test_short_box_finds_recent_box(self):
        closes = [80 + i for i in range(40)] + box_closes(45) + [99.0, 98.5]
        opens = [None] * len(closes)
        closes.append(103.0); opens.append(99.0)
        vols = [1000] * (len(closes) - 1) + [2500]
        bars = build(closes, vols, opens)
        self.assertIsNone(screen.zhenming8_at(bars, 10))                 # 60 日箱型含前段上漲，振幅過大
        z = screen.zhenming8_at(bars, 10, box_days=40)
        self.assertIsNotNone(z)
        self.assertEqual(z["box_days"], 40)


class WithinTests(unittest.TestCase):
    def test_within_choices(self):
        closes = box_closes() + [99.0] * 12
        opens = [None] * len(closes)
        closes.append(103.0); opens.append(99.0)
        vols = [1000] * (len(closes) - 1) + [2500]
        bars = build(closes, vols, opens)
        self.assertIsNone(screen.zhenming8_at(bars, 10, within=10))
        self.assertIsNotNone(screen.zhenming8_at(bars, 10, within=21))
        r = screen.screen({"zhenming8": {"enabled": True, "amp": 10, "within": 15}})
        self.assertIn("站回期限", r.get("error", ""))
