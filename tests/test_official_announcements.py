import importlib.util
import json
from pathlib import Path
import sqlite3
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('official', Path(__file__).resolve().parents[1]/'scripts/official_announcements.py')
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
SOURCE = dict(id='test',name='Test official',url='https://www.cbc.gov.tw/feed',kind='rss',category='policy',minutes=5)
FEED = '<rss><channel><item><title>央行利率決議</title><link>https://www.cbc.gov.tw/a?utm_source=test</link><pubDate>Fri, 06 Nov 2026 09:45:28 GMT</pubDate><description>政策說明</description></item></channel></rss>'


class OfficialTests(unittest.TestCase):
    def test_time_precision_and_window(self):
        self.assertEqual(m.dates('1151106'), ('2026-11-06',None,'date'))
        self.assertEqual(m.dates(''),(None,None,'unknown'))
        self.assertEqual(m.dates('Fri, 06 Nov 2026 09:45:28 GMT')[1], '2026-11-06T17:45:28+08:00')
        for value,expected in [('2026-11-09T06:59:00+08:00',False),('2026-11-09T07:00:00+08:00',True),('2026-11-09T14:30:00+08:00',True),('2026-11-09T14:31:00+08:00',False),('2026-11-08T09:00:00+08:00',False)]:
            self.assertEqual(m.active(m.dt.datetime.fromisoformat(value)),expected)

    def test_urls_and_markup(self):
        self.assertEqual(m.rss(SOURCE,FEED)[0]['url'],'https://www.cbc.gov.tw/a')
        self.assertIsNone(m.rss(dict(SOURCE,date_only=True),FEED)[0]['published_at'])
        self.assertEqual(m.clean('<script>alert(1)</script><b>政策</b>'),'alert(1) 政策')
        for url in ['https://127.0.0.1/a','http://www.cbc.gov.tw/a','https://user:pass@www.cbc.gov.tw/a','https://www.cbc.gov.tw.evil.test/']:
            with self.assertRaises(ValueError):m.safe_url(url,SOURCE['url'])
        with self.assertRaises(ValueError):m.rss(SOURCE,'<!DOCTYPE rss><rss/>')
        with self.assertRaises(ValueError):m.rss(SOURCE,'<html>blocked</html>')

    def test_idempotent_and_partial_failure(self):
        bad = dict(SOURCE,id='bad')
        def fetch(source,state):
            if source['id']=='bad':return source,[],None,None,'HTTP 503','error'
            return source,m.rss(source,FEED),None,None,None,'ok'
        with tempfile.TemporaryDirectory() as tmp,patch.object(m,'fetch_source',side_effect=fetch):
            p=Path(tmp)
            self.assertEqual(m.run(p,True,[SOURCE,bad]),1)
            db=sqlite3.connect(p/'announcements.sqlite3')
            old=db.execute('SELECT id,first_seen,updated_at FROM announcements').fetchone()
            self.assertEqual(m.run(p,True,[SOURCE,bad]),1)
            self.assertEqual(db.execute('SELECT count(*) FROM announcements').fetchone()[0],1)
            self.assertEqual(db.execute('SELECT id,first_seen,updated_at FROM announcements').fetchone(),old)
            self.assertEqual(db.execute("SELECT last_success FROM sources WHERE id='bad'").fetchone()[0],None)
            self.assertFalse(json.loads((p/'health.json').read_text(encoding='utf-8'))['website_sync'])
            db.close()

    def test_no_announcements_and_no_false_ai_match(self):
        source=dict(SOURCE,kind='trading_notice',id='twse_attention')
        self.assertEqual(m.parse(source,'[{"Number":"0","Code":"","Date":""}]'),[])
        doc=dict(title='Taiwan daily news',summary='')
        self.assertNotIn('technology',m.labels(doc)[0])
        self.assertIn('technology',m.labels(dict(title='AI 產業政策',summary=''))[0])
        self.assertFalse(m.labels(dict(title='世界棒球英雄獲就業金卡',summary='歡迎加入半導體 AI 產業'))[1])
        self.assertTrue(m.labels(dict(title='處置公告｜2360',summary='',source_id='twse_disposition'))[1])


if __name__=='__main__':unittest.main()
