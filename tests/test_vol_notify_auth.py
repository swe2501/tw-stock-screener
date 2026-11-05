import io, json, os, sys, unittest
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from api import vol_notify


class _Resp:
    def __init__(self, data): self._d = json.dumps(data).encode()
    def read(self, *a): return self._d
    def __enter__(self): return self
    def __exit__(self, *a): return False


def _call(headers, body):
    raw = json.dumps(body).encode()
    h = vol_notify.handler.__new__(vol_notify.handler)
    hdrs = {"Content-Length": str(len(raw))}
    hdrs.update(headers)
    h.headers = hdrs
    h.rfile = io.BytesIO(raw)
    h.wfile = io.BytesIO()
    out = {}
    h.send_response = lambda c, *a: out.__setitem__("status", c)
    h.send_header = lambda *a: None
    h.end_headers = lambda: None
    h.do_POST()
    return out.get("status"), h.wfile.getvalue().decode("utf-8")


BODY = {"code": "2330", "name": "TSMC", "vol": 1000, "vol_target": 500, "email": "attacker@evil.test"}
ENV = {"SUPABASE_URL": "https://example.supabase.co", "SUPABASE_ANON_KEY": "anon", "MEMBER_REQUIRE_VERIFIED_PHONE": ""}


@mock.patch.dict(os.environ, ENV)
class VolNotifyAuthTest(unittest.TestCase):
    def test_no_bearer_401(self):
        with mock.patch.object(vol_notify, "_send_vol_email") as send:
            st, _ = _call({}, BODY)
        self.assertEqual(st, 401); send.assert_not_called()

    def test_fake_token_raise_401(self):
        with mock.patch("urllib.request.urlopen", side_effect=Exception("401")), \
             mock.patch.object(vol_notify, "_send_vol_email") as send:
            st, _ = _call({"Authorization": "Bearer fake"}, BODY)
        self.assertEqual(st, 401); send.assert_not_called()

    def test_fake_token_httperror_401(self):
        import urllib.error
        err = urllib.error.HTTPError("u", 401, "no", {}, io.BytesIO(b"{}"))
        with mock.patch("urllib.request.urlopen", side_effect=err), \
             mock.patch.object(vol_notify, "_send_vol_email") as send:
            st, _ = _call({"Authorization": "Bearer fake"}, BODY)
        self.assertEqual(st, 401); send.assert_not_called()

    def test_valid_user_sends_to_user_email(self):
        user = {"id": "u1", "email": "user@example.com", "email_confirmed_at": "2026-01-01T00:00:00Z"}
        with mock.patch("urllib.request.urlopen", return_value=_Resp(user)), \
             mock.patch.object(vol_notify, "_send_vol_email", return_value=(True, "id")) as send:
            st, _ = _call({"Authorization": "Bearer good"}, BODY)
        self.assertEqual(st, 200)
        self.assertEqual(send.call_args[0][4], "user@example.com")
        self.assertNotIn("attacker@evil.test", str(send.call_args))

    def test_unconfirmed_email_403(self):
        user = {"id": "u1", "email": "user@example.com", "email_confirmed_at": None}
        with mock.patch("urllib.request.urlopen", return_value=_Resp(user)), \
             mock.patch.object(vol_notify, "_send_vol_email") as send:
            st, _ = _call({"Authorization": "Bearer good"}, BODY)
        self.assertEqual(st, 403); send.assert_not_called()

    def test_missing_email_403(self):
        with mock.patch("urllib.request.urlopen", return_value=_Resp({"id": "u1"})), \
             mock.patch.object(vol_notify, "_send_vol_email") as send:
            st, _ = _call({"Authorization": "Bearer good"}, BODY)
        self.assertEqual(st, 403); send.assert_not_called()

    def test_no_user_id_401(self):
        with mock.patch("urllib.request.urlopen", return_value=_Resp({"email": "a@b.c"})), \
             mock.patch.object(vol_notify, "_send_vol_email") as send:
            st, _ = _call({"Authorization": "Bearer good"}, BODY)
        self.assertEqual(st, 401); send.assert_not_called()

    def test_missing_supabase_env_401(self):
        with mock.patch.dict(os.environ, {"SUPABASE_URL": ""}), \
             mock.patch("urllib.request.urlopen") as uo, \
             mock.patch.object(vol_notify, "_send_vol_email") as send:
            st, _ = _call({"Authorization": "Bearer good"}, BODY)
        self.assertEqual(st, 401); uo.assert_not_called(); send.assert_not_called()

    def test_internal_error_no_traceback(self):
        user = {"id": "u1", "email": "user@example.com", "email_confirmed_at": "x"}
        with mock.patch("urllib.request.urlopen", return_value=_Resp(user)), \
             mock.patch.object(vol_notify, "_send_vol_email", side_effect=RuntimeError("boom secret")):
            st, out = _call({"Authorization": "Bearer good"}, BODY)
        self.assertEqual(st, 500)
        self.assertNotIn("Traceback", out); self.assertNotIn("boom", out)
        self.assertIn("internal error", out)

    def test_missing_fields_400(self):
        user = {"id": "u1", "email": "user@example.com", "email_confirmed_at": "x"}
        with mock.patch("urllib.request.urlopen", return_value=_Resp(user)), \
             mock.patch.object(vol_notify, "_send_vol_email") as send:
            st, _ = _call({"Authorization": "Bearer good"}, {"email": "attacker@evil.test"})
        self.assertEqual(st, 400); send.assert_not_called()


if __name__ == "__main__":
    unittest.main()
