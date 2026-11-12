"""screen_cache 成功診斷紀錄離線測試（2026-11-12 CTO）：假金鑰（合成 JWT）、假 job_id、mock urlopen，不連網。"""
import base64
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
JOB = "job-sentinel-5d1e-DO-NOT-LOG"
RESULT = {"results": [{"code": "2330", "name": "member-secret-sentinel"}], "count": 1}
PAYLOAD_SECRET = "payload-ref-sentinel"


def fake_jwt(role, extra=PAYLOAD_SECRET):
    enc = lambda d: base64.urlsafe_b64encode(json.dumps(d).encode()).decode().rstrip("=")
    return ".".join((enc({"alg": "HS256", "typ": "JWT"}),
                     enc({"role": role, "ref": extra, "iss": "supabase-" + extra}), "sig-sentinel-DO-NOT-LOG"))


SERVICE_JWT = fake_jwt("service_role")
ANON_JWT = fake_jwt("anon")
OPAQUE = "sb_" + "secret_fake-opaque-sentinel-DO-NOT-LOG"  # 拆開避免被當成真金鑰掃描；此為假值


class Response(io.BytesIO):
    def __init__(self, value=None, status=200, headers=None):
        super().__init__(json.dumps(value).encode() if value is not None else b"")
        self.status, self.headers = status, headers or {}


def load(service, anon=ANON_JWT):
    spec = importlib.util.spec_from_file_location("screen_cache_diag_log", SOURCE)
    m = importlib.util.module_from_spec(spec)
    with patch.dict(os.environ, {"SUPABASE_URL": "https://offline.invalid", "SUPABASE_ANON_KEY": anon,
                                 "SUPABASE_SERVICE_KEY": service}):
        spec.loader.exec_module(m)
    return m


class FakeRest:
    """screen_cache 模擬：rls_hides_rows=True 代表請求實際以 anon 身分執行、RLS 讓 SELECT 回 0 列。"""
    def __init__(self, rls_hides_rows=False, invalid=False, content_range=None):
        self.rows, self.rls, self.invalid, self.range = {}, rls_hides_rows, invalid, content_range

    def __call__(self, req, timeout=None):
        if self.invalid:
            raise HTTPError("https://offline.invalid/rest/v1/screen_cache", 401, "x", {},
                            io.BytesIO(json.dumps({"message": "Invalid API key " + JOB}).encode()))
        m, q = req.get_method(), parse_qs(urlsplit(req.full_url).query)
        if m == "POST":
            row = json.loads(req.data); self.rows[row["job_id"]] = row["result"]; return Response(None, 201)
        if m == "DELETE":
            if "job_id" in q: self.rows.pop(q["job_id"][0][3:], None)
            return Response(None, 204)
        hit = [] if self.rls else [{"result": self.rows[j]} for j in [q["job_id"][0][3:]] if j in self.rows]
        rng = self.range or (f"0-{len(hit) - 1}/*" if hit else "*/*")
        return Response(hit, 200, {"Content-Range": rng})


def http(m, method, body=None, query=""):
    h = m.handler.__new__(m.handler)
    raw = json.dumps(body or {}).encode()
    h.headers = {"Content-Length": str(len(raw))}; h.rfile, h.wfile, h.path = io.BytesIO(raw), io.BytesIO(), "/api/screen" + query
    st = []; h.send_response = st.append; h.send_header = lambda *a: None; h.end_headers = lambda: None
    getattr(h, "do_" + method)()
    return st[0], json.loads(h.wfile.getvalue())


class ScreenCacheDiagLog(unittest.TestCase):
    def run_flow(self, m, backend, via_handler=False):
        buf = io.StringIO(); cap = logging.StreamHandler(buf)
        diag, err = logging.getLogger(m.__name__ + ".diag"), logging.getLogger(m.__name__)
        diag.addHandler(cap); err.addHandler(cap)
        try:
            with patch.object(m.urllib.request, "urlopen", side_effect=backend), \
                    patch.object(m._CACHE_DIAG.handlers[0], "stream", io.StringIO()), \
                    patch.object(m, "screen", return_value=RESULT):
                if via_handler:
                    out = (http(m, "POST", {"job_id": JOB}), http(m, "GET", query="?job_id=" + JOB))
                else:
                    m._cache_save(JOB, RESULT); out = m._cache_get(JOB)
        finally:
            diag.removeHandler(cap); err.removeHandler(cap)
        lines = [l for l in buf.getvalue().splitlines() if l]
        text = "\n".join(lines)
        for bad in (JOB, SERVICE_JWT, ANON_JWT, OPAQUE, "sig-sentinel", PAYLOAD_SECRET, "member-secret-sentinel",
                    "Invalid API key", "Bearer", "apikey", "offline.invalid", "eq.", "lt.", "HS256"):
            self.assertNotIn(bad, text)
        self.assertTrue(all(l.startswith("[screen_cache] ") for l in lines), lines)
        return out, lines

    def test_service_valid_insert_201_get_200_rows_1(self):
        out, lines = self.run_flow(load(SERVICE_JWT), FakeRest())
        self.assertEqual(out, RESULT)
        self.assertEqual(len(lines), 4)
        self.assertIn("ok method=DELETE path=/screen_cache params=created_at status=204 rows=n/a range=none key=service role=service_role", lines[0])
        self.assertIn("ok method=DELETE path=/screen_cache params=job_id status=204", lines[1])
        self.assertIn("ok method=POST path=/screen_cache params=- status=201 rows=n/a range=none key=service role=service_role", lines[2])
        self.assertIn("ok method=GET path=/screen_cache params=job_id,select status=200 rows=1 range=0-0/* key=service role=service_role", lines[3])

    def test_service_slot_holds_anon_role_key_rls_hides_rows(self):
        # CTO 假設：SUPABASE_SERVICE_KEY 實際是 anon 角色 → 寫入 201、讀回 200 但 0 列 → pending
        m = load(ANON_JWT)
        (post, get), lines = self.run_flow(m, FakeRest(rls_hides_rows=True), via_handler=True)
        self.assertEqual(post, (200, RESULT)); self.assertEqual(get, (200, {"pending": True}))
        self.assertIn("ok method=POST path=/screen_cache params=- status=201 rows=n/a range=none key=service role=anon", lines[2])
        self.assertIn("ok method=GET path=/screen_cache params=job_id,select status=200 rows=0 range=*/* key=service role=anon", lines[3])

    def test_no_service_key_falls_back_to_anon_label(self):
        out, lines = self.run_flow(load(""), FakeRest(rls_hides_rows=True))
        self.assertIsNone(out)
        self.assertIn("status=200 rows=0 range=*/* key=anon role=anon", lines[-1])

    def test_invalid_key_401_only_error_lines(self):
        out, lines = self.run_flow(load(SERVICE_JWT), FakeRest(invalid=True))
        self.assertIsNone(out)
        self.assertEqual(len(lines), 4)                      # DELETE×2、POST、GET 各一行錯誤，沒有 ok 行
        for line in lines:
            self.assertIn("status=401", line); self.assertIn("exc=HTTPError", line); self.assertIn("key=service", line)
            self.assertNotIn(" ok ", line)

    def test_opaque_and_malformed_keys(self):
        _, lines = self.run_flow(load(OPAQUE), FakeRest())
        self.assertIn("key=service role=opaque", lines[-1])
        _, lines = self.run_flow(load(fake_jwt("x; DROP " + JOB)), FakeRest())
        self.assertIn("role=unknown", lines[-1])
        bad = "aaa.%%%notbase64.bbb"
        _, lines = self.run_flow(load(bad), FakeRest())
        self.assertIn("role=opaque", lines[-1])

    def test_content_range_only_numeric_format(self):
        _, lines = self.run_flow(load(SERVICE_JWT), FakeRest(content_range="0-0/" + JOB))
        self.assertIn("range=none", lines[-1])
        _, lines = self.run_flow(load(SERVICE_JWT), FakeRest(content_range="0-0/1"))
        self.assertIn("range=0-0/1", lines[-1])

    def test_diag_channel_does_not_propagate_to_warning_logs(self):
        m = load(SERVICE_JWT)
        self.assertFalse(m._CACHE_DIAG.propagate)
        with patch.object(m._CACHE_LOG, "warning") as warn, patch.object(m.urllib.request, "urlopen", side_effect=FakeRest()), \
                patch.object(m._CACHE_DIAG.handlers[0], "stream", io.StringIO()) as stream:
            m._cache_save(JOB, RESULT); m._cache_get(JOB)
        warn.assert_not_called()
        self.assertEqual(len(stream.getvalue().splitlines()), 4)  # 真正輸出到 stderr 的 handler 也有 4 行
        self.assertEqual(len(m._CACHE_DIAG.handlers), 1)          # 重複載入不會疊加 handler


if __name__ == "__main__":
    unittest.main()
