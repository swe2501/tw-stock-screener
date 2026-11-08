"""LINE Pay Online API v3 client (server side only; no SDK).

2026-11-08 會員方案付款第一階段：只在 uat 用 LINE Pay 測試環境（sandbox）。
- 金鑰只從環境變數讀：LINEPAY_CHANNEL_ID、LINEPAY_CHANNEL_SECRET、LINEPAY_ENV（sandbox｜production，預設 sandbox）。
  本模組不產生、不記錄、不回傳金鑰。
- 簽章：HMAC-SHA256(key=secret, msg=secret + apiPath + (POST 為 body 字串／GET 為 query) + nonce) → Base64。
  POST 用同一份序列化後的 body 字串簽章並送出。
- transactionId 是 19 位整數（超過 JS 安全整數），一律轉成字串處理。
- LINE Pay 不論成功失敗都回 HTTP 200，要看 returnCode；錯誤也可能是 {resultCode, statusMessage} 形狀。
文件：https://developers-pay.line.me/online-api-v3
"""
import base64
import hashlib
import hmac
import json
import os
import re
import urllib.error
import urllib.request
import uuid

HOSTS = {"sandbox": "https://sandbox-api-pay.line.me", "production": "https://api-pay.line.me"}
CURRENCY = "TWD"

# 官方建議的讀取逾時下限（秒）
TIMEOUT = {"request": 15, "confirm": 45, "check": 25, "refund": 25}


class LinePayError(Exception):
    def __init__(self, code, message, retryable=False):
        super().__init__(f"{code}: {message}")
        self.code, self.message, self.retryable = str(code), str(message), retryable


def config():
    """回 (env, channel_id, secret)；未設定回 None。"""
    cid = (os.environ.get("LINEPAY_CHANNEL_ID") or "").strip()
    secret = (os.environ.get("LINEPAY_CHANNEL_SECRET") or "").strip()
    env = (os.environ.get("LINEPAY_ENV") or "sandbox").strip().lower()
    if not cid or not secret or env not in HOSTS:
        return None
    return env, cid, secret


def sign(secret, path, payload, nonce):
    msg = (secret + path + payload + nonce).encode("utf-8")
    return base64.b64encode(hmac.new(secret.encode("utf-8"), msg, hashlib.sha256).digest()).decode("ascii")


def _ids_to_str(raw):
    """把 19 位數交易編號轉成字串再解析，避免任何浮點誤差（Python int 本身安全，這裡保持與前端一致）。"""
    return re.sub(rb'("(?:transactionId|refundTransactionId)"\s*:\s*)(\d{10,})', rb'\1"\2"', raw)


def _call(method, path, body=None, query="", timeout=20, cfg=None, opener=None):
    cfg = cfg or config()
    if not cfg:
        raise LinePayError("NOT_CONFIGURED", "LINE Pay 尚未設定")
    env, cid, secret = cfg
    nonce = str(uuid.uuid4())
    payload = json.dumps(body, ensure_ascii=False, separators=(",", ":")) if body is not None else ""
    signed = payload if method == "POST" else query
    headers = {"Content-Type": "application/json", "X-LINE-ChannelId": cid,
               "X-LINE-Authorization-Nonce": nonce, "X-LINE-Authorization": sign(secret, path, signed, nonce)}
    url = HOSTS[env] + path + (("?" + query) if query else "")
    req = urllib.request.Request(url, data=payload.encode("utf-8") if method == "POST" else None, method=method, headers=headers)
    try:
        with (opener or urllib.request.urlopen)(req, timeout=timeout) as r:
            raw = r.read()
    except urllib.error.HTTPError as e:
        raise LinePayError(f"HTTP{e.code}", "LINE Pay 連線失敗", retryable=e.code >= 500)
    except (urllib.error.URLError, TimeoutError, OSError):
        raise LinePayError("NETWORK", "LINE Pay 連線逾時或失敗", retryable=True)
    try:
        data = json.loads(_ids_to_str(raw) or b"{}")
    except ValueError:
        raise LinePayError("BAD_JSON", "LINE Pay 回應格式錯誤", retryable=True)
    code = str(data.get("returnCode") or data.get("resultCode") or "")
    msg = data.get("returnMessage") or data.get("statusMessage") or ""
    return code, msg, data.get("info") or {}


def _ok(code, msg, retry_codes=()):
    if code != "0000":
        raise LinePayError(code, msg or "LINE Pay 回應失敗", retryable=code.startswith("190") or code in retry_codes)


def request_payment(order_id, amount, product_name, confirm_url, cancel_url, **kw):
    """申請付款 → (transaction_id 字串, payment_url_web, payment_url_app)。amount 為整數新台幣。"""
    if not isinstance(amount, int) or amount <= 0:
        raise LinePayError("AMOUNT", "金額必須是正整數")
    body = {"amount": amount, "currency": CURRENCY, "orderId": order_id,
            "packages": [{"id": "membership", "amount": amount, "name": "先見 FORESIGHT 會員方案",
                          "products": [{"name": product_name, "quantity": 1, "price": amount}]}],
            "redirectUrls": {"confirmUrl": confirm_url, "cancelUrl": cancel_url}}
    code, msg, info = _call("POST", "/v3/payments/request", body, timeout=TIMEOUT["request"], **kw)
    _ok(code, msg)
    url = info.get("paymentUrl") or {}
    tid = str(info.get("transactionId") or "")
    if not tid.isdigit() or not url.get("web"):
        raise LinePayError("BAD_RESPONSE", "LINE Pay 未回傳交易編號")
    return tid, url.get("web"), url.get("app") or ""


def confirm_payment(transaction_id, amount, **kw):
    """確認付款（此時才扣款）→ info。金額必須用伺服器訂單上的金額，不可用網頁送來的。"""
    if not str(transaction_id).isdigit():
        raise LinePayError("TXN", "交易編號格式錯誤")
    code, msg, info = _call("POST", f"/v3/payments/{transaction_id}/confirm", {"amount": amount, "currency": CURRENCY},
                            timeout=TIMEOUT["confirm"], **kw)
    _ok(code, msg)
    return info


def check_status(transaction_id, **kw):
    """查詢付款申請狀態 → returnCode：0000 未完成驗證、0110 可確認、0121 取消／逾時、0122 失敗、0123 已完成。"""
    if not str(transaction_id).isdigit():
        raise LinePayError("TXN", "交易編號格式錯誤")
    code, msg, _ = _call("GET", f"/v3/payments/requests/{transaction_id}/check", timeout=TIMEOUT["check"], **kw)
    return code, msg


def refund(transaction_id, amount=None, **kw):
    """退款（省略 amount＝全額）→ refundTransactionId 字串。"""
    if not str(transaction_id).isdigit():
        raise LinePayError("TXN", "交易編號格式錯誤")
    body = {} if amount is None else {"refundAmount": amount}
    code, msg, info = _call("POST", f"/v3/payments/{transaction_id}/refund", body, timeout=TIMEOUT["refund"], **kw)
    _ok(code, msg, retry_codes=("1999",))
    return str(info.get("refundTransactionId") or "")
