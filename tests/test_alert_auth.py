"""Offline auth boundaries for api/alert.py (FIX-001 / SEC-001)."""
import importlib.util
import io
import json
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "api"))


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


ALERT = load("alert_auth_under_test", ROOT / "api" / "alert.py")


def invoke(body=None, headers=None, path="/api/alert"):
    """Build handler, capture _json calls, run do_POST. Returns (status, payload)."""
    h = object.__new__(ALERT.handler)
    raw = json.dumps(body or {}).encode("utf-8")
    hdrs = {"Content-Length": str(len(raw))}
    if headers:
        hdrs.update(headers)
    h.headers = hdrs
    h.rfile = io.BytesIO(raw)
    h.command = "POST"
    h.path = path
    captured = []

    def _json(code, data):
        captured.append((code, data))
        return (code, data)

    h._json = _json
    h.do_POST()
    assert captured, "handler did not call _json"
    return captured[-1]


class AlertAuthTests(unittest.TestCase):
    def test_x_vercel_cron_alone_cannot_sell_without_cron_secret(self):
        with patch.object(ALERT, "CRON_SECRET", ""), patch.object(ALERT, "_run_sell_alert") as sell:
            status, data = invoke(
                {"kind": "sell", "email": "attacker@evil.test"},
                {"x-vercel-cron": "1", "Authorization": "Bearer anything"},
                path="/api/alert?kind=sell",
            )
        self.assertIn(status, (401, 403))
        sell.assert_not_called()

    def test_bearer_cron_secret_allows_sell(self):
        secret = "unit-cron-secret-value"
        fake = {"ok": True, "sent": False, "message": "patched"}
        with (
            patch.object(ALERT, "CRON_SECRET", secret),
            patch.object(ALERT, "SUPABASE_SERVICE_KEY", "svc-key"),
            patch.object(ALERT, "SUPABASE_ANON_KEY", "anon-key"),
            patch.object(ALERT, "_run_sell_alert", return_value=fake) as sell,
        ):
            status, data = invoke(
                {"kind": "sell", "email": "attacker@evil.test"},
                {"Authorization": f"Bearer {secret}"},
                path="/api/alert?kind=sell",
            )
        self.assertEqual(status, 200)
        self.assertEqual(data, fake)
        sell.assert_called_once_with(ALERT.ALERT_EMAIL)

    def test_wrong_bearer_rejects_sell(self):
        with (
            patch.object(ALERT, "CRON_SECRET", "correct-secret"),
            patch.object(ALERT, "_verify_admin_email", return_value=None),
            patch.object(ALERT, "_run_sell_alert") as sell,
            patch("lib.member_phone.check", return_value=None),
        ):
            status, data = invoke(
                {"kind": "sell"},
                {"Authorization": "Bearer wrong-secret"},
                path="/api/alert?kind=sell",
            )
        self.assertEqual(status, 403)
        self.assertEqual(data, {"error": "forbidden"})
        sell.assert_not_called()

    def test_missing_cron_secret_rejects_header_only_cron(self):
        with patch.object(ALERT, "CRON_SECRET", ""), patch.object(ALERT, "_run_sell_alert") as sell:
            status, data = invoke(
                {"kind": "sell"},
                {"x-vercel-cron": "1", "x-cron-secret": "nope"},
                path="/api/alert?kind=sell",
            )
        self.assertEqual(status, 401)
        sell.assert_not_called()

    def test_non_admin_jwt_forbidden_on_sell_and_test(self):
        with (
            patch.object(ALERT, "CRON_SECRET", "cron"),
            patch.object(ALERT, "_verify_admin_email", return_value=None),
            patch.object(ALERT, "_run_sell_alert") as sell,
            patch.object(ALERT, "_send_test_email") as send_test,
            patch("lib.member_phone.check", return_value=None),
        ):
            sell_status, sell_data = invoke(
                {"kind": "sell", "email": "user@example.com"},
                {"Authorization": "Bearer user-jwt"},
                path="/api/alert?kind=sell",
            )
            test_status, test_data = invoke(
                {"test": True, "email": "user@example.com"},
                {"Authorization": "Bearer user-jwt"},
            )
        self.assertEqual(sell_status, 403)
        self.assertEqual(sell_data, {"error": "forbidden"})
        self.assertEqual(test_status, 403)
        self.assertEqual(test_data, {"error": "forbidden"})
        sell.assert_not_called()
        send_test.assert_not_called()

    def test_admin_can_test_and_recipient_is_alert_email(self):
        with (
            patch.object(ALERT, "CRON_SECRET", "cron"),
            patch.object(ALERT, "_verify_admin_email", return_value="admin@example.com"),
            patch.object(ALERT, "_send_test_email", return_value=(True, "msg-id")) as send_test,
            patch("lib.member_phone.check", return_value=None),
        ):
            status, data = invoke(
                {"test": True, "email": "attacker@evil.test", "subject": "單元測試"},
                {"Authorization": "Bearer admin-jwt"},
            )
        self.assertEqual(status, 200)
        self.assertEqual(data, {"sent": True, "result": "msg-id"})
        send_test.assert_called_once_with(ALERT.ALERT_EMAIL, "單元測試")

    def test_exception_response_hides_traceback(self):
        with (
            patch.object(ALERT, "CRON_SECRET", "cron-secret"),
            patch.object(ALERT, "SUPABASE_SERVICE_KEY", "svc"),
            patch.object(ALERT, "_run_sell_alert", side_effect=RuntimeError("boom at alert.py line 999")),
        ):
            status, data = invoke(
                {"kind": "sell"},
                {"Authorization": "Bearer cron-secret"},
                path="/api/alert?kind=sell",
            )
        self.assertEqual(status, 500)
        self.assertEqual(data, {"error": "internal error"})
        blob = json.dumps(data)
        self.assertNotIn("Traceback", blob)
        self.assertNotIn("alert.py", blob)
        self.assertNotIn("RuntimeError", blob)


    def test_health_recipient_locked_to_alert_email(self):
        with (
            patch.object(ALERT, "CRON_SECRET", "cron"),
            patch.object(ALERT, "SUPABASE_SERVICE_KEY", "svc-key"),
            patch.object(ALERT, "_sa_send", return_value=(True, "id")) as send,
        ):
            status, data = invoke(
                {"kind": "health", "email": "attacker@evil.test", "subject": "s", "message": "m"},
                {"Authorization": "Bearer svc-key"},
                path="/api/alert?kind=health",
            )
        self.assertEqual(status, 200)
        send.assert_called_once()
        self.assertEqual(send.call_args.args[2], ALERT.ALERT_EMAIL)
        self.assertNotEqual(send.call_args.args[2], "attacker@evil.test")

    def test_health_cron_bearer_allowed_and_recipient_locked(self):
        with (
            patch.object(ALERT, "CRON_SECRET", "cron"),
            patch.object(ALERT, "SUPABASE_SERVICE_KEY", "svc-key"),
            patch.object(ALERT, "_sa_send", return_value=(True, "id")) as send,
        ):
            status, _ = invoke(
                {"kind": "health", "email": "attacker@evil.test"},
                {"Authorization": "Bearer cron"},
                path="/api/alert?kind=health",
            )
        self.assertEqual(status, 200)
        self.assertEqual(send.call_args.args[2], ALERT.ALERT_EMAIL)

    def test_health_without_cron_or_service_key_forbidden(self):
        with (
            patch.object(ALERT, "CRON_SECRET", "cron"),
            patch.object(ALERT, "SUPABASE_SERVICE_KEY", "svc-key"),
            patch.object(ALERT, "_verify_admin_email", return_value=None),
            patch.object(ALERT, "_sa_send") as send,
            patch("lib.member_phone.check", return_value=None),
        ):
            status, data = invoke(
                {"kind": "health", "email": "attacker@evil.test"},
                {"Authorization": "Bearer wrong", "x-vercel-cron": "1"},
                path="/api/alert?kind=health",
            )
        self.assertIn(status, (401, 403))
        send.assert_not_called()

if __name__ == "__main__":
    unittest.main()
