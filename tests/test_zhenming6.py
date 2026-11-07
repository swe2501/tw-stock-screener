"""真名六式（空頭啟動）規則測試：人工 K 線，驗證核心條件與型態跌破。"""
import os, sys, unittest
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'api'))
import screen  # noqa: E402


def bars_from(closes, last_black=None):
    """依收盤路徑造 K 線：開盤＝前收，高低各加減 0.3；last_black=(開, 收) 覆寫最後一根。"""
    out, prev = [], closes[0]
    for i, c in enumerate(closes):
        o = prev
        out.append((f"2026-{(i // 28) % 12 + 1:02d}-{i % 28 + 1:02d}", o, max(o, c) + .3, min(o, c) - .3, c, 1000))
        prev = c
    if last_black:
        o, c = last_black
        d = out[-1][0]
        out[-1] = (d, o, o + .2, c - .2, c, 3000)
    return out


def lin(a, b, n):
    return [a + (b - a) * i / n for i in range(1, n + 1)]


class Zhenming6(unittest.TestCase):
    def test_core_without_pattern(self):
        path = [60] + lin(60, 100, 40) + lin(100, 92, 15)
        bars = bars_from(path + [91.5], last_black=(92, 88))
        r = screen.zhenming6_at(bars)
        self.assertIsNotNone(r)
        self.assertEqual(r["stop"], 92.2)
        self.assertNotIn("pattern", r)

    def test_black_below_threshold_fails(self):
        path = [60] + lin(60, 100, 40) + lin(100, 92, 15)
        bars = bars_from(path + [91.5], last_black=(92, 90.5))   # 1.66%
        self.assertIsNone(screen.zhenming6_at(bars))

    def test_bullish_alignment_fails(self):
        path = [60] + lin(60, 100, 40) + lin(100, 110, 10)
        bars = bars_from(path + [111], last_black=(111, 107))
        self.assertIsNone(screen.zhenming6_at(bars))

    def test_m_top_neckline_break(self):
        path = [60] + lin(60, 100, 30) + lin(100, 90, 8) + lin(90, 100, 8) + lin(100, 91, 12)
        bars = bars_from(path + [90.5], last_black=(91, 87))
        r = screen.zhenming6_at(bars, pattern="m_top")
        self.assertIsNotNone(r)
        self.assertEqual(r["pattern"], "M頭")
        self.assertLess(87, r["level"])
        self.assertIsNotNone(screen.zhenming6_at(bars, pattern="all"))

    def test_box_breakdown(self):
        osc = []
        for i in range(40):
            osc.append(95 + (4 if i % 8 < 4 else -4) * (1 if i % 2 else .6))
        path = [80] + lin(80, 96, 20) + osc + lin(95, 91.5, 8)
        bars = bars_from(path + [91.2], last_black=(91.2, 87.5))
        r = screen.zhenming6_at(bars, pattern="box")
        self.assertIsNotNone(r)
        self.assertEqual(r["pattern_key"], "box")

    def test_no_pattern_when_required(self):
        path = [60] + lin(60, 100, 40) + lin(100, 92, 15)
        bars = bars_from(path + [91.5], last_black=(92, 88))
        self.assertIsNone(screen.zhenming6_at(bars, pattern="hs_top"))

    def test_five_bar_largest_body_includes_red_and_excludes_shadows(self):
        bars=bars_from([60]+lin(60,100,40)+lin(100,92,15)+[91.5],last_black=(92,88))
        previous=bars[-2]
        # A prior red body's length blocks the new black body too.
        bars[-2]=(previous[0],previous[4]-5,previous[2],previous[3],previous[4],1000)
        self.assertIsNone(screen.zhenming6_at(bars))
        bars[-2]=previous
        bars[-2]=(previous[0],previous[1],150,10,previous[4],1000)
        self.assertIsNotNone(screen.zhenming6_at(bars))

    def test_equal_smaller_and_new_larger_signals(self):
        bars=bars_from([60]+lin(60,100,40)+lin(100,92,15)+[91.5],last_black=(92,88))
        first=screen.zhenming6_at(bars)
        self.assertIsNotNone(first)
        self.assertIsNone(screen.zhenming6_at(bars+[('2026-03-03',88,89,83,84,1000)])) # equal four-point body
        self.assertIsNone(screen.zhenming6_at(bars+[('2026-03-03',88,89,84,85,1000)])) # smaller, still >3%
        larger=screen.zhenming6_at(bars+[('2026-03-03',88,89,82,83,1000)])
        self.assertIsNotNone(larger)
        self.assertEqual(larger['rules_version'],2)
        self.assertEqual(larger['prior_max_body'],4)

    def test_window_has_four_preceding_bars_not_five(self):
        bars=bars_from([60]+lin(60,100,40)+lin(100,92,15)+[91.5],last_black=(92,88))
        old=bars[-6];bars[-6]=(old[0],old[4]+8,old[4]+9,old[4]-.3,old[4],1000)
        self.assertIsNotNone(screen.zhenming6_at(bars))
        self.assertIsNotNone(screen.zhenming6_at(bars+[('2026-03-03',99,100,70,71,1000)],t=len(bars)-1))

    def test_cover_season_flag(self):
        path = [60] + lin(60, 100, 40) + lin(100, 92, 15)
        bars = bars_from(path + [91.5], last_black=(92, 88))
        d = bars[-1]
        bars[-1] = ("2026-03-10",) + tuple(d[1:])
        self.assertTrue(screen.zhenming6_at(bars)["cover_season"])
        bars[-1] = ("2026-11-03",) + tuple(d[1:])
        self.assertFalse(screen.zhenming6_at(bars)["cover_season"])


if __name__ == "__main__":
    unittest.main()
