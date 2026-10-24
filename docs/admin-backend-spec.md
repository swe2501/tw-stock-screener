# 後台管理頁面 規格文件（Admin Backend Spec）

> 版本：2026-10-24 初版　｜　狀態：Phase 1（會員管理）實作中
> 產品：跟誰學｜盤後研究院（付費台股盤後研究 SaaS）
> 對象：3 位管理員（`swe250165@gmail.com`、`qa5518556130@gmail.com`、`wenpin0617@gmail.com`）

---

## 0. 設計前提與限制

| 項目 | 現況／限制 |
|---|---|
| 認證 | Supabase Auth（email 密碼＋Google OAuth＋手機 OTP）；個資／等級擬存 `auth.users.user_metadata` |
| 權限 | 管理員＝白名單 3 個 email（`VIEWER_EMAILS`）；後台每個 API 都要驗 JWT→email∈白名單 |
| **Vercel 函式上限** | Hobby 方案**最多 12 個** `api/*.py`，目前**已滿 12 個** → **不可新增檔案**，後台 API 一律掛進既有 `api/auth.py`（action 路由） |
| 服務金鑰 | 列使用者／改 metadata 需 **service_role**（繞過 RLS），只能在**後端**用 → 需在 **Vercel 環境變數加 `SUPABASE_SERVICE_KEY`**（絕不進前端） |
| 金流 | **尚未串接** → 進帳／MRR 先用手動記帳表，待接綠界／藍新／Stripe |
| 使用量 | **目前無事件紀錄** → 需新增輕量 `usage_events` 表才能算分時使用量／功能熱度 |
| DB | uat／prod **共用同一個 Supabase**；改 schema 兩站同時生效，須先對齊 |

---

## 1. 權限模型

- 後台入口（`#adminView`）與 nav 只對白名單 email 顯示（前端 `body.is-admin`）。
- **真正的防線在後端**：每個 admin API 先用呼叫者 JWT 打 `/auth/v1/user` 取 email，不在白名單 → 403。
- service_role 金鑰只在 `api/auth.py` 內使用，不回傳前端。
- 所有管理員寫入操作寫一筆 `admin_audit_log`（誰、何時、改了什麼）。

---

## 2. 頁面規劃（分頁）

### 2.1 會員管理（Phase 1，先做）
- **列表**：email／等級／註冊日／最後登入／登入方式／驗證狀態／裝置數。
- **等級＝照合夥人 `docs/database/member-voucher-levels.sql` 定義**：`observation`(觀察・市場觀察員)／`research`(研究・趨勢研究員)／`advanced`(進階・策略研究員)／`vip`(VIP・先見領航員)，＋`free`(一般會員)。`choice`(自選券) 屬「券」非常設等級。
- ⚠️ **兩套等級來源**：合夥人系統的等級是**券/權益(member_rewards→member_entitlements)算出來、會到期**（`member_feature_access()`）；後台這裡的「改等級」目前寫 `user_metadata.tier`（管理員手動、不到期）。兩者尚未合流 → Phase 1.5 要決定「後台改等級」是(a)直接發/撤一張長期權益走他的系統，或(b)用 `user_metadata.tier` 當管理員覆寫、各 gate 同時認這兩者。目前合夥人券系統本身仍 campaign off、VIP 目錄未就緒(`MEMBER_VIP_NOT_READY`)。
- **操作**：
  - 改等級（下拉：一般會員 / 觀察 / 研究 / 進階 / VIP；寫 `user_metadata.tier`）。
  - 設定／延長**訂閱到期日**（`user_metadata.expires_at`）。
  - 停權 / 復權（`user_metadata.banned`）、重寄驗證信、重設密碼。
  - 管理員白名單增刪（改 `admin_allowlist` 表，取代寫死的 `VIEWER_EMAILS`）。
- **資料源**：Supabase Auth admin API（service_role）＋ `user_metadata`。
- **API**：`POST /api/auth {action:"admin_members"}`、`{action:"admin_set_tier"}`、`{action:"admin_set_expiry"}`、`{action:"admin_ban"}`。

### 2.2 使用分析（Phase 2）
- DAU/WAU/MAU、分時段尖峰、功能熱度（篩選器／K圖／主力訊號…）、單一會員使用量、留存（次日/7/30 日）、流失名單。
- **前置**：新增 `usage_events(user_id, event, meta, ts)` 表，前端關鍵操作打點（登入、開 K 圖、跑篩選、開主力訊號…），每日彙整進 `usage_daily`。
- API：`{action:"admin_usage", range, metric}`。

### 2.3 訂閱與進帳（Phase 2）
- 每月營收、MRR、ARPU、付費/試用/到期/流失分佈、付款與退款紀錄。
- **前置**：`payments(user_id, amount, plan, paid_at, method, status, refund_at)` 表；串金流後自動寫入，未串前先手動記帳。
- API：`{action:"admin_revenue", range}`。

### 2.4 系統／排程健康（Phase 2，營運最重要）
- 各排程（每日/每週爬蟲）最後成功時間＋失敗告警；**各資料表新鮮度**（price_window／stock_themes／broker_trades／hot_topics／inst_daily… 最後更新日）；Vercel 函式數/頻寬、Supabase DB 大小/額度。
- **前置**：排程尾端寫 `job_runs(job, ok, rows, started_at, finished_at, err)`；表新鮮度用各表 `max(日期)` 直接查。
- API：`{action:"admin_health"}`。

### 2.5 AI 成本監控（Phase 3）
- ✨AI判定／形態判定 每日呼叫次數、花費、各會員用量、觸頂次數。前置：AI 呼叫寫 `ai_usage`。

### 2.6 稽核日誌（Phase 1 併做）
- `admin_audit_log(admin_email, action, target_user, detail, ts)`；後台操作全記錄，列表可查。

### 2.7 進階（Phase 3+）
- 對會員推播／公告；功能開關（feature flags，依等級開放）；題材/白名單內容維護（直接編 THEME_MEMBERS / 題材粒度）；處置股風險提醒。

---

## 3. 資料模型新增（SQL，分期）

```sql
-- Phase 1
create table admin_allowlist(email text primary key, added_by text, added_at timestamptz default now());
create table admin_audit_log(id bigserial primary key, admin_email text, action text, target_user text, detail jsonb, ts timestamptz default now());
-- 等級／到期存 auth.users.user_metadata：{ tier:'free|observation|research|advanced|vip', expires_at, banned:false }（等級代碼照合夥人 member-voucher-levels.sql）

-- Phase 2
create table usage_events(id bigserial primary key, user_id uuid, event text, meta jsonb, ts timestamptz default now());
create table job_runs(id bigserial primary key, job text, ok boolean, rows int, started_at timestamptz, finished_at timestamptz, err text);
create table payments(id bigserial primary key, user_id uuid, plan text, amount int, method text, status text, paid_at timestamptz, refund_at timestamptz);
```
（全部 enable RLS；一般會員無權限，只有 service_role／管理員後端能讀寫。）

---

## 4. API 設計（全部掛 `api/auth.py` 的 `action` 路由）

| action | 方法 | 權限 | 說明 |
|---|---|---|---|
| `admin_members` | POST | admin | 列所有會員＋等級／註冊／最後登入 |
| `admin_set_tier` | POST | admin | 改某會員等級（寫 user_metadata.tier） |
| `admin_set_expiry` | POST | admin | 設訂閱到期日 |
| `admin_ban` | POST | admin | 停權/復權 |
| `admin_audit` | POST | admin | 查稽核日誌 |
| `admin_usage` / `admin_revenue` / `admin_health` | POST | admin | Phase 2 |

共用：`_verify_admin(token)`（JWT→email∈白名單）、`_admin_api(path,method,body)`（service_role 打 `/auth/v1/admin/*`）。

---

## 5. 實作順序

1. **Phase 1（本次）**：`api/auth.py` 加 `admin_members` / `admin_set_tier` ＋前端 `#adminView` 會員管理頁（列表＋改等級）＋稽核日誌；**需先在 Vercel 設 `SUPABASE_SERVICE_KEY`**。
2. Phase 2：`job_runs`／表新鮮度 → 系統健康頁；`usage_events` → 使用分析；`payments` → 進帳。
3. Phase 3：AI 成本、推播、feature flags、內容維護。

## 6. 前端等級如何「生效」
改等級後，各付費功能的 gate 要改讀 `user_metadata.tier`（目前是 `VIEWER_EMAILS` 白名單＋RLS）。Phase 1 先能「設定與顯示」等級；把各功能真正綁等級是 Phase 1.5（需逐一把 owner-only 功能改成 tier-based）。
