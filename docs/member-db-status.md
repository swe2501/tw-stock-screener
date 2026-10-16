# 會員資料庫串接 — 2026-10-16 線上套用完成

使用者已明確確認允許在 UAT／正式站共用的 `Taiwan stock2`（`bruqrbvbjxntgoljxsne`，main / PRODUCTION）套用四份會員 SQL。透過 GitHub 登入的 Supabase SQL Editor 執行，四次均顯示 `Success. No rows returned`。先前的自動審查攔截已在使用者確認具體目標後解除；不再等待相同授權。

## 已線上建立

| 項目 | 實際結果 |
|---|---|
| `member-services.sql` | 10 會員服務表、8 函式、Auth 推薦碼觸發器、既有會員推薦碼補建；未建立活動或發放獎勵 |
| `member-services-supplement.sql` | 點數流水、活動表、本人推薦統計 view |
| `member-research-documents.sql` | 8 種研究文件、本人讀取 policy、預期版本 CAS 寫入 RPC |
| `member-storage.sql` | 頭像 bucket 與私有交易截圖 bucket、7 個本人路徑 Storage policy |

線上 catalog 驗證：**13 個會員／活動資料表全部啟用 RLS、9 個會員函式、7 個 Storage policy**。`member-avatars` 為公開頭像圖片；`member-trade-images` 為私有。套用前已確認這批物件、兩個 bucket 與 storage.objects policy 均不存在，沒有覆蓋既有物件。

部署 SQL 預檢、執行與驗證頁：`https://supabase.com/dashboard/project/bruqrbvbjxntgoljxsne/sql/91abcc42-228f-4314-9c03-5dca51c37d72`。

## 線上驗證證據與界限

- 用既有一位會員的身分在交易內測試文件 RPC，再以不同 JWT subject 驗證跨會員不可見，並驗證直接刪表資料被拒絕、舊 revision 寫入產生 `MEMBER_DOCUMENT_CONFLICT`。**全部測試寫入已 ROLLBACK**，沒有留下測試交易或覆寫使用者文件。只讀取必要會員識別供權限驗證，未輸出會員資料列或憑證。
- SQL 結果：`PASS: live document CAS, cross-owner RLS, direct delete denied; test writes rolled back`。
- REST 零筆探測：原先 404 的七個表／view 現在對匿名回傳 **401 / 42501（無資料表權限）**，符合私人會員服務的設定；不是缺件。原自選／回測部位／分點追蹤表維持原樣。
- 尚需真實兩裝置瀏覽器對同帳號的實際資料驗收、Storage 服務端的實際圖片上傳／讀回、OAuth／SMS provider 與頭像流程驗收；不能把 SQL 驗證當成這些端到端測試已全完成。
- 寄信 outbox 已存在，但寄送 worker／寄送服務與送達驗證仍未實作。活動、點數／優惠、推薦獎勵規則未建真實營運資料，不從本機目標進度自動發真實權益。

## UAT 前端部署仍待確認

程式已推送 Git `uat`，但實際 Vercel UAT 的 DOM script 清單仍只有舊 `member-goal-art.js`，沒有 `member-cloud.js`／`member-leek-3d.js`。目前登入的 Vercel 帳號開該專案顯示 404；需有權限的專案擁有者部署最新 `uat` Preview。**資料庫已線上套用，不等於舊 UAT 前端已更新或使用者已跨裝置同步。** 外部無 cookie 的 HTTP 會轉到 Vercel 登入頁，不能用該頁內容判斷 build。

## 已串接的前端程式（待託管部署）

`assets/member-cloud.js` 在登入身分驗證後讀取會員文件；本機先保存、延遲上傳、離線保留、重新連線／手動重試。會員頁首顯示真實同步進度，不把本機保存當成雲端已完成。

8 種文件：交易／目標／計畫／角色／帳戶與理由、交易草稿、收藏分類／順序／觀察／自訂策略／回測紀錄、研究筆記、筆記編輯草稿、垃圾桶、回饋草稿、私房篩選偏好。原本機資料可匯移；兩裝置版本不同時明確選擇保留本機／雲端，需二次確認並可下載版本備份。清除文件用有版本 tombstone，切帳號取消舊回應，token 不進文件。

截圖保留 IndexedDB 快取並排入私有 Storage；另裝置透過本人 token 讀取，不產生公開截圖網址。JSON 備份不含圖片本體。公開行情與站內新聞沿用公開 API；搜尋字串、即時篩選結果與導覽分頁不作個人文件上傳。

## 測試與維護

- `tests/member-cloud.test.cjs`：12 項同步測試通過（假 REST）。
- `tests/member-cloud.browser.cjs`：衝突介面、二次確認與下載備份通過。
- `tests/member-trade-ui.browser.cjs`：實際 cloud 模組＋假 REST，交易／策略寫入及同步狀態通過。
- `tests/member-database.test.cjs`：四份 SQL 在隔離 PGlite PostgreSQL 通過兩會員 RLS、CAS／tombstone、8 文件種類、匿名／直接改表拒絕、圖片路徑、回饋冪等、推薦隔離。使用經 SHA512 核對的官方 npm `@electric-sql/pglite@0.3.14`，未加入網站依賴。
- 四份 SQL 是**已部署的初次建置檔，不可盲目重跑**。後續需 catalog 比對後另寫增量遷移；UAT 與正式站仍共用 DB。
- 角色補充：九角色初始裁切已修復；小韭菜有程式建立的立體試作與持續待機／拖曳運鏡／三節奏／連續成長，明示造型試作。其餘角色仍為插畫互動，正式 GLB 角色素材 manifest 仍為空，不能宣稱全角色遊戲級 3D 已完成。

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
