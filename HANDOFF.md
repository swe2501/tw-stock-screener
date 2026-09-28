# AI_stock 「跟誰學｜盤後研究院」開發交接文件

> 最後更新：2026-09-27
> 目標：讓另一位開發者（含 Claude Code）能無痛接手本專案的開發與維運。
> 本站定位：以**真實官方資料**打造合夥人 genshuei 風格的台股**盤後**研究網站（非盤中即時）。

---

## 0. 最重要的鐵則（先看這段）

1. **語言**：一律**繁體中文**回覆與溝通。
2. **部署**：**uat 先行**；**prod 一定要用戶明確說「推 prod」才能推**。禁止自作主張推 prod。
3. **算法先討論**：評分／權重／門檻類邏輯，動工前先跟用戶討論，不要自己定死。
4. **算法標註在網站**：所有算分方法與每次改動，都要標在網站上（頁尾/note 區）供合夥人複查。
5. **能自己做就自己做**：SQL 自己用 Chrome 在 Supabase 跑，不要叫用戶手動；資料修正自己跑腳本。
6. **容量估算**：任何「會存資料」的功能，動工前先估總資料量對照 Supabase 免費版上限（曾爆磁碟）。
7. **不碰**：信用卡／密碼／CAPTCHA／下單／金流。
8. **Git commit 屬名**：結尾加 `Co-Authored-By: Claude <當下實際模型版本> <noreply@anthropic.com>`（例：`Claude Opus 5.5`），用當時跑的模型版本，不要沿用舊版號。

---

## 1. 環境與路徑

| 項目 | 路徑 / 值 |
|---|---|
| 主 repo | `C:\Users\User\Desktop\AI_stock` |
| 前端主檔 | `index.html`（單檔 SPA，~700KB＋，所有視圖都在裡面） |
| 後端 API（Vercel serverless） | `api/*.py`（screen.py, chart.py, alert.py…） |
| 每日排程腳本 | `scripts/*.py`，由 `scripts/run_daily_job.bat` 串起 |
| Python | `C:\Users\User\AppData\Local\Python\pythoncore-3.14-64\python.exe` |
| 本機股價 SQLite | `D:\stock_data\wantgoo_full.db`（表：stock_daily 等；**注意上櫃/上市各半**，見眉角） |
| Supabase 專案 | `bruqrbvbjxntgoljxsne`（名稱 Taiwan stock2 / stock filter）URL `https://bruqrbvbjxntgoljxsne.supabase.co` |
| 部署平台 | Vercel（分支 push 自動部署） |
| 分支 | `Andrew`(本機工作)、`uat`(測試)、`prod`(正式，含 `.github/` 雲端排程) |

### 執行指令注意
- Windows。**PowerShell 為主**，Bash 工具也有但**背景 Bash 無網路**（getaddrinfo 失敗）→ 要跑有網路的背景任務用 **PowerShell `run_in_background`**。
- PowerShell 跑 python 帶中文/`&&` 會壞 → 用獨立呼叫或 here-string；長字串用 `@'...'@`。
- 跑 python 一律用上面那個完整路徑的 python.exe。

---

## 2. 部署流程（uat / prod）

本機在 `Andrew` 分支工作，但**功能是直接 commit 到 `origin/uat`**（透過 worktree），確認後再 promote 到 `prod`。

> 此 worktree 推法與 `CLAUDE.md` 的 `git merge Andrew` 推法**是同一件事**（Andrew→uat→prod），擇一即可。本機工作區常有大量未 commit 修改時，用 worktree 比較不會卡 checkout。

### Worktree 位置（已建好，重用即可；`git worktree list` 可查）
- uat：`C:\Users\User\AppData\Local\Temp\claude\C--Users-User-Desktop-trip-project\6a747587-922c-41c7-aaca-1b22bfdea8f3\scratchpad\uat_wt`
- prod：同目錄下 `prod_wt`
- 若資料夾不見了（Temp 被清），用 `git worktree prune` 後 `git worktree add <路徑> origin/uat` 重建。

### 推 uat（每次改完 index.html）
```powershell
$uat="...\scratchpad\uat_wt"; cd $uat
git fetch origin uat --quiet; git reset --hard origin/uat --quiet
Copy-Item "C:\Users\User\Desktop\AI_stock\index.html" "$uat\index.html" -Force
git add index.html
git commit -m "feat(...): ...`n`nCo-Authored-By: Claude <當下模型版本> <noreply@anthropic.com>"
git push origin HEAD:uat
```

### 推 prod（**須用戶明確授權**）
用 prod_wt，從 uat 取檔但**保留 prod 專屬的 `.github/`（雲端排程 yml）**：
```powershell
$prod="...\scratchpad\prod_wt"; cd $prod
git fetch origin uat prod --quiet; git checkout -q prod; git reset --hard origin/prod --quiet
git checkout origin/uat -- .        # 取 uat 全部內容
git checkout HEAD -- .github        # 還原 prod 專屬 .github（雲端排程只在 prod）
git commit -am "..."; git push origin HEAD:prod
```
- prod push 偶爾被「Production Deploy」classifier 擋（非必現）→ 重試即可。

### 眉角
- 後端 `scripts/*.py`、Supabase 資料修正都是**本機/資料層**，前端直讀 Supabase → **不需部署**即生效。只有 `index.html`（與 `api/`）改動需部署。

---

## 3. 前端架構（index.html）

- **單頁多視圖**：`window._VIEWS[viewName] = {el:'xxxView', show:'_xxxShow'}`。切換用 `window._showView('viewName')`：隱藏所有視圖 el、顯示目標 el、呼叫其 show 函式。
- **導覽**：頂部 `#mainNav`，大項用 `.mn-grp>.mn-item`（hover 下拉），子項 `<a onclick="_showView('x')">`。
  - `_setNav(v)` 依 `NAVMAP{view→大項中文}` 把對應大項加 `.mn-active`（綠底 focus）。**新增視圖記得補進 NAVMAP**，否則綠底不亮。
- **資料層**：多處各自定義 `sb(path)` / `Q()`，都是 `fetch(SIG_SB_URL + '/rest/v1/' + path, {headers:{apikey:SIG_SB_ANON, Authorization:'Bearer '+SIG_SB_ANON}})`。`SIG_SB_URL`/`SIG_SB_ANON` 是全域常數（anon key）。
- **付費 gate（主力籌碼帳號）**：
  - `window._isOwner`（由 `_applyAuthState` 設定，= 登入 email ∈ `VIEWER_EMAILS` 白名單，含用戶 swe250165@gmail.com）。
  - 付費分頁在 show 時呼叫自己的 `applyGate()`：owner 顯示內容、非 owner 顯示「付費解鎖更多」teaser（`#xxLock`/`#xxBody`）。
  - `_applyAuthState` 內會呼叫各分頁的 `window._xxxApplyGate()` 以在登入狀態變動時即時切換。
  - `.nav-owner` class = 僅 owner 可見的選單項（完全隱藏）；付費分頁本身**不加** nav-owner（大家都看得到入口，內容才 gate）。
- **圖表**：用 LightweightCharts 4.1.3（CDN 已載）。多面板同步十字線用 `chart.setCrosshairPosition(price,time,series)`；要吸附線值用 `crosshair.mode = CrosshairMode.Magnet`。
- **個股搜尋**：頂部 `.topsearch`（首頁隱藏，靠 `.topsearch[hidden]{display:none}` 蓋過 flex）＋ 首頁 hero `#hpSearch`。自動完成資料 `window._names/_mkt/_ind`（`_loadNames()`），含上市（API `screen.py?stat=names`）＋上櫃（`otc_names` 表）＋產業（`screen.py?stat=industries`）。
- **K線 modal**（`#chartModal`，`openChart(code,name,...)`）：右側 `#chartNotePanel` 為三分頁（觀察備註/基本面/相關新聞，見 §5）。

---

## 4. 後端資料管線

- `scripts/run_daily_job.bat`：每日盤後（Windows 排程）依序跑所有腳本，log 到 `daily_job_stdout.log`。新增每日腳本要加進這裡。
- 部分腳本已搬 **GitHub Actions 雲端排程**（prod 分支 `.github/workflows/daily-cloud-jobs.yml`，台灣週一~五 20:30）：法說會、除權息因子。**wantgoo 擋雲端 IP(403)**，故需 wantgoo 登入的腳本（margin_ratio 當日值、market_indicators 富台指）留本機。
- Supabase 寫入：腳本用 `SUPABASE_SERVICE_KEY`（`broker_signals._load_env()` 讀 .env）POST/upsert；前端用 anon key 讀。

### 建表流程（Supabase 無 DDL API）
用 Chrome（用戶已登入 Supabase）在 SQL Editor 跑：
1. `mcp__claude-in-chrome__navigate` 到 `https://supabase.com/dashboard/project/bruqrbvbjxntgoljxsne/sql/new`
2. JS：`monaco.editor.getModels()[0].setValue(sql)`，SQL 內含 `create table` + `alter table enable row level security` + `create policy anon_read_x for select to anon using(true)`。
3. 點 Run（DDL 會跳「Potential issue detected」→ 再點「Run query」確認）。**Chrome 分頁若 viewport 0×0（視窗沒顯示）→ 點擊/截圖失效，但 JS 可執行**：用 JS 直接找按鈕文字點擊（先點含「Run」非「Run query」的鈕、等 1.2s、再點「Run query」）。
4. 用 REST 以 anon key 驗證表存在（200 []）。

---

## 5. 已完成功能模組總表

> 每個功能＝【Supabase 表】＋【scripts 腳本(每日)】＋【index.html 視圖/區塊】。詳見對應 memory 檔（`.claude/.../memory/*.md`）。

| 功能 | 位置 | 表 | 腳本 | memory |
|---|---|---|---|---|
| 貪婪指標 | 市場觀察 | greed_base | compute_greed.py | project_greed_index |
| 融資維持率三組 | 首頁§4 | margin_maint_split | margin_ratio.py / margin_maintenance_calc.py | project_margin_maint_split |
| 外資空單溫度計（付費） | 市場觀察 | foreign_hedge_daily | foreign_hedge.py | project_foreign_hedge |
| 大盤多空廣度（付費） | 市場觀察＋首頁§3鈕 | breadth_daily | breadth_daily.py | project_breadth |
| K線 基本面/新聞分頁 | K線 modal 右側 | stock_fundamentals, stock_financials | fundamentals.py | project_fundamentals |
| 選擇權支撐壓力區（價平+主次區間，週/月 tab） | 首頁 §6 選擇權矩陣下方 | option_sr（PK trade_date+kind） | option_sr.py | project_option_sr |
| 選擇權 N 日大量區（5~480日，壓力/支撐前5） | 首頁 §6 選擇權矩陣下方 | option_nday（本機明細 txo_daily） | txo_history.py → option_nday.py | project_stock_sr |
| 個股分價量表壓力支撐 | 選股「🧱 壓力支撐逼近」＋K線右側「🧱 支撐壓力」分頁/圖上色帶 | stock_sr（PK code+n，每日覆蓋） | stock_sr.py（歷史 backfill_stock_2y.py） | project_stock_sr |
| 流動性排行（現貨、個股期貨各前50） | 選股 | liquidity_top | liquidity_top.py | project_liquidity_top |
| 主動ETF成分/集中 | ETF分析 | etf_holdings, active_etf_flow | upload_active_etf_holdings.py, active_etf_flow.py | project_active_etf_consensus |
| 台指VIX/富台指/匯率 KPI | 首頁 hero | market_indicators | market_indicators.py | project_taifex_vix |

### 重點功能細節
- **外資空單溫度計**：避險比率 R = 外資期貨淨空名目 H ÷ 外資持股市值 V ×100。H＝MAX(−Σ(外資各契約 net 口×指數×每點價值),0)，每點：大台200/小台50/微台10。V(上市)＝Σ(mi-qfiis 全體外資持有股數×收盤)，扣ETF=排除00開頭。分級用**2年歷史百分位**（<P80常態/P80–95偏高/≥P95顯著偏高）＋固定紅線>1.2%。前端三層架構（完美.html 藍本）＋情境模擬器。
- **大盤多空廣度**：每市場(tse/otc/all)算 漲跌平/漲跌停/站上5-10-20-60MA%/新高低/漲跌量比。情緒燈號用手冊§6滲透率門檻；SOP 用 60/20MA廣度。'all'=tse+otc 原始計數相加後算 pct。
- **K線基本面**：PE/PB/殖利率(BWIBBU/TPEx)、月營收YoY(t187ap05)、季報累計毛利率/營益率/淨利率/EPS(t187ap06 六業別)。相關新聞=hot_topics 依代號過濾。
- **選擇權支撐壓力**：TXO 最近月月選、一般盤各履約價最大未平倉：壓力=買權最大OI履約價、支撐=賣權最大OI履約價＋P/C比。
- **流動性排行**（2026-09-28 改）：現貨=上市成交金額前50、個股期貨=成交量前50（只留個股期貨、排除指數類/ETF 期貨與價差單；標準型/小型分開，小型標「小型期貨」）。

---

## 6. 資料源清單（實測可行的端點）

### TWSE（證交所，urllib 大多可讀）
- `openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL`：全上市 OHLCV＋成交金額(TradeValue)。**JSON 穩定**（舊 www rwd 端點改回傳 CSV）。
- `www.twse.com.tw/rwd/zh/fund/MI_QFIIS?date=YYYYMMDD&response=json&selectType=ALLBUT0999`：外資持股統計（欄位[5]=全體外資持有股數）。**密集請求會 307/308 限流**→退避重試＋節流。
- `www.twse.com.tw/rwd/zh/fund/BFI82U?dayDate=YYYYMMDD&type=day&response=json`：三大法人買賣金額（主列開頭「外資及陸資」）。
- `openapi.twse.com.tw/v1/exchangeReport/BWIBBU_ALL`：PE/殖利率/PB。
- `openapi.twse.com.tw/v1/opendata/t187ap03_L`（基本資料/董事長）、`t187ap05_L`（月營收）、`t187ap06_L_ci/_ins/_basi/_bd/_mim/_fh`（綜合損益表，六業別；金額**仟元**，EPS 在末欄，季別為**累計**）。

### TPEx（櫃買，urllib 可讀）
- `www.tpex.org.tw/openapi/v1/tpex_mainboard_peratio_analysis`（PE/PB/殖利率）、`mopsfin_t187ap05_O`（月營收）、`mopsfin_t187ap06_O_ci/...`（財報）。

### TAIFEX（期交所）
- `openapi.taifex.com.tw/v1/DailyMarketReportOpt`：**選擇權每日行情 CSV**（含未沖銷契約量 OI 在 index 11、交易時段一般/盤後）。**urllib 可讀、無 403**。
- `openapi.taifex.com.tw/v1/DailyMarketReportFut`：期貨每日 JSON（各契約 Volume/OI）。
- `openapi.taifex.com.tw/v1/SSFLists`：股票期貨 320 檔 代號→StockCode/StockName（`SSOLists`=股票選擇權）。
- `www.taifex.com.tw/cht/3/futContractsDate?queryDate=YYYY%2FMM%2FDD`：三大法人各契約未平倉 HTML（urllib 可讀；`futures_market.py` 有解析器 `_parse_inst`）。
- **台指VIX**：`www.taifex.com.tw/file/taifex/Dailydownload/vix/log2data/{YYYYMM}new.txt`（每日收盤月檔，Tab 分隔，數字 ASCII；盤後日更、慢一交易日）。**www 與 mis 有 WAF 擋 urllib**，但這個靜態檔＋openapi 用 urllib 可讀；MIS 即時頁需真瀏覽器。
- ⚠️ TAIFEX **openapi 用 urllib 可讀**（實測 DailyMarketReportOpt/Fut/SSFLists 都 OK），但 **www.taifex.com.tw 與 mis.taifex.com.tw 的「即時/查詢頁」有 WAF**，PowerShell/urllib 常 403 → 需 Playwright 真瀏覽器（見 market_indicators）。

### 其他
- **Yahoo Finance**：`query1.finance.yahoo.com/v8/finance/chart/{code}.TW?range=2y&interval=1d`（上市 .TW、上櫃 .TWO、加權 ^TWII）。歷史回補用。
- **玩股網（wantgoo）**：需登入，用 Playwright persistent context（`.wantgoo_profile`、channel=chrome、headless=False）。富台指、當日融資維持率、主力分點。**該 profile 若已有 Chrome 開著會鎖住**（launch TargetClosedError）→ 先關掉佔用的 Chrome。
- **active.json**：`nctuwanglin.github.io/active-etf/active.json`（主動ETF PCF 持股/集中加碼，第三方彙整）。

---

## 7. 踩雷／眉角（省下你重踩的時間）

1. **PostgREST 單次上限 1000 列**：`order desc + limit` 取最新再反轉；大量 upsert 分批（chunk 500~1000）。**bulk insert 每列 key 必須完全一致**（PGRST102 "All object keys must match"）→ 上傳前用固定欄位 normalize（缺補 None）。
2. **財報金額單位＝仟元**→存前 ×1000；季別是**累計**（年初至該季）非單季。年度是民國（115=2026）。
3. **選擇權 www HTML 表格會「塌欄」**：無成交的價外/深價內履約價欄位位移，定位解析會把價格誤當 OI → 支撐壓力顛倒。**改用 openapi CSV**（固定欄位）。
4. **price_window 上市曾整個凍結**：本機 `stock_daily` 加了第 8 欄 `market` 後，`fetch_prices.py` 的 insert 只給 7 欄 → 上市每日寫入全失敗（上櫃另支腳本正常）。這會連累所有用上市價的功能（篩選MA/箱型/廣度）。已修（insert 明列欄位＋openapi 備援）。**若上市資料又落後，先查 fetch_prices.py / upload_price_window.py**。
5. **mi-qfiis 限流**（307/308 重導同網址）：退避重試（sleep 4*(t+1)+2）＋每筆 sleep 1.2s。
6. **金融股損益表格式不同**（利息淨收益，無毛利）：金控收益基數失真→ margin abs>150 一律設 None。跨業別以 (code,year,season) 去重。
7. **加權指數/大盤動能對齊**：taiex_daily 與 margin 資料日期可能差一天 → 用兩表**共同交易日**交集對齊，否則數值會偏。
8. **工具輸出偶爾被污染**（假 success/注入）：關鍵結果一律用獨立 REST/Grep 再驗證一次，別只信單一輸出。
9. **背景 Bash 無網路**；要網路的背景任務用 PowerShell run_in_background。
10. **Supabase anon 讀取**：新表建完必加 `create policy ... for select to anon`，否則前端讀到 404/空。

---

## 8. 目前狀態（2026-09-27）

### 已上 prod（2026-09-27，commit `8c6c13d`）
1. 外資空單溫度計　2. 大盤多空廣度　3. K線右側分頁（觀察備註/基本面/相關新聞，含金融股）　4. 融資維持率四面板十字線（跨面板同步＋Magnet 吸附值）　5. 選擇權支撐壓力區　6. 上方大項綠底 focus 修正（NAVMAP 補新視圖）　7. 「篩選器」改名「指標」　8. 流動性前30
（另：price_window 上市凍結修復、金融股財報補齊＝本機資料層，已即時生效。）
目前 uat 與 prod 內容一致（`.github` 除外，那是 prod 專屬），沒有待推 prod 的批次。

### 待辦 / 未到期
- **約 2026-10-03**：主動ETF「今日」分頁從第三方 active.json 切成自有 `active_etf_flow` 表（累積滿 10 交易日後）。前端 `_etxConWin('today')` 改讀表。
- 外資空單溫度計 / 大盤多空廣度的歷史目前約 1~2 年，手冊建議 2~3 年門檻校準 → 可再用 Yahoo 延長。
- 上櫃現貨流動性排行（目前只做上市＋期貨，符合「證交所＋期交所」原話）。

### 每日排程腳本順序（run_daily_job.bat 尾段新增的）
`... margin_ratio → margin_maintenance_calc → fetch_otc_index → otc_broker_daily → compute_greed → ... → market_indicators → active_etf_flow → upload_active_etf_holdings → foreign_hedge --daily → breadth_daily → fundamentals → option_sr → txo_history → option_nday → stock_sr → liquidity_top → job_health`

---

## 9. 記憶檔（.claude memory）

專案知識在 `C:\Users\User\.claude\projects\C--Users-User-Desktop-AI-stock\memory\*.md`，`MEMORY.md` 是索引（在 AI_stock 開 session 會自動載入）。
（2026-09-27 前早期 session 誤開在 trip project，記憶曾存在 `...trip-project\memory`，已全數搬到上述路徑並刪除舊檔。）接手後建議先讀完索引與各 project_*.md（每個功能的定案規格、資料源、眉角都在裡面）。

---

## 10. 快速上手檢查清單

- [ ] 讀本檔 §0 鐵則 + §7 眉角。
- [ ] 確認能跑 `python.exe scripts/xxx.py`（.env 有 SUPABASE_SERVICE_KEY）。
- [ ] 確認 Chrome 已登入 Supabase（建表用）。
- [ ] 改前端 → 推 uat → 用 preview/瀏覽器驗證 → 回報用戶 → **等「推 prod」才 promote**。
- [ ] 新功能：先討論算法/門檻 → 估容量 → 建表(anon policy) → 腳本(入 bat) → 前端視圖(_VIEWS+NAVMAP) → 頁尾標算法 → 驗證 → uat。
