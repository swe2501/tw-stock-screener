import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch
from http.server import ThreadingHTTPServer
from threading import Thread
from urllib.error import HTTPError

spec = importlib.util.spec_from_file_location("site_search", Path(__file__).parents[1] / "api/site_search.py")
search = importlib.util.module_from_spec(spec)
spec.loader.exec_module(search)


class PublicSearchTest(unittest.TestCase):
    def test_http_success_validation_and_unavailable_are_distinct(self):
        server=ThreadingHTTPServer(('127.0.0.1',0),search.handler)
        thread=Thread(target=server.serve_forever,daemon=True)
        thread.start()
        url=f'http://127.0.0.1:{server.server_port}/api/site_search?q=%E6%99%B6%E7%89%87'
        try:
            with patch.object(search,'search',return_value={'available':True,'partial':False,'items':[]}):
                with search.urllib.request.urlopen(url) as response:
                    self.assertEqual(response.status,200)
                    self.assertIn('s-maxage=120',response.headers['Cache-Control'])
            with patch.object(search,'search',return_value={'available':False,'partial':True,'items':[]}):
                with self.assertRaises(HTTPError) as error: search.urllib.request.urlopen(url)
                self.assertEqual(error.exception.code,503)
                self.assertEqual(error.exception.headers['Cache-Control'],'no-store')
            with patch.object(search,'search',side_effect=ValueError('invalid')):
                with self.assertRaises(HTTPError) as error: search.urllib.request.urlopen(url)
                self.assertEqual(error.exception.code,400)
        finally:
            server.shutdown()
            server.server_close()
            thread.join()

    def test_query_is_quoted_not_injected_into_filter_grammar(self):
        p = search.query_params("news_feed", '台積電,topic.eq."x"_%', 8)
        self.assertEqual(set(p), {"select", "or", "order", "limit"})
        self.assertTrue(p["or"].startswith('(title.ilike."%'))
        self.assertIn('\\"x\\"', p["or"])
        self.assertIn('\\\\_', p["or"])
        self.assertIn('\\\\%', p["or"])

    def test_search_spans_all_saved_dates_sorts_and_deduplicates(self):
        def fetcher(source, q, limit):
            self.assertEqual(q, "晶片")
            if source == "news_feed":
                return [{"title":"晶片舊新聞","link":"https://example.test/old","published_at":"2024-01-01T12:00:00Z","description":"<b>完整</b> &amp; 摘要"},
                        {"title":"晶片新新聞","link":"https://example.test/new","news_date":"2026-10-16"}]
            return [{"topic":"晶片題材","source_urls":["https://example.test/new"],"published_at":"2026-10-15"}]
        data = search.search("晶片", fetcher=fetcher)
        self.assertEqual(len(data["items"]), 2)
        self.assertEqual(data["items"][0]["date"], "2026-10-16")
        self.assertEqual(data["items"][1]["snippet"], "完整 & 摘要")
        self.assertFalse(data["partial"])

    def test_unsafe_urls_are_never_returned(self):
        for url in ("javascript:alert(1)", "data:text/html,test", "https://user:pass@example.test", "//example.test"):
            self.assertEqual(search.safe_url(url), "")
        row = search.normalize("hot_topics", {"topic":"測試題材","published_at":"2026-10-16","source_urls":"['https://example.test/a', 'https://example.test/b']"})
        self.assertEqual(row["url"], "https://example.test/a")

    def test_partial_failure_preserves_other_source_and_full_failure_is_explicit(self):
        def fetcher(source, *_):
            if source=="hot_topics": raise TimeoutError()
            return [{"title":"測試新聞","link":"https://example.test/a","news_date":"2026-10-16"}]
        data = search.search("測試", fetcher=fetcher)
        self.assertTrue(data["partial"])
        self.assertTrue(data["available"])
        def failed(*_): raise TimeoutError()
        self.assertFalse(search.search("測試", fetcher=failed)["available"])

    def test_invalid_queries_and_bad_source_rows(self):
        for q in ("", "a", "%%%%", "a"*81, None):
            with self.assertRaises(ValueError): search.search(q)
        self.assertIsNone(search.normalize("news_feed", {"title":"a", "published_at":"invalid"}))
        self.assertIsNone(search.normalize("news_feed", "not a row"))

    def test_only_anonymous_read_credentials_and_get_are_used(self):
        class Response:
            def __enter__(self): return self
            def __exit__(self,*_): pass
            def read(self,*_): return b'[]'
        with patch.dict(search.os.environ,{"SUPABASE_URL":"https://fixture.test","SUPABASE_ANON_KEY":"public-fixture"}), patch.object(search.urllib.request,"urlopen",return_value=Response()) as call:
            self.assertEqual(search.fetch_source("news_feed","晶片",8),[])
        request=call.call_args.args[0]
        self.assertEqual(request.get_method(),"GET")
        self.assertEqual(request.get_header("Authorization"),"Bearer public-fixture")
        self.assertNotIn("news_date=", request.full_url)


if __name__=="__main__": unittest.main()
