"""Offline credential-boundary tests; all keys and responses are synthetic."""
import contextlib
import gzip
import importlib.util
import io
import json
import logging
import os
from pathlib import Path
import unittest
from unittest.mock import patch
from urllib.error import HTTPError
from urllib.parse import parse_qs, urlsplit

SOURCE = Path(__file__).parents[1] / "api/screen.py"
SERVICE = "fake-service-sentinel-DO-NOT-LOG"
ANON = "fake-anon-sentinel-DO-NOT-LOG"
RESULT = {"results": [{"code": "2330", "name": "fixture"}], "count": 1}


class Response(io.BytesIO):
    def __init__(self, value=None, status=200, zipped=False):
        raw = json.dumps(value).encode() if value is not None else b""
        super().__init__(gzip.compress(raw) if zipped else raw)
        self.status = status
        self.headers = {"Content-Encoding": "gzip"} if zipped else {}


def load_screen(service=SERVICE, anon=ANON):
    spec = importlib.util.spec_from_file_location("screen_cache_credentials", SOURCE)
    module = importlib.util.module_from_spec(spec)
    with patch.dict(os.environ, {"SUPABASE_URL": "https://offline.invalid",
                               "SUPABASE_ANON_KEY": anon,
                               "SUPABASE_SERVICE_KEY": service}):
        spec.loader.exec_module(module)
    return module


def handler(module, method, body=None, query=""):
    h = module.handler.__new__(module.handler)
    payload = json.dumps(body or {}).encode()
    h.headers = {"Content-Length": str(len(payload))}
    h.rfile, h.wfile = io.BytesIO(payload), io.BytesIO()
    h.path = "/api/screen" + query
    statuses = []
    h.send_response = statuses.append
    h.send_header = lambda *args: None
    h.end_headers = lambda: None
    getattr(h, "do_" + method)()
    return statuses[0], json.loads(h.wfile.getvalue())


class ScreenCacheCredentials(unittest.TestCase):
    def assert_key(self, request, key):
        self.assertTrue(request.get_header("Apikey") == key, "apikey credential selection mismatch")
        self.assertTrue(request.get_header("Authorization") == "Bearer " + key, "Authorization credential selection mismatch")

    def test_save_get_and_both_deletes_use_service_headers(self):
        s, calls = load_screen(), []
        def backend(request, timeout):
            calls.append(request)
            self.assertEqual(timeout, 10)
            self.assert_key(request, SERVICE)
            self.assertEqual(urlsplit(request.full_url).path, "/rest/v1/screen_cache")
            return Response([{"result": RESULT}] if request.get_method() == "GET" else None,
                            200 if request.get_method() == "GET" else 201)
        with patch.object(s.urllib.request, "urlopen", side_effect=backend):
            s._cache_save("offline-job", RESULT)
            self.assertEqual(s._cache_get("offline-job"), RESULT)
        self.assertEqual([r.get_method() for r in calls], ["DELETE", "DELETE", "POST", "GET"])
        for request in calls:  # Assert outside transport: it intentionally swallows exceptions.
            self.assert_key(request, SERVICE)
        self.assertTrue(parse_qs(urlsplit(calls[0].full_url).query)["created_at"][0].startswith("lt."))
        self.assertEqual(parse_qs(urlsplit(calls[1].full_url).query)["job_id"], ["eq.offline-job"])
        self.assertEqual(json.loads(calls[2].data), {"job_id": "offline-job", "result": RESULT})
        self.assertEqual(parse_qs(urlsplit(calls[3].full_url).query),
                         {"job_id": ["eq.offline-job"], "select": ["result"]})

    def test_service_does_not_require_anon(self):
        s = load_screen(anon="")
        with patch.object(s.urllib.request, "urlopen", return_value=Response([])) as call:
            self.assertEqual(s._cache_sb("/screen_cache"), (200, []))
        self.assert_key(call.call_args.args[0], SERVICE)

    def test_missing_service_uses_anon_and_logs_once_per_cold_import(self):
        with self.assertLogs(level="WARNING") as logs:
            s = load_screen(service="")
            with patch.object(s.urllib.request, "urlopen", side_effect=lambda *a, **k: Response([])) as call:
                s._cache_save("fallback-job", RESULT)
                s._cache_get("fallback-job")
        self.assertEqual(call.call_count, 4)
        for item in call.call_args_list:
            self.assert_key(item.args[0], ANON)
        self.assertEqual(len(logs.output), 1)
        self.assertIn("anon", logs.output[0].lower())
        self.assertNotIn(ANON, "\n".join(logs.output))
        self.assertNotIn(SERVICE, "\n".join(logs.output))

    def test_non_screen_cache_paths_still_use_anon(self):
        s = load_screen()
        for path in ("/security_catalog", "/price_window", "/page_cache", "/stock_themes",
                     "/stock_dividends", "/taiex_daily", "/candle_combo_hits", "/screen_cache_extra"):
            with self.subTest(path=path), patch.object(s.urllib.request, "urlopen", return_value=Response([])) as call:
                self.assertEqual(s._cache_sb(path), (200, []))
                self.assert_key(call.call_args.args[0], ANON)

    def test_non_screen_cache_does_not_fallback_to_service(self):
        s = load_screen(anon="")
        with patch.object(s.urllib.request, "urlopen") as call:
            self.assertEqual(s._cache_sb("/security_catalog"), (0, None))
            call.assert_not_called()

    def test_gzip_screen_cache_result_is_unchanged(self):
        s = load_screen()
        with patch.object(s.urllib.request, "urlopen", return_value=Response([{"result": RESULT}], zipped=True)):
            self.assertEqual(s._cache_get("gzip-job"), RESULT)

    def test_service_http_failure_does_not_retry_with_anon(self):
        s = load_screen()
        for status in (401, 403, 500):
            with self.subTest(status=status), patch.object(s.urllib.request, "urlopen", side_effect=HTTPError(
                    "https://offline.invalid", status, SERVICE, None, None)) as call:
                self.assertEqual(s._cache_sb("/screen_cache"), (0, None))
                self.assertEqual(call.call_count, 1)
                self.assert_key(call.call_args.args[0], SERVICE)

    def test_secrets_never_reach_response_or_logs_even_on_transport_error(self):
        log, stdout = io.StringIO(), io.StringIO()
        capture = logging.StreamHandler(log)
        logging.getLogger().addHandler(capture)
        try:
            with contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stdout):
                for service in (SERVICE, ""):
                    s = load_screen(service=service)
                    key = service or ANON
                    with patch.object(s, "screen", return_value=RESULT), patch.object(
                            s.urllib.request, "urlopen", side_effect=RuntimeError(key)):
                        self.assertEqual(handler(s, "POST", {"job_id": "error-job"}), (200, RESULT))
                        self.assertEqual(handler(s, "GET", query="?job_id=error-job"), (200, {"pending": True}))
                output = log.getvalue() + stdout.getvalue()
                self.assertNotIn(SERVICE, output)
                self.assertNotIn(ANON, output)
        finally:
            logging.getLogger().removeHandler(capture)

    def test_post_then_get_returns_persisted_result_without_recomputing(self):
        s, rows, calls = load_screen(), {}, []
        def backend(request, timeout):
            calls.append(request)
            self.assert_key(request, SERVICE)
            method = request.get_method()
            if method == "POST":
                value = json.loads(request.data)
                rows[value["job_id"]] = value["result"]
            if method == "GET":
                job = parse_qs(urlsplit(request.full_url).query)["job_id"][0][3:]
                return Response([{"result": rows[job]}] if job in rows else [])
            return Response(None, 201)
        with patch.object(s, "screen", return_value=RESULT) as compute, patch.object(
                s.urllib.request, "urlopen", side_effect=backend):
            self.assertEqual(handler(s, "POST", {"job_id": "roundtrip", "min_price": 20}), (200, RESULT))
            self.assertEqual(handler(s, "GET", query="?job_id=roundtrip"), (200, RESULT))
            self.assertEqual(handler(s, "GET", query="?job_id=roundtrip"), (200, RESULT))
            self.assertEqual(handler(s, "GET", query="?job_id=missing"), (200, {"pending": True}))
        compute.assert_called_once_with({"min_price": 20})
        self.assertEqual([r.get_method() for r in calls], ["DELETE", "DELETE", "POST", "GET", "GET", "GET"])
        self.assertNotIn(SERVICE, json.dumps(rows))
        self.assertNotIn(ANON, json.dumps(rows))


if __name__ == "__main__":
    unittest.main()
