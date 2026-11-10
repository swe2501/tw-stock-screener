"""離線 owner 邊界與錯誤不洩漏；僅使用記憶體中的合成資料。"""
import copy
import io
import json
import unittest
import urllib.error
from unittest.mock import patch
from api import watchlist, broker_watch

OWNER = "00000000-0000-0000-0000-000000000001"
OTHER = "00000000-0000-0000-0000-000000000002"
TOKEN = "synthetic-jwt-no-real-account"
SECRET_TEXT = "token=DO_NOT_LOG email=synthetic@example.test /private/path.py Traceback SQL secret"


def invoke(module, method, body=None, query="", auth="Bearer " + TOKEN, raw=None, length=None):
    h = object.__new__(module.handler)
    data = json.dumps(body or {}).encode() if raw is None else raw
    h.headers = {"Content-Length": str(len(data) if length is None else length)}
    if auth is not None:
        h.headers["Authorization"] = auth
    h.command = method
    h.path = "/api/" + module.__name__.split(".")[-1] + query
    h.rfile = io.BytesIO(data)
    responses = []
    h._json = lambda code, payload: responses.append((code, payload))
    getattr(h, "do_" + method)()
    assert len(responses) == 1, responses
    return responses[0]


class MemoryRest:
    """刻意不模擬 RLS，確定應用層本身確實加上 owner 條件。"""
    def __init__(self):
        self.rows = [{"id": 1, "user_id": OWNER, "code": "2330", "broker_id": "B1", "note": "本人"},
                     {"id": 2, "user_id": OTHER, "code": "2330", "broker_id": "B1", "note": "他人"},
                     {"id": 3, "user_id": OTHER, "code": "2603", "broker_id": "B2", "note": "他人私有"}]
        self.calls = []

    def __call__(self, path, method="GET", body=None, token=None, params=None, **kwargs):
        self.calls.append((path, method, copy.deepcopy(body), copy.deepcopy(params), token))
        params = params or {}
        matches = [r for r in self.rows if all(str(r.get(k)) == str(params[k])[3:]
                   for k in ("id", "code", "broker_id", "user_id") if k in params)]
        if method == "GET":
            return 200, copy.deepcopy(matches)
        if method == "PATCH":
            for row in matches:
                row.update(body)
            return 200, copy.deepcopy(matches)
        if method == "DELETE":
            self.rows = [r for r in self.rows if r not in matches]
            return 200, copy.deepcopy(matches)
        if method == "POST":
            row = dict(body)
            if kwargs.get("prefer", "").endswith("merge-duplicates"):
                matching = next((r for r in self.rows if all(r.get(k) == row.get(k)
                                for k in ("user_id", "broker_id", "code"))), None)
                if matching is not None:
                    matching.update(row)
                    return 200, [copy.deepcopy(matching)]
            row.setdefault("id", 4)
            self.rows.append(row)
            return 201, [copy.deepcopy(row)]
        raise AssertionError("不允許的測試操作")


class OwnerBoundaryTests(unittest.TestCase):
    def setUp(self):
        self.rest = MemoryRest()
        for target, kwargs in [("lib.member_phone.check", {"return_value": None}),
                               ("api.watchlist._verified_user_id", {"return_value": (200, OWNER)}),
                               ("api.watchlist._sb", {"side_effect": self.rest}),
                               ("api.broker_watch._sb", {"side_effect": self.rest})]:
            mock = patch(target, **kwargs)
            mock.start()
            self.addCleanup(mock.stop)

    def test_get_returns_only_verified_owner_even_with_forged_query(self):
        for module in (watchlist, broker_watch):
            with self.subTest(module=module.__name__):
                status, data = invoke(module, "GET", query="?user_id=" + OTHER + "&id=3&code=2603")
                self.assertEqual(status, 200)
                self.assertEqual([row["id"] for row in data], [1])
                self.assertEqual(self.rest.calls[-1][3]["user_id"], "eq." + OWNER)

    def test_patch_other_id_cannot_read_or_modify_other_owner(self):
        original = copy.deepcopy(self.rest.rows)
        status, data = invoke(watchlist, "PATCH", {"id": 2, "note": "偽造", "user_id": OTHER}, "?user_id=" + OTHER)
        self.assertEqual((status, data), (200, []))
        self.assertEqual(self.rest.rows, original)
        self.assertEqual(self.rest.calls[-1][3], {"id": "eq.2", "user_id": "eq." + OWNER})
        self.assertNotIn("user_id", self.rest.calls[-1][2])

    def test_patch_own_id_works_but_cannot_transfer_owner(self):
        status, data = invoke(watchlist, "PATCH", {"id": 1, "user_id": OTHER, "note": "已修改"})
        self.assertEqual(status, 200)
        self.assertEqual(data[0]["note"], "已修改")
        self.assertEqual(data[0]["user_id"], OWNER)
        self.assertEqual(self.rest.rows[1]["note"], "他人")

    def test_delete_other_only_code_has_no_effect(self):
        original = copy.deepcopy(self.rest.rows)
        status, data = invoke(watchlist, "DELETE", query="?code=2603&user_id=" + OTHER)
        self.assertEqual((status, data), (200, {"ok": True}))
        self.assertEqual(self.rest.rows, original)

    def test_delete_same_code_deletes_only_own_row(self):
        status, _ = invoke(watchlist, "DELETE", query="?code=2330&user_id=" + OTHER)
        self.assertEqual(status, 200)
        self.assertEqual([row["id"] for row in self.rest.rows], [2, 3])

    def test_post_overwrites_client_owner(self):
        status, data = invoke(watchlist, "POST", {"code": "1101", "user_id": OTHER}, "?user_id=" + OTHER)
        self.assertEqual(status, 201)
        self.assertEqual(data[0]["user_id"], OWNER)

    def test_broker_upsert_same_key_updates_only_own_row(self):
        status, data = invoke(broker_watch, "POST", {"broker_id": "B1", "code": "2330", "broker_name": "更新", "user_id": OTHER})
        self.assertEqual(status, 200)
        self.assertEqual(data[0]["user_id"], OWNER)
        self.assertEqual(self.rest.rows[1]["note"], "他人")
        self.assertNotIn("broker_name", self.rest.rows[1])
        self.assertEqual(self.rest.calls[-1][3]["on_conflict"], "user_id,broker_id,code")

    def test_broker_post_cannot_create_for_other_owner(self):
        status, data = invoke(broker_watch, "POST", {"broker_id": "B2", "code": "2603", "user_id": OTHER})
        self.assertEqual(status, 201)
        self.assertEqual(data[0]["user_id"], OWNER)
        self.assertEqual(self.rest.rows[2]["note"], "他人私有")

    def test_broker_delete_other_only_key_has_no_effect(self):
        original = copy.deepcopy(self.rest.rows)
        status, _ = invoke(broker_watch, "DELETE", query="?broker_id=B2&code=2603&user_id=" + OTHER)
        self.assertEqual(status, 200)
        self.assertEqual(self.rest.rows, original)

    def test_broker_delete_same_key_only_deletes_owner(self):
        status, _ = invoke(broker_watch, "DELETE", query="?broker_id=B1&code=2330&user_id=" + OTHER)
        self.assertEqual(status, 200)
        self.assertEqual([r["id"] for r in self.rest.rows], [2, 3])
        self.assertEqual(self.rest.calls[-1][3], {"broker_id": "eq.B1", "code": "eq.2330", "user_id": "eq." + OWNER})

    def test_no_token_or_non_bearer_rejected_before_rest(self):
        for module, methods in ((watchlist, ("GET", "POST", "PATCH", "DELETE")),
                                (broker_watch, ("GET", "POST", "DELETE"))):
            for method in methods:
                for auth in (None, "", "Basic synthetic", "Bearer "):
                    with self.subTest(module=module.__name__, method=method, auth=auth):
                        self.assertEqual(invoke(module, method, auth=auth)[0], 401)
        self.assertEqual(self.rest.calls, [])

    def test_expired_invalid_or_failed_verification_never_reaches_rest(self):
        for module, methods in ((watchlist, ("GET", "POST", "PATCH", "DELETE")),
                                (broker_watch, ("GET", "POST", "DELETE"))):
            for status in (401, 503):
                with patch("api.watchlist._verified_user_id", return_value=(status, None)):
                    for method in methods:
                        self.assertEqual(invoke(module, method)[0], status)
        self.assertEqual(self.rest.calls, [])

    def test_broker_does_not_inherit_watchlist_patch_route(self):
        self.assertFalse(hasattr(broker_watch.handler, "do_PATCH"))

    def test_invalid_body_or_missing_keys_rejected(self):
        cases = [(watchlist, "PATCH", b"[]", None), (watchlist, "POST", b"{bad", None),
                 (watchlist, "POST", b"{}", -1), (watchlist, "PATCH", b"{}", None),
                 (broker_watch, "POST", b"[]", None), (broker_watch, "POST", b"{}", None),
                 (broker_watch, "POST", b"{}", "bad")]
        for module, method, raw, length in cases:
            self.assertEqual(invoke(module, method, raw=raw, length=length)[0], 400)
        self.assertEqual(invoke(watchlist, "DELETE")[0], 400)
        self.assertEqual(invoke(broker_watch, "DELETE", query="?code=2330")[0], 400)
        self.assertEqual(self.rest.calls, [])


class SafeErrorsTests(unittest.TestCase):
    def setUp(self):
        for target, kwargs in [("lib.member_phone.check", {"return_value": None}),
                               ("api.watchlist._verified_user_id", {"return_value": (200, OWNER)})]:
            mock = patch(target, **kwargs)
            mock.start()
            self.addCleanup(mock.stop)

    def requests(self):
        for module, methods in ((watchlist, ("GET", "POST", "PATCH", "DELETE")),
                                (broker_watch, ("GET", "POST", "DELETE"))):
            for method in methods:
                yield module, method, {"id": 1, "code": "2330", "broker_id": "B1", "user_id": OTHER}

    def test_exceptions_all_verbs_are_generic_and_safe_logged(self):
        for module, method, body in self.requests():
            with self.subTest(module=module.__name__, method=method), \
                 patch.object(module, "_sb", side_effect=RuntimeError(SECRET_TEXT)), \
                 self.assertLogs("api.watchlist", level="ERROR") as logs:
                result = invoke(module, method, body, "?code=2330&broker_id=B1")
            self.assertEqual(result, (500, {"error": "internal_error"}))
            text = json.dumps(result) + " ".join(logs.output)
            for sensitive in (SECRET_TEXT, "DO_NOT_LOG", "synthetic@example.test", OWNER, OTHER, TOKEN, "/private/path.py"):
                self.assertNotIn(sensitive, text)
            self.assertIn("RuntimeError", " ".join(logs.output))

    def test_upstream_errors_all_verbs_never_forward_payload(self):
        for module, method, body in self.requests():
            for status in (400, 401, 403, 404, 409, 429, 500, 502):
                with self.subTest(module=module.__name__, method=method, status=status), \
                     patch.object(module, "_sb", return_value=(status, {"traceback": SECRET_TEXT, "message": SECRET_TEXT})), \
                     self.assertLogs("api.watchlist", level="ERROR") as logs:
                    code, payload = invoke(module, method, body, "?code=2330&broker_id=B1")
                self.assertEqual(code, status)
                self.assertEqual(set(payload), {"error"})
                self.assertNotIn(SECRET_TEXT, json.dumps(payload) + " ".join(logs.output))
                self.assertNotIn("traceback", json.dumps(payload).lower())

    def test_phone_guard_exception_is_generic(self):
        for module in (watchlist, broker_watch):
            with patch("lib.member_phone.check", side_effect=RuntimeError(SECRET_TEXT)), self.assertLogs("api.watchlist", level="ERROR"):
                self.assertEqual(invoke(module, "GET"), (500, {"error": "internal_error"}))

    def test_rest_http_error_body_not_read_or_leaked(self):
        for module in (watchlist, broker_watch):
            error_body = io.BytesIO(SECRET_TEXT.encode())
            error = urllib.error.HTTPError("https://rest.fixture", 500, SECRET_TEXT, {}, error_body)
            with patch.object(module, "SUPABASE_URL", "https://rest.fixture"), \
                 patch("urllib.request.urlopen", side_effect=error):
                code, payload = module._sb("/watchlist", token=TOKEN)
            self.assertEqual((code, payload), (500, {}))
            self.assertEqual(error_body.tell(), 0)


class VerifiedIdentityTests(unittest.TestCase):
    def verify(self, response=None, error=None, token=TOKEN):
        response = io.BytesIO(json.dumps(response).encode())
        with patch.object(watchlist, "SUPABASE_URL", "https://auth.fixture"), \
             patch.object(watchlist, "SUPABASE_ANON_KEY", "synthetic-public-key"), \
             patch("urllib.request.urlopen", side_effect=error, return_value=response) as remote:
            result = watchlist._verified_user_id(token)
        return result, remote

    def test_only_auth_verified_id_used_not_metadata_or_unverified_claims(self):
        result, remote = self.verify({"id": OWNER, "user_metadata": {"user_id": OTHER}, "sub": OTHER})
        self.assertEqual(result, (200, OWNER))
        request = remote.call_args.args[0]
        self.assertEqual(request.full_url, "https://auth.fixture/auth/v1/user")
        self.assertEqual(request.get_header("Authorization"), "Bearer " + TOKEN)
        self.assertEqual(remote.call_args.kwargs["timeout"], 10)

    def test_malformed_or_missing_identity_fails_closed(self):
        for user in ({}, {"sub": OWNER}, {"id": OTHER + ",or.(id.neq.null)"}, {"id": 1}, [], None):
            self.assertEqual(self.verify(user)[0], (401, None))

    def test_invalid_expired_token_and_auth_outage_fail_closed(self):
        for status, expected in ((401, 401), (403, 401), (500, 503)):
            error = urllib.error.HTTPError("https://auth.fixture", status, SECRET_TEXT, {}, io.BytesIO(SECRET_TEXT.encode()))
            with self.assertLogs("api.watchlist", level="ERROR") as logs:
                self.assertEqual(self.verify(error=error)[0], (expected, None))
            self.assertNotIn(SECRET_TEXT, " ".join(logs.output))
        with self.assertLogs("api.watchlist", level="ERROR"):
            self.assertEqual(self.verify(error=TimeoutError(SECRET_TEXT))[0], (503, None))

    def test_missing_config_missing_or_oversized_token_no_request(self):
        for token in (None, "", "x" * 8193):
            result, remote = self.verify(token=token)
            self.assertEqual(result, (401, None))
            remote.assert_not_called()
        with patch.object(watchlist, "SUPABASE_URL", ""), patch("urllib.request.urlopen") as remote:
            self.assertEqual(watchlist._verified_user_id(TOKEN), (503, None))
        remote.assert_not_called()


if __name__ == "__main__":
    unittest.main()
