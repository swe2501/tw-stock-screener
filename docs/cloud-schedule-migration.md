# 排程全上雲 — 可行性盤點（2026-10-18）

> 目標：網站正式上雲後，不再用本機 Windows 工作排程器跑盤後／盤中排程。
> 方法：盤點 7 個 `.bat`（`scripts/run_*.bat`）共 **64 支** 排程腳本，依「能否在雲端（GitHub Actions／雲端 cron）執行」分層。

## 一、現況架構（為什麼不是把腳本搬上去就好）

```
wantgoo 爬蟲(需登入瀏覽器, 過 Cloudflare)  ─┐
官方源抓取(TWSE/TPEX/TAIFEX/FRED/美財政部) ─┼─►  D:\stock_data\wantgoo_full.db  ──► 聚合/計算 ──► Supabase ──► 網站
                                            (12 GB 本機 SQLite 資料湖)        (~25 支讀它)       (serving 層)
```

- **資料湖是本機單機 12GB SQLite**（`D:\stock_data\wantgoo_full.db`）。約 25 支腳本從它讀、算完推 Supabase。
- Supabase 是對外 serving 層；網站讀 Supabase。
- 所以「全上雲」不只是搬腳本，而是要處理 **(1) wantgoo 登入爬取** 與 **(2) 12GB 本機資料湖** 這兩個耦合在一起的根。

## 二、分層結果（64 支）

### ✅ 可立即上雲 — 26 支（純官方源／Supabase，不碰資料湖與 wantgoo；已全數掛進 workflow 並實測）
`upload_exdiv_factor`、`gen_listed_codes`、`catalyst_lawshow`、`ust_yields_push`、`fetch_otc_index`、`upload_etf`、`upload_institutional`、`upload_etf_div`、`upload_etf_holders`、`sector_turnover`、`margin_market`、`inst_market`、`futures_market`、`chip_brief`、`options_market`、`daily_slogan_rotate`、`gov_broker_moneylink`、`active_etf_flow`、`upload_active_etf_holdings`、`foreign_hedge`、`breadth_daily`、`fundamentals`、`mops_announce`、`liquidity_top`、`job_health`、`news_feed`

> **從原本 28 移出 2 支（2026-10-18 完整 run 實測發現）**：
> - `upload_hot_topics` → 需本機產生的 `scripts/hot_topics.json`（隱藏本機相依，靜態掃描未抓到）→ 留本機。
> - `page_cache_push` → 末端聚合，需**完整管線**資料；部分管線上雲時會「完成 3/5、不完整不覆寫」→ 歸 Phase 2，資料湖上雲後再跑。

> 其中 `catalyst_lawshow`、`upload_exdiv_factor` 已在 `daily-cloud-jobs.yml`（GitHub Actions）跑；其餘官方源同類可加入。
>
> **✅ 2026-10-18 實測通過（Phase 1 第一小批）**：把 `inst_market`(TWSE)、`fetch_otc_index --daily`(TPEX)、`options_market`(TAIFEX) 加進 workflow，用 `gh workflow run daily-cloud-jobs.yml --ref uat` 觸發，GitHub Actions run 29 秒全綠，三支都**實際抓到資料並 upsert Supabase（status 200）**，連同原本 2 支共 5 步全過 → **TWSE / TPEX / TAIFEX 從 GitHub 雲端 IP 都不被限流**。
> **✅ 2026-10-18 第二小批通過**：`sector_turnover`、`margin_market`、`futures_market`(TAIFEX openapi，資料已最新→冪等略過)、`fundamentals`(1967 檔+1977 財報列全 upsert 200) 皆雲端跑通。
> **✅ 2026-10-18 第三批（剩餘）完整 run 實測**：一次把剩餘 19 支加入後觸發，**28 步中 26 支成功**（含 gen_listed_codes、ust_yields_push/美財政部、全部 upload_etf*、chip_brief、foreign_hedge、liquidity_top、mops_announce、breadth_daily、news_feed、job_health…）。**2 支失敗且已移除**（upload_hot_topics 缺本機 json、page_cache_push 需完整管線，見上）。至此 **26 支「可直接上雲」全部掛進 workflow 且實測通過**。
> → `futures_market` 用 TAIFEX **openapi(T+1 延遲)**，要當日值須改走 `futDataDown`（同 `api/chart`）—— 屬資料新鮮度，不影響雲端可跑性。
> **✅ 移除 2 支後重跑全綠（26/26，conclusion=success）。**
> **⚠️ 效能註記**：`breadth_daily`（大盤廣度）單支約 **3 分鐘**，是整個 run 的主要時間瓶頸（疑似對 Supabase 大量查詢）；目前總時長約 10 分、workflow `timeout-minutes: 15` 尚有餘裕，但後續再加腳本或它變更慢時要留意逾時，值得優化其查詢。
> **操作重點**：workflow 只要**推到任一分支就會在 GitHub 註冊**，之後 `gh workflow run --ref <branch>` 即可觸發，**不必等推 prod**（schedule 定時觸發才需在預設分支 prod）。
> 注意：部分「源:僅 Supabase」者（如 `breadth_daily`、`page_cache_push`）吃的是 Supabase 裡的資料，而那些資料若上游來自資料湖類腳本，仍要等第二層一起上雲才會新鮮。

### ⚠️ 需先把「本機資料湖」上雲 — 25 支（只讀本機 SQLite，不自己爬 wantgoo）
`fetch_prices`、`fetch_prices_otc`、`fetch_hourly`、`upload_price_window`、`compute_strength`、`compute_box`、`chip_etl_twse`、`chip_etl_tpex`、`inst_daily_push`、`holder_flow_push`、`daytrade_etl`、`backfill_gaps`、`broker_signals`、`broker_highwin`、`compute_greed`、`broker_rankings`、`sell_tracker`、`gov_broker`、`etf_daily`、`breadth_ext`、`txo_history`、`option_sr`、`stock_sr`、`mingdeng`、`free_float`

> 這些沒有 wantgoo 登入問題，卡點是 `sqlite3.connect(D:\stock_data\wantgoo_full.db)`。把資料湖改成雲端 Postgres（或直接改讀寫 Supabase）後即可上雲 —— **無硬性阻礙，但是中大型重構＋資料庫代管成本（12GB）**。

### ❌ 硬卡 — 10 支（直接爬 wantgoo，需登入瀏覽器＋過 Cloudflare）
`wantgoo_daily_job`、`margin_ratio`、`margin_maintenance_calc`、`otc_broker_daily`、`wantgoo_etf`、`wantgoo_etf_flow`、`otc_market`、`market_indicators`、`index_history`、`macro_events`

> **這是唯一真正的結構性障礙。** wantgoo 會對雲端 IP 回 403（明載於 `daily-cloud-jobs.yml`），且需要帶登入態的真實瀏覽器（Playwright persistent profile）過 Cloudflare。GitHub Actions 無持久 profile、會被 Cloudflare 擋。

### 🔁 盤中即時 — 1 支
`intraday_push`（`mis.twse` 全市場掃盤，08:55 起跑的 `--loop` 常駐迴圈）

> 不是爬 wantgoo，但它是**常駐迴圈**，不適合 GitHub Actions。要改成雲端「每 N 分鐘 cron 觸發一次」的無狀態版本，並確認 `mis.twse` 不擋雲端 IP。

## 三、阻礙分析

| 阻礙 | 影響範圍 | 難度 |
|---|---|---|
| wantgoo 403＋Cloudflare 登入 | 10 支爬蟲 | 高（結構性） |
| 12GB 本機 SQLite 資料湖 | 25 支讀取者 | 中（重構＋代管成本） |
| 盤中常駐迴圈 | 1 支 | 低～中（改 cron 無狀態） |
| GitHub IP 抓官方源是否被限流 | 28 支（風險） | 低 — **TWSE/TPEX/TAIFEX 已於 2026-10-18 實測通過** |

## 四、建議路線（分階段，務實混合）

1. **Phase 1（進行中）**：把 28 支純官方源腳本陸續加進 `daily-cloud-jobs.yml`。**第一小批（inst_market/fetch_otc_index/options_market）已於 2026-10-18 實測在 GitHub Actions 跑通**（見上）。觸發用 `gh workflow run daily-cloud-jobs.yml --ref uat`，不必等推 prod；要「每日自動定時」才需把 workflow 推上 prod（預設分支）。可依此法分批加入其餘 25 支並各自驗一次。
2. **Phase 2**：把 `D:\stock_data\wantgoo_full.db` 資料湖搬上雲（改用雲端 Postgres 或直接讀寫 Supabase），25 支讀取者隨之上雲。需評估 12GB 的代管方案與成本。
3. **Phase 3（硬核 wantgoo）**：三選一
   - **(a) 混合（建議）**：保留一台小型常開機器（現有 PC／迷你主機／台灣住宅 IP 的小 VPS）**只跑那 10 支 wantgoo 爬蟲**，把結果寫進雲端資料湖；其餘全上雲。
   - **(b) 改官方源重寫**：把 wantgoo 提供的（分點／主力／部分 ETF 流）改用 TWSE/TPEX/TAIFEX 官方重寫 —— 工程大，且部分資料（如券商分點即時整理度）官方未必有等價免費來源。
   - **(c) 住宅代理 + 搬登入 session 上雲**：繞 403，但 Cloudflare 仍會擋、脆弱，不建議長期。

## 五、結論

- **約 45/64 支（28 官方源 + ~17 可隨資料湖上雲的核心）技術上可上雲**；完整 25 支資料湖依賴只要資料湖上雲即可。
- **真正無法「純雲端」的是那 10 支 wantgoo 爬蟲**（403＋登入＋Cloudflare）。
- 因此實際可達的終局是 **混合式**：一台小機器專跑 wantgoo 餵雲端資料湖，其餘排程全部雲端化。要做到「完全不用本機」，前提是放棄 wantgoo 或接受 (c) 的脆弱代理方案。

> 盤點依據：`scripts/run_*.bat` 與 `.github/workflows/daily-cloud-jobs.yml`；分類腳本見當次 session 的 scratchpad `cloud_audit.py`。源判斷為靜態掃描（import／URL／`sqlite3`）；TWSE/TPEX/TAIFEX 三源已於 2026-10-18 用 Phase 1 第一小批實跑驗證，其餘同源同模式風險低，加入前仍建議各源抽一支實測。
