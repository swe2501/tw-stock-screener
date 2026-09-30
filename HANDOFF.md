# AI_stock 「跟誰學｜盤後研究院」開發交接文件

> 最後更新：2026-09-29（prod `22e9573`，uat＝prod 無待推）；先前由 swe250165／fufongart 帳號 session 建立與更新
> 目標：讓另一位開發者（含另一個帳號的 Claude Code）能無痛接手本專案的開發與維運。
> 本站定位：以**真實官方資料**打造合夥人風格的台股**盤後**研究網站（非盤中即時）。
> 正式網址：tw-stock-screener-neon.vercel.app　Repo：swe2501/tw-stock-screener

---

## 0. 最重要的鐵則（先看這段）

1. **語言**：所有處理過程與結論一律**繁體中文**（用戶明確要求過多次）。
2. **部署**：**uat 先行**；**prod 一定要用戶明確說「推 prod」才能推**。禁止自作主張推 prod。
3. **算法先討論**：評分／權重／門檻類邏輯，動工前先跟用戶討論，不要自己定死（用戶給的門檻若與實際資料不合，先拿資料回報再請他選，例如「空單增 2000 口」實測太鬆 → 用戶改選「3 日累計 ≥5000」）。
4. **算法標註在網站**：所有算分方法與每次改動，都要標在網站上（頁尾 note 區）供合夥人複查。
5. **SQL**：Supabase 無 DDL API。建表 SQL 寫進 `sql/*.sql`，**請用戶到 Supabase SQL Editor 手動執行**（本機 Chrome 擴充功能帳號與 app 帳號不同時連不上，見 memory `reference_chrome_bridge_account`）。用戶回「SQL 跑好了」再繼續。
6. **容量估算**：任何會存資料的功能，動工前先估總資料量（曾爆 Supabase 磁碟）。
7. **不碰**：信用卡／密碼／CAPTCHA／下單／金流。
8. **Git commit 屬名**：結尾加 `Co-Authored-By: Claude <當下實際模型版本> <noreply@anthropic.com>`，用當時跑的模型版本。
9. **有開通籌碼權限的會員＝管理者**（`window._isOwner` / `VIEWER_EMAILS`）。會員專屬按鈕（列上去、移除…）寫入要靠 RLS 白名單。
10. **不放假資料**：合夥人給的範本 HTML（完美.html、神燈與冥燈.html）裡的數字多為示範假資料，上線只能用自有資料算出的真數字。

---

## 1. 環境與路徑

| 項目 | 路徑 / 值 |
|---|---|
| 主 repo | `C:\Users\User\Desktop\AI_stock`（工作分支 `Andrew`） |
| 前端主檔 | `index.html`（單檔 SPA，約 900KB，所有視圖都在裡面） |
| 後端 API（Vercel serverless） | `api/*.py`（screen.py 以 `stat=` 多工、chart.py…）。**api/ 下每個 .py 都會被當函式**，不可放共用模組 → 需要的對照表直接內嵌在 screen.py |
| 每日排程 | `scripts/run_daily_job.bat`（Windows 工作排程器，盤後） |
| 其他排程 | `scripts/run_codex_topics.bat`（平日 9~15 點每小時，AI 熱門題材）、`AI_stock_news_feed` → `scripts/run_news_feed.bat`（每 4 小時，06:30 起） |
| Python | `C:\Users\User\AppData\Local\Python\pythoncore-3.14-64\python.exe`（一律用完整路徑） |
| 本機 SQLite | `D:\stock_data\wantgoo_full.db`：stock_daily（上市 twse／上櫃 otc 普通股，2024-07 起；**market 為 NULL 的約 31 萬列＝上市**）、stock_hourly、txo_daily、**etf_daily（新，上市/上櫃 ETF）** 等 |
| Supabase | `https://bruqrbvbjxntgoljxsne.supabase.co`；腳本用 `.env` 的 `SUPABASE_SERVICE_KEY`，前端用 anon key（index.html 常數 `SIG_SB_URL`/`SIG_SB_ANON`） |
| 合夥人參考站（本機） | `C:\Users\User\Desktop\AI台股研究雷達實戰班\真名版網站\genshuei-market`（vinext dev，http://localhost:3000，例：/news） |
| 合夥人規格文件 | `C:\Users\User\Desktop\AI台股研究雷達實戰班\` 下各資料夾（盤面結構判讀、支撐壓力、外資期權空單與持股配置\完美.html、明燈與冥燈…）；.docx 用 python zipfile 解 `word/document.xml` 讀 |
| 本機預覽 | 另一個 session 開的 `npx serve` 在 http://localhost:3333（靜態 index.html）；在頁面用 JS 覆寫 fetch 把 `/api/` 導到正式站即可測。付費頁測試時設 `window._isOwner=true` |

### 執行指令眉角
- Windows。Bash（Git Bash）與 PowerShell 皆可；背景 Bash 目前可連網（ETF 回補即以背景 Bash 完成）。
- **heredoc 內的 Windows 路徑**：`printf`/`sed` 會把 `\U`、`\n` 吃掉 → 寫 .bat/.py 一律用檔案編輯工具或 python 腳本，不要用 printf/sed 塞反斜線路徑。
- **.bat 不可寫中文註解**（cmd 以 Big5 解讀 UTF-8 會報錯）。
- Python 印中文要設 `PYTHONIOENCODING=utf-8`，否則 cp950 會炸 `≥` 等字元。

---

## 2. 部署流程（uat / prod）

本機在 `Andrew` 分支 commit＋push，再用 worktree 把檔案同步到 uat／prod（本機工作區有大量未追蹤檔，用 worktree 不會卡 checkout）。

### Worktree（重用即可；`git worktree list` 可查）
- uat：`C:\Users\User\AppData\Local\Temp\claude\C--Users-User-Desktop-trip-project\6a747587-922c-41c7-aaca-1b22bfdea8f3\scratchpad\uat_wt`
- prod：同目錄 `prod_wt`
- 若資料夾不見（Temp 被清）：`git worktree prune` 後 `git worktree add <路徑> origin/uat` 重建。

### 推 uat（Bash）— 2026-09-28 起一律 **git merge**，禁止「複製 index.html 覆蓋」
舊做法（reset 到 origin/uat 再 cp index.html）會把合夥人或別人推到 uat 的修改**默默蓋掉**，已停用。
2026-09-28 已做首次正式合併（uat `a59688b`，之後 Andrew 是 uat 的祖先，可乾淨合併）。
```bash
W=<uat_wt 路徑> && cd $W && git fetch -q origin && git checkout -q --detach origin/uat \
 && git merge --no-ff origin/Andrew -m "merge Andrew → uat: <摘要>

Co-Authored-By: Claude <模型版本> <noreply@anthropic.com>" && git push -q origin HEAD:uat
```
- **有衝突就停下來**告知用戶衝突檔與兩邊差異，不要 `--ours/--theirs` 整份覆蓋。
- uat 上有些檔案（logo、vercel.json logo 路由、box/greed/etf 腳本）曾只提交在 uat；已補提交進 Andrew（以本機實際排程版本為準，compute_greed.py 取 9/24 較新版）。

### 協作：合夥人也 clone 這個 repo 改版面
- 合夥人**不直接推 uat／prod**：從最新 uat 開自己的分支 `git fetch origin && git checkout -b <他的名字>-layout origin/uat`，改完 `git push origin <分支>`，告訴用戶分支名稱。
- 收到後：`git fetch origin` → 合併進 Andrew（`git merge origin/<分支>`；本機未提交檔案擋住時改在暫時 worktree 合併）→ 衝突逐段比對、不整份覆蓋 → 本機驗證 → 走上面的 uat 流程。
- 他改版面前先問會動哪幾頁，我方避開同區塊（index.html 單檔，衝突機率高）。
- 遠端 `Duke` 分支**不是合夥人的**（6 月初始版本，來源不明），不要動。
- uat 預覽網址（Vercel 保護，需登入）：tw-stock-screener-git-uat-andrew250165s-projects.vercel.app。無法用 curl 驗後端，所以新 API 一律先在本機 `import screen` 直接呼叫函式驗證。

### 推 prod（**須用戶明確說「推 prod」**）
```bash
W=<prod_wt 路徑> && cd $W && git fetch -q origin && git reset -q --hard origin/prod \
 && git checkout origin/uat -- . && git checkout HEAD -- .github \
 && git commit -q -m "prod: ..." && git push -q origin HEAD:prod
```
- `.github/`（GitHub Actions 雲端排程）只存在 prod，務必還原。
- 推完約 1 分鐘生效；用 curl 打正式站新 `stat=` 端點驗證。

### 不需部署即生效的
`scripts/*.py`、Supabase 資料修正、本機 SQLite → 前端直讀 Supabase，改完即生效。只有 `index.html`、`api/` 需部署。

---

## 3. 前端架構（index.html）

- **視圖註冊**：`window._VIEWS[name]={el:'xxxView',show:'_xxxShow'}`，`_showView(name)` 切換；新視圖要補 `NAVMAP{view→大項}`（大項 focus 底色）。
- **瀏覽器上一頁**：history 模組包裝 `_showView`（切頁時也呼叫 `window._fhPageBg`）。
- **付費 gate**：頁面 show 時 `applyGate()`；owner 顯示內容、否則顯示「付費解鎖更多」`#xxLock`。登入狀態變動時 `_applyAuthState` 會呼叫各頁 `window._xxxApplyGate()`。
- **全站配色（2026-09-28 改為合夥人「完美.html」風格）**：開頭兩組 CSS 變數 `:root{}`（深色預設）與 `:root[data-theme="light"]{}`。
  - 深色：底 #070c18、卡片 #0f172a、強調天藍 #38bdf8、次強調靛藍 #6366f1；淺色：底 #f8fafc、白卡、強調 #0284c7。
  - 強調色按鈕文字用 `var(--on-accent)`、品牌底色上的文字用 `var(--on-brand)`（勿再寫死 #231c00／#f4efe1）。
  - `--brand-green` 為沿用舊名的「標題／導覽強調色」。
  - 字型 Inter＋Noto Sans TC，數字等寬 JetBrains Mono。
  - 明暗切換：右上 `#themeToggle` → `_toggleTheme()`（寫 localStorage `theme`），並呼叫各頁 retheme hook（`_rethemeChart`、`_hxRetheme`、`window._fhRetheme`）。**新頁若自有配色，必須跟隨 `html[data-theme]`，不可自存一套**（曾因此被用戶罵）。
  - 例外：**每日新聞頁**刻意 100% 照合夥人 /news 的米色報紙風（有自己的 `--nw-*` 變數，深色另有覆寫）。
- **外資空單溫度計**的樣式寫成可重用的 `.pf` 容器（`--pf-*` 變數），`.pf.pf-light` 為淺色。
- **圖表**：LightweightCharts 4.1.3。縮放限制用 `window._clampChartZoom(chart, 10, 資料筆數)`（最多放大到 10 日、最多縮到剛好填滿）。資料多於 1000 筆要 `order=desc&limit=1000` 再反轉。
- **個股搜尋**：`window._loadNames()` → `_names/_mkt/_ind/_etf`，含上市、上櫃、ETF（`etf_products`＋`screen.py?stat=otcetf`）。
- **K 線 modal**（`openChart(code,name,…)`）：標題列有 產業／上市上櫃／**市值**（新）／價格；左側面板 主力分點／大盤K／支撐壓力／價量分析（皆可摺疊）；右側分頁 觀察備註／基本面／相關新聞／支撐壓力。
  - 均線色（2026-09-29 用戶指定，`MA_COLORS`＋`.ma-toggle` 標籤兩處要同步）：MA5 黃 #F2C200、MA10 藍 #2196F3、MA20 桃紅 #FF4081、MA60 橘 #FF8C00、MA120 紫、MA240 綠。
  - 個股支撐壓力線：**支撐紅、壓力綠**（`_srDraw` 與右側表格、圖例文字同步）。
- **漲跌配色慣例**：數字**正數紅、負數綠、0 灰**（台股慣例；2026-09-29 已修正基本面 YoY 與廣度淨上漲兩處反色）。新寫的正負值一律照此。
- **台股休市判定（全站共用）**：`window._loadTwHol()`（讀 `/api/screen?stat=holidays`＝證交所休市表，瀏覽器直連會被 CORS 擋）、`window._twIsTrading(iso)`、`window._twAdj(iso)`（順延至次一交易日）。結算日卡、溫度計結算倒數與避險偵測都用它。

---

## 4. 後端資料管線與排程

- `run_daily_job.bat` 尾段順序（新增的以 ★ 標）：
  `… market_indicators → active_etf_flow → upload_active_etf_holdings → foreign_hedge --daily（★含 fill_spot 回補近 60 天現貨買賣超空值）→ macro_events → breadth_daily → ★etf_daily → ★breadth_ext → fundamentals → option_sr → txo_history（供 OIΔ）→ stock_sr（option_nday 已於 2026-09-29 移出排程） → liquidity_top → job_health`
- GitHub Actions（prod 分支）：法說會、除權息因子（台灣週一~五 20:30）。wantgoo 擋雲端 IP，需登入的腳本留本機。
- **price_window 上傳**（`upload_price_window.py`）：2026-09-28 改為「upsert → 刪過期」。舊的「整張 DELETE 再 INSERT」在兩個排程重疊時互刪，造成 9/21~9/23 只剩 4 成檔數、真名二式誤判（6533）。

---

## 5. 功能模組總表

| 功能 | 位置 | 表 | 腳本 | memory |
|---|---|---|---|---|
| 貪婪指標 | 市場觀察 | greed_base | compute_greed.py | project_greed_index |
| 融資維持率三組 | 首頁§4 | margin_maint_split | margin_ratio.py / margin_maintenance_calc.py | project_margin_maint_split |
| 外資空單溫度計（付費） | 市場觀察 | foreign_hedge_daily, macro_events, macro_news, catalyst_events | foreign_hedge.py, macro_events.py | project_foreign_hedge, project_macro_events, project_perfect_theme |
| 大盤多空廣度（付費）＋市場廣度五分頁 | 市場觀察；首頁盤面結構卡「付費解鎖更多」 | breadth_daily, **breadth_ext** | breadth_daily.py, **etf_daily.py, breadth_ext.py** | project_breadth |
| 盤面結構判讀（12 規則＋櫃買/集中強弱勢） | 首頁 §3A | taiex_daily, otc_index_daily… | margin_ratio.py（taiex 補官方） | project_market_structure |
| 處置股（新） | 市場觀察 | 無（即時抓） | api `stat=disposal` | — |
| 每日籌碼報告（含**台指期結算日卡**） | 首頁 | chip_brief 等 | chip_brief.py… | — |
| 每日新聞（改版） | 每日新聞 | hot_topics, **news_feed** | run_codex_topics.bat→upload_hot_topics.py、**news_feed.py** | project_news_feed |
| 掏金篩選器（原「指標」） | 選股 | price_window | api screen.py | — |
| 產業地圖（點磚塊帶成分股） | 題材族群 | price_window | api `stat=sectors` | — |
| K 線市值（新） | K 線標題列 | 無 | api `stat=shares`（官方被擋用內嵌 `_SHARES_FALLBACK`） | — |
| K 線 基本面/新聞 | K 線右側 | stock_fundamentals, stock_financials | fundamentals.py | project_fundamentals |
| 選擇權支撐壓力（OI 峰值，方案 A、5 層、週選＝週三 W 系列／月選） | 首頁 §6 | option_sr（res_levels/sup_levels） | option_sr.py、txo_history.py（OIΔ 用）；舊 option_nday.py 已停用 | project_option_sr |
| 個股支撐壓力（SPEC-TA-SR-002，依週期不跨週期） | 選股「🧱 壓力支撐逼近」＋K 線 | stock_sr, stock_sr_h | stock_sr.py [--src hour], fetch_hourly.py | project_stock_sr |
| 流動性排行 | 選股 | liquidity_top | liquidity_top.py | project_liquidity_top |
| 主動 ETF | ETF 分析 | etf_holdings, active_etf_flow | … | project_active_etf_consensus |

### 2026-09-28 這個帳號做的事（細節）

1. **外資空單溫度計改版**（合夥人很滿意）：版面／配色 100% 比照 `完美.html`。
   - 頂部標題列、四層概覽（01 規模比率／02 匯率 vs 真金白銀／03 今日現期貨矩陣／04 事件窗倒數）、6 指標卡、第一層避險比率走勢（P80/P95 警戒帶）、第二層 USD/TWD（Yahoo `TWD=X`，右軸反轉）vs 外資現貨買賣超柱狀、第三層四象限、第四層 4 張倒數卡（台指期結算＝每月第三個週三；台積電法說＝catalyst_events；FOMC＝macro_events「美國利率決議」；台灣央行＝investing.com 無資料→顯示「尚未公告」）＋總經事件表、每日明細表、情境模擬器（情境選單＋重設）。
   - 長表「開啟全部 N 筆 ▾／收起 ▴」（預設 5 列）：未來 7 天、近 7 天、中重要度、每日明細、避險偵測表。
   - **事件前／連假前避險偵測**（合夥人定案）：交易日 t 近 3 日累計空單增加（等值大台淨口數減少量）≥ **5,000 口**，且 t 後 1~3 個交易日內有事件 →「疑似事件前避險」；t 後休市 ≥3 天 →「疑似連假前避險」。事件＝台指期結算、FOMC（程式內建 2024~2026 會議日）、台灣央行（內建，2026 為依往例推估）、台積電法說、高重要度與會員列上的總經事件（排除已移除）。呈現：走勢圖標記、明細表 ⚑、第四層偵測表、解讀文字。近 2 年觸發 17 次。
   - **總經事件管理**：會員可「列上去」中重要度事件，並新增「✕ 移除」（高重要度＝hidden、已列上＝取消列上）與「已移除事件」還原區（`sql/macro_events_hidden.sql` 用戶已執行）。
   - `macro_events.py`：抓未來 90 天；國家加台灣（只留標題含「利率」者，但實測 investing 沒有台灣利率決議）。
   - `foreign_hedge.py`：新增 `fill_spot()`（`--fill-spot` 可單跑），已補 7 天空值；9/22 缺漏以 `--backfill 20` 補上。
2. **全站配色改完美.html 風格**＋首頁主視覺改金融終端風（移除左側深藍色帶、網格淡底＋光暈、Inter 標題＋天藍→靛藍漸層）。
3. **掏金篩選器**：「指標」改名；固定顯示 日期/最低價/長紅/放量/長黑/縮量/產業；其餘分 型態（碗型＝原無放量黑棒、箱型）／K棒／缺口／漲停跌停（跌停尚未做）／指標（MACD）／真名絕招，**比照 K 線主力分點的摺疊列**，列上與「目前組合」顯示已選條件，附全部清除。
4. **產業地圖**：`stat=sectors` 回傳每產業成分股 `[代號,名稱,收盤,漲跌幅,成交值億]`（約 83KB），點磚塊展開、可依漲幅/跌幅/成交值排序。
5. **處置股**：上市 `openapi.twse.com.tw/v1/announcement/punish`＋上櫃 `tpex.org.tw/openapi/v1/tpex_disposal_information`，只留迄日 ≥ 今天，同代號取迄日最晚一筆；上櫃次數依措施文字判斷（「所有投資人」＝第二次全額預收）；預設排除 5 碼可轉債。
6. **K 線市值**：已發行股數（t187ap03_L＋mopsfin_t187ap03_O）× 最新收盤。
7. **每日籌碼報告**：新增「台指期結算日」卡（月結算＋週三/週五週選；2026-09-29 起依證交所休市表順延，並標「原 X/X 遇休市順延」）。
8. **每日新聞改版**（比照合夥人 /news）：報頭、日期＋時段篩選、搜尋、左側產業索引、雙欄卡片。來源＝`hot_topics`（AI 焦點題材，依熱度）＋`news_feed`（中央社財經 RSS、Yahoo 股市 RSS、證交所 newsList、MOPS 上市/上櫃重大訊息；每 4 小時；留 30 天），依發布時間分盤前/盤中/盤後/晚間。預設開最近 >10 則的日期。
   - 個股比對：代號、≥3 字股名、兩字股名只比白名單 `TWO_OK`，外國公司名先遮蔽（輝達新→達新、海力士→力士 曾誤判）。
   - hot_topics 的 codes/source_urls 存成 **Python 字串表示**，前端用正規式解析（舊版因此從未顯示個股與連結）。
9. **市場廣度延伸（大盤多空廣度頁下半）**：比照玩股網 騰落線／多空頭排列／市場寬度／新高-新低＋合夥人要的「站上 60 日／20 日／兩者皆站上 家數（上市/上櫃）」。
   - 切換：上市櫃／上市／上櫃 × 含 ETF／扣 ETF；「大盤扣除台積電」＝r_ex=(r加權−w×r2330)/(1−w)，w=前日台積電市值÷上市總市值（現行股數估算）。上櫃圖疊櫃買指數（otc_index_daily 僅 2026-02 起）。
   - 定義：上漲佔比＝上漲÷(上漲＋下跌)（不含平盤，與玩股網對得上）；短均線 5>10>20；**長均線 10>20>60**（反推與玩股網一致）；市場寬度 20/60/240 日；新高低＝52 週（252 日）收盤。
   - 資料：`etf_daily.py`（Yahoo 回補 2 年＋官方每日）→ 本機 etf_daily；`breadth_ext.py` 每日全量重算 6 組合約 3,200 列上傳 breadth_ext（約 40 秒）。
   - 9/24 對照玩股網：寬度 20/60/240 = 46.0/42.2/44.5% vs 46.26/41.87/43.81%；短排列 28.4/20.2% vs 28.59/19.59%；長排列 20.6/47.3% vs 20.88/48.13%。

---

## 6. 資料源清單（實測可行）

### TWSE
- `openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL`（含 ETF）、`/opendata/t187ap03_L`（基本資料＋已發行股數）、`/opendata/t187ap04_L`（每日重大訊息）、`/announcement/punish`（處置）、`/news/newsList`、`BWIBBU_ALL`、`t187ap05_L`、`t187ap06_L_*`。
- `www.twse.com.tw/rwd/zh/fund/MI_QFIIS`（外資持股，限流 307/308）、`rwd/zh/fund/BFI82U?dayDate=…`（三大法人；**偶爾限流回空 → fill_spot 會補**）、`rwd/zh/TAIEX/MI_5MINS_HIST?date=YYYYMM01`（加權日 OHLC，補 Yahoo ^TWII 缺日）。
### TPEx
- `tpex.org.tw/openapi/v1/`：`tpex_mainboard_daily_close_quotes`（含 ETF）、`mopsfin_t187ap03_O`（IssueShares）、`mopsfin_t187ap04_O`（重大訊息）、`tpex_disposal_information`、`tpex_trading_warning_information`、`tpex_mainboard_peratio_analysis`…（完整清單：`/openapi/swagger.json`）。
### TAIFEX
- `openapi.taifex.com.tw/v1/DailyMarketReportOpt|Fut`、`SSFLists`；`www.taifex.com.tw/cht/3/futContractsDate`（法人未平倉）；台指 VIX 月檔。www/mis 查詢頁有 WAF → Playwright。
### 其他
- Yahoo v8 chart（.TW/.TWO/^TWII/TWD=X）；investing.com 經濟日曆（Playwright 真 Chrome、每頁開新瀏覽器）；Google News RSS（個股新聞）；中央社 `feeds.feedburner.com/rsscna/finance`；Yahoo 股市 `tw.stock.yahoo.com/rss?category=tw-market`；玩股網（需登入 profile）。

---

## 7. 踩雷／眉角

1. PostgREST 單次 1000 列：`order desc + limit 1000` 再反轉；upsert 分批且每列 key 一致。
2. 財報金額仟元、季別為累計；金融股格式不同。
3. 選擇權 www HTML 會塌欄 → 用 openapi CSV。
4. **price_window 不可整表 DELETE 再 INSERT**（排程重疊互刪）→ 已改 upsert。上市資料若落後，先查 fetch_prices.py / upload_price_window.py。
5. mi-qfiis、BFI82U 限流 → 退避重試＋節流；空值靠 fill_spot 補。
6. Yahoo ^TWII 偶有整天缺（例 2026-09-22）→ margin_ratio.py `_taiex()` 用證交所 MI_5MINS_HIST 補近 3 個月。
7. 2026-09-25（中秋）、09-28（教師節）休市；9/24 為交接時最新交易日。
8. 背景 Bash 可連網；但 heredoc/printf 會吃反斜線路徑。
9. 新表必加 anon select policy。
10. 工具輸出偶有污染 → 關鍵結果用獨立查詢再驗證。
11. 本機 stock_daily 沒有 ETF → ETF 在 etf_daily；market 為 NULL 的列視為上市。

---

## 8. 目前狀態（2026-09-30）

### 全站採用合夥人 redesign 版面（2026-09-30，已上 prod）＋ redesign2 輕更新（uat 待驗）
- **背景**：合夥人（justy）交付完整 redesign HTML（桌面 `AI台股研究雷達實戰班\tw-stock-screener-redesign\tw-stock-screener-redesign*.html`）。掃描確認＝**我們同一支 app 換皮**（同 Supabase 專案 `bruqrbvbjxntgoljxsne`、同 `/api/screen`·`/api/chart`、同 `_VIEWS`/`NAVMAP`/`VIEWER_EMAILS`/`_isOwner`）。用戶選 **A 案：直接以他的檔案為新 `index.html`**（非逐塊搬 CSS）。他交付走桌面檔、非 git commit（`origin/justy-layout` 是空分支）。
- **redesign（第一版）已上 prod**：Andrew `1cbf396`→uat `fbe8ed5`→prod `ddb290e`。我方補回他 fork 缺的「**真名三式**」前端（`#zhenming3` 勾選框＋`doScreen` payload＋結果列 `name-cell` 的 `s.zm3` 標籤＋`.zm3-info` CSS；後端 `screen.py zhenming3_at` 未動）。
- **redesign2（輕更新，2026-09-30，已上 prod）**：Andrew `9254f9a`→uat `a8c9ae1`→prod `d1c44da`。他這版拿**我 prod 版（已含真名三式）當基底**再細修：ETF 甜甜圈互動重繪、市場廣度「分頁與篩選分離」、**選擇權支撐壓力卡改讀 OI 峰值 schema**（`res_levels`/`sup_levels`/`ref_price`/`ref_kind`/`meta`）、結算日遇休市順延（新增全站 `_twHol`/`_twAdj` 讀 `/api/screen?stat=holidays`）、多空排列配色（長多#f59e0b/長空#8b5cf6）、行動版表格、文案微調。
- **⚠️ 踩雷修正**：第一版 redesign 把選擇權卡「降級」成舊「N日大量區 vol/oi」前端（我方原始 index.html 本來就是 OI 峰值前端）；redesign2 修回。已驗證線上 `option_sr` 表有 OI 峰值資料（2026-09-24、ref 48125 TX近月結算202610、月選 res/sup 各 5 層、週選 4 層）→ 新前端顯示正常。
- **本機驗證 OK**（真實 Supabase）：hero/今日判讀/每日籌碼報告/K線圖/選股頁（含真名三式）/選擇權 OI 峰值卡 全渲染、無頁面錯誤。`/api/` 本機不動（靜態伺服器），選股實跑須 uat 驗。
- **備份**：`index_ours_backup.html`（原始 pre-justy）、`index_prev_deployed.html`（第一版 redesign）於本 session scratchpad。
- redesign2 已由用戶確認並說「推 prod」，已上 prod `d1c44da`；線上驗證 OI 峰值卡顯示正常。
- 頁尾「改動紀錄（供合夥人複查）」note 已更新含輕更新項目。

### 🔧 TAIFEX 資料落後修復＋防呆（2026-09-30，本機生效；Andrew `f84a17c`）
- **症狀**：`option_sr` / `option_nday` / `futures_daily` / `liquidity_top` 停在 2026-09-24（其他表已 9/29）。
- **根因**：這幾支讀 TAIFEX openapi `DailyMarketReportOpt`/`DailyMarketReportFut`，trade_date 取回傳 `body[0][0]`。主排程 `\WantgooDailyScrape`（週一~五 **19:00**，跑 `run_daily_job.bat`）常在這系列 openapi 當日資料**發布前**跑到 → 寫入舊日期（9/25 中秋、9/28 教師節休市，9/24 後下一交易日＝9/29）。openapi 隔天才補上。非程式錯誤，是時機。
- **A 已補**：手動重跑三支 → option_sr/futures_daily/liquidity_top 皆 2026-09-29，線上驗證選擇權卡＝資料日 9/29、ref 47,781。
- **B 防呆**：`broker_signals.py` 新增 `latest_trade_date(env,table)`（fail-open）；`option_sr.py`/`futures_market.py`/`liquidity_top.py` 加「來源日期沒比 Supabase 既有最新日新就 `[skip]` 不覆寫」（`--force` 可繞過）。已測資料最新時三支皆正確 skip。
- **B 補跑排程**：新 `scripts/run_taifex_catchup.bat` 跑這三支；Windows 排程 `AI_stock_taifex_catchup`（週二~六 **08:30**，此時 openapi 必已發布前一交易日）。主排程若跑太早被防呆擋下 → 隔天早上補跑寫入。
- **option_nday（成交量模式用）排程先前已移除、仍停 9/24**；用戶選 **①隱藏成交量切換**（2026-09-30 已實作並上 prod `db655d5`）：`index.html` 的 `#gsOptSR` render() 已移除整個 `osr-mode-tabs` 切換列，卡片固定顯示「未平倉 OI 峰值」（mode 恆為 `oi`）。**`option_nday` 表保留未刪**、成交量分層資料的 `pkVol`/`ndayRows` 前端程式也保留（未走），日後若要恢復成交量模式：把切換列加回 + 恢復 option_nday 抓取排程即可。線上驗證：無切換鈕、資料日 9/29。

### ✅ 請另一個 claude code 帳號複查（Andrew `f84a17c` 一併提交）
用戶說明：下列後端腳本的既有未提交改動是「用另一 claude code 帳號」所做，本次一併 commit，請該帳號確認是否符合預期：
`broker_rankings.py`、`fetch_prices.py`、`run_codex_topics.bat`、`wantgoo_daily_job.py`、`wantgoo_scraper.py`。
（另 `futures_market.py` 原為未追蹤檔，本次首次納入版控。）

### 🔧 真名三式進場改「訊號日收盤」（2026-09-30，已上 prod `aad7433`）
- **合夥人回饋**：他用 AI 分析真名三式，發現原「次日開盤進場」常遇跳空開高＝系統性追高，建議改「訊號日收盤買進」。
- **我方驗證**（scratchpad `bt_zm3_compare.py`，唯讀比較三法）：
  - A 次日開盤（原）：勝率 35.6%、平均 −0.44%
  - **B 訊號日收盤（採用）：勝率 42.5%、平均 +0.47%**（帶量 41.7%/+0.72%、不帶量 42.9%）
  - C 次日開盤＋過濾跳空(>3%/>5%)：幾乎無改善（35.6~35.9%）→ 證明問題是「次日開盤普遍高於訊號收盤」，非僅大跳空。
- **實作**：`backtest_zhenming3.py` 進場 `entry=b[t][4]`（訊號日收盤）、出場自次日起算、hold 重算；`index.html` 真名三式說明改「訊號日收盤進場」＋新數字＋執行前提註記（收盤確認即買進、多一個「當根收盤即成交」假設、非前視偏誤、仍未達原文件 50~60%）。**`zhenming3_at` 篩選邏輯與結果列停損/目標不變**。
- 部署 Andrew `ad9bb0c`→uat `f232abd`→prod `aad7433`；線上驗證說明顯示 42.5%。

### 🔧 篩選進度條改百分比 & 手機下拉修復（2026-09-30，已上 prod）
- **進度條 %（prod `db15d42`）**：後端一次算完才回、無中途進度 → 進度條改「時間估計 %」：`_scanStart` 依預期時長推進、封頂 95%，`renderResults` 完成補 100% 並把實際耗時存 `localStorage('zm_scan_ms')` 下次自適應；`scanElapsed`(秒)→`scanPct`(%)、`.scan-fill` 由不確定動畫改確定式寬度。**真實逐檔 % 未做**（需改 `api/screen.py` 於運算迴圈回報 processed/total 到 job 暫存＋前端輪詢）。
- **手機下拉修復（prod `e0fe1d6`）**：合夥人回報手機版下拉「options 被擋住」。根因＝手機 nav 被 `.pro` 區塊 `width:100% !important` 壓成兩行、下拉又是相對該項 absolute→壓到第二行 nav。修法（`@media max-width:600px`）：`#mainNav .mn-grp{position:static}`＋`.mn-menu{left/right:8;top:calc(100%+3px);width:auto}`＋`#mainNav{overflow:visible}` → 下拉改掛在整個 sticky `#mainNav` 底部左右滿寬，不壓 nav。桌機(≥601)不受影響。

### prod 目前 = `e0fe1d6`（2026-09-30）
近期推 prod 的批次（新→舊）：
- `e0fe1d6`：手機下拉不再蓋住第二行 nav。
- `db15d42`：篩選進度條改顯示百分比（時間估計）取代秒數。
- `aad7433`：真名三式進場改「訊號日收盤」（回測 35.6%→42.5%、平均 −0.44%→+0.47%）。
- `db655d5`：選擇權支撐壓力卡隱藏「成交量」切換，固定 OI 峰值。
- `d1c44da`：合夥人 redesign2 輕更新（選擇權 OI 峰值前端修回、ETF 甜甜圈、廣度分頁與篩選分離、結算日遇休市順延、多空排列配色、行動版表格）。
- `ddb290e`：全站採用合夥人 redesign 版面（含真名三式）。
- `22e9573`：K 線均線色（MA5 黃／MA10 藍／MA20 桃紅／MA60 橘）、個股支撐線紅壓力線綠、正紅負綠修正（基本面 YoY、廣度淨上漲）。
- `dfc5ac9`：選擇權支撐壓力**排除價平**（價平＝最接近加權收盤的履約價，同玩股網反灰列）。
- `d738cb4`：選擇權 OI 峰值方案 A＋5 層＋週選只看週三系列、結算日休市順延、N 日不跨結算（後端）、多空頭排列四色、協作流程文件。
- `a289af8` 以前：市場廣度五分頁、溫度計開合、全站配色、首頁主視覺、避險偵測、總經移除/還原、長均線 10>20>60、SPEC-002、搜尋防自動填入、話題族群頁面化等。

### 首頁選擇權支撐壓力（OI 峰值）— 已定案並上線
- `scripts/option_sr.py`：ref＝台指期 TX 近月一般盤結算價；**價平＝最接近加權收盤的履約價，兩側排除**；壓力取 CALL strike > max(ref,價平)、支撐取 PUT strike < min(ref,價平)；峰值四條件 同側 P70／同側最大×**0.20**／前後各 5 檔中位數×1.5／局部高點（前後各 2，平台留一）；**200 點內合併**留 OI 最大；近→遠各取 **5 層**，不足顯示「—」並標候選不足（**不降門檻**，用戶確認）。
- 合約：**週選只看週三（W）系列**、月選；到期日遇休市順延（`_expiry_adj`：週末＋證交所休市表＋本機實際交易日，含颱風）；到期當日即換下一檔。
- 驗證：2026-09-24 202609W5 → 壓力 49000/50000/51500/52600、支撐 47500/46000/43000/41500，與用戶看玩股網 support-resistance（`/option/support-resistance-data?tradeDate=<ms>&contract=` JSON）判斷一致。玩股網參考價用 TX 收盤（48123），我們用結算價（48125）。
- 前端 #gsOptSR 只剩「週選｜月選」與 OI 峰值；舊 N 日大量區（option_nday）分頁與排程皆已移除（程式與表保留未刪）。`txo_history.py` 保留供 OIΔ。

### 協作流程（2026-09-28 起）
- uat 一律 **git merge** Andrew（見 §2），不再複製 index.html 覆蓋。
- 合夥人（不是 `Duke` 分支）會 clone repo 改版面：他開自己的分支 → 告知分支名 → 我方合併進 Andrew、逐段處理衝突 → uat。
- **2026-09-30 GitHub 協作者**：合夥人 justy 的 GitHub 帳號 `qa5518556130-dot`（email qa5518556130@gmail.com）已由 owner `swe2501` 加為 collaborator（Write，個人 repo 預設），**且已接受邀請（2026-09-30），可直接 push**。之前他 push 403 就是還沒被加。他若用 commit 交付：`git fetch origin && git merge origin/<他的分支>`（進 Andrew）→ uat → prod。
- **2026-09-30 交付方式實況**：justy 這次不是用 commit 交付——他推的 `origin/justy-layout` 分支內容 = uat 原點（0 筆他的 commit，blob 與 uat 相同）；實際交付是一份**完整 HTML 檔**放在桌面（見上「uat 待驗」段路徑）。故本次改採「以他的檔案為新 index.html」而非合併分支。日後他若改用 commit 交付，仍照原流程 `git merge origin/<分支>` 進 Andrew。
- 合夥人用的 AI 會讀 AGENTS.md；舊版禁止所有 Git 導致他無法開分支 → 2026-09-29 已在 AGENTS.md 開頭標明 Git 禁令只限話題族群排程、合夥人依「合夥人協作規範」。用戶會把新版 AGENTS.md 傳給合夥人覆蓋後，由合夥人**自己**開分支（我方不代開；曾代開 user/ui-redesign 已依用戶要求刪除）。他推完告知分支名後：`git fetch origin && git merge origin/<分支>`（進 Andrew）。

### 待用戶／合夥人決定
- **明燈與冥燈**（memory `project_mingdeng`）：付費才能看；長黑棒＝(開−收)/收≥5%；**長上影線公式已確認**＝紅棒(最高−收)/收、黑棒(最高−開)/收，**門檻待用戶回**（我提議≥3%）；另待「點名真人呈現方式」與「第一批追蹤名單」（合夥人整理中）。三階段：①回測引擎＋MOPS 內部人申報＋管理者登錄 ②YouTube 字幕 AI＋美國國會申報 ③產業連動；FB/Threads/X 不爬。

### 其他待辦
- 約 2026-10-03：主動 ETF「今日」改讀自有 active_etf_flow。
- 掏金篩選器「跌停板」條件尚未做。
- 首頁台股加權圖可套用 `_clampChartZoom`（曾提議未做）。
- 台灣央行 2026 下半年會議日為推估，官方公布後更新溫度計內 `CBC` 陣列。

---

## 9. 記憶檔（.claude memory）

`C:\Users\User\.claude\projects\C--Users-User-Desktop-AI-stock\memory\*.md`，`MEMORY.md` 為索引（同一台電腦、同一 Windows 使用者開 Claude Code 於 AI_stock 會自動載入；**若新帳號讀不到，請手動讀這個資料夾**）。本 session 新增：`project_news_feed.md`、`project_mingdeng.md`；`feedback_language.md`（一律中文）、`reference_chrome_bridge_account.md`（Chrome 帳號不同就請用戶手動跑 SQL）務必先看。

---

## 10. 快速上手檢查清單

- [ ] 讀本檔 §0 鐵則、§7 眉角、§8 目前狀態。
- [ ] 讀 memory 索引與相關 project_*.md。
- [ ] 確認 `.env` 有 SUPABASE_SERVICE_KEY，能跑 `python.exe scripts/xxx.py`。
- [ ] 看 §8 待決事項（明燈與冥燈門檻／名單）、問合夥人是否有分支要合併。
- [ ] 流程：討論算法/門檻 → 估容量 → 寫 `sql/*.sql` 請用戶執行 → 腳本（入 bat）→ 前端視圖（_VIEWS＋NAVMAP，跟隨全站明暗）→ 頁尾標算法 → 本機驗證 → 推 uat → 回報「已部署到 uat，請確認…」→ 等「推 prod」。
