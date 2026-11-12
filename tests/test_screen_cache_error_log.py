"""screen_cache 錯誤紀錄離線測試：假金鑰、假 job_id、mock urlopen，不連網。"""
import gzip
import importlib.util
import io
import json
import os
from pathlib import Path
import unittest
from unittest.mock import patch
from urllib.error import HTTPError

SOURCE = Path(__file__).parents[1] / "api/screen.py"
SERVICE = "fake-service-sentinel-DO-NOT-LOG"
ANON = "fake-anon-sentinel-DO-NOT-LOG"
JOB = "job-sentinel-7f3a9c-DO-NOT-LOG"
RESULT = {"results": [{"code": "2330", "name": "member-secret-sentinel"}], "count": 1}
BODY_SECRET = "upstream-message-sentinel permission denied for table screen_cache"


class Response(io.BytesIO):
    def __init__(self, value=None, status=200, raw=None):
        super().__init__(raw if raw is not None else (json.dumps(value).encode() if value is not None else b""))
        self.status, self.headers = status, {}


def load(service=SERVICE, anon=ANON):
    spec = importlib.util.spec_from_file_location("screen_cache_error_log", SOURCE)
    m = importlib.util.module_from_spec(spec)
    with patch.dict(os.environ, {"SUPABASE_URL": "https://offline.invalid", "SUPABASE_ANON_KEY": anon,
                                 "SUPABASE_SERVICE_KEY": service}):
        spec.loader.exec_module(m)
    return m


def http_error(status, raw, gz=False):
    hdrs = {"Content-Encoding": "gzip"} if gz else {}
    return HTTPError("https://offline.invalid/rest/v1/screen_cache?job_id=eq." + JOB, status, "x", hdrs,
                     io.BytesIO(gzip.compress(raw) if gz else raw))


class ScreenCacheErrorLog(unittest.TestCase):
    FORBIDDEN = (SERVICE, ANON, JOB, "member-secret-sentinel", "upstream-message-sentinel", "permission denied",
                 "Bearer", "apikey", "offline.invalid", "eq.", "lt.")

    def capture(self, module, fn):
        with self.assertLogs(module.__name__, level="WARNING") as logs:
            fn()
        text = "\n".join(logs.output)
        for bad in self.FORBIDDEN:
            self.assertNotIn(bad, text)
        self.assertTrue(all("[screen_cache]" in line for line in logs.output))
        return logs.output

    def assert_no_logs(self, module, fn):
        with patch.object(module._CACHE_LOG, "warning") as warn:
            fn()
        warn.assert_not_called()

    def test_non_2xx_with_supabase_code(self):
        s = load()
        err = lambda req, timeout: (_ for _ in ()).throw(http_error(401, json.dumps(
            {"code": "42501", "message": BODY_SECRET, "details": JOB, "hint": None}).encode()))
        with patch.object(s.urllib.request, "urlopen", side_effect=err):
            out = self.capture(s, lambda: self.assertIsNone(s._cache_get(JOB)))
        self.assertEqual(len(out), 1)
        for field in ("method=GET", "path=/screen_cache", "params=job_id,select", "status=401", "code=42501",
                      "exc=HTTPError", "key=service"):
            self.assertIn(field, out[0])

    def test_pgrst_code_and_gzip_body_and_anon_label(self):
        s = load(service="")
        err = lambda req, timeout: (_ for _ in ()).throw(http_error(400, json.dumps({"code": "PGRST102", "message": BODY_SECRET}).encode(), gz=True))
        with patch.object(s.urllib.request, "urlopen", side_effect=err):
            out = self.capture(s, lambda: s._cache_save(JOB, RESULT))
        self.assertEqual(len(out), 3)                             # 兩次 DELETE + POST 各一行
        self.assertEqual([l.split("method=")[1].split()[0] for l in out], ["DELETE", "DELETE", "POST"])
        self.assertIn("params=created_at", out[0]); self.assertIn("params=job_id", out[1]); self.assertIn("params=-", out[2])
        for line in out:
            self.assertIn("code=PGRST102", line); self.assertIn("status=400", line); self.assertIn("key=anon", line)

    def test_non_json_error_body_is_code_none(self):
        s = load()
        for raw in (b"<html>502 Bad Gateway " + JOB.encode() + b"</html>", b"", json.dumps(["x"]).encode(),
                    json.dumps({"code": "bad code; DROP " + JOB}).encode(), json.dumps({"code": None}).encode()):
            with self.subTest(raw=raw[:20]), patch.object(s.urllib.request, "urlopen",
                                                          side_effect=lambda req, timeout, raw=raw: (_ for _ in ()).throw(http_error(502, raw))):
                out = self.capture(s, lambda: s._cache_get(JOB))
                self.assertIn("status=502", out[0]); self.assertIn("code=none", out[0])

    def test_exception_logs_class_only(self):
        s = load()
        for exc in (TimeoutError("timed out " + JOB), OSError(SERVICE), ValueError(BODY_SECRET)):
            with self.subTest(exc=type(exc).__name__), patch.object(s.urllib.request, "urlopen", side_effect=exc):
                out = self.capture(s, lambda: s._cache_get(JOB))
                self.assertIn("exc=" + type(exc).__name__, out[0]); self.assertIn("status=none", out[0]); self.assertIn("code=none", out[0])

    def test_2xx_non_json_body_is_logged_as_exception(self):
        s = load()
        with patch.object(s.urllib.request, "urlopen", return_value=Response(raw=b"not-json " + JOB.encode())):
            out = self.capture(s, lambda: s._cache_get(JOB))
        self.assertIn("exc=JSONDecodeError", out[0])

    def test_2xx_is_silent(self):
        s = load()
        with patch.object(s.urllib.request, "urlopen", side_effect=lambda req, timeout: Response(
                [{"result": RESULT}] if req.get_method() == "GET" else None, 200 if req.get_method() == "GET" else 201)):
            self.assert_no_logs(s, lambda: (s._cache_save(JOB, RESULT), s._cache_get(JOB)))

    def test_other_paths_unchanged_and_silent(self):
        s = load()
        with patch.object(s.urllib.request, "urlopen", side_effect=http_error(500, b'{"code":"XX000"}')):
            self.assert_no_logs(s, lambda: self.assertEqual(s._cache_sb("/page_cache", params=[("kind", "eq.themes")]), (0, None)))

    def test_missing_config_logged(self):
        s = load(service="", anon="")
        with patch.object(s.urllib.request, "urlopen") as up:
            out = self.capture(s, lambda: s._cache_get(JOB))
        up.assert_not_called()
        self.assertIn("exc=MissingConfig", out[0]); self.assertIn("key=none", out[0])

    def test_unserializable_result_logged_and_post_handler_still_200(self):
        s = load()
        calls = []
        def ok(req, timeout):
            calls.append(req.get_method())
            return Response(None, 204)
        h = s.handler.__new__(s.handler)
        payload = json.dumps({"job_id": JOB}).encode()
        h.headers = {"Content-Length": str(len(payload))}
        h.rfile, h.wfile, h.path = io.BytesIO(payload), io.BytesIO(), "/api/screen"
        statuses = []
        h.send_response, h.send_header, h.end_headers = statuses.append, lambda *a: None, lambda: None
        bad = {"results": [], "count": 0, "x": {1, 2}}               # set 無法序列化（模擬結果含非 JSON 型別）
        with patch.object(s, "screen", return_value={"results": [], "count": 0}), \
                patch.object(s, "_cache_save", side_effect=TypeError("Object of type set " + JOB)), \
                patch.object(s.urllib.request, "urlopen", side_effect=ok):
            out = self.capture(s, h.do_POST)
        self.assertEqual(statuses, [200])
        self.assertIn("method=SAVE", out[0]); self.assertIn("exc=TypeError", out[0])
        with patch.object(s.urllib.request, "urlopen", side_effect=ok):
            out = self.capture(s, lambda: self.assertRaises(TypeError, s._cache_save, JOB, bad))
        self.assertEqual(calls, ["DELETE", "DELETE"])                 # POST 前序列化失敗
        self.assertIn("method=POST", out[0]); self.assertIn("exc=TypeError", out[0])


if __name__ == "__main__":
    unittest.main()
