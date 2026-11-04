import importlib.util
from pathlib import Path
import sys
import types
import unittest


SCRAPER_STUB = types.ModuleType("wantgoo_scraper")
SCRAPER_STUB.LOCAL_DB_PATH = Path("unused-test-database.sqlite")
sys.modules.setdefault("wantgoo_scraper", SCRAPER_STUB)

SPEC = importlib.util.spec_from_file_location(
    "candle_combos", Path("scripts/candle_combos.py")
)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


def bars(rows):
    result = MODULE.Bars()
    for index, (open_, high, low, close, volume) in enumerate(rows):
        result.d.append(f"2026-01-{index + 1:02d}")
        result.o.append(open_)
        result.h.append(high)
        result.l.append(low)
        result.c.append(close)
        result.v.append(volume)
        result.seg.append(0)
        result.segstart.append(0)
    return result


class ThreeMethodsBodyContinuityTests(unittest.TestCase):
    def test_rising_three_accepts_touch_and_rejects_body_gap(self):
        prefix = [
            (100, 111, 99, 110, 100),
            (108, 109, 106, 107, 80),
            (107, 108, 104, 105, 80),
            (104, 105, 102, 103, 100),
        ]
        touching = bars(prefix + [(104, 113, 103, 112, 150)])
        gapped = bars(prefix + [(105, 113, 104, 112, 150)])

        self.assertEqual(MODULE.three_methods(touching, True), [(0, 4)])
        self.assertEqual(MODULE.three_methods(gapped, True), [])

    def test_falling_three_accepts_touch_and_rejects_body_gap(self):
        prefix = [
            (110, 111, 99, 100, 100),
            (102, 105, 101, 104, 80),
            (104, 107, 103, 106, 80),
            (106, 108, 105, 107, 100),
        ]
        touching = bars(prefix + [(106, 107, 97, 98, 80)])
        gapped = bars(prefix + [(105, 106, 97, 98, 80)])

        self.assertEqual(MODULE.three_methods(touching, False), [(0, 4)])
        self.assertEqual(MODULE.three_methods(gapped, False), [])


if __name__ == "__main__":
    unittest.main()
