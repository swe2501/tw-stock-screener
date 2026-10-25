# 交接：算法公式改存後端＋管理者總開關（2026-10-24）

> 這份針對「把 強度／貪婪 算法公式搬到後端、用後台總開關控制顯示」這一階段。
> 已 commit 並 push 到 **uat**（commit `3b18004`），**尚未推 prod**。

---

## 1. 這階段做了什麼（需求）

合夥人不想在畫面上看到話題熱度的算法公式。決策：
- **公式文字存後端資料庫**（不放前端），因為放前端用帳號控制顯示，懂技術的人可用開發者模式窺探。
- 預設**只有管理者**看得到；做一個**總開關（algo_visible）**，讓管理者自己決定要不要顯示。
- **總開關打開＝只有管理者自己看得到；關閉（預設）＝連管理者也看不到**（避免直播／分享畫面時外洩）。
- 範圍：①話題族群「話題熱度」的強度公式 ②K 圖「貪婪指標」計分規則。**兩段都完整搬後端。**

---

## 2. 架構（實作結果）

### 資料庫
- 新表 `public.admin_settings(key text pk, value text, updated_at)`，已 `enable RLS`（只有 service_role 能讀寫）。**DDL 已在 Supabase SQL editor 執行成功。**
- 用到的 key：
  - `algo_visible` ＝ `'true'`/`'false'`（總開關；預設視為 false）
  - `formula_topic_heat` / `formula_strength` / `formula_greed` / `formula_greed_method`（公式 HTML，可含 `{佔位}`）
- **這些 formula_* 列可留空**：後端 `auth.py` 內嵌同一份預設（`_ALGO_DEFAULTS`）當後備，DB 有列才以 DB 為準。所以「未 seed 也能運作」。

### 後端 `api/auth.py`（沒有新增檔案，維持 12 個 function 上限）
- `_settings_get(keys)`、`_algo_formulas()`：讀 admin_settings，缺列回內嵌預設。
- 公開 action **`algo_info`**（需登入 JWT）：只有 `email ∈ 白名單(管理者)` **且** `algo_visible=='true'` 才回 `{visible:true, formulas:{...}}`；其餘一律 `{visible:false}`（前端拿不到公式文字 → 開發者模式也看不到）。
- 管理 action：
  - `admin_algo_get` → `{algo_visible, formulas}`（給後台顯示目前狀態）
  - `admin_set_algo_visible {on:bool}` → 切換總開關（寫 admin_settings）
  - `admin_seed_algo` → 把內嵌預設公式一次寫入 DB（冪等；**不需本機 service key**）

### 前端 `apps/web/index.html`
- 新增 `window._algoFormulas`、`window._fillTpl`、`_loadAlgoFormulas()`：管理者登入後打 `algo_info`，拿到才填入；否則 body 不加 `algo-on`、公式區留空。
- 三處公式**不再內嵌文字**，改 template 由後端填值：
  - 話題族群「話題熱度」框：secret 公式兩行改成 `<span id="htHeatFormula">`，由後端注入。
  - 強度 popup `_showStrengthCalc`：gate 改 `!window._algoFormulas`，body 由 `formulas.strength` 套版。
  - 貪婪 popup `_showGreedCalc`：gate 改 `!window._algoFormulas`，body 由 `formulas.greed` + `formulas.greed_method` 套版。**原 `_greedMethodologyHTML()`（含錨點表）已整個刪除。**
- 後台新增「**算法公式**」分頁：總開關 toggle ＋「重新寫入預設公式到資料庫」按鈕（呼叫上面三個 admin action）。

---

## 3. ⚠️ 一個誠實的限制（請知悉）

K 圖貪婪分數的**最上層合成** `greed = 0.70×base + 0.30×catalyst` 仍在前端計算（儀表板數字要即時算出來），所以這一行 `0.70/0.30` 仍會出現在前端 JS。**真正機密**（四維權重 30/25/25/20、各指標錨點表、RS 百分位組成、強度 0.6/0.2/0.2 拆解、利多/利空出盡 K 規則）**已全部移出前端**，開發者模式看不到。
若要連這一行都藏起來，需把 greed 的最終合成也搬到後端（多一個 endpoint 回傳算好的 greed 值）——這是可選的後續，不在這階段。

---

## 4. 切帳號後請驗收（用管理者帳號）

管理者白名單＝`swe250165@gmail.com`、`qa5518556130@gmail.com`、`wenpin0617@gmail.com`。

1. 先確認 **uat 這次 build 是綠的**（只改既有檔、function 數沒變，理論上不會卡 12 上限）。uat 網址：`https://tw-stock-screener-git-uat-andrew250165s-projects.vercel.app`（需 Vercel 登入才看得到）。
2. 以管理者帳號登入 → 進 **後台管理 → 算法公式**。
3. 按 **「重新寫入預設公式到資料庫」**（把內建公式 seed 進 admin_settings；之後可直接在 Supabase 改 formula_* 各列）。
4. 把**總開關打開** → 回：
   - 話題族群 → 話題熱度分頁：應看到「強度 ＝ 0.6×RS…」公式。
   - 個股 K 圖：貪婪儀表旁出現「・點看算法」，點開有完整計分規則（錨點表）。
5. 把**總開關關閉** → 上面兩處公式都消失（連管理者也看不到）。
6. **防窺驗證**：登出（或用一般帳號），對 index.html 檢視原始碼／開發者模式搜尋「BIAS20」「布林 %b」「0.6×相對強度」——應**搜不到**（已不在前端）。

---

## 5. 這階段之外、仍待處理（給下一棒）

- **推 prod**：這批（357 篩選器／題材補齊／今日排行榜改版／後台管理／會員等級 member_tiers／本次算法公式）都只在 uat，尚未推 prod。推 prod 記得「整樹對齊 uat」那一步（見 memory `deploy-prod-sync-justy`）。
- **設 neo.amaster@gmail.com 為 VIP**：用後台 會員管理 下拉改等級（已註冊，之前因封測 gate 被擋，現已解耦）。
- 其他 `.algo-gated` 區塊（判讀依據／葛蘭碧參數／支撐壓力 SPEC）目前是 CSS 對所有人隱藏，但文字仍在前端 HTML。這次只處理合夥人指名的 強度／貪婪兩段；若之後也要防窺，可循同一套（搬 DB＋algo_info）處理。
- hot_topics 的 codex 模型問題（gpt-6.1-sol 不支援）— 先前 context 提到，未解。

---

## 6. 關鍵檔案
- `api/auth.py`：`_ALGO_*` 常數、`_settings_get`/`_algo_formulas`、`algo_info`、`admin_algo_get`/`admin_set_algo_visible`/`admin_seed_algo`。
- `apps/web/index.html`：`_loadAlgoFormulas`/`_fillTpl`（~`_applyAuthState` 前）、`_showStrengthCalc`、`_showGreedCalc`、後台 `renderAlgo()` ＋ 分頁按鈕 `data-t="algo"`。
- `docs/database/admin-member-tiers.sql`：member_tiers（上一階段，已套用）。
- admin_settings 表：本階段在 SQL editor 建立（無獨立 .sql 檔；DDL＝`create table ... admin_settings(key text primary key, value text, updated_at timestamptz not null default now()); enable RLS`）。
