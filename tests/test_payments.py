"""lib/payments.py 離線測試：假的 PostgREST（記憶體表）＋假的 LINE Pay，不連網路、不寫資料庫。"""
import datetime as dt
import os
import sys
import unittest
from pathlib import Path
from urllib.parse import parse_qsl, unquote

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from lib import linepay as real_lp  # noqa: E402
from lib import payments as P  # noqa: E402

ALICE = {"id": "11111111-1111-1111-1111-111111111111"}
BOB = {"id": "22222222-2222-2222-2222-222222222222"}
ORIGIN = "https://tw-stock-screener-git-uat-andrew250165s-projects.vercel.app"


class FakeRest:
    """只實作 payments.py 用到的 PostgREST 子集：eq/gt/is.null 篩選、order、limit、POST、PATCH。"""

    def __init__(self):
        self.t = {"member_plans": [
            {"plan_code": "research_30d_test", "tier": "research", "days": 30, "price_twd": 20, "label": "研究員 30 天（測試）", "active": True, "sandbox_only": True},
            {"plan_code": "vip_30d_test", "tier": "vip", "days": 30, "price_twd": 40, "label": "VIP 30 天（測試）", "active": True, "sandbox_only": True},
            {"plan_code": "research_30d", "tier": "research", "days": 30, "price_twd": 299, "label": "研究員 30 天", "active": True, "sandbox_only": False},
            {"plan_code": "old_plan", "tier": "vip", "days": 30, "price_twd": 1, "label": "停售", "active": False, "sandbox_only": True}],
            "member_payment_orders": [], "member_subscription_periods": []}
        self.seq = 0

    def _match(self, row, filters):
        for k, v in filters:
            if k in ("select", "order", "limit"):
                continue
            op, _, val = v.partition(".")
            cell = row.get(k)
            if op == "eq" and str(cell).lower() != unquote(val).lower() and not (isinstance(cell, bool) and str(cell).lower() == val):
                return False
            if op == "gt" and not (cell is not None and str(cell) > unquote(val)):
                return False
            if op == "is" and val == "null" and cell is not None:
                return False
        return True

    def __call__(self, path, method="GET", body=None, prefer=None):
        table, _, qs = path.lstrip("/").partition("?")
        filters = parse_qsl(qs, keep_blank_values=True)
        rows = self.t[table]
        if method == "GET":
            out = [dict(r) for r in rows if self._match(r, filters)]
            for k, v in filters:
                if k == "order":
                    col, _, d = v.partition(".")
                    out.sort(key=lambda r: str(r.get(col)), reverse=d == "desc")
                if k == "limit":
                    out = out[:int(v)]
            return 200, out
        if method == "POST":
            made = []
            for r in body:
                r = dict(r)
                if table == "member_subscription_periods":
                    if any(x["provider"] == r["provider"] and x["external_period_id"] == r["external_period_id"] for x in rows):
                        return 409, {"code": "23505"}
                    self.seq += 1
                    r.setdefault("id", self.seq)
                    r.setdefault("revoked_at", None)
                if table == "member_payment_orders":
                    r.setdefault("created_at", dt.datetime.now(dt.timezone.utc).isoformat())
                    r.setdefault("provider_txn_id", None)
                rows.append(r)
                made.append(dict(r))
            return 201, made
        if method == "PATCH":
            hit = [r for r in rows if self._match(r, filters)]
            for r in hit:
                r.update(body)
            return 200, [dict(r) for r in hit]
        raise AssertionError(method)


class FakeLP:
    LinePayError = real_lp.LinePayError

    def __init__(self):
        self.calls, self.confirm_error, self.check_code, self.txn = [], None, "0123", "2023042201206549310"

    def request_payment(self, order_id, amount, name, confirm_url, cancel_url):
        self.calls.append(("request", order_id, amount, confirm_url, cancel_url))
        return self.txn, "https://sandbox-web-pay.line.me/web/payment/wait?x=1", "line://pay/payment/x"

    def confirm_payment(self, txn, amount):
        self.calls.append(("confirm", txn, amount))
        if self.confirm_error:
            raise self.confirm_error
        return {"orderId": "o", "transactionId": txn, "payInfo": [{"method": "BALANCE", "amount": amount}]}

    def check_status(self, txn):
        self.calls.append(("check", txn))
        return self.check_code, ""


class Base(unittest.TestCase):
    def setUp(self):
        self._env = {k: os.environ.get(k) for k in ("LINEPAY_CHANNEL_ID", "LINEPAY_CHANNEL_SECRET", "LINEPAY_ENV")}
        os.environ.update(LINEPAY_CHANNEL_ID="1", LINEPAY_CHANNEL_SECRET="s", LINEPAY_ENV="sandbox")
        self.rest, self.lp = FakeRest(), FakeLP()

    def tearDown(self):
        for k, v in self._env.items():
            if v is None:
                os.environ.pop(k, None)
            else:
                os.environ[k] = v

    def buy(self, user=ALICE, plan="research_30d_test", **extra):
        return P.create(user, dict({"plan_code": plan, "return_origin": ORIGIN}, **extra), self.rest, self.lp)

    def orders(self):
        return self.rest.t["member_payment_orders"]


class PlanTests(Base):
    def test_sandbox_lists_only_active_test_plans(self):
        r = P.list_plans(self.rest)
        self.assertEqual([p["plan_code"] for p in r["plans"]], ["research_30d_test", "vip_30d_test"])

    def test_production_never_sells_test_plans(self):
        os.environ["LINEPAY_ENV"] = "production"
        self.assertEqual([p["plan_code"] for p in P.list_plans(self.rest)["plans"]], ["research_30d"])

    def test_disabled_without_keys(self):
        os.environ.pop("LINEPAY_CHANNEL_SECRET")
        st, j = P.handle("pay_plans", {}, ALICE, self.rest)
        self.assertEqual((st, j["code"]), (503, "PAY_DISABLED"))

    def test_requires_login(self):
        self.assertEqual(P.handle("pay_plans", {}, None, self.rest)[0], 401)


class CreateTests(Base):
    def test_server_price_and_redirect_urls(self):
        r = self.buy(amount=1)                                    # 網頁送來的金額被忽略
        self.assertEqual(r["amount"], 20)
        o = self.orders()[0]
        self.assertEqual((o["status"], o["kind"], o["expected_amount"], o["provider_env"]), ("pending", "membership", 20, "sandbox"))
        self.assertEqual(o["provider_txn_id"], self.lp.txn)
        _, oid, amount, confirm_url, cancel_url = self.lp.calls[0]
        self.assertEqual((oid, amount), (o["order_key"], 20))
        self.assertEqual(confirm_url, ORIGIN + "/?lp=confirm")
        self.assertEqual(cancel_url, ORIGIN + "/?lp=cancel")

    def test_rejects_foreign_origin_and_unknown_plan(self):
        with self.assertRaises(P.PayError):
            self.buy(return_origin="https://evil.example")
        with self.assertRaises(P.PayError):
            self.buy(plan="old_plan")                              # 停售
        with self.assertRaises(P.PayError):
            self.buy(plan="research_30d")                          # 測試環境不賣正式方案
        self.assertEqual(self.orders(), [])

    def test_request_failure_marks_order_failed(self):
        def boom(*a, **k):
            raise real_lp.LinePayError("1104", "Merchant not found.")
        self.lp.request_payment = boom
        with self.assertRaises(P.PayError):
            self.buy()
        self.assertEqual((self.orders()[0]["status"], self.orders()[0]["failure_code"]), ("failed", "request:1104"))


class ConfirmTests(Base):
    def test_happy_path_creates_period_and_marks_paid(self):
        o = self.buy()
        r = P.confirm(ALICE, {"order_key": o["order_key"], "transaction_id": self.lp.txn}, self.rest, self.lp)
        self.assertEqual(r["status"], "paid")
        row = self.orders()[0]
        self.assertEqual((row["paid_amount"], row["paid_currency"]), (20, "TWD"))
        self.assertIsNotNone(row["verified_at"])
        periods = self.rest.t["member_subscription_periods"]
        self.assertEqual(len(periods), 1)
        p = periods[0]
        # 測試環境的期間標成 linepay_sandbox，之後判斷會員等級時可排除（uat／正式站共用資料庫）
        self.assertEqual((p["tier"], p["provider"], p["external_period_id"], row["period_id"]), ("research", "linepay_sandbox", "order:" + o["order_key"], p["id"]))
        days = (dt.datetime.fromisoformat(p["expires_at"]) - dt.datetime.fromisoformat(p["starts_at"])).days
        self.assertEqual(days, 30)
        self.assertEqual(("confirm", self.lp.txn, 20), self.lp.calls[1])   # 用訂單上的金額確認

    def test_confirm_twice_is_idempotent(self):
        o = self.buy()
        args = {"order_key": o["order_key"], "transaction_id": self.lp.txn}
        P.confirm(ALICE, args, self.rest, self.lp)
        r = P.confirm(ALICE, args, self.rest, self.lp)
        self.assertTrue(r["already"])
        self.assertEqual(len(self.rest.t["member_subscription_periods"]), 1)
        self.assertEqual(sum(1 for c in self.lp.calls if c[0] == "confirm"), 1)

    def test_other_users_order_is_not_found(self):
        o = self.buy()
        with self.assertRaises(P.PayError) as e:
            P.confirm(BOB, {"order_key": o["order_key"], "transaction_id": self.lp.txn}, self.rest, self.lp)
        self.assertEqual(e.exception.status, 404)
        self.assertEqual(self.rest.t["member_subscription_periods"], [])

    def test_transaction_mismatch(self):
        o = self.buy()
        with self.assertRaises(P.PayError) as e:
            P.confirm(ALICE, {"order_key": o["order_key"], "transaction_id": "1234567890123456789"}, self.rest, self.lp)
        self.assertEqual(e.exception.status, 400)

    def test_duplicate_code_then_status_completed(self):
        o = self.buy()
        self.lp.confirm_error = real_lp.LinePayError("1172", "dup")
        r = P.confirm(ALICE, {"order_key": o["order_key"], "transaction_id": self.lp.txn}, self.rest, self.lp)
        self.assertEqual(r["status"], "paid")
        self.assertIn(("check", self.lp.txn), self.lp.calls)

    def test_duplicate_code_but_not_completed(self):
        o = self.buy()
        self.lp.confirm_error, self.lp.check_code = real_lp.LinePayError("1198", "dup"), "0121"
        with self.assertRaises(P.PayError):
            P.confirm(ALICE, {"order_key": o["order_key"], "transaction_id": self.lp.txn}, self.rest, self.lp)
        self.assertEqual(self.rest.t["member_subscription_periods"], [])

    def test_retryable_keeps_pending(self):
        o = self.buy()
        self.lp.confirm_error = real_lp.LinePayError("1900", "temp", retryable=True)
        with self.assertRaises(P.PayError) as e:
            P.confirm(ALICE, {"order_key": o["order_key"], "transaction_id": self.lp.txn}, self.rest, self.lp)
        self.assertEqual(e.exception.status, 503)
        self.assertEqual(self.orders()[0]["status"], "pending")

    def test_declined_marks_failed(self):
        o = self.buy()
        self.lp.confirm_error = real_lp.LinePayError("1142", "insufficient")
        with self.assertRaises(P.PayError):
            P.confirm(ALICE, {"order_key": o["order_key"], "transaction_id": self.lp.txn}, self.rest, self.lp)
        self.assertEqual((self.orders()[0]["status"], self.orders()[0]["failure_code"]), ("failed", "confirm:1142"))
        with self.assertRaises(P.PayError) as e:                      # 失敗的單不能再確認
            P.confirm(ALICE, {"order_key": o["order_key"], "transaction_id": self.lp.txn}, self.rest, self.lp)
        self.assertEqual(e.exception.status, 409)

    def test_second_purchase_same_tier_stacks(self):
        a = self.buy()
        P.confirm(ALICE, {"order_key": a["order_key"], "transaction_id": self.lp.txn}, self.rest, self.lp)
        self.lp.txn = "2023042201206549311"
        b = self.buy()
        P.confirm(ALICE, {"order_key": b["order_key"], "transaction_id": self.lp.txn}, self.rest, self.lp)
        p1, p2 = self.rest.t["member_subscription_periods"]
        self.assertEqual(p2["starts_at"], p1["expires_at"])

    def test_bad_order_key_format(self):
        st, j = P.handle("pay_linepay_confirm", {"order_key": "x;drop", "transaction_id": "1"}, ALICE, self.rest)
        self.assertEqual(st, 400)


class CancelHistoryTests(Base):
    def test_cancel_only_pending_and_history(self):
        o = self.buy()
        self.assertEqual(P.cancel(ALICE, {"order_key": o["order_key"]}, self.rest)["status"], "failed")
        self.assertEqual(self.orders()[0]["failure_code"], "cancelled")
        h = P.history(ALICE, self.rest)
        self.assertEqual(len(h["orders"]), 1)
        self.assertEqual(P.history(BOB, self.rest)["orders"], [])


if __name__ == "__main__":
    unittest.main()
