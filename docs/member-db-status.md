# 會員中心 — 資料後端現況盤點（給 login agent 追蹤）

> 盤點日：2026-10-16，對應 uat `6880f64`。方法：靜態掃 `assets/member-*.js` 的存取方式 ＋ 用 anon key 實測 Supabase 表/RPC 是否存在。
> **一句話**：登入、自選、目標價、回測、分點追蹤 已接 DB；**會員中心大多數新功能仍是 localStorage（不跨裝置）**；獎勵/點數/推薦/優惠券/回饋/活動 的**資料表與 RPC 都還沒建**（遷移 SQL 已寫好但未套用，且缺 3 個物件）。

---

## 1. 已接資料庫、會跨裝置同步 ✅

| 功能 | 後端 | 表/機制 | 狀態 |
|---|---|---|---|
| 登入／註冊／個資／頭像 | Supabase Auth | `/auth/v1/*`（Google OAuth PKCE＋手機簡訊 OTP）、個資存 `auth.users.user_metadata`、頭像存 Storage `member-avatars` | ✅ 程式完整；**待確認後台 provider 是否開通**（見待辦） |
| 自選／觀察清單 ＋ **目標價** | `api/watchlist.py` | `watchlist` 表（欄位含 note / target_price / rt_target_price / vol_target），帶登入 token | ✅ 表存在、綁帳號、會同步 |
| 回測部位 | — | `backtest_positions` 表 | ✅ 表存在 |
| 主力分點追蹤 | `api/broker_watch.py` | `broker_watchlist` 表 | ✅ 表存在 |

---

## 2. 只存 localStorage、**不跨裝置同步** ⚠️（換電腦/清快取就沒了）

| 功能 | 模組 | 存法 | 備註 |
|---|---|---|---|
| **我的目標／交易紀錄／目標與計畫／目標角色** | `member-trade-ui.js`(9×localStorage)、`member-trade-engine.js`(純運算)、`member-goal-art.js`(純繪圖) | `localStorage.setItem(key(profile.id), …)` | 用 user id 當 key＝同瀏覽器不同帳號不互蓋，**不等於跨裝置**；僅 `/api/chart` 抓行情；有「備份/匯出」(xlsx) 供手動搬 |
| 我的研究／研究筆記 | `member-research.js`(7×)、`member-features.js`(10×) | localStorage | |
| 自訂策略 | `member-strategy-ui.js`、`member-strategy-engine.js` | 本機（引擎純運算，UI 抓 `/api/chart`） | |
| 會員中心面板狀態 | `member-center.js`(12×) | localStorage | 分頁含「我的目標／我的自選／我的研究／我的回饋」等 |
| 私房選股設定 | `member-private-screen.js` | 讀 `price_window`（公開行情）＋本機設定 | 行情接 DB，但使用者設定在本機 |

> **要不要把這些改接 DB**（跨裝置同步）是產品決策——目前看起來是刻意做成純前端工具，請 login agent 確認。

---

## 3. 程式有接、但 **Supabase 裡資料表/RPC 還沒建** ❌（實測全 404）

前端 `member-identity.js` 會查這些，實測全部不存在：

| 類型 | 物件 | 實測 | 在遷移 SQL? |
|---|---|---|---|
| 表 | `member_feedback_tickets` | 404 PGRST205 | ✅ 有 |
| 表 | `member_rewards` | 404 | ✅ 有 |
| 表 | `member_coupons` | 404 | ✅ 有 |
| 表 | `member_point_ledger` | 404 | ❌ **缺** |
| view | `member_referral_summary` | 404 | ❌ **缺** |
| 表 | `academy_events` | 404 | ❌ **缺** |
| RPC | `ensure_member_referral_code` | 404 PGRST202 | ✅ 有 |
| RPC | `redeem_member_promo_code` | 404 | ✅ 有 |
| RPC | `bind_member_referral` | 404 | ✅ 有 |
| RPC | `submit_member_feedback` | 404 | ✅ 有 |
| RPC | `claim_member_reward` | 404 | ✅ 有 |

- 遷移檔 `docs/database/member-services.sql`（建 10 表＋8 函式）**已寫好但尚未套用到 Supabase**。
- 影響功能：**獎勵/禮遇、點數、優惠券、推薦碼、意見回饋、學院活動** → 目前都顯示「尚未啟用」或空白（前端有 404 防呆，不會整頁壞）。

---

## 待辦（給 login agent）

1. **套用遷移**：把 `docs/database/member-services.sql` 跑進 Supabase（建 10 表＋8 函式＋RLS）。
2. **補齊缺的 3 個物件**（前端有查、SQL 沒有）：
   - `member_point_ledger`（表）
   - `member_referral_summary`（view／或對應查詢）
   - `academy_events`（表）
3. **Auth 後台設定**：確認 Google OAuth、手機簡訊（SMS）provider 已在 Supabase 後台開通，否則登入流程會卡在「尚未開通」。
4. **Storage**：建立 `member-avatars` bucket ＋本人專屬上傳 RLS（否則頭像上傳 403/not found）。
5. **產品決策**：第 2 區（我的目標/交易紀錄/研究筆記/自訂策略）要不要改接 DB 以跨裝置同步？若要，需各自設計表＋API。
6. **環境注意**：uat/prod **共用同一個 Supabase**；前端部分寫入（如 `/api/watchlist`）硬寫 prod domain。套用遷移＝同時影響兩站，請先對齊再執行。
