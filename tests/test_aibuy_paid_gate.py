"""AI 買點付費保護（phase 1）離線測試；所有金鑰、JWT、會員 ID 都是假的，不連網。"""
import contextlib
import importlib.util
import io
import json
import logging
import os
from pathlib import Path
import re
import unittest
from unittest.mock import patch
from urllib.error import HTTPError
from urllib.parse import parse_qs, urlsplit

ROOT = Path(__file__).parents[1]
SOURCE = ROOT / "api/screen.py"
SERVICE = "fake-service-sentinel-DO-NOT-LOG"
ANON = "fake-anon-sentinel-DO-NOT-LOG"
TOKEN = "fake.jwt.sentinel-DO-NOT-LOG"
FREE_ID = "00000000-0000-4000-8000-000000000001"
PAID_ID = "00000000-0000-4000-8000-000000000002"
SUB_ID = "00000000-0000-4000-8000-000000000003"
EXPIRED_ID = "00000000-0000-4000-8000-000000000004"
ADMIN_ID = "ef7193f4-15be-4ab0-b004-705d95b1a3dc"
ENV = {"SUPABASE_URL": "https://offline.invalid", "SUPABASE_ANON_KEY": ANON, "SUPABASE_SERVICE_KEY": SERVICE}


class Response(io.BytesIO):
    def __init__(self, value=None, status=200):
        super().__init__(json.dumps(value).encode() if value is not None else b"")
        self.status = status
        self.headers = {}


def load_screen():
    spec = importlib.util.spec_from_file_location("screen_aibuy_gate", SOURCE)
    module = importlib.util.module_from_spec(spec)
    with patch.dict(os.environ, ENV):
        spec.loader.exec_module(module)
    return module


def call(module, query, token=TOKEN, method="GET"):
    h = module.handler.__new__(module.handler)
    h.headers = {"Authorization": "Bearer " + token} if token else {}
    h.rfile, h.wfile = io.BytesIO(b""), io.BytesIO()
    h.path = "/api/screen" + query
    statuses, headers = [], {}
    h.send_response = statuses.append
    h.send_header = lambda k, v: headers.__setitem__(k, v)
    h.end_headers = lambda: None
    getattr(h, "do_" + method)()
    raw = h.wfile.getvalue()
    body = json.loads(raw) if headers.get("Content-Type", "").startswith("application/json") else raw
    return (statuses[0] if statuses else None), headers, body


class Supabase:
    """假的 Supabase：/auth/v1/user 依 JWT 回會員；member_tiers／periods／page_cache 依 fixture 回。"""
    def __init__(self, uid=PAID_ID, tiers=None, periods=None, period_status=200, auth_status=200, cache=None, count=None):
        self.uid, self.auth_status, self.period_status = uid, auth_status, period_status
        self.tiers = tiers if tiers is not None else {PAID_ID: [{"tier": "vip", "expires_at": None}],
                                                       EXPIRED_ID: [{"tier": "vip", "expires_at": "2000-01-01T00:00:00+00:00"}],
                                                       FREE_ID: [{"tier": "free", "expires_at": None}]}
        self.periods = periods if periods is not None else {SUB_ID: [{"tier": "research"}]}
        self.cache, self.count, self.requests = cache or [], count, []

    def __call__(self, request, timeout=None):
        self.requests.append(request)
        u = urlsplit(request.full_url)
        q = parse_qs(u.query)
        if u.path == "/auth/v1/user":
            if self.auth_status != 200:
                raise HTTPError(request.full_url, self.auth_status, "x", None, None)
            return Response({"id": self.uid})
        uid = (q.get("user_id") or [""])[0][3:]
        if u.path == "/rest/v1/member_tiers":
            return Response(self.tiers.get(uid, []))
        if u.path == "/rest/v1/member_subscription_periods":
            if self.period_status != 200:
                raise HTTPError(request.full_url, self.period_status, "x", None, None)
            return Response(self.periods.get(uid, []))
        if u.path == "/rest/v1/page_cache":
            kind = q.get("kind", [""])[0]
            if request.get_method() == "POST":
                return Response(None, 201)
            if kind == "eq.aibuy__count":
                return Response(self.count or [])
            return Response(self.cache)
        if u.path == "/rest/v1/price_window":
            return Response([])
        raise AssertionError("unexpected upstream " + u.path)

    def key_of(self, path):
        return [(r.get_header("Apikey"), r.get_method()) for r in self.requests if urlsplit(r.full_url).path == path]


BARS = [[f"2026-{1 + i // 28:02d}-{1 + i % 28:02d}", 10, 11, 9, 10, 1000] for i in range(120)]


class AibuyPaidGate(unittest.TestCase):
    def setUp(self):
        self.s = load_screen()
        self.env = patch.dict(os.environ, dict(ENV, ANTHROPIC_API_KEY="fake-ai-sentinel", AI_PROVIDER="anthropic"))
        self.env.start()
        self.addCleanup(self.env.stop)
        # 任何被擋的情況都不可呼叫 AI 或做昂貴工作
        self.llm = patch.object(self.s, "_aibuy_call", side_effect=AssertionError("LLM must not run")).start()
        self.bars = patch.object(self.s, "_aibuy_bars", side_effect=AssertionError("bars must not load")).start()
        self.png = patch.object(self.s, "_aibuy_png", side_effect=AssertionError("png must not render")).start()
        self.core = patch.object(self.s, "_aibuy", wraps=self.s._aibuy).start()
        self.addCleanup(patch.stopall)

    def expect_blocked(self, status, query="?stat=aibuy&code=2330", token=TOKEN, fake=None):
        fake = fake or Supabase()
        with patch.object(self.s.urllib.request, "urlopen", side_effect=fake):
            code, headers, body = call(self.s, query, token=token)
        self.assertEqual(code, status)
        self.assertEqual(headers["Cache-Control"], "private, no-store")
        self.assertEqual(body["auth"], status)
        self.llm.assert_not_called(); self.bars.assert_not_called(); self.png.assert_not_called(); self.core.assert_not_called()
        self.assertEqual(fake.key_of("/rest/v1/page_cache"), [])
        return body, fake

    def test_not_logged_in_401_for_json_and_img(self):
        for q in ("?stat=aibuy&code=2330", "?stat=aibuy&code=2330&img=1", "?stat=aibuy&code=bad!"):
            with self.subTest(q=q):
                body, fake = self.expect_blocked(401, q, token="")
                self.assertEqual(body["error"], "請先登入會員")
                self.assertEqual(fake.requests, [])            # 沒 token 連 Auth 都不打

    def test_non_bearer_header_is_401(self):
        self.assertEqual(self.s._aibuy_bearer({"Authorization": "Basic abc"}), "")
        self.assertEqual(self.s._aibuy_bearer({"Authorization": "Bearer " + "x" * 9000}), "")

    def test_invalid_or_expired_jwt_401(self):
        for st in (401, 403):
            with self.subTest(st=st):
                self.expect_blocked(401, fake=Supabase(auth_status=st))
        self.expect_blocked(401, fake=Supabase(uid="not-a-uuid"))

    def test_free_member_403_for_json_and_img(self):
        for q in ("?stat=aibuy&code=2330", "?stat=aibuy&code=2330&img=1"):
            with self.subTest(q=q):
                body, fake = self.expect_blocked(403, q, fake=Supabase(uid=FREE_ID))
                self.assertIn("付費會員", body["error"])
                self.assertIn("升級", body["error"])
                self.assertEqual({k for k, _ in fake.key_of("/rest/v1/member_tiers")}, {SERVICE})
                self.assertEqual({k for k, _ in fake.key_of("/rest/v1/member_subscription_periods")}, {SERVICE})

    def test_member_without_row_and_expired_tier_403(self):
        self.expect_blocked(403, fake=Supabase(uid="00000000-0000-4000-8000-0000000000ff"))
        self.expect_blocked(403, fake=Supabase(uid=EXPIRED_ID))
        self.expect_blocked(403, fake=Supabase(uid=FREE_ID, period_status=404))   # periods 表未建立

    def test_service_key_missing_fails_closed_503_no_anon_fallback(self):
        with patch.dict(os.environ, {"SUPABASE_SERVICE_KEY": ""}):
            body, fake = self.expect_blocked(503)
        self.assertEqual(fake.requests, [])                    # 不用 anon 去驗或讀等級
        self.assertIn("暫時無法使用", body["error"])

    def test_upstream_failures_fail_closed_503(self):
        self.expect_blocked(503, fake=Supabase(auth_status=500))
        self.expect_blocked(503, fake=Supabase(uid=FREE_ID, period_status=500))
        broken = Supabase()
        orig = broken.__call__
        def tiers_down(request, timeout=None):
            if urlsplit(request.full_url).path == "/rest/v1/member_tiers":
                raise HTTPError(request.full_url, 500, "x", None, None)
            return orig(request, timeout)
        with patch.object(self.s.urllib.request, "urlopen", side_effect=tiers_down):
            code, headers, _ = call(self.s, "?stat=aibuy&code=2330")
        self.assertEqual((code, headers["Cache-Control"]), (503, "private, no-store"))
        self.llm.assert_not_called()

    def allowed(self, fake, query="?stat=aibuy&code=2330"):
        self.bars.side_effect = None; self.bars.return_value = BARS
        self.png.side_effect = None; self.png.return_value = (b"\x89PNG-fixture", "desc")
        self.llm.side_effect = None
        self.llm.return_value = ({"verdict": "觀望", "points": []}, {"in": 1, "out": 1})
        with patch.object(self.s, "_aibuy_facts", return_value=("facts", None)), \
                patch.object(self.s.urllib.request, "urlopen", side_effect=fake):
            return call(self.s, query)

    def test_paid_member_200_and_page_cache_reads_use_service_only(self):
        fake = Supabase(uid=PAID_ID)
        code, headers, body = self.allowed(fake)
        self.assertEqual((code, headers["Cache-Control"]), (200, "private, no-store"))
        self.assertEqual(body["verdict"], "觀望")
        self.llm.assert_called_once()
        reads = [(k, m) for k, m in fake.key_of("/rest/v1/page_cache")]
        self.assertEqual(reads[:2], [(SERVICE, "GET"), (SERVICE, "GET")])
        self.assertTrue(all(k == SERVICE for k, _ in reads))
        self.assertEqual(fake.key_of("/rest/v1/member_subscription_periods"), [])   # 已由 member_tiers 判定付費

    def test_subscription_period_member_200(self):
        code, headers, _ = self.allowed(Supabase(uid=SUB_ID))
        self.assertEqual((code, headers["Cache-Control"]), (200, "private, no-store"))

    def test_admin_allowed_without_tier_lookup(self):
        fake = Supabase(uid=ADMIN_ID, tiers={})
        code, headers, _ = self.allowed(fake)
        self.assertEqual((code, headers["Cache-Control"]), (200, "private, no-store"))
        self.assertEqual(fake.key_of("/rest/v1/member_tiers"), [])

    def test_admin_ids_match_auth_py(self):
        src = (ROOT / "api/auth.py").read_text(encoding="utf-8")
        block = re.search(r"ADMIN_IDS = \{(.*?)\}", src, re.S).group(1)
        self.assertEqual(set(re.findall(r'"([0-9a-f-]{36})"', block)), set(self.s.AIBUY_ADMIN_IDS))

    def test_cached_hit_and_img_and_errors_are_private_no_store(self):
        fake = Supabase(uid=PAID_ID)
        code, headers, body = self.allowed(fake, "?stat=aibuy&code=2330&img=1")
        self.assertEqual((code, headers["Content-Type"], headers["Cache-Control"]), (200, "image/png", "private, no-store"))
        self.llm.assert_not_called()
        code, headers, body = self.allowed(Supabase(uid=PAID_ID), "?stat=aibuy&code=bad!")
        self.assertEqual((code, body["error"], headers["Cache-Control"]), (200, "代號格式不正確", "private, no-store"))
        # 共享快取命中：同日同模型 → 不呼叫 AI
        model = self.s._aibuy_provider()[2]
        hit = Supabase(uid=PAID_ID, cache=[{"payload": {"date": BARS[-1][0], "model": model, "v": self.s.AIBUY_VER, "verdict": "偏多"}}])
        code, headers, body = self.allowed(hit)
        self.assertEqual((code, body.get("cached"), headers["Cache-Control"]), (200, True, "private, no-store"))
        self.llm.assert_not_called()
        # 伺服器錯誤 stub
        with patch.object(self.s, "_aibuy_provider", side_effect=RuntimeError("boom")):
            code, headers, body = self.allowed(Supabase(uid=PAID_ID))
        self.assertEqual((code, headers["Cache-Control"]), (200, "private, no-store"))
        self.assertTrue(body["stub"])

    def test_counter_unreadable_fails_closed_without_llm(self):
        fake = Supabase(uid=PAID_ID)
        orig = fake.__call__
        def count_down(request, timeout=None):
            if "aibuy__count" in request.full_url:
                raise HTTPError(request.full_url, 500, "x", None, None)
            return orig(request, timeout)
        code, headers, body = self.allowed(count_down)
        self.assertEqual((code, headers["Cache-Control"]), (200, "private, no-store"))
        self.assertTrue(body["stub"])
        self.llm.assert_not_called()

    def test_other_page_cache_kinds_still_use_anon(self):
        for kind in ("themes", "sectors", "themeall", "sectorall", "focus", "limitup", "codex_visual_patterns@uat"):
            with self.subTest(kind=kind), patch.object(self.s.urllib.request, "urlopen", return_value=Response([])) as up:
                self.s._cache_sb("/page_cache", params=[("kind", "eq." + kind), ("select", "payload")])
                self.assertEqual(up.call_args.args[0].get_header("Apikey"), ANON)

    def test_frontend_has_no_unauthenticated_aibuy_caller(self):
        # 2ca2aedf 起前端「AI 判定」只讀已存的視覺判讀，不呼叫 ?stat=aibuy。日後新增呼叫者必須走
        # _authFetch（帶 Authorization）＋blob URL（img=1），並顯示 401 請先登入／403 付費升級提示。
        hits = []
        for f in (ROOT / "apps/web").rglob("*"):
            if f.suffix in (".html", ".js", ".mjs", ".cjs") and f.is_file() and "node_modules" not in f.parts:
                text = f.read_text(encoding="utf-8", errors="ignore")
                if re.search(r"stat=aibuy|['\"]aibuy['\"]", text):
                    hits.append(str(f.relative_to(ROOT)))
        self.assertEqual(hits, [], "new aibuy caller must use _authFetch + 401/403 UI; update this test with it")

    def test_preflight_allows_authorization(self):
        _, headers, _ = call(self.s, "", method="OPTIONS")
        self.assertIn("Authorization", headers["Access-Control-Allow-Headers"])

    def test_no_secret_or_identity_in_logs_or_responses(self):
        log, out = io.StringIO(), io.StringIO()
        cap = logging.StreamHandler(log); logging.getLogger().addHandler(cap)
        try:
            with contextlib.redirect_stdout(out), contextlib.redirect_stderr(out):
                bodies = [self.expect_blocked(403, fake=Supabase(uid=FREE_ID))[0],
                          self.expect_blocked(503, fake=Supabase(auth_status=500))[0]]
                bodies.append(self.allowed(Supabase(uid=PAID_ID))[2])
        finally:
            logging.getLogger().removeHandler(cap)
        text = log.getvalue() + out.getvalue() + json.dumps(bodies, ensure_ascii=False)
        for secret in (SERVICE, ANON, TOKEN, FREE_ID, PAID_ID):
            self.assertNotIn(secret, text)


if __name__ == "__main__":
    unittest.main()
