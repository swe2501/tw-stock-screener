# 交接文件 — AI_stock 盤後研究院（2026-10-05）

本文件記錄近期 session 新增/修改的功能、資料來源、部署流程與待辦，供合夥人與後續開發者接手。

---

## 一、部署流程（鐵則）

- **uat 先行；prod 一定要用戶明確說「推 prod」才能推。禁止自作主張推 prod。**
- 分支：`Andrew`＝本機開發；`uat`、`prod`＝部署分支。正式站 prod = https://tw-stock-screener-neon.vercel.app
- 主程式：單檔 SPA `index.html`（約 1.27MB）。
- **推 uat**：commit `index.html` 到 Andrew → 到 uat worktree：
  `git fetch -q origin; git checkout -q -B uat origin/uat; git merge -X theirs Andrew -m "..."; git push origin uat`
  （worktree 路徑見 scratchpad `uat_wt`）
- **推 prod**（需用戶明確同意）：prod worktree：
  `git reset --hard origin/prod; git checkout origin/uat -- .; git checkout HEAD -- .github; git commit; git push origin HEAD:prod`
  **務必保留 prod 專屬的 `.github/workflows/daily-cloud-jobs.yml`。**
- 驗證 prod：`fetch(prod_url?_=Date.now(),{cache:'no-store'})`，CDN 約 20–60s 傳播。
- 每次改動標註在**頁尾「改動紀錄」**供合夥人複查（鐵則）。

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
