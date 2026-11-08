import datetime as dt
import unittest
import urllib.parse
from lib.official_announcements import read


class ReadTests(unittest.TestCase):
    def test_invalid_never_queries(self):
        def forbidden(*args):raise AssertionError('invalid request reached backend')
        for body in [{'from':'2020-01-01','to':'2026-11-01'},{'limit':500},{'limit':True},{'source':'fsc&select=*'},{'from':'not-a-date'}]:
            self.assertEqual(read(body,forbidden)[0],400)

    def test_join_and_bounded_projection(self):
        calls=[]
        def rest(path):
            calls.append(path)
            return 200,[]
        code,result=read({'from':'2026-11-01','to':'2026-11-08','source':'fsc','limit':20},rest)
        self.assertEqual(code,200)
        params=urllib.parse.parse_qs(urllib.parse.urlsplit(calls[0]).query)
        self.assertEqual(params['published_date'],['gte.2026-11-01','lte.2026-11-08'])
        self.assertEqual(params['limit'],['20'])
        self.assertIn('official_sources',params['select'][0])
        self.assertNotIn('error',calls[1])
        self.assertEqual(result['items'],[])

    def test_server_errors_not_exposed(self):
        code,result=read({},lambda *args:(403,{'secret':'do not expose'}))
        self.assertEqual(code,503)
        self.assertNotIn('secret',str(result))

    def test_policy_duplicates_keep_sources_but_company_not_merged(self):
        rows=[{'id':'1','title':'國安基金','published_date':'2026-11-06','url':'https://www.nta.gov.tw/a','source':{'name':'國庫署','category':'market_policy'}},
              {'id':'2','title':'國安基金','published_date':'2026-11-06','url':'https://www.mof.gov.tw/a','source':{'name':'財政部','category':'fiscal_trade'}},
              {'id':'3','title':'董事會決議','published_date':'2026-11-06','source':{'category':'company_disclosure'}},
              {'id':'4','title':'董事會決議','published_date':'2026-11-06','source':{'category':'company_disclosure'}}]
        def rest(path):return (200,rows if path.startswith('/official_announcements?') else [])
        code,result=read({},rest)
        self.assertEqual(code,200);self.assertEqual(len(result['items']),3)
        self.assertEqual(result['items'][0]['other_sources'][0]['name'],'財政部')


if __name__=='__main__':unittest.main()
