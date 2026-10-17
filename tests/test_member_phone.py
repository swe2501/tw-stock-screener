import io
import json
import os
import unittest
from unittest.mock import patch
from lib import member_phone

class PhoneGuardTests(unittest.TestCase):
    def call(self, user):
        response = io.BytesIO(json.dumps(user).encode())
        with patch.dict(os.environ, {"MEMBER_REQUIRE_VERIFIED_PHONE":"1", "SUPABASE_URL":"https://auth.fixture", "SUPABASE_ANON_KEY":"public"}), patch("urllib.request.urlopen", return_value=response):
            return member_phone.check("test-token")

    def test_rollout_off_preserves_existing_access_without_auth_call(self):
        with patch.dict(os.environ, {"MEMBER_REQUIRE_VERIFIED_PHONE":"0"}), patch("urllib.request.urlopen") as fetch:
            self.assertIsNone(member_phone.check("token"));fetch.assert_not_called()

    def test_verified_phone_required_from_auth_server_not_metadata(self):
        for user in [{"id":"member"}, {"id":"member","phone":"886912345678","user_metadata":{"phone_verified":True}}, {"id":"member","phone_confirmed_at":"2026-10-17"}]:
            self.assertEqual(self.call(user)[0],403)
        self.assertIsNone(self.call({"id":"member","phone":"886912345678","phone_confirmed_at":"2026-10-17"}))

    def test_missing_token_rejected(self):
        with patch.dict(os.environ, {"MEMBER_REQUIRE_VERIFIED_PHONE":"1"}):
            self.assertEqual(member_phone.check("")[0],401)

    def test_private_endpoints_reject_before_forwarding(self):
        import importlib
        for name, methods in [("watchlist", ["GET", "POST", "PATCH", "DELETE"]), ("broker_watch", ["GET", "POST", "DELETE"]), ("vol_notify", ["POST"])]:
            module = importlib.import_module("api." + name)
            for method in methods:
                instance = module.handler.__new__(module.handler)
                instance.headers = {"Authorization":"Bearer test-token"}
                result = []
                instance._json = lambda *args: result.append(args)
                with patch("lib.member_phone.check", return_value=(403, {"code":"MEMBER_PHONE_REQUIRED"})):
                    getattr(instance, "do_" + method)()
                self.assertEqual(result[0][0], 403, name + method)

    def test_phone_only_member_can_logout_without_email_or_password(self):
        from api import auth
        instance = auth.handler.__new__(auth.handler)
        raw = json.dumps({"action":"logout"}).encode()
        instance.headers = {"Authorization":"Bearer phone-token", "Content-Length":str(len(raw))}
        instance.rfile = io.BytesIO(raw)
        result = []
        instance._json = lambda *args: result.append(args)
        with patch.object(auth, "_sb", return_value=(200, {})) as remote:
            instance.do_POST()
            remote.assert_called_once_with("/logout", {}, token="phone-token")
        self.assertEqual(result[0][0], 200)

    def test_auth_outage_fails_closed(self):
        with patch.dict(os.environ, {"MEMBER_REQUIRE_VERIFIED_PHONE":"1", "SUPABASE_URL":"https://auth.fixture", "SUPABASE_ANON_KEY":"public"}), patch("urllib.request.urlopen", side_effect=TimeoutError):
            self.assertEqual(member_phone.check("token")[0],503)

if __name__ == "__main__":unittest.main()
