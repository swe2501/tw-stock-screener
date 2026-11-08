"""會員方案付款（LINE Pay）— 訂單、確認、開通。2026-11-08 第一階段：只在設定了 LINE Pay 金鑰的環境（uat 測試）啟用。

資料表（docs/database/member-payment-linepay.sql＋member-membership-lifecycle.sql）：
  member_plans                 價格表；後端只認這裡的價格
  member_payment_orders        訂單（kind='membership'）；合夥人原儲值點數表擴充
  member_subscription_periods  已付款期間（付款確認成功才寫）

安全原則：
  - 金額、方案、等級、天數一律由伺服器查表決定；網頁只送方案代碼。
  - 只有呼叫 LINE Pay「確認付款」成功（或查詢狀態為已完成）才寫已付款期間；網頁導回不等於已付款。
  - 確認與開通都可重複呼叫：同一訂單只開通一次（external_period_id 唯一＋訂單狀態條件更新）。
  - 回跳網址只接受本站網域。
rest(path, method, body, prefer) → (status, data)，由呼叫端注入（api/auth.py 的 service role）。
"""
import datetime as dt
import re
import uuid
from urllib.parse import quote

from lib import linepay as lp

PROVIDER = "linepay"
ORIGIN_RE = re.compile(r"^https://(tw-stock-screener-neon\.vercel\.app"
                       r"|tw-stock-screener-[a-z0-9]+-andrew250165s-projects\.vercel\.app"
                       r"|tw-stock-screener-git-[a-z0-9-]+-andrew250165s-projects\.vercel\.app)$")
LOCAL_RE = re.compile(r"^http://(localhost|127\.0\.0\.1):\d{2,5}$")
ORDER_RE = re.compile(r"^fq[0-9a-f]{32}$")
# 確認付款時表示「已經確認過／重複」的代碼 → 改查狀態判斷
DUPLICATE_CODES = {"1172", "1152", "1198"}


class PayError(Exception):
    def __init__(self, status, message, code=""):
        super().__init__(message)
        self.status, self.message, self.code = status, message, code


def now():
    return dt.datetime.now(dt.timezone.utc)


def _q(v):
    return quote(str(v), safe="")


def enabled():
    cfg = lp.config()
    return cfg[0] if cfg else None


def _plans(rest, env):
    st, rows = rest("/member_plans?select=plan_code,tier,days,price_twd,label,sandbox_only&active=eq.true&order=price_twd.asc")
    if st != 200 or not isinstance(rows, list):
        raise PayError(503, "方案暫時無法讀取")
    # 測試環境只賣測試方案；正式環境絕不賣測試方案
    return [r for r in rows if bool(r.get("sandbox_only")) == (env == "sandbox")]


def list_plans(rest):
    env = enabled()
    if not env:
        raise PayError(503, "付款功能尚未開放", "PAY_DISABLED")
    return {"env": env, "plans": [{k: r[k] for k in ("plan_code", "tier", "days", "price_twd", "label")} for r in _plans(rest, env)]}


def _origin(value, env):
    v = str(value or "").rstrip("/")
    if ORIGIN_RE.match(v) or (env == "sandbox" and LOCAL_RE.match(v)):
        return v
    raise PayError(400, "回跳網址不在允許清單")


def create(user, body, rest, lp_mod=lp):
    """建立訂單並向 LINE Pay 申請付款 → {order_key, payment_url, app_url, amount, label}。"""
    env = enabled()
    if not env:
        raise PayError(503, "付款功能尚未開放", "PAY_DISABLED")
    plan_code = str(body.get("plan_code") or "")
    plan = next((p for p in _plans(rest, env) if p["plan_code"] == plan_code), None)
    if not plan:
        raise PayError(400, "方案不存在或未開放")
    origin = _origin(body.get("return_origin"), env)
    amount = int(plan["price_twd"])
    order_key = "fq" + uuid.uuid4().hex
    row = {"user_id": user["id"], "order_key": order_key, "provider_event_key": f"{PROVIDER}:{order_key}",
           "status": "pending", "expected_amount": amount, "currency": "TWD", "kind": "membership",
           "plan_code": plan_code, "provider": PROVIDER, "provider_env": env}
    st, _ = rest("/member_payment_orders", "POST", [row], "return=minimal")
    if st not in (200, 201, 204):
        raise PayError(503, "訂單建立失敗，請稍後再試")
    try:
        txn, web, app = lp_mod.request_payment(order_key, amount, plan["label"],
                                               origin + "/?lp=confirm", origin + "/?lp=cancel")
    except lp_mod.LinePayError as e:
        _patch(rest, order_key, {"status": "failed", "failure_code": "request:" + e.code[:40]}, only_pending=True)
        raise PayError(502, "LINE Pay 申請付款失敗（" + e.code + "）", e.code)
    _patch(rest, order_key, {"provider_txn_id": txn}, only_pending=True)
    return {"order_key": order_key, "payment_url": web, "app_url": app, "amount": amount, "label": plan["label"]}


def _patch(rest, order_key, fields, only_pending=False):
    fields = dict(fields, updated_at=now().isoformat())
    path = "/member_payment_orders?order_key=eq." + _q(order_key) + ("&status=eq.pending" if only_pending else "")
    return rest(path, "PATCH", fields, "return=representation")


def _order(rest, user, order_key):
    if not ORDER_RE.match(str(order_key or "")):
        raise PayError(400, "訂單編號格式錯誤")
    st, rows = rest("/member_payment_orders?select=*&kind=eq.membership&order_key=eq." + _q(order_key))
    if st != 200 or not isinstance(rows, list):
        raise PayError(503, "訂單暫時無法讀取")
    if not rows or rows[0]["user_id"] != user["id"]:
        raise PayError(404, "找不到訂單")       # 不洩漏別人訂單是否存在
    return rows[0]


def period_provider(order):
    """已付款期間的 provider：正式付款 'linepay'；測試環境 'linepay_sandbox'。
    uat 與正式站共用資料庫，測試付款也會寫進 member_subscription_periods；之後全站改讀
    member_membership_status() 前，要排除 linepay_sandbox，避免假付款變成真權限。"""
    return PROVIDER if order.get("provider_env") == "production" else PROVIDER + "_sandbox"


def _period(rest, order, plan):
    """寫入已付款期間（可重複呼叫）。同等級還有有效期間時接在後面（只接同環境的期間）。"""
    ext = "order:" + order["order_key"]
    provider = period_provider(order)
    st, rows = rest("/member_subscription_periods?select=id&provider=eq." + provider + "&external_period_id=eq." + _q(ext))
    if st == 200 and rows:
        return rows[0]["id"]
    start = now()
    st, active = rest("/member_subscription_periods?select=expires_at&user_id=eq." + _q(order["user_id"]) + "&tier=eq." + _q(plan["tier"])
                      + "&provider=eq." + provider + "&revoked_at=is.null&expires_at=gt." + _q(start.isoformat()) + "&order=expires_at.desc&limit=1")
    if st == 200 and active:
        start = max(start, dt.datetime.fromisoformat(active[0]["expires_at"].replace("Z", "+00:00")))
    row = {"user_id": order["user_id"], "tier": plan["tier"], "provider": provider, "external_period_id": ext,
           "starts_at": start.isoformat(), "expires_at": (start + dt.timedelta(days=int(plan["days"]))).isoformat()}
    st, rows = rest("/member_subscription_periods", "POST", [row], "return=representation")
    if st in (200, 201) and rows:
        return rows[0]["id"]
    st, rows = rest("/member_subscription_periods?select=id&provider=eq." + provider + "&external_period_id=eq." + _q(ext))
    if st == 200 and rows:                  # 併發時另一個請求先寫入
        return rows[0]["id"]
    raise PayError(503, "開通紀錄寫入失敗，請稍後重試（款項已確認，不會重複扣款）")


def _plan_of(rest, plan_code):
    st, rows = rest("/member_plans?select=plan_code,tier,days,price_twd,label&plan_code=eq." + _q(plan_code))
    if st != 200 or not rows:
        raise PayError(503, "方案資料讀取失敗")
    return rows[0]


def confirm(user, body, rest, lp_mod=lp):
    """會員從 LINE Pay 導回後呼叫：確認付款（扣款）→ 寫已付款期間 → 訂單標記已付款。"""
    if not enabled():
        raise PayError(503, "付款功能尚未開放", "PAY_DISABLED")
    order = _order(rest, user, body.get("order_key"))
    txn = str(body.get("transaction_id") or "")
    if not txn.isdigit() or txn != str(order.get("provider_txn_id") or ""):
        raise PayError(400, "交易編號與訂單不符")
    plan = _plan_of(rest, order["plan_code"])
    if order["status"] == "paid":
        return _public(order, plan, already=True)
    if order["status"] != "pending":
        raise PayError(409, "此訂單已取消或失敗，請重新購買")
    amount = int(float(order["expected_amount"]))
    paid_info = None
    try:
        paid_info = lp_mod.confirm_payment(txn, amount)
    except lp_mod.LinePayError as e:
        if e.code in DUPLICATE_CODES:
            code, _ = lp_mod.check_status(txn)
            if code != "0123":
                raise PayError(409, "LINE Pay 交易狀態異常（" + code + "）", code)
        elif e.retryable:
            raise PayError(503, "LINE Pay 暫時無法確認，請稍後重新整理頁面（不會重複扣款）", e.code)
        else:
            _patch(rest, order["order_key"], {"status": "failed", "failure_code": "confirm:" + e.code[:40]}, only_pending=True)
            raise PayError(402, "付款未完成（" + e.code + "）", e.code)
    paid_amount = sum(int(x.get("amount") or 0) for x in (paid_info or {}).get("payInfo") or []) or amount
    period_id = _period(rest, order, plan)
    st, rows = _patch(rest, order["order_key"], {"status": "paid", "paid_amount": paid_amount, "paid_currency": "TWD",
                                                  "verified_at": now().isoformat(), "period_id": period_id}, only_pending=True)
    order = (rows[0] if st == 200 and rows else _order(rest, user, order["order_key"]))
    return _public(order, plan)


def cancel(user, body, rest):
    """會員在 LINE Pay 按取消後導回：待付款訂單標記失敗（cancelled）。"""
    order = _order(rest, user, body.get("order_key"))
    if order["status"] == "pending":
        _patch(rest, order["order_key"], {"status": "failed", "failure_code": "cancelled"}, only_pending=True)
        order["status"] = "failed"
    return {"order_key": order["order_key"], "status": order["status"]}


def _public(order, plan, already=False):
    return {"order_key": order["order_key"], "status": order["status"], "amount": int(float(order["expected_amount"])),
            "label": plan["label"], "tier": plan["tier"], "days": plan["days"], "already": already,
            "verified_at": order.get("verified_at"), "env": order.get("provider_env")}


def history(user, rest):
    """本人的方案訂單＋目前有效的已付款期間。"""
    uid = _q(user["id"])
    st, orders = rest("/member_payment_orders?select=order_key,status,expected_amount,paid_amount,plan_code,provider,provider_env,"
                      "created_at,verified_at,failure_code&kind=eq.membership&user_id=eq." + uid + "&order=created_at.desc&limit=30")
    st2, periods = rest("/member_subscription_periods?select=tier,provider,starts_at,expires_at,revoked_at&user_id=eq." + uid
                        + "&revoked_at=is.null&expires_at=gt." + _q(now().isoformat()) + "&order=expires_at.asc")
    if st != 200 or st2 != 200:
        raise PayError(503, "付款紀錄暫時無法讀取")
    return {"orders": orders or [], "periods": periods or [], "env": enabled()}


ACTIONS = {"pay_plans", "pay_linepay_request", "pay_linepay_confirm", "pay_linepay_cancel", "pay_history"}


def handle(action, body, user, rest):
    """api/auth.py 入口 → (http status, json)。user 為已驗證的 Supabase 使用者。"""
    try:
        if not user or not user.get("id"):
            raise PayError(401, "請先登入")
        if action == "pay_plans":
            return 200, list_plans(rest)
        if action == "pay_linepay_request":
            return 200, create(user, body, rest)
        if action == "pay_linepay_confirm":
            return 200, confirm(user, body, rest)
        if action == "pay_linepay_cancel":
            return 200, cancel(user, body, rest)
        if action == "pay_history":
            return 200, history(user, rest)
        raise PayError(400, "未知的付款動作")
    except PayError as e:
        return e.status, {"error": e.message, "code": e.code}
    except Exception:
        return 500, {"error": "internal error"}
