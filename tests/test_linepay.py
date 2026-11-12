"""lib/linepay.py 離線測試：不連線 LINE Pay，用假 opener 檢查簽章、交易編號字串化、錯誤處理。"""
import base64
import hashlib
import hmac
import json
import os
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from lib import linepay as lp  # noqa: E402

CFG = ("sandbox", "1234567890", "test-secret-not-real")


class FakeResp:
    def __init__(self, raw):
        self.raw = raw

    def read(self):
        return self.raw

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


class Recorder:
    def __init__(self, raw):
        self.raw, self.req = raw, None

    def __call__(self, req, timeout=None):
        self.req, self.timeout = req, timeout
        return FakeResp(self.raw)


def expected_sig(path, payload, nonce, secret=CFG[2]):
    return base64.b64encode(hmac.new(secret.encode(), (secret + path + payload + nonce).encode(), hashlib.sha256).digest()).decode()


class SignTests(unittest.TestCase):
    def test_sign_matches_documented_formula(self):
        self.assertEqual(lp.sign("s", "/v3/payments/request", '{"a":1}', "n"), expected_sig("/v3/payments/request", '{"a":1}', "n", "s"))


class RequestTests(unittest.TestCase):
    def test_request_signs_exact_body_and_returns_string_txn(self):
        raw = (b'{"returnCode":"0000","returnMessage":"Success.","info":{"paymentUrl":{"web":"https://sandbox-web-pay.line.me/x",'
               b'"app":"line://pay/payment/x"},"transactionId":2023042201206549310,"paymentAccessToken":"1"}}')
        rec = Recorder(raw)
        tid, web, app = lp.request_payment("ord-1", 300, "研究員 30 天", "https://h/?lp=confirm", "https://h/?lp=cancel", cfg=CFG, opener=rec)
        self.assertEqual(tid, "2023042201206549310")          # 19 位數保持精確字串
        self.assertTrue(web.startswith("https://sandbox-web-pay.line.me"))
        req = rec.req
        self.assertEqual(req.full_url, "https://sandbox-api-pay.line.me/v3/payments/request")
        body = req.data.decode()
        h = {k.lower(): v for k, v in req.header_items()}
        self.assertEqual(h["x-line-channelid"], CFG[1])
        self.assertEqual(h["x-line-authorization"], expected_sig("/v3/payments/request", body, h["x-line-authorization-nonce"]))
        j = json.loads(body)
        self.assertEqual(j["amount"], 300)
        self.assertEqual(j["currency"], "TWD")
        self.assertEqual(sum(p["amount"] for p in j["packages"]), j["amount"])
        self.assertEqual(j["packages"][0]["products"][0]["price"] * j["packages"][0]["products"][0]["quantity"], 300)
        self.assertGreaterEqual(rec.timeout, 10)

    def test_nonce_differs_each_call(self):
        raw = b'{"returnCode":"0000","info":{"paymentUrl":{"web":"https://w"},"transactionId":1234567890123456789}}'
        a, b = Recorder(raw), Recorder(raw)
        lp.request_payment("o1", 1, "x", "https://c", "https://d", cfg=CFG, opener=a)
        lp.request_payment("o2", 1, "x", "https://c", "https://d", cfg=CFG, opener=b)
        na = dict(a.req.header_items())["X-line-authorization-nonce"]
        nb = dict(b.req.header_items())["X-line-authorization-nonce"]
        self.assertNotEqual(na, nb)

    def test_rejects_non_integer_amount(self):
        with self.assertRaises(lp.LinePayError):
            lp.request_payment("o", 10.5, "x", "https://c", "https://d", cfg=CFG, opener=Recorder(b"{}"))

    def test_error_shapes(self):
        with self.assertRaises(lp.LinePayError) as e:
            lp.request_payment("o", 1, "x", "https://c", "https://d", cfg=CFG,
                               opener=Recorder(b'{"returnCode":"1172","returnMessage":"Existing same orderId."}'))
        self.assertEqual(e.exception.code, "1172")
        with self.assertRaises(lp.LinePayError) as e:
            lp.request_payment("o", 1, "x", "https://c", "https://d", cfg=CFG,
                               opener=Recorder(b'{"resultCode":1104,"statusMessage":"Merchant not found."}'))
        self.assertEqual(e.exception.code, "1104")
        with self.assertRaises(lp.LinePayError) as e:
            lp.request_payment("o", 1, "x", "https://c", "https://d", cfg=CFG, opener=Recorder(b'{"returnCode":"1900"}'))
        self.assertTrue(e.exception.retryable)

    def test_not_configured(self):
        saved = {k: os.environ.pop(k, None) for k in ("LINEPAY_CHANNEL_ID", "LINEPAY_CHANNEL_SECRET")}
        try:
            self.assertIsNone(lp.config())
            with self.assertRaises(lp.LinePayError) as e:
                lp.request_payment("o", 1, "x", "https://c", "https://d")
            self.assertEqual(e.exception.code, "NOT_CONFIGURED")
        finally:
            for k, v in saved.items():
                if v is not None:
                    os.environ[k] = v


class ConfirmCheckRefundTests(unittest.TestCase):
    def test_confirm_path_body_and_signature(self):
        rec = Recorder(b'{"returnCode":"0000","returnMessage":"OK","info":{"orderId":"o","transactionId":2018082512345678910,'
                       b'"payInfo":[{"method":"BALANCE","amount":300}]}}')
        info = lp.confirm_payment("2018082512345678910", 300, cfg=CFG, opener=rec)
        self.assertEqual(info["transactionId"], "2018082512345678910")
        path = "/v3/payments/2018082512345678910/confirm"
        self.assertTrue(rec.req.full_url.endswith(path))
        h = {k.lower(): v for k, v in rec.req.header_items()}
        self.assertEqual(h["x-line-authorization"], expected_sig(path, rec.req.data.decode(), h["x-line-authorization-nonce"]))
        self.assertEqual(json.loads(rec.req.data), {"amount": 300, "currency": "TWD"})
        self.assertGreaterEqual(rec.timeout, 40)

    def test_confirm_rejects_bad_txn(self):
        with self.assertRaises(lp.LinePayError):
            lp.confirm_payment("12ab", 1, cfg=CFG, opener=Recorder(b"{}"))

    def test_check_is_get_signed_with_empty_query(self):
        rec = Recorder(b'{"returnCode":"0110","returnMessage":"auth completed"}')
        code, _ = lp.check_status("2018082512345678910", cfg=CFG, opener=rec)
        self.assertEqual(code, "0110")
        self.assertEqual(rec.req.get_method(), "GET")
        self.assertIsNone(rec.req.data)
        path = "/v3/payments/requests/2018082512345678910/check"
        h = {k.lower(): v for k, v in rec.req.header_items()}
        self.assertEqual(h["x-line-authorization"], expected_sig(path, "", h["x-line-authorization-nonce"]))

    def test_refund_full_and_partial(self):
        rec = Recorder(b'{"returnCode":"0000","info":{"refundTransactionId":2018082512345678911}}')
        self.assertEqual(lp.refund("2018082512345678910", cfg=CFG, opener=rec), "2018082512345678911")
        self.assertEqual(json.loads(rec.req.data), {})
        rec = Recorder(b'{"returnCode":"0000","info":{"refundTransactionId":1}}')
        lp.refund("2018082512345678910", 100, cfg=CFG, opener=rec)
        self.assertEqual(json.loads(rec.req.data), {"refundAmount": 100})


if __name__ == "__main__":
    unittest.main()
