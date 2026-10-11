# 交接文件 — AI_stock 盤後研究院（2026-10-05）

本文件記錄近期 session 新增/修改的功能、資料來源、部署流程與待辦，供合夥人與後續開發者接手。

---

## 一、部署流程（鐵則）

- **uat 先行；prod 一定要用戶明確說「推 prod」才能推。禁止自作主張推 prod。**
- 分支：`Andrew`＝本機開發；`uat`、`prod`＝部署分支。正式站 prod = https://tw-stock-screener-neon.vercel.app
- 主程式：單檔 SPA `index.html`（約 1.27MB）。
- ⚠️ **動手前先同步（2026-10-11 教訓）**：合夥人（JUSTY，分支 `justy-layout`）與其他 session 會**直接推 uat**，本機 `C:\Users\User\Desktop\AI_stock` 的檔案可能比 uat 舊。10-11 就發生本機 `index.html` 停在 00:11 的版本、缺合夥人當天三次 ETF 修改；若照舊流程「改本機 → 複製到 uat_wt → commit」會把他的修改整個蓋掉。
  **每次開工先跑**：`git fetch origin && git status -sb && git rev-list --left-right --count HEAD...origin/uat`；本機落後就先 `git merge --ff-only origin/uat`（本機有未提交修改時先備份或 commit）。**禁止用複製檔案覆蓋 uat。**
- **推 uat（與 `CLAUDE.md` 一致，一律 git merge）**：commit 到 Andrew 並 push → 到 uat worktree：
  `git fetch -q origin; git checkout -q --detach origin/uat; git merge --no-ff origin/Andrew -m "merge Andrew → uat: ..."; git push origin HEAD:uat`
  （worktree 路徑見 scratchpad `uat_wt`）。**有衝突就停下來告知用戶衝突檔與兩邊差異，不可用 `-X theirs`／`--ours` 整份覆蓋**（舊版本文件寫的 `-X theirs` 已作廢）。
- **推 prod**（需用戶明確同意）：prod worktree：
  `git reset --hard origin/prod; git checkout origin/uat -- .; git checkout HEAD -- .github; git commit; git push origin HEAD:prod`
  **務必保留 prod 專屬的 `.github/workflows/daily-cloud-jobs.yml`。**
- 驗證 prod：`fetch(prod_url?_=Date.now(),{cache:'no-store'})`，CDN 約 20–60s 傳播。
- 每次改動標註在**頁尾「改動紀錄」**供合夥人複查（鐵則）。
- ⚠️ **Vercel 免費(Hobby)方案上限 12 個 Serverless Function**。`vercel.json` 用 `builds:[{src:"api/*.py"}]` → **每個 `api/*.py` = 1 個 function**。api 檔數 >12 → **每次 build 都 Error（~13–36s 秒殺）**「No more than 12 Serverless Functions on the Hobby plan」，alias **退回上一個成功版本**，造成「推了卻看不到新功能」的假象。**加新 api 端點前務必先數**：`git ls-tree -r --name-only origin/uat | grep -E "^api/.*\.py$" | wc -l`。詳見下方「六、2026-10-11」。

## 二、資料層

- Supabase 專案 `bruqrbvbjxntgoljxsne`（Taiwan stock2）。anon 讀 publishable key；寫入用 service key（本機 `.env.local`，`broker_signals._load_env`）。
- 建表無 DDL API：SQL 寫進 `sql/*.sql`；由 Claude 在 Chrome 用 **Supabase Management API v1** 執行：
  `POST https://api.supabase.com/v1/projects/bruqrbvbjxntgoljxsne/database/query`，Bearer = dashboard localStorage `supabase.dashboard.auth.token`.access_token（約 1 小時過期，過期重載 dashboard 分頁再取）。
- 本機 SQLite：`D:\stock_data\wantgoo_full.db`。
- 每日排程：`scripts/run_daily_job.bat`（Windows 工作排程）。
- Python：`C:\Users\User\AppData\Local\Python\pythoncore-3.14-64\python.exe`，CJK 設 `PYTHONIOENCODING=utf-8`。

## 三、本期新增功能

### A. 個股 K 圖「籌碼」分頁（單一 tab，5 張獨立柱）
- 子面板分頁：**技術指標 ｜ 籌碼**（最上層；點籌碼隱藏 VOL/MACD/RSI）。
- 籌碼頁 5 張柱（紅買綠賣）：外資(日)、投信(日)、自營(日)、**大戶(週)、散戶(週)**。
- 資料：
  - 日：`inst_daily`（code,trade_date,foreign_net,trust_net,dealer_net,total_net，單位張，滾動120交易日，~31MB）← `scripts/inst_daily_push.py` ← 本機 `institutional_trades`。
  - 週：`holder_flow`（code,week_date,big_net,retail_net,big_pct,retail_pct,big_shares,retail_shares,total_shares,close_px）← `scripts/holder_flow_push.py` ← TDCC `holding_distribution`＋`stock_daily` 收盤。覆蓋**熱門前 500 檔**（近20日成交值），**每週更新**。回補完成：491 檔、7857 列。
  - 大戶/散戶門檻（用戶定案）：大戶＝持股≥300張 **或** 市值≥3000萬；散戶＝<20張 **或** <100萬。市值用當週收盤換算等效張數，跨 TDCC 級距用均勻分布內插（近似值；高價股大戶/散戶會微幅重疊）。
  - 大戶/散戶（週）前端以 **baseline 階梯填滿**前向填滿到日軸：一週一整塊實心粗柱、佔滿 5 交易日、與日軸對齊（`_buildBandPanel`）。
- 關鍵前端：`_chipTab('tech'|'chip')`、`_renderChipAll`、`_buildBarPanel`（日，histogram）、`_buildBandPanel`（週，baseline 實心）、`window._chipCharts`。
- 兩表 RLS：anon 可讀、僅 service_role 寫（`sql/inst_daily.sql`、`sql/holder_flow.sql`）。皆併入 `run_daily_job.bat`。

### B. K 圖共用改進
- **十字線跨面板同步**：滑鼠在任一面板，其餘日軸面板畫同時間垂直線（子面板隱藏水平線）。`_wireXhair`、`window._chartSyncGroup`、各圖 `_xhairSeries`。週面板(baseline)在日軸上，亦同步。
- **主圖 X 軸顯示日期**（`_renderMainChart` 用 `_chartOpts(h,true)`）。
- **K 圖標記分類開關**（法說會／除權息，動態偵測、比照均線顯示隱藏）：`_mkShow`、`_MK_DEFS`、`_renderMarkerToggles`、`#markerToggles`。
- 移除無用「清標記」按鈕。

### C. ETF 詳情（ETF 探索 → 卡片 → 右側抽屜 `_etxOpen`/`renderDrawer`）P0→P3
- 分頁：總覽／今日動作／成分股／績效／相似／配息／投資試算／規模基本／持有人。
- **P0 資料正確性**：發行投信（由基金名稱推定 `_etfIssuer`）與基金經理人（`etf_products.manager`）分開；TDCC 持有人級距中文化＋數值排序（`_tierLabel`，原字串排序 bug）＋小/中/大額分組；配息摘要（頻率、近12月配息、近12月殖利率〔÷收盤標口徑〕、連續配息**年數** `_divSummary`）；被動 ETF 用「持股配置變動(PCF)」；缺漏顯示「—」。
- **P1**：總覽頁（行情/規模/配息/集中度/今日動作/特色）；成分股集中度（前1/5/10大 `_concentration`）；配息柱狀圖（單次/年度累計）。
- **P2**：績效（價格/含息報酬、年化、最大回撤、年化波動；含息 vs 加權正規化線圖；純函式 `_retOver/_annualize/_maxDD/_annVol`；資料 `/api/chart` range=3y 上限，切 ETF 以 token 取消過期請求）；相似度（加權持股重疊 Σmin(wA,wB) `_etfSimilar`）＋持股差異 `_etxSimDiff`。
- **P3**：投資試算（定期定額：每月投入/設定目標；配息現金流：一次投入/每月想領；未來資產柱狀圖；純函式 `_fvMonthly/_pmtForTarget`，0% 不除零、負/空值防呆；非投資建議說明）。
- 指數相關新聞 bug 修正：指數改載 `macro_news`（`_loadIndexPanels`），不再殘留前一檔個股新聞。

### D. 首頁/其他
- §4 融資動能背離加「今日／3 日」週期。
- 外資空單避險歷史圖右上加「事件避險／連假避險」標記開關。
- 富台指期（SGX FTSE Taiwan）最後交易日倒數（每月**倒數第二個營業日**，依證交所休市表 `window._twIsTrading`）。

## 四、待辦 / 已知限制

- ETF「查看完整分析」全螢幕頁：目前整合進既有抽屜（分頁橫向可捲），未另開全頁。
- ETF 績效近五年/更長：`/api/chart` 上限近 3 年 → 顯示「—」不虛構；若要更長需補更長行情/配息歷史。
- ETF `etf_distributions` 僅約近 3 年 → 連續配息年數偏低（非 bug，不虛構）。
- 大戶/散戶門檻為 TDCC 級距近似；高價股大戶/散戶區間會微幅重疊。
- 大戶/散戶覆蓋前 500；要擴更多檔需分批跑 `holder_flow_push.py --top N`（TDCC 逐股限流 1.2s/週，斷點續跑）。
- 明燈冥燈 Phase 2（YouTube 字幕 AI＋國會申報）仍待辦。

## 五、相關檔案
- `scripts/inst_daily_push.py`、`scripts/holder_flow_push.py`、`scripts/chip_etl_tdcc.py`、`scripts/run_daily_job.bat`
- `sql/inst_daily.sql`、`sql/holder_flow.sql`
- `index.html`（籌碼、ETF 抽屜、K 圖、首頁 §4、避險圖、富台指倒數）

---

## 六、2026-10-11 本期修復與重要限制

### A.（最重要）Vercel build 連環失敗 — Hobby 12 function 上限
- **現象**：合夥人改了 ETF 配息頁（配息日曆＋配息來源圓餅圖）、技術面(Put/Call) 等，**推到 uat 了、GitHub 上也在**，但**線上 uat 完全看不到**。
- **根因**：合夥人 commit `032cee5` 新增 `api/pc_ratio.py`（Put/Call 技術圖）→ api 從 12 變 **13 個** → 超過 Vercel **Hobby 方案 12 個 Serverless Function 硬上限** → **從該 commit 起每一次 build 都 Error**（Vercel Deployments 一整排紅色 Error，秒數很短 13–36s）。uat alias 因此**退回最後一次成功的 `3b028f7`（22h 前）**，配息改版(`e64d9d8`)與今日動作修正(`5a9c141`)全上不了線。
- **排查步驟**：Vercel → Deployments → 看狀態欄若一排短秒數 Error → 點進去看紅框「Build Failed」訊息。數 function：`git ls-tree -r --name-only origin/uat | grep -E "^api/.*\.py$" | wc -l`。找前端沒用到的死檔：`git show origin/uat:index.html | grep -oE "/api/[a-z_]+" | sort -u` 比對 `api/` 實際檔案清單。
- **解法**（commit `5152bd0`，只推 uat）：移除死檔 **`api/sessions.py`**（台指期日/夜盤 K 線端點，功能早已併入 `chart.py` 的日盤＋夜盤合併，前端 `index.html` 0 次呼叫 `/api/sessions`）→ 回到 **12 個** → build 恢復 Ready。線上實測 00981A 配息頁已正常顯示配息日曆（除息 2026-09-16 已過／發放 2026-10-13 即將到來）＋圓餅圖，技術面分頁也上線。
- **教訓**：**以後要加 api 端點前先確認 ≤12**；真的需要更多就得升級 Vercel Pro（付費，需用戶決定）。

### B. 主動 ETF「今日動作」永遠空白 — delta_shares 未計算
- **現象**：00981A 等 22 檔主動式 ETF 的「今日加減碼」一直空白（被動 ETF 正常）。
- **根因**：`scripts/upload_active_etf_holdings.py` 原本只寫 `shares/weight`，**沒算 `delta_shares`**（今日股數−前一日），前端讀 `etf_holdings.delta_shares` 自然全空。
- **解法**：在 DELETE 覆蓋前**先讀既有(前一日)持股算 delta**（比照被動 ETF `wantgoo_etf.py`），已 commit 進 repo（原本此腳本未納版控）。下次盤後(交易日)跑完 `run_daily_job.bat` 即自動生效。（10-08 的歷史缺口另以 github `nctuwanglin/active-etf` 10-07 快照回填過一次。）

### C.「為什麼合夥人截圖有配息日曆，線上卻沒有？」
- 因為配息頁（配息日曆/圓餅圖）是**純前端 + Supabase 匿名查詢**（`Q('etf_distributions...')`），**完全不經 `/api` serverless function**。他在**本機 localhost / 本地開發環境**跑最新 `index.html` 當然看得到；但那份新程式碼**從未在 Vercel 成功部署過**（所有含配息日曆的 build 都卡在 12-function 上限失敗），所以任何 Vercel 線上網址（含 uat alias 與 preview）都看不到。失敗的 build 不會產生可用的 preview URL。簡言之：**「本機看得到 + 已 push」≠「已部署成功」**。

### D. 2026-10-11 晚：本機／Andrew 對齊 uat（整理）
- 原狀：Andrew 落後 uat 19 個提交；本機 `index.html`、`scripts/wantgoo_etf.py` 為舊版，缺合夥人當天新增的 `api/pc_ratio.py`、`scripts/etf_move_rows.py`、`tests/`。
- 處理：逐檔比對確認本機獨有內容只有 `HANDOFF.md` 第六節與 `待提供logo清單.md`（其餘 236 個 logo 圖與 uat 完全相同），備份後 `git reset --hard origin/uat` 對齊，再放回這兩份文件並提交。Andrew＝uat。
- 驗證：`index.html` 41 段內嵌腳本語法 0 錯、4 支 Python 語法 OK、`tests/` 6 個測試通過。
- 注意：`scripts/wantgoo_etf.py` 已是合夥人重構版（成分股列組裝移到 `etf_move_rows.build_holdings_rows`；進入條件由「有 nav 或有成分股」改為「有成分股」），每日排程自此跑這一版。
- 相關文件：`交接文件_畫線套件與集團logo.md`（畫線套件、logo 機制）、`待提供logo清單.md`（還缺的 34 個集團 logo，等用戶提供圖）、`融資維持率_交接文件.md`（§4 口徑 A/B/C 待合夥人決定）。

### 待辦
- 本次只推 uat。**推 prod 需用戶明確同意**；屆時把累積的 uat 變更一起上 prod，並 `git push origin origin/uat:justy-layout` 對齊 justy-layout（見 [記憶] deploy-prod-sync-justy）。
- ETF 版面改回舊樣（今日加減碼原貌＋多一顆按鈕）仍 **DEFERRED**（用戶「先不改版面」，待合夥人確認位置/樣式/按鈕功能）。
