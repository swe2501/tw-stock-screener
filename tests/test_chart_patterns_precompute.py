import json
from pathlib import Path
import sqlite3
import sys
import tempfile
import unittest
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
import chart_patterns_precompute as scan
from test_chart_pattern_rules import anchors,finish


class SnapshotTests(unittest.TestCase):
    def test_readonly_current_day_and_invalid_partial_scan(self):
        with tempfile.TemporaryDirectory() as folder:
            database=Path(folder)/'prices.db'
            c=sqlite3.connect(database)
            c.execute('create table stock_daily(code text,trade_date text,open real,high real,low real,close real,volume real)')
            bars=finish(anchors([(0,110),(20,100),(32,112),(45,101),(59,111)]),114)
            for code,rows in [('2330',bars),('2317',bars[:-1])]:
                c.executemany('insert into stock_daily values(?,?,?,?,?,?,?)',[(code,b['date'],b['open'],b['high'],b['low'],b['close'],b['volume']) for b in rows])
            c.commit();before=database.read_bytes()
            snapshot=scan.scan(database)
            self.assertEqual(database.read_bytes(),before,'scanner must never modify the stock database')
            self.assertTrue(snapshot['complete']);self.assertEqual(snapshot['coverage']['stale'],1)
            self.assertTrue(any(s['type']=='w' and s['code']=='2330' for s in snapshot['signals']))
            self.assertTrue(all(s['code']!='2317' and s['date']==bars[-1]['date'] for s in snapshot['signals']))
            self.assertEqual(len(snapshot['types']),15);json.dumps(snapshot,allow_nan=False)
            c.execute("update stock_daily set high=1 where code='2330'");c.commit()
            with self.assertRaisesRegex(ValueError,'Invalid OHLC'):scan.scan(database)
            c.close()

    def test_missing_database_cannot_be_created_and_empty_publish_rejected(self):
        with tempfile.TemporaryDirectory() as folder:
            missing=Path(folder)/'absent.db'
            with self.assertRaises(sqlite3.OperationalError):scan.scan(missing)
            self.assertFalse(missing.exists())
        with self.assertRaises(ValueError):scan.publish_snapshot({},dict(complete=True))


if __name__=='__main__':unittest.main()
