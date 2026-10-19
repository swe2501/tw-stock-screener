import importlib.util
import json
from http.server import HTTPServer
from pathlib import Path
import threading
import unittest
from urllib.error import HTTPError
from urllib.request import Request, urlopen
from unittest.mock import patch, MagicMock
from datetime import date

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('mobile_preview', ROOT / 'services/mobile-preview/api/prices.py')
preview = importlib.util.module_from_spec(spec)
spec.loader.exec_module(preview)


class PreviewTests(unittest.TestCase):
    def test_public_research_uses_only_fixed_public_columns_and_apikey(self):
        with patch.dict(preview.os.environ, {'PUBLIC_RESEARCH_PUBLISHABLE_KEY': 'sb_publishable_test'}, clear=True), patch.object(preview, 'build_opener') as opener:
            response = MagicMock(status=200)
            response.read.return_value = b'[]'
            opener.return_value.open.return_value.__enter__.return_value = response
            self.assertEqual(preview.public_source('news_feed', 'chip,topic.eq.x_%'), [])
            req = opener.return_value.open.call_args.args[0]
            self.assertTrue(req.full_url.startswith(preview.PUBLIC_RESEARCH_ORIGIN + '/rest/v1/news_feed?'))
            self.assertEqual(req.get_method(), 'GET')
            self.assertIsNone(req.get_header('Authorization'))
            self.assertEqual(req.get_header('Apikey'), 'sb_publishable_test')
            with self.assertRaises(ValueError):
                preview.public_source('member_profiles', 'test')
            response.read.return_value = b'x' * 500001
            with self.assertRaises(ValueError):
                preview.public_source('news_feed', 'test')

    def test_search_normalizes_deduplicates_and_preserves_dates(self):
        def fetcher(source, query, limit):
            if source == 'news_feed':
                return [{'title': '<b>晶片新聞</b>', 'description': 'a &amp; b', 'published_at': '2026-10-18T10:00:00Z', 'link': 'https://example.test/a', 'source': '公開新聞'},
                        {'title': 'invalid', 'published_at': '2026-99-99', 'link': 'https://example.test/b'},
                        {'title': 'unsafe', 'published_at': '2026-10-18', 'link': 'javascript:alert(1)'}]
            return [{'topic': '晶片題材', 'summary': 'summary', 'published_at': '2026-10-17', 'source_urls': ['https://example.test/a'], 'sector': '半導體'},
                    {'topic': '產業題材', 'published_at': '2026-10-16', 'source_urls': '["https://example.test/c"]'}]
        data = preview.search('晶片', fetcher)
        self.assertTrue(data['available'])
        self.assertFalse(data['partial'])
        self.assertEqual(len(data['items']), 2)
        self.assertEqual(data['items'][0]['title'], '晶片新聞')
        self.assertEqual(data['items'][0]['snippet'], 'a & b')
        self.assertEqual(data['items'][0]['date'], '2026-10-18')

    def test_partial_outage_is_not_empty_success_and_invalid_query_never_fetches(self):
        def failed(*args):
            raise RuntimeError('internal connection details')
        data = preview.search('台積電', failed)
        self.assertFalse(data['available'])
        self.assertTrue(data['partial'])
        def partial(source, *args):
            if source == 'news_feed':
                return []
            raise RuntimeError()
        data = preview.search('台積電', partial)
        self.assertTrue(data['available'])
        self.assertTrue(data['partial'])
        fetcher = MagicMock()
        for query in ['', 'a', ' ' * 5, '*' * 4, 'a' * 81]:
            with self.assertRaises(ValueError):
                preview.search(query, fetcher)
        fetcher.assert_not_called()

    def test_institutions_excludes_foreign_dealer_double_count_and_margin_units(self):
        institutions={'stat':'OK','date':'20261016','data':[['自營商(自行買賣)','50','70','-20'],['自營商(避險)','20','30','-10'],['投信','40','10','30'],['外資及陸資(不含外資自營商)','20','50','-30'],['外資自營商','8','3','5'],['合計','130','160','-30']]}
        values=preview.institution_rows(institutions,'2026-10-16')
        self.assertEqual(values,{'foreign':-30,'trust':30,'dealer':-30,'total':-30})
        with self.assertRaises(ValueError):preview.institution_rows(institutions,'2026-10-15')
        institutions['data'][-1][3]='99'
        with self.assertRaises(ValueError):preview.institution_rows(institutions,'2026-10-16')
        margin={'stat':'OK','date':'20261016','tables':[{'data':[['融券(交易單位)','0','0','0','20','25'],['融資金額(仟元)','0','0','0','100','90']]}]}
        self.assertEqual(preview.margin_rows(margin,'2026-10-16'),{'finance_balance_twd':90000,'finance_change_twd':-10000,'short_balance_units':25,'short_change_units':5})

    def test_public_stock_catalog_excludes_nonstock_and_invalid_prices(self):
        row={'Date':'1151016','Code':'2330','Name':'台積電','ClosingPrice':'101','Change':'1','TradeValue':'1000','TradeVolume':'20'}
        with patch.object(preview,'_stock_cache',None),patch.object(preview,'public_json',return_value=[row,{**row,'Code':'020000'},{**row,'Code':'2317','ClosingPrice':'--'}]):
            status,data=preview.stock_catalog()
            self.assertEqual(status,200)
            self.assertEqual(len(data['items']),1)
            self.assertEqual(data['items'][0]['name'],'台積電')
            self.assertTrue(data['partial'])
            self.assertEqual(data['excluded_rows'],2)

    def test_official_candle_dates_and_ohlc_are_validated(self):
        rows = preview.candle_rows([['115/10/16', '100', '120', '99', '110']], today=date(2026, 10, 18))
        self.assertEqual(rows, [{'date': '2026-10-16', 'open': 100, 'high': 120, 'low': 99, 'close': 110}])
        for raw in [['115/10/16','100','98','99','110'], ['115/10/19','100','120','99','110'], ['115/10/16','NaN','120','99','110']]:
            with self.assertRaises(ValueError):
                preview.candle_rows([raw], today=date(2026,10,18))

    def test_daily_market_normalization_dates_percent_and_activity(self):
        def row(day='1151016', **extra):
            return {'Date': day, 'TAIEX': '101', 'Change': '1', 'TradeValue': '1,234', 'TradeVolume': '567', **extra}
        rows = preview.market_rows([row(), row('1151015', TAIEX='100', Change='0')], today=date(2026, 10, 18))
        self.assertEqual([r['date'] for r in rows], ['2026-10-15', '2026-10-16'])
        self.assertEqual(rows[-1]['change_percent'], 1)
        self.assertEqual(rows[-1]['trade_value_twd'], 1234)
        for data in [[], [row('1151032')], [row('1151019')], [row(TAIEX='NaN')], [row(TradeValue='-1')], [row(Change='101')], [row(), row(TAIEX='102')]]:
            with self.assertRaises((ValueError, KeyError)):
                preview.market_rows(data, today=date(2026, 10, 18))

    def test_market_cache_and_upstream_failure_do_not_create_fresh_data(self):
        response = MagicMock(status=200, headers={'Content-Type': 'application/json'})
        response.read.return_value = json.dumps([{'Date': '1151016', 'TAIEX': '101', 'Change': '1', 'TradeValue': '1000', 'TradeVolume': '50'}]).encode()
        with patch.object(preview, '_market_cache', None), patch.object(preview, 'build_opener') as opener:
            opener.return_value.open.return_value.__enter__.return_value = response
            status, data = preview.market_summary()
            self.assertEqual(status, 200)
            self.assertFalse(data['cached'])
            self.assertEqual(opener.return_value.open.call_args.args[0].full_url, preview.MARKET_SOURCE)
            original_time = data['retrieved_at']
            status, cached = preview.market_summary()
            self.assertTrue(cached['cached'])
            self.assertEqual(opener.return_value.open.call_count, 1)
            preview._market_cache = (preview.time.monotonic() - 400, data)
            opener.return_value.open.side_effect = RuntimeError('secret failure')
            status, stale = preview.market_summary()
            self.assertEqual(status, 200)
            self.assertTrue(stale['stale'])
            self.assertEqual(stale['retrieved_at'], original_time)
            preview._market_cache = None
            status, failed = preview.market_summary()
            self.assertEqual(status, 503)
            self.assertFalse(failed['available'])
            self.assertNotIn('secret', json.dumps(failed))

    def test_rejects_production_and_privileged_keys_without_request(self):
        for base, key in [
            ('https://bruqrbvbjxntgoljxsne.supabase.co', 'sb_publishable_test'),
            (preview.STAGING_ORIGIN, 'sb_secret_test'),
            (preview.STAGING_ORIGIN + '.evil.test', 'sb_publishable_test'),
        ]:
            with patch.dict(preview.os.environ, {'STAGING_SUPABASE_URL': base,
                    'STAGING_SUPABASE_PUBLISHABLE_KEY': key}, clear=True), patch.object(preview, 'build_opener') as opener:
                self.assertEqual(preview.connectivity()['connection_state'], 'configuration_rejected')
                opener.assert_not_called()

    def test_staging_metadata_only_and_failure_does_not_leak(self):
        with patch.dict(preview.os.environ, {'STAGING_SUPABASE_URL': preview.STAGING_ORIGIN,
                'STAGING_SUPABASE_PUBLISHABLE_KEY': 'sb_publishable_test'}, clear=True), patch.object(preview, 'build_opener') as opener:
            response = MagicMock(status=200, headers={'Content-Type': 'application/json'})
            response.read.return_value = b'{"external": {"google": false}}'
            opener.return_value.open.return_value.__enter__.return_value = response
            result = preview.connectivity()
            self.assertTrue(result['supabase_connected'])
            self.assertFalse(result['database_connected'])
            req = opener.return_value.open.call_args.args[0]
            self.assertEqual(req.full_url, preview.STAGING_ORIGIN + '/auth/v1/settings')
            self.assertEqual(req.get_method(), 'GET')
            response.read.assert_called_once_with(65536)
            opener.return_value.open.side_effect = RuntimeError('secret details')
            self.assertEqual(preview.connectivity(), {'database_connected': False, 'supabase_connected': False, 'connection_state': 'unavailable'})

    def test_no_database_and_no_writes(self):
        server = HTTPServer(('127.0.0.1', 0), preview.handler)
        worker = threading.Thread(target=server.serve_forever, daemon=True)
        worker.start()
        base = 'http://127.0.0.1:' + str(server.server_port)
        try:
            with urlopen(base + '/health') as response:
                data = json.load(response)
                self.assertFalse(data['database_connected'])
                self.assertFalse(data['member_login_enabled'])
            for path, method, status in [
                ('/api/prices?action=site_search&q=hello', 'GET', 503),
                ('/api/auth', 'GET', 404),
                ('/api/prices?action=other', 'GET', 404),
                ('/api/prices?action=site_search&q=x', 'GET', 400),
                ('/api/prices?action=site_search&q=hello&q=world', 'GET', 400),
                ('/api/watchlist', 'DELETE', 405),
                ('/api/auth', 'POST', 405),
            ]:
                with self.assertRaises(HTTPError) as caught:
                    urlopen(Request(base + path, method=method))
                self.assertEqual(caught.exception.code, status)
                payload = json.load(caught.exception)
                if status == 503:
                    self.assertFalse(payload['available'])
            with patch.object(preview, 'search', return_value={'available': True, 'partial': False, 'items': []}):
                with urlopen(base + '/api/prices?action=site_search&q=test') as response:
                    self.assertEqual(response.status, 200)
        finally:
            server.shutdown()
            server.server_close()
            worker.join()

    def test_stock_candles_bind_code_month_and_actual_volume(self):
        catalog = {'items': [{'code': '2330', 'name': '台積電', 'kind': 'stock'}]}
        def source(url):
            month = url.split('date=')[1][:8]
            roc = str(int(month[:4])-1911)+'/'+month[4:6]+'/01'
            return {'stat': 'OK', 'title': '個股日成交資訊 2330 台積電', 'data': [[roc, '1,234', '12345', '100', '110', '99', '105']]}
        with patch.object(preview, '_stock_candle_cache', {}), patch.object(preview, 'stock_catalog', return_value=(200, catalog)), patch.object(preview, 'public_json', side_effect=source) as fetch:
            for code in ['https://evil.test', '2330&stockNo=2317', '2330/../']:
                self.assertEqual(preview.stock_candles(code)[0], 400)
            self.assertEqual(preview.stock_candles('2317')[0], 404)
            fetch.assert_not_called()
            status, data = preview.stock_candles('2330')
            self.assertEqual(status, 200)
            self.assertEqual(len(data['candles']), 6)
            self.assertEqual(data['candles'][0]['volume'], 1234)
            self.assertFalse(data['partial'])
            self.assertTrue(all('stockNo=2330&' in url for url in data['source']['urls']))
        with patch.object(preview, '_stock_candle_cache', {}), patch.object(preview, 'stock_catalog', return_value=(200, catalog)), patch.object(preview, 'public_json', return_value={'stat': 'OK', 'title': '2317 鴻海', 'data': [['115/10/01', '1234', '12345', '100', '110', '99', '105']]}):
            self.assertEqual(preview.stock_candles('2330')[0], 503)

    def test_single_function_and_no_cron(self):
        config = json.loads((ROOT / 'services/mobile-preview/vercel.json').read_text())
        self.assertNotIn('crons', config)
        self.assertEqual(config['builds'], [{'src': 'api/prices.py', 'use': '@vercel/python'}])
