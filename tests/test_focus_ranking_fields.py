import copy
import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch

spec=importlib.util.spec_from_file_location('focus_ranking_screen',Path(__file__).resolve().parents[1]/'api/screen.py')
screen=importlib.util.module_from_spec(spec);spec.loader.exec_module(screen)
DATES=['2026-10-19','2026-10-16','2026-10-15','2026-10-14','2026-10-13','2026-10-12','2026-10-09']


def snapshot():
    return dict(date=DATES[0],gainers=[dict(code='2330',name='台積電',close=120,chg=2)],
                losers=[dict(code='2317',name='鴻海',close=90,chg=-2)],
                volume_surge=[dict(code='2330',name='台積電',close=120,chg=2,vol=1234500,ratio=2.4)])


class RankingFieldsTests(unittest.TestCase):
    def setUp(self):screen._focus_detail_cache.clear()

    def test_five_market_sessions_not_five_stock_rows_and_theme_membership(self):
        data=snapshot();before=copy.deepcopy(data)
        history={'2330':[dict(trade_date=d,close=100) for d in DATES],
                 '2317':[dict(trade_date=d,close=80) for d in DATES if d!=DATES[5]]}
        with patch.object(screen,'THEME_MEMBERS',{'AI 伺服器':['2330','2317'],'半導體':['2330']}):
            result=screen._focus_details(data,history)
        self.assertEqual(result['five_day_base_date'],DATES[5])
        self.assertEqual(result['gainers'][0]['chg_5d'],20)
        self.assertIsNone(result['losers'][0]['chg_5d'],'suspended stock without the baseline must not silently use another date')
        self.assertEqual(result['gainers'][0]['themes'],[{'id':'AI 伺服器','name':'AI 伺服器'},{'id':'半導體','name':'半導體'}])
        self.assertEqual(result['volume_surge'][0]['volume_lots'],1234.5)
        self.assertEqual(result['volume_surge'][0]['vol'],1234500)
        self.assertEqual(data,before,'enrichment must not mutate the cached snapshot')

    def test_legacy_read_uses_only_two_batched_detail_queries_and_reuses_them(self):
        calls=[]
        def backend(path,**kwargs):
            calls.append((path,kwargs.get('params')))
            if path=='/page_cache':return 200,[dict(payload=snapshot(),updated_at='2026-10-19T08:00:00Z')]
            if dict(kwargs['params']).get('select')=='trade_date':return 200,[dict(trade_date=d) for d in DATES[:6]]
            self.assertEqual(dict(kwargs['params'])['trade_date'],'eq.'+DATES[5])
            self.assertEqual(dict(kwargs['params'])['code'],'in.(2317,2330)')
            return 200,[dict(code='2330',close=100),dict(code='2317',close=100)]
        with patch.object(screen,'_cache_sb',side_effect=backend):
            a=screen._read_focus_snapshot();b=screen._read_focus_snapshot()
        self.assertEqual(sum(path=='/price_window' for path,_ in calls),2)
        self.assertEqual(a['gainers'][0]['chg'],2);self.assertEqual(a['losers'][0]['chg'],-2)
        self.assertEqual(a['gainers'][0]['chg_5d'],20);self.assertEqual(a['losers'][0]['chg_5d'],-10)
        self.assertEqual(a,b)

    def test_new_daily_snapshot_has_all_fields_without_extra_fetches(self):
        history={'2330':[dict(trade_date=d,close=120-i*4,volume=2000000 if i==0 else 500000) for i,d in enumerate(DATES)],
                 '2317':[dict(trade_date=d,close=90+i*2,volume=100000) for i,d in enumerate(DATES)]}
        with patch.object(screen,'_load_pw_window',return_value=(DATES[0],history)),patch.object(screen,'_cache_sb',side_effect=AssertionError('no network enrichment for daily computation')):
            result=screen._fetch_focus()
        self.assertEqual(result['fields_version'],2);self.assertEqual(result['gainers'][0]['code'],'2330');self.assertEqual(result['losers'][0]['code'],'2317')
        self.assertEqual(result['volume_surge'][0]['volume_lots'],2000)
        with patch.object(screen,'_cache_sb',return_value=(200,[dict(payload=result)])) as call:
            returned=screen._read_focus_snapshot()
        self.assertEqual(call.call_count,1);self.assertEqual(returned['gainers'],result['gainers'])

    def test_failed_missing_or_nonpositive_history_is_null_not_zero(self):
        with patch.object(screen,'_cache_sb',return_value=(503,None)):
            result=screen._focus_details(snapshot())
        self.assertIsNone(result['gainers'][0]['chg_5d']);self.assertIsNone(result['five_day_base_date'])
        result=screen._focus_details(snapshot(),{'2330':[dict(trade_date=d,close=0) for d in DATES]})
        self.assertIsNone(result['gainers'][0]['chg_5d'])
        self.assertEqual(result['gainers'][0]['chg'],2)


if __name__=='__main__':unittest.main()
