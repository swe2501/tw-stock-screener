# 會員方案付款：LINE Pay 測試環境串接（2026-11-08，Andrew）

## 做了什麼
- **資料庫（已套用到共用 Supabase，經 Andrew 同意）**
  - 套用 JUSTY 的 `docs/database/member-membership-lifecycle.sql`：`member_subscription_periods`、`member_tiers.expires_at`、RPC `member_membership_status()`。只新增，現有會員權限不變；**全站等級讀取尚未切換到這個 RPC**（依 JUSTY 文件，切換需雙方一起回歸測試）。
  - 新增 `docs/database/member-payment-linepay.sql`：
    - `member_plans` 價格表（service role 專用）。正式價格未定，只放 4 個 `sandbox_only` 測試方案（四等級各 30 天，10／20／30／40 元）。
    - 擴充 JUSTY 的 `member_payment_orders`（原儲值點數用、套用時為空表）：加 `kind`（stored_points｜membership）、`plan_code`、`provider`、`provider_env`、`provider_txn_id`、`period_id`、`failure_code`、`updated_at`；`points` 改可空，加 `member_payment_orders_kind_shape` 檢查（儲值單必有點數無方案；方案單必有方案無點數）。原儲值點數用法與對帳 RPC 不受影響。
- **後端**：`lib/linepay.py`（LINE Pay Online API v3：HMAC 簽章、申請／確認／查詢／退款）、`lib/payments.py`（訂單、確認、開通）。掛在 `api/auth.py` 的 action：`pay_plans`、`pay_linepay_request`、`pay_linepay_confirm`、`pay_linepay_cancel`、`pay_history`（會員 JWT）。未新增 API 檔（維持 12 支）。
- **前端**：`member-payments.js` 的 LINE Pay 面板。後端有開放時才換成真流程（方案選擇→前往 LINE Pay→導回確認→結果視窗）；未開放的環境完全維持 JUSTY 原本預覽。信用卡、超商代碼未動。

## 安全
- 金額／等級／天數一律由伺服器查 `member_plans`；網頁只送方案代碼。
- 只有呼叫 LINE Pay「確認付款」成功（或查詢狀態為 0123 已完成）才寫 `member_subscription_periods`；網頁導回不算付款。
- 確認可重複呼叫：同一訂單只開通一次（`external_period_id='order:<訂單>'` 唯一＋訂單 `status=pending` 條件更新）。
- 回跳網址只接受本站網域；測試環境另允許 localhost。
- 測試環境只賣 `sandbox_only` 方案，正式環境絕不賣測試方案。
- **測試付款寫入的期間 `provider='linepay_sandbox'`，正式付款才是 `'linepay'`。** uat 與正式站共用資料庫；全站改讀 `member_membership_status()` 之前，RPC 必須排除 `linepay_sandbox`（或先作廢這些期間），否則 uat 的假付款會變成正式站的真權限。
- 金鑰只在 Vercel 環境變數：`LINEPAY_CHANNEL_ID`、`LINEPAY_CHANNEL_SECRET`、`LINEPAY_ENV`（sandbox｜production）。**目前只該設在 Preview（uat），不要勾 Production。** 沒設金鑰的環境，所有付款 action 回 503「付款功能尚未開放」。

## 測試
- `tests/test_linepay.py`（10）：簽章公式、19 位交易編號保持字串、錯誤格式、逾時下限。
- `tests/test_payments.py`（18）：伺服器定價、網域白名單、正常付款、重複確認、他人訂單、交易編號不符、重複代碼＋查詢狀態、暫時錯誤保留待付款、拒付、同等級續買接續、取消、紀錄。
- `tests/member-payments.test.cjs`（JUSTY，8）照常通過。

## 尚未做（之後）
- 全站等級改讀 `member_membership_status()`（與 JUSTY 一起）。
- 正式價格、正式商家帳號、自動續訂（LINE Pay 需另外申請）、退款後台、發票。

## 回滾
- 程式：`git revert` 本次 commit。
- 資料庫：`member_plans` 可 drop；`member_payment_orders` 新欄位可 drop（套用前為空表）；lifecycle 部分見 JUSTY 文件。
