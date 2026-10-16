# 會員資料庫串接 — 2026-10-16 最新進度

> 本節取代下方舊盤點的「產品決策尚未確認」與「仍只有 localStorage」程式狀態。使用者已明確要求把今日功能與未接資料庫的會員功能一起串接，並授權處理資料庫。**線上 schema 尚未套用，不能宣稱已跨裝置啟用。**

## 本輪程式完成

- 新增 `assets/member-cloud.js`：登入身分重新驗證後讀取會員專屬文件，再開啟表單；本機先保存、延遲上傳、離線保留、重新連線／手動重試。
- 8 種文件：交易／目標／計畫／角色／帳戶與理由、交易草稿、收藏分類／順序／觀察紀錄／自訂策略／回測紀錄、研究筆記、筆記編輯草稿、垃圾桶、回饋草稿、私房篩選器偏好。
- 原有本機資料可匯移；兩裝置版本不同時顯示「保留本機版本／使用雲端版本」，需再次確認，另可下載版本備份。CAS 預期版本避免靜默覆蓋；清除文件用有版本的 tombstone。
- 截圖保留 IndexedDB 快取並排入私有 Storage 上傳；另裝置透過本人 token 讀取，不產生公開截圖網址。JSON 備份不包含圖片本體。
- 登出／切帳號會取消舊回應，認證 token 不進文件。會員頁首顯示真實同步狀態；資料庫缺件時保留本機功能並顯示待啟用。
- 公開行情與站內新聞沿用既有公開 API；即時篩選結果、搜尋字串、導覽分頁等暫態狀態不作會員文件上傳。

## 線上盤點：本輪只讀實測

使用網站現有公開權限，對表發出 `select=*&limit=0`，不請求會員資料列、不寫入。

| 物件 | 結果 |
|---|---|
| watchlist / backtest_positions / broker_watchlist | HTTP 200；不代表本輪重新驗證了所有登入寫入與 RLS |
| member_research_documents | HTTP 404 / PGRST205 |
| member_feedback_tickets / member_rewards / member_coupons | HTTP 404 / PGRST205 |
| member_point_ledger / member_referral_summary / academy_events | HTTP 404 / PGRST205 |

**目前阻礙是連線能力，不是使用者未授權。** GitHub 登入可用於登入 Supabase 帳號，但這個對話仍未取得可管理對應專案的 Supabase 連線；沒有可用的資料庫管理工具或本機管理憑證。已建議 Supabase 外掛，尚無連線成功證據。不得要求使用者在聊天貼私鑰。

## SQL 與驗證

按順序審查／套用：

1. `docs/database/member-services.sql`：原會員服務表、RPC、RLS、Auth 觸發器與推薦碼補建。
2. `docs/database/member-services-supplement.sql`：點數流水、本人推薦統計、已發布活動。
3. `docs/database/member-research-documents.sql`：8 種研究文件、本人讀取、CAS RPC；前端不直接 insert/update/delete。
4. `docs/database/member-storage.sql`：頭像與私有交易截圖；已有 bucket 不變更公開性，既有截圖 bucket 若公開則中止。

`tests/member-database.test.cjs` 已在隔離的 PGlite PostgreSQL 以兩個假會員執行四份 SQL，通過文件 RLS、CAS／tombstone、8 種文件、匿名／直接改表拒絕、跨會員圖片拒絕、回饋冪等、推薦統計隔離。測試套件為官方 npm `@electric-sql/pglite@0.3.14`，下載後比對 registry SHA512，未加入網站依賴。**這不替代真實 Supabase Storage、Auth 與併發部署驗收。**

`tests/member-cloud.test.cjs` 12 項通過（假 REST）：舊資料匯移、第二裝置讀回、離線、衝突、刪除版本、上傳中修改、切帳號、缺表、身分不符、缺圖清理、損壞同步 metadata、跨裝置私有截圖。
`tests/member-trade-ui.browser.cjs` 已載入真正 cloud 模組並使用假 REST，確認交易／策略寫入及頁首同步狀態；不是線上會員測試。`tests/member-cloud.browser.cjs` 另驗證衝突的兩次確認、保留本機／雲端選擇、版本遞增及備份下載。

## 連線後要完成

- 先確認專案 ID 與既有 table/function/policy 定義，UAT 與正式站共用 Supabase；比較現況後只套用需要的增量。這些 SQL 為初次建置檔，**不是可盲目重跑的冪等遷移**。既有公開 Storage policy 可能和新 policy 疊加，也必須審查。
- 套用後用真實測試會員驗證兩會員隔離、兩裝置衝突、離線恢復、頭像、私有附件與 token 過期，再更新本檔「線上已啟用」。
- Auth OAuth／SMS 需確認後台 provider 與實際服務；寄信 outbox worker、寄送服務與送達驗證尚缺。不得把 queued 當成已送達。
- 點數／優惠／推薦的真實活動規則與獎勵資料尚未建立；不從本機目標進度發放真實權益。
- 九角色真正 3D 素材仍未交付，與資料庫串接分開；不得宣稱遊戲級角色已完成。

---

## 以下保留合夥人原始盤點（uat 6880f64；歷史紀錄）

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
