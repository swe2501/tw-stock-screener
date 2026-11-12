# 會員權限切換到已付款期間：給 JUSTY 的說明

2026-11-09 · Andrew

> 線上版（可留言）：https://claude.ai/artifact/XcKo1acyBqhNCSbQ5vn9AE 。本檔是 2026-11-09 的匯出快照，之後以線上版為準。

LINE Pay 測試付款已在 uat 跑通，付款成功會寫進你設計的「已付款期間」表；但網站目前還不讀它，所以付了錢權限不會變。要讓付款真正開通權限，需要把全站判斷會員等級的三個地方，統一改成讀你的 `member_membership_status()`，並先排除測試付款。想跟你一起分工完成。

## 已完成

付款這一段已經接上你的設計，缺的只剩「網站讀取等級」這一步。

| 項目 | 狀態 |
| --- | --- |
| 你的 `member-membership-lifecycle.sql` | 11/08 經 Andrew 同意已套用到共用資料庫：`member_subscription_periods`、`member_tiers.expires_at`、`member_membership_status()`。只新增，現有權限不變 |
| 價格表 `member_plans`（新） | 只有 4 個 `sandbox_only` 測試方案（四等級各 30 天，10／20／30／40 元）；正式價格未定 |
| 你的 `member_payment_orders` | 擴充 `kind`（stored\_points｜membership）、`plan_code`、`provider`、`provider_env`、`provider_txn_id`、`period_id` 等欄位；`points` 改可空並加形狀檢查。儲值點數的用法與你的對帳 RPC 不受影響 |
| LINE Pay 付款流程 | uat 實測跑通：只有 LINE Pay 確認付款成功才寫期間；同一訂單重複確認不會重複開通 |
| 測試付款的期間 | 標成 `provider='linepay_sandbox'`（正式付款才是 `linepay`）；目前 2 筆，已作廢（`revoked_at`） |
| 正式站 | 程式已上 prod，但 Production 沒有 LINE Pay 金鑰，付款頁維持你的預覽畫面 |

## 現況：三個等級來源

網站現在從三個地方判斷會員等級，各頁用的不一樣，而且都不知道「已付款期間」的存在。

| 來源 | 怎麼讀 | 用在哪 |
| --- | --- | --- |
| `member_tiers` 表 | `index.html` 的 `_applyAuthState` 登入後直接讀 `member_tiers?select=tier`，存成 `window._memberTier`（管理者不讀） | 封測門檻 `siteGate`、`guest-access.js`、`member-benefits.js` |
| 個人資料 `profile.membership.plan` | `AcademyIdentity.getProfile()` | `member-quick-menu.js` 等級名稱、`member-benefits.js`、`member-payments.js` 帳務摘要 |
| 分享券 `AcademyShareUnlock.membershipTier()` | 分享活動的券 | `guest-access.js`、`member-benefits.js` |

管理者（`VIEWER_EMAILS`／後端 `ADMIN_IDS`）另外判斷，不在這次範圍。資料端還有幾條 RLS 會看等級：主力資料的 VIP 讀取、出場追蹤券讀取，你在 lifecycle 文件提過要另附政策遷移。

## 切換步驟

建議照這個順序做，全部在 uat 雙方測過才上 prod。負責人是建議，可以再調。

| # | 要做的事 | 建議負責 |
| --- | --- | --- |
| 1 | RPC 排除測試付款的期間（見下一節） | Andrew 準備 SQL，你確認後套用 |
| 2 | 前端做一個共用的等級讀取（例如 `AcademyIdentity.membershipStatus()`）：呼叫 `member_membership_status()`，回傳 tier、source、expires\_at、next\_change\_at、features；到 `next_change_at` 自動重查；切換帳號時丟掉前一個帳號的結果 | 你（`member-identity.js` 是你的） |
| 3 | 三個來源改讀共用讀取：`index.html` 封測門檻與 `window._memberTier`、快捷選單、權益頁、訪客預覽、帳務摘要 | `index.html` 那段 Andrew；`member-*.js` 你 |
| 4 | 資料端 RLS 改用同一套規則：需要一個能在 policy 裡用的函式（例如 `member_effective_tier(uid)`），取代直接查 `member_tiers` 的政策 | 你設計，雙方測 |
| 5 | 付款確認成功後，前端立刻重新讀取等級，不用重新整理頁面 | Andrew（`member-payments.js`） |
| 6 | uat 依下方驗收清單回歸測試 → 上 prod | 雙方 |

## 必須先處理：排除測試付款

uat 和正式站共用同一個資料庫，所以 uat 上用假錢付的測試期間也在同一張表。如果 RPC 不排除，切換後測試付款會變成正式站的真權限。

建議在 `member_membership_status()` 的 subscription 那一段加一個條件：

```sql
select p.tier,'subscription',p.expires_at from public.member_subscription_periods p
 where p.user_id=u and p.starts_at<=now() and p.expires_at>now() and p.revoked_at is null
   and p.provider not like '%\_sandbox' escape '\'
```

第 4 步的 RLS 共用函式也要加同一個條件。代價是 uat 上的測試付款也不會開通權限，驗證「付款後權限有沒有變」要用別的方法，見「需要你決定的事」第 1 點。

## 驗收清單

切換後在 uat 逐項測，全過才上 prod。

- [ ] 免費會員：封測門檻、權益頁、快捷選單都顯示「見習研究生」，跟現在一樣
- [ ] 管理員在 `member_tiers` 給的永久等級：照舊有效
- [ ] 管理員給等級並設到期日：到期一過自動回免費，不用重新登入
- [ ] 正式付款期間（`provider='linepay'`）：開通對應等級，到期回免費
- [ ] 測試付款期間（`linepay_sandbox`）：不開通
- [ ] 已作廢的期間（有 `revoked_at`）：不開通
- [ ] 券（`member_rewards`＋`member_entitlements`）：照舊只開券內的工具
- [ ] 同時有幾種來源：取最高等級
- [ ] 切換帳號：不沿用前一個帳號的等級
- [ ] RLS：免費會員直接打 API，讀不到 VIP 才能看的資料
- [ ] 付款完成後，不重新整理頁面就看得到新等級

## 需要你決定的事

1. **uat 上怎麼驗證「付款後權限有變」**：測試付款被排除後，uat 付了也不會開通。建議做法：由管理員用 service role 手動寫一筆 `provider='linepay'`、只有 1 小時的期間給測試帳號，測完作廢。也可以改成「測試期間只對指定測試帳號有效」，你比較喜歡哪種？
2. **分享券 `AcademyShareUnlock` 要不要併進 RPC**：RPC 現在讀 `member_rewards`＋`member_entitlements` 的券；分享券是不是同一套？不是的話要怎麼納入？
3. **`profile.membership.plan` 的去留**：切換後還要保留嗎？保留的話只用來顯示，還是直接拿掉？
4. **分工**：「切換步驟」表裡的負責人可以嗎？特別是第 4 步 RLS，你的文件提過現有 VIP 主力讀取與出場追蹤券政策要另外遷移。

## 參考檔案

都在 repo `swe2501/tw-stock-screener` 的 uat 分支。

- `docs/collaboration/changes/2026-11-08-linepay-sandbox.md`：LINE Pay 串接變更紀錄（安全原則、測試、回滾）
- `docs/database/member-membership-lifecycle.sql`、`docs/member-membership-lifecycle-review.md`：你的開通設計
- `docs/database/member-payment-linepay.sql`：價格表與訂單表擴充
- `lib/payments.py`（`period_provider()` 決定 `linepay` / `linepay_sandbox`）、`lib/linepay.py`
- `apps/web/index.html`：`_applyAuthState` 讀 `member_tiers` 的那段
