> **2026-10-18 網站＋App 共同開發**：合夥人接手先看 [docs/collaboration/README.md](docs/collaboration/README.md)。App 位於 `apps/mobile`，會員與資料服務規格共用；各自使用功能分支與獨立工作目錄。新增安全同步／整合工具與 GitHub 檢查，不改現有正式站、資料庫或登入設定。

最新交易紀錄與目標：[HANDOFF_TRADING_2026-10-16.md](HANDOFF_TRADING_2026-10-16.md)

> **2026-10-16 會員／自選／策略最新交接**：請先讀 [HANDOFF_MEMBER_2026-10-16.md](HANDOFF_MEMBER_2026-10-16.md)。包含本機 justy-layout／UAT 最新狀態、分類溢位、拖曳排序、私房篩選器與尚未啟用的會員服務；舊的部署範例仍須遵守目前 AGENTS.md。

# 交接文件 — AI_stock 盤後研究院（2026-10-05；最後更新 2026-10-18）

本文件記錄近期 session 新增/修改的功能、資料來源、部署流程與待辦，供合夥人與後續開發者接手。

> **接手先看**：第一節（部署鐵則）→ 第七節（最新一期，全部在 uat、尚未上 prod）→ 第六節（Vercel 12 function 上限）。交接文件不只這一份，另有 `交接文件_畫線套件與集團logo.md`、`待提供logo清單.md`、`融資維持率_交接文件.md`、`AGENTS.md`、`CLAUDE.md`，請全部讀。

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
- 第七節新增：`scripts/page_cache_push.py`、`sql/page_cache.sql`、`api/screen.py`（`calc_limit_down`、`sma20_stage_scan`、sectors／themes 快取標頭）

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

---

## 七、2026-10-11 ～ 10-13 本期新增與修正（全部在 uat，尚未上 prod）

> 狀態：Andrew＝uat 內容一致（uat 另含合夥人 10-12 晚推的 `c0b8db5` 美債研究／全球環境頁）。prod 仍停在 `6431e1b`（10-08）。
> **凡是標「需 prod」的項目，在 uat 上測不到**——因為前端呼叫後端一律寫死正式站網址（`https://tw-stock-screener-neon.vercel.app/api/...`），後端程式要推 prod 才會更新。

### A. K 圖

| 功能 | 重點 | 關鍵程式（index.html） |
|---|---|---|
| ⛶ 全視窗按鈕 | 彈窗加 class `kfull` 撐滿視窗並嘗試 `requestFullscreen()`；Esc 先還原不關圖；關圖自動還原；手機與 ETF 內嵌模式不顯示 | `_setChartFull` / `_toggleChartFull`、CSS `#chartModal.kfull …` |
| 顯示設定記憶 | 均線各條／全部、BBAND、量均線、MACD／RSI 線、大盤K、支撐壓力週期、價量分析、箱型、葛蘭碧買點標記；換股票、換週期、關掉再開、重新整理都沿用 | `window._kPref`（localStorage `kchart_prefs_v1`）、`_kVizOn/_kVizSet/_kApplyViz/_kSyncVizLabels/_kSyncLayerUI`、`_srSyncUI/_mkSyncUI/_vpSyncUI` |
| 全螢幕下拉選單 | 「畫線工具／圖形註解」選單原本搬到 `body`，瀏覽器全螢幕只顯示全螢幕元素內的內容所以看不到 → 改為一律掛在 `.modal-overlay`（K 圖彈窗）內 | `_toggleDrawDD` |
| 畫線套件修正 | ①點同時記 `time` 與邏輯索引 `li`，最後一根 K 棒右側空白區也能落點 ②右鍵取消工具 ③線與圖形改虛線（箭頭、文字實線）④橡皮擦按住左鍵拖曳連續清除，判定 10→14px ⑤只畫在繪圖區內（`_dClip`）⑥縮放／平移時重畫 | `_coordAt` / `_dX` / `_noT` / `_dClip` / `_redrawSoon` / `_setupDrawTools` |
| 換股後工具狀態 | 換股票／換週期後已選工具維持啟用（按鈕反藍＝真的能畫）；關閉 K 圖才取消 | `_resetDrawingState`、`closeChart` |
| 每檔各自記線 | 換股票時存回上一檔、載入這一檔；重新整理後保留；最多留最近 150 檔 | `_drawSwap` / `_drawStoreSave`（localStorage `kchart_draw_v1`） |

**眉角**
- 圖表範圍變動事件觸發的當下，價格軸還沒重算（要等圖表自己重繪），所以 `_redrawSoon` 是「立刻畫＋下一個畫格＋50ms＋260ms」各補一次。拖右側價格軸改上下比例**沒有事件可訂閱**，靠 `chartContainer` 的滑鼠／滾輪事件觸發重畫。
- 舊的「趨勢線」（`trendLines`）與斐波那契**沒有**納入每檔記憶，仍是換圖就清。
- 開著「大盤K」時左側多一條價格軸，畫線座標可能偏移（原本就有，未處理）。
- 設定與畫線都存在各自瀏覽器，不跨裝置。主力分點勾選因每檔分點不同，不納入記憶。

### B. 外資空單溫度計：第三層之二（匯率 × 現貨 × 期貨）
- 原四象限保留；下方新增 8 格矩陣（四象限 × 台幣升／貶）＋五邊形雷達。原象限 III 單獨提匯率的文字已移除。
- 程式：`FX3`（8 格文字）、`renderFx3(q, cur, rank)`、`fxPctOn`、`pctRank`；常數 `FX_FLAT=0.10`、`FX3_WIN=60`。
- **三個門檻是 Claude 先定的初版，尚待用戶／合夥人確認**：匯率持平範圍 ±0.10%（持平時兩列都不命中，只標所在欄）、雷達比較期間近 60 個交易日百分位、避險水位＝100−近 2 年 PR。8 格判讀文字也待合夥人過目。
- 雷達只呈現五個面向各自的相對位置，不合成單一分數。算法說明在該區塊下方（`algo-gated`）。

### C. 掏金篩選器

| 項目 | 說明 | 狀態 |
|---|---|---|
| 跌停板 | 收盤 ≤ 跌停價；跌停價＝前收×0.9 依升降單位無條件進位（`calc_limit_down`） | **需 prod**（uat 勾了會被正式站後端忽略、回傳未篩結果） |
| 葛蘭碧買點 1／2／3 | 獨立分類 `data-cat="granville"`（排在「真名絕招」後）；可複選；參數 `sma20_stages` | **需 prod** |
| 葛蘭碧買點 K 圖標記 | 日 K 圖層列「葛蘭碧買點」開關（預設關、會記住），標出歷史每一輪的買1／買2／買3；週／月／小時 K 不顯示 | uat 可看 |

**葛蘭碧買點規則**（合夥人 2026-10-12 規格，參數為初版）
- 均線＝20 日簡單移動平均（含當日）。帶量 1.3 倍、長紅／長下影 3%、十字線＝開等於收。
- 每天先檢查重置：`MA[t] < MA[t-1]` 即清除所有階段、當天不觸發。依序 1→2→3、同一天不跨階段、每階段只記首次。
- **前後端是兩份同規則的程式，改參數兩邊要一起改**：後端 `api/screen.py` 的 `sma20_stage_scan` / `sma20_stage_at`（常數 `SMA20_*`），前端 `index.html` 的 `_sma20Scan` / `_sma20Build`。已用 2330、2603、3026 比對，訊號日期完全一致。
- 額外的保守處理（規格沒寫）：資料窗內尚未出現過重置日之前不產生訊號（無法確定該輪起點）。
- 試算（上市櫃 1,964 檔、2024 年至今）：買點 1 共 15,582 次、買點 2 共 8,317 次、**買點 3 只有 1,432 次**（平均一檔不到一次；台積電等大型股近 3 年 0 次）。原因是買點 3 要求整根 K 棒在均線下，但均線下彎一天就重置，兩者能同時成立的時間很短。**是否放寬待合夥人決定**。
- 內部變數仍叫 `sma20_*`，只有畫面文字改成「葛蘭碧買點」。

### D. 產業地圖／題材列表載入加速（預算表）
- **原因**：兩頁每次都等後端現算（產業地圖實測 2.6～11.9 秒、題材列表 0.5～3.2 秒）。
- **做法**：每晚把結果存進 Supabase `page_cache`，前端直接讀表（實測約 0.15～0.2 秒）。
  - 表：`page_cache(kind pk, trade_date, payload jsonb, updated_at)`，RLS 訪客唯讀；建表 SQL 在 `sql/page_cache.sql`（**已於 10-12 執行**）。容量：每頁 1 列每日覆寫，合計約 150 KB，不成長。
  - 腳本：`scripts/page_cache_push.py`——呼叫正式站既有端點（`stat=sectors`、`stat=themes`）取結果後覆寫；抓取失敗或內容不完整就不覆寫。已排入 `run_daily_job.bat`（`job_health.py` 之前）。**已手動跑過一次成功，尚未經過排程自動跑的那一輪，請確認隔天資料日有更新。**
  - 前端：`window._swrJson(key, url, paint, fail, loading)`——先畫 localStorage 上次的資料 → 讀 `page_cache` → 表內沒有或超過 4 天未更新才退回後端。進站 4 秒後閒置預抓。
  - 後端：`stat=sectors`／`stat=themes` 成功回應加 `Cache-Control: s-maxage=300, stale-while-revalidate=86400`（**需 prod**）。
- **取捨**：這兩頁改成固定顯示排程跑完那一刻的結果，盤中不會變。要盤中更新就把腳本多排幾個時段。
- 之後要讓別的頁面也走預算表：在 `page_cache_push.py` 的 `KINDS` 加一項（含驗證函式），前端改用 `_swrJson`。

### E. 這幾天踩到的坑
1. **主工作區被別的程序切分支**：10-12 23:44 主工作區從 Andrew 被切到 `justy-layout`（非 Claude 所為，疑為另一個視窗／工具），導致一筆提交落在本機 justy-layout。已用 cherry-pick 搬回 Andrew、本機 justy-layout 還原成遠端狀態，遠端 justy-layout 未受影響。**教訓：每次 commit 前先 `git status -sb` 確認在 Andrew。**
2. **批次字串取代改到自己剛插入的函式**：把 `c.time == null` 全域換成 `_noT(c)` 時，連 `_noT` 的定義本身也被換掉，變成無限遞迴、線段點不下去。實測才抓到。**教訓：先做取代、再插入新函式；改完一定要用真的點擊實測。**
3. **預覽面板在背景時不繪圖**：`requestAnimationFrame` 不觸發、`innerWidth` 為 0、圖表範圍設了不生效、截圖逾時。驗證互動要先用一次真的滑鼠操作（`computer` 的 click／scroll）把面板喚醒，並以 `find` 取得的 `ref` 點擊，不要只呼叫函式。
4. **瀏覽器全螢幕無法在預覽環境進入**：全螢幕相關修正只能驗證到「全視窗（`kfull`）」，真正的瀏覽器全螢幕要請用戶在 uat 親測。
5. **Chrome 擴充功能連不上**（帳號不一致，見記憶 `reference_chrome_bridge_account`）：SQL 請用戶到 Supabase SQL Editor 手動貼。

### F. 待辦 / 等回覆
- **推 prod**：uat 累積了第六節與本節全部內容，等用戶說「推prod」。推完要測「需 prod」的三項（跌停板、葛蘭碧買點篩選、後端快取標頭），並依第六節待辦對齊 justy-layout（justy-layout 有獨立 commit 要先回報）。
- **等用戶在 uat 確認**：瀏覽器全螢幕下的下拉選單、拖價格軸時畫線是否跟上、匯率矩陣三個門檻與 8 格文字、葛蘭碧買點 3 是否放寬。
- **可選**：均線 SMA／EMA 切換（會影響篩選結果與既有回測數字，動工前先討論範圍）；K 圖標記文字「買1」是否改全名；大盤K 開啟時畫線座標偏移。
- 其餘沿用第四節、第六節待辦（34 個集團 logo、融資維持率口徑、ETF 今日加減碼版面、明燈與冥燈、真名三式調參、篩選器納入上櫃）。

---

## 八、2026-10-14 本期新增與修正（全部在 uat，尚未上 prod）

### A. 選擇權「支撐壓力卡」價平/OI 延遲 → 改全同日官網來源（`scripts/option_sr.py`）
- **現象**：首頁選擇權卡的 OI/價平/參考價停在前一交易日，但同卡的 Put/Call 比（合夥人 `api/pc_ratio.py` 即時抓官網 pcRatio）已是當日 → 兩個日期對不上、「價平沒變更」。
- **根因**：option_sr 原本抓 TAIFEX **openapi `DailyMarketReportOpt/Fut`，那是 T+1 才發布**（實測 10-14 中午仍停 10-12）。調排程時間救不了（當天根本還沒資料）。
- **修法（全同日來源，比照合夥人即時爬蟲）**：當日各檔 OI 改讀本機 `txo_daily`（官網 `optDataDown` 同日，`txo_history.py` 寫入）；參考價＝TX 近月一般盤結算（官網 `futDataDown` 同日 POST，`_tx_ref` 改寫）；價平＝當日加權收盤（`taiex_daily`）。移除 openapi 依賴與備援切換。OI 峰值演算法不變，`--dry --force` 實測與原路徑結果完全一致。
- **排程**：`run_daily_job.bat` 已把 `txo_history.py` 移到 `option_sr.py` 之前（option_sr 依賴當日 txo_daily，順序反了會讀舊資料）。

### B. 官股券商買賣超 → 改用 money-link 實際成交金額（對上合夥人看盤軟體）
- **現象**：首頁「全市場官股券商」卡淨買賣超只有 ~225 億，合夥人看盤軟體（CMoney 系）是全市場 412.61 億。
- **根因**：原 `gov_broker.py` 用本機 wantgoo 分點「Σ張×均價」**估算**（分點涵蓋其實近全量、但只有張+均價、無實際成交金額），口徑系統性偏低約三成；免費網頁（histock/MoneyDJ）只有 top-N、拿不到各家買賣總額。
- **來源（用戶提供）**：**money-link 富聯網** `https://www.money-link.com.tw/stxba/imwcontent0.asp?page=hott3&ID=HOTT3`——靜態 HTML，含「上市/上櫃/**全市場** × 8 家官股券商 × 今日買進/賣出/買賣超/近5/20/60/今年以來」**實際成交金額**（百萬元，含鉅額）。全市場合計 2026/10/13：買 1331.12億 / 賣 918.51億 / **淨 +412.61億**，與合夥人 1:1。
- **做法**：新增 `scripts/gov_broker_moneylink.py`（取全市場合計 → `gov_broker_daily` buy/sell/net_amt＋近5/20/60）；`gov_broker.py` 不再寫每日總額、只留個股買賣超榜 `gov_broker_stock`；`gov_broker_daily` 新增 `net5/net20/net60` 欄位（Supabase Management API 在瀏覽器內執行 DDL）；前端 `govNet()` 改為優先讀 net5/20/60 精準值（缺值才退回加總每日）。`run_daily_job.bat` 已在 gov_broker 後串入 gov_broker_moneylink。
- 個股「買超/賣超 TOP5」小榜仍由 gov_broker_stock（wantgoo）提供。

### C. K 圖「列入觀察」按鈕點了沒反應（合夥人改版遺漏）
- `toggleWatchFromChart()` 原本只 `document.getElementById('chartNoteInput')?.focus()`，但該輸入框在 `display:none` 的「觀察備註」分頁內 → focus 隱藏元素＝沒反應。
- **修法**：未登入先 `openAuthModal('login')`；登入則 `window._cnpTab('note')` 切到觀察備註分頁(顯示 #cnpNote) 再 focus。「加入回測」本身正常（未登入會跳「請先登入」toast）。

### 待辦
- **推 prod**：第六/七/八/九節累積全部在 uat，等用戶說「推 prod」；推完依鐵則把 justy-layout 對齊 uat（`git push origin origin/uat:justy-layout`）。
- option_sr 乾淨版、官股 money-link 皆只動 uat；排程腳本已就位，下一個交易日盤後跑 `run_daily_job.bat` 即生效。


## 九、2026-10-15 盤中即時（第3層：mis 全市場掃盤）

**目標**：題材列表／產業地圖／今日焦點（及題材/產業抽屜）盤中跟著即時更新，收盤回盤後。

### 架構（後端注入 + 本機掃盤推 page_cache + 前端盤中讀 *_rt）
- **`api/screen.py`**：新增模組級注入點 `_INTRADAY = {"listed":{code:{price,prev,vol,name}}, "otc":{...}, "date"}`。
  `fetch_all_stocks_latest` / `_fetch_tpex_quotes` / `_fetch_sectors` 在 `_INTRADAY` 有值時改用盤中快照；
  `_fetch_sectors` 的彙整核心抽成 `_sectors_from(items, date)` 盤後/盤中共用。**prod/Vercel 永不設定 `_INTRADAY` → 盤後行為 100% 不變（零風險）**。
- **`scripts/intraday_push.py`**（本機）：盤中(週一~五 09:00–13:35)掃 mis `getStockInfo.jsp` 全市場——
  上市代號取自 TWSE 全市場(`fetch_all_stocks_latest`)、上櫃代號取自 Supabase `otc_names`(868 檔，比 TPEx openapi 穩)；
  批次 100 檔，`z`成交價 / `y`昨收 / `v`累積張數(×1000=股)。注入 screen 後現算
  **themes / sectors / overview / themeall / sectorall**，寫 `page_cache` 的 **`*_rt`** kind（trade_date=今日、updated_at=now）。
  `--loop` 常駐每 90 秒一輪、過 14:00 自動結束；`--force` 不檢查時段、`--dry` 只算不寫。
  mis 憑證缺 Subject Key Identifier → 只清 `ssl.VERIFY_X509_STRICT` 旗標（**鏈與主機名仍驗證**，比盲關 CERT_NONE 安全）。
  防呆：上市掃到 <500 檔不覆寫。單輪實測 ~22 秒（遠低於 90 秒）。
- **`index.html`**：新增 `window._twSession()`(台北 09:00–13:36 判斷，任何瀏覽器時區都正確)、
  `window._swrRT(key,...)`(盤中優先讀 `<key>_rt`，不新鮮>6分或非盤中→退回盤後 `_swrJson`)、
  `window._rtStart/_rtStop`(盤中每 90 秒自動刷新目前這張頁)。今日焦點(`_ovShow`)、題材列表(`_themesShow`)、
  產業地圖、題材抽屜、產業抽屜 5 處改走 `_swrRT`；抽屜盤中略過記憶體舊快取直接讀 `_rt`。

### 為何用 `*_rt` 而非直接覆寫 themes/sectors/overview
page_cache 是 **uat 與 prod 共用**同一個 Supabase。若推盤中到原 kind，舊 prod 前端會立刻吃到盤中 → 等於沒經核准就動 prod。
分 `*_rt` 後：**只有部署了盤中前端的站台（目前 uat）會在盤中讀 `*_rt`；prod 舊前端照舊讀盤後 kind，不受影響**。
推 prod 後 prod 前端才會開始吃盤中。夜間 `page_cache_push.py` 仍只寫盤後 kind（themes/sectors/overview/themeall/sectorall），互不干擾。

### 排程（待設定）
`scripts/run_intraday.bat` 已建好（設 UTF-8、cd 專案、跑 `intraday_push.py --loop`，log→`D:\stock_data\intraday_push.log`）。
需在工作排程器新增一個**週一~五 08:55** 觸發的任務指向它（詳見對話中的 schtasks 指令）。
**注意這跟夜間 `run_daily_job.bat` 是兩個獨立任務**（一個白天常駐、一個晚上跑一次）。

### 驗證
`--dry --force` + 實寫皆通過：題材成員覆蓋 395/406（缺 11 為興櫃等拿不到盤中者）、
今日焦點台積電 -2.01%/跌停反綠/漲停反紅皆正確、OTC 已納入。前端強制盤中後 `_swrRT` 確實讀到 `*_rt` 並正常 render。

### 待辦 / 等回覆
- **設排程**：✅ 已註冊 Windows 工作排程器任務 `AI_stock_Intraday`（週一~五 08:55 → `run_intraday.bat`）。
- 今日焦點的「官方產業類股強弱」小區塊盤中仍是盤後值（來源 TWSE rwd MI_INDEX 盤後；其餘區塊皆盤中），可接受；日後要盤中可用產業地圖口徑近似。
- 推 prod 時這節一起上；上後 prod 才吃盤中。


## 十、2026-10-15 首頁指標卡「2 年走勢線圖」dialog

**目標**：首頁「每日台股籌碼報告」KPI 卡片點一下 → 彈出該指標近 2 年走勢線圖（走勢面積圖／K棒／十字線）。

### 卡片 → 資料來源
- **櫃買指數(=OTC)／台指期(日盤)／台指VIX／富台指** → Supabase 新表 `index_history`（玩股網每日 OHLC）。
- **台幣匯率** → 既有 `/api/chart?code=TWD=X&range=2y`（Yahoo，回傳含 OHLC，K棒也可用）。
- **加權** → 維持原本 `_openMarketTrain()`（市場列車），不改。

### 玩股網歷史 API（關鍵坑）
- 端點：`/investrue/{code}/historical-daily-candlesticks?before=<交易日ms>&top=490`（≈2 年）；全球商品用 `/global/stwn&/...`。
  code：`vixtwn`(VIX)、`two`(櫃買/OTC)、`wtx&`(台指期)、`stwn&`(富台指)、`0000`(加權)。
- **區分大小寫**（用 `TWO` 會 400，要 `two`）；`before` 必須是**頁面給的有效交易日午夜 ms**，亂給會 400。
- 有 Cloudflare → 要**真實瀏覽器**，沿用既有玩股網登入 Playwright profile（`wantgoo_scraper.PROFILE_DIR`，`market_indicators.py` 同款）。回 `[{time,open,high,low,close,volume}]` 降冪。

### 新增/修改
- **`scripts/index_history.py`**（新）：導到各商品**自己的頁面**（確保 before/大小寫正確）→ 讀頁面自己打的 top=490 URL 原樣重打拿 JSON → upsert `index_history`(code,trade_date,OHLC；RLS anon 可讀，service key 寫)。launch 遇 profile 鎖會清 `SingletonLock` 重試一次。
- **`index_history` 表**：DDL 已在 Supabase 後台頁內（Management API）執行；四檔各回補 490 筆（≈2 年）。
- **`run_daily_job.bat`**：`market_indicators.py` 之後串 `index_history.py` 每日續抓（兩者共用同一 wantgoo profile、依序跑，靠 lock-retry 防衝突）。
- **`index.html`**：通用 `window._openSeriesChart(cfg)` + `window._scCfg`(key＝卡片中文名) + `window._openKpiChart(k)`，沿用 VIX dialog 的 lightweight-charts。櫃買/台指期/匯率卡改可點；VIX 改讀 `index_history`（補足 2 年 OHLC、K棒可用）；富台指換算卡可點。

### 驗證
本機起站實測：櫃買 490 筆 2024-10→2026-10、canvas 正常、走勢/K棒可切；VIX/台指期/富台指同路徑皆開得出；匯率 518 筆（含 OHLC）。Console 無 JS 錯誤。

### 待辦 / 注意
- 已上 **uat**；**未上 prod**，推 prod 時連同第六~九節一起。
- 當時工作目錄被另一並行 session 切到合夥人分支 `codex/member-system`（內容＝當時 uat），本功能 commit 落在那條再乾淨 merge 進 uat（只有這一個 commit）。合夥人會員系統已在 uat。


## 十一、2026-10-16 ～ 10-17 本期新增與修正（全部在 uat，尚未上 prod）

> 注意：這段期間**合夥人的 login agent 持續在推 uat**（會員系統/交易紀錄/3D 角色等），且**共用同一個工作目錄**，工作樹常有未提交檔。動 uat 前務必 `git fetch`；本地 Andrew 有時沒 ff 對齊（不影響 uat 已部署內容）。uat↔prod **共用同一個 Supabase**。

### A. 指標卡走勢圖：新增「疊加大盤」「一年新高」開關（`index.html` `_openSeriesChart`）
- **疊加大盤**：五張卡 dialog 皆可切，加權(^TWII 2年, /api/chart)以藍色虛線疊在**左軸**(獨立刻度)，十字線同顯指標值＋加權。
- **一年新高**：僅 VIX，標記可開關；每段突破只標首日（修掉「一年新高」字樣重疊）。

### B. 盤中即時：價格修正＋產業改市值加權＋掃盤穩定性（`scripts/intraday_push.py`、`api/screen.py`）
- **價格 bug（關鍵）**：盤中 mis `getStockInfo` 的 top-level `z/pz/tv` 多為 `-`，真正最近成交價在**巢狀 `trade.z`**。舊碼退回昨收→全市場幾乎平盤（產業漲0跌0、%偏低）。`_cur_price` 改為 `z → trade.z → 最佳買賣中價(b/a) → 今開o → 昨收y`。
- **產業地圖改市值加權（貼三竹官方類指數）**：新增 `_get_shares_map()`（TWSE `t187ap03_L` 上市＋TPEx `mopsfin_t187ap03_O` 上櫃發行股數，快取 24h，SSL 清 `VERIFY_X509_STRICT`）。`_sectors_from(items, date, shares)` 產業漲跌幅改 **Σ(漲跌×市值)/Σ市值**（市值＝收盤×發行股數）；方塊大小仍用成交金額；整產業無股數才退回算術平均。**實測：半導體 0.52 vs 三竹 0.26、電機 2.00 vs 2.20、金融 1.90 vs 1.89、玻璃 6.40 vs 6.24，貼。**（成交金額加權實測不準，已否決。）發行股數抓取 ~20 秒、偶爾 timeout→空→退回等權，屬正常。
- **掃盤穩定性**：mis 一批上限 ~150（200 報 rtcode 9999）；盤中單請求 ~6 秒（payload 大）；並行 `CONC=12` 最快 ~28 秒/全市場（16 併反被節流）。`BATCH=150`、`INTERVAL=35` 秒、前端輪詢 35 秒（**5 秒全市場不可行**）。並行偶有整批失敗被靜默丟 → 漏大權值股(如大立光8100億市值)→市值加權劇烈跳動；修法：每批**重試 4 次**、`MIN_LISTED` 500→**950**（少一批剩~890 會擋下不覆寫）。
- 盤中 pusher 當天用新碼手動重啟過（`schtasks /Run /TN "AI_stock_Intraday"`）；排程任務隔天 08:55 自動吃新碼。

### C. 會員中心資料後端盤點（`docs/member-db-status.md`，給 login agent 追）
- **登入/個資/頭像**＝Supabase Auth（已接）；**自選/目標價/回測/分點追蹤**＝`watchlist`/`backtest_positions`/`broker_watchlist` 表（已接、跨裝置同步）。
- **會員中心新面板/交易紀錄/我的目標/研究筆記/自訂策略**＝**只存 localStorage**（不跨裝置）。
- **獎勵/點數/優惠券/推薦/回饋/活動**＝程式有接但 **Supabase 表/RPC 全 404 未建**；遷移檔 `docs/database/member-services.sql` 已寫未套用，且前端查的 `member_point_ledger`/`member_referral_summary`/`academy_events` **連 SQL 都沒有**。

### D. Vercel 部署失敗（已解）＋ 12 函式硬限制
- 失敗根因：合夥人加 `api/site_search.py`＝**第 13 個 Serverless Function**，超過 **Hobby 12 上限**→全線 build 失敗（uat/justy-layout 都中）。**合夥人已自行移除 site_search.py**，回到 12、build 恢復。見 [[vercel-hobby-12-function-limit]]。
- 長期：Hobby 不能邀成員、不能給合夥人看 build log。**升 Pro（~US$20/月/seat，viewer 免費）**可一次解：函式上限、合夥人收部署信、他的 AI 看 log。用戶暫不升。
- **任何新 api 功能都要併進現有 `.py`（如 `?stat=xxx`）、不能新增檔**，否則又爆 12。

### E. Vercel 部署失敗轉寄給合夥人（Gmail，待用戶自己設定）
- 用戶要「Vercel 失敗信也寄合夥人 qa5518556130@gmail.com」。Hobby 不能加 Vercel 成員→走 **Gmail 原生轉寄**：用戶 Gmail 設定→轉寄→加 `qa5518556130@gmail.com`→合夥人點驗證。**驗證通知信草稿已用 Gmail 連接器存進用戶草稿匣**（主旨「請協助點一下 Gmail 轉寄驗證信…」）。Gmail 設定那兩個鈕我的工具碰不到，要用戶自己按。

### F. K 圖「法說會/除權息」標記改預設關閉（`index.html`）
- `_mkShow` 的 `div`(除權息)、`catalyst`(法說會) 由預設 true→**false**，比照葛蘭碧用 `_kPref` 記住(`mk_div`/`mk_catalyst`)。

### G. 葛蘭碧買點大改（`index.html _sma20Scan` ＋ `api/screen.py sma20_stage_scan`，兩邊同步、參數對齊）
- **動態組數＋各組 checkbox**：每個「買1」開啟新的一組；點葛蘭碧按鈕下方 `#sma20GroupPanel` 列「共 N 組／全部／第1組…(帶買1起始日)」checkbox，可單獨顯示/隱藏某組。`_sma20GroupsOn`(null=全顯)、換股票重置。
- **買2 修正**：由「月線嚴格上彎(m>m1&&m>m3)＋最低≤月線＋收盤>月線」改為 **「最低≤月線＋收盤>月線」(回測不破)**（拿掉月線上彎要求）。
- **重置修正**：MA 下彎「1 天」→ **連續 `SMA20_RESET_N=3` 天** 才重置（健康回測壓 1~2 天不殺輪）。
- **買3 修正**：由「整根在月線下(h<m)」改為 **「收盤跌破月線(c<m)」** ＋止跌K(長紅≥3%/長下影≥3%/十字開=收，不變)，與買2「收盤站回」對稱。
- 買1 未動。實測國巨 2327 序列乾淨：買1(收上月線)→買2(回測不破)→買3(收破月線)。**規則參數初版，可再依個案調。**

### H. ✨ AI 判定買點（骨架已上，真 AI 後端**未完成＝下一步**）
- **骨架已上 uat**：`api/screen.py` 新增 `?stat=aibuy&code=XXX`（**沒新增函式、仍 12 個**），目前回**假資料(stub)**＋CDN 快取一天。前端 K 圖工具列加「✨ AI 判定」按鈕(`_aiBuyToggle`)＋面板 `#aiBuyPanel`(判讀/評分/摘要/型態量能葛蘭碧三點/免責)＋localStorage 當日快取。前端 host-aware，uat 打同源。
- **架構方向（已與用戶定）**：按需(用戶點才算)、不掃全市場；省錢靠「同檔當天快取」。金鑰放**後端 env**(Vercel)，絕不放前端。模型建議 Haiku 5.5(~$0.001/次)或 GPT-4.1 mini(可 temperature=0 更穩，Claude 5 系列已無 temperature)。
- **下一步（用戶指示「先寫好後端、用環境變數開關，有 key 就走真的」）＝未完成**：把 `?stat=aibuy` 改為：
  1. 讀 env `AI_PROVIDER`(anthropic/openai)、`ANTHROPIC_API_KEY`/`OPENAI_API_KEY`、`AI_MODEL`。**無 key→回現有 stub**；有 key→走真的。
  2. 抓該股近 1 年日線（`price_window` via `_cache_sb`，code eq）＋算 `sma20_stage_scan` 買點。
  3. 組精簡 prompt（近 ~60 根 OHLC＋MA20＋最近買點），urllib 呼叫 Anthropic Messages API(`x-api-key`,`anthropic-version:2023-06-01`) 或 OpenAI chat/completions(`temperature:0`,`response_format json_object`)，要求**只回 JSON**(verdict/score/summary/points/disclaimer)，容錯解析。
  4. 回傳**同 stub 格式**(stub:false)，前端不用動。任何錯誤→退回 stub（功能不壞）。
  5. (選)有 `SUPABASE_SERVICE_KEY` env 才加 Supabase 共享快取(kind `aibuy_<code>`)。
- 參考：Claude API 技能給的定價/模型 ID（Haiku 5.5 `claude-haiku-5-5` $0.10/$0.50、Sonnet 5.5 `claude-sonnet-5-5` $2/$10、Opus 5.5 `claude-opus-5-5` $4/$20，皆 per 1M token）。見 [[index-chart-dialogs]] 無關，另記。

### I. Supabase 合夥人權限（已開）
- 已邀 `qa5518556130@gmail.com` 為 **Developer**（組織層級＝Taiwan stock2 ＋ LINE 貼身秘書**兩個專案**，用戶確認過）。開之前**全量備份**在 `D:\stock_data\supabase_backup\2026-10-15\`（67 表 148MB）。

### 待辦 / 等回覆
- **接真 AI 後端**（H 的下一步）＝**當前未完成任務**，用戶切帳號前交代「先寫好後端、用環境變數開關」。
- **推 prod**：第六~十一節全部累積在 uat，等用戶說「推 prod」；推完依鐵則把 justy-layout 對齊 uat（`git push origin origin/uat:justy-layout`）。見 [[deploy-prod-sync-justy]]。
- Gmail 轉寄：用戶自己在 Gmail 設定加轉寄地址＋請合夥人點驗證（草稿已在草稿匣）。
- 葛蘭碧規則參數（RESET_N=3 等）、產業市值加權、AI 判讀口徑，皆初版可再調。

## 十二、2026-10-17 晚：AI 判定真後端（已上 uat，未上 prod）＋葛蘭碧說明補正

### A. AI 判定（`api/screen.py` `_aibuy*`、`?stat=aibuy&code=`，仍 12 個函式）
- **開關全在 Vercel 環境變數**（Settings → Environment Variables，改完要 Redeploy 才生效）：
  `ANTHROPIC_API_KEY`／`OPENAI_API_KEY`（沒有任何一把＝回假資料）、`AI_PROVIDER`（anthropic｜openai，不設＝有哪把用哪把、都有優先 anthropic）、`AI_MODEL`（不設＝`claude-haiku-5-5`／`gpt-4.1-mini`）、`AI_DAILY_LIMIT`（預設 300）、`SUPABASE_SERVICE_KEY`（有才寫共享快取與每日計數）。
- 流程：驗代號（4～6 碼英數）→ 讀 `price_window` 日線（<80 根回假資料）→ 查共享快取 `page_cache` kind=`aibuy_<代號>`（同資料日＋同模型才用）→ 檢查每日計數 `aibuy__count` → 程式先算好均線／量比／漲跌／區間／葛蘭碧紀錄＋近 40 根日線 → 呼叫 AI（Anthropic 用 `output_config.format` json_schema＋effort low；OpenAI 用 json_object＋temperature 0）→ 驗格式、夾分數 0～100 → 寫回快取與計數 → 回傳（含 usage token 數）。
- 任何錯誤（金鑰錯、逾時、格式不符、拒答）都退回假資料並附 `stub_reason`，前端照常顯示「假資料示意」。
- 只用 Python 標準庫 urllib（`requirements.txt` 規定不裝外部套件），沒裝 Anthropic SDK。
- 成本估算（Haiku 5.5 $0.10/$0.50 每百萬 token）：輸入約 2,000 token、輸出含思考約 500～1,500 token → **約 US$0.001／次**；同檔同資料日只算一次，加上每日上限 300 次，**最壞約 US$0.3／日**。
- 共享快取容量：每檔 1 列（約 2～3 KB），全市場約 2,000 檔上限 ≈ 6 MB。
- ⚠️ `screen.py` 註解提到 Vercel 上的 service key 可能過期；若過期，快取與計數寫不進去 → 每日上限失效、只剩 CDN 快取（成功結果 1 小時）擋重複呼叫。設金鑰時一併確認 `SUPABASE_SERVICE_KEY` 有效。
- 前端 `_aiBuyLoad/_aiBuyRender`：只有真的判讀結果才存 localStorage（假資料、錯誤、舊版後端回 `{status:ok}` 都不存），金鑰設好後不會被當天舊假資料卡住。
- **還沒用真金鑰跑過**（目前沒有金鑰）；已用 Python 測：無金鑰→假資料、假金鑰→退回假資料（HTTPError）、模擬 AI 回應→正確解析與夾分數。

### B. 葛蘭碧說明補正
- 程式（前後端）已是 10-17 修正版，但篩選器說明仍寫舊規則 → 已改：買點 2 不要求均線上彎、買點 3 改「收盤 < 均線」、重置改「連續 3 天下彎」，並附全市場試算（上市櫃 1,964 檔、2024 年至今：買1 13,362／買2 9,425／買3 4,136 次；買1→2 中位 8 日、2→3 中位 7 日）。前後端用 8 檔比對訊號完全一致。

### 待辦
- 用戶在 Vercel 設 `ANTHROPIC_API_KEY`（或 OpenAI）後 Redeploy uat，實測一檔看真判讀；確認 `SUPABASE_SERVICE_KEY` 有效。
- 推 prod 時這節一起上（前端呼叫正式站的 `?stat=aibuy`，prod 未更新前面板顯示「暫時無法取得」）。

### C.（10-17 晚）AI 判定加入「形態判定」（AI 看圖）
- 用戶決定形態由 **AI 看圖判斷**（不用程式規則，避免死板）。後端 `_aibuy_png()` 用純標準庫把最近 160 根日 K 畫成 PNG（紅漲綠跌、20 日均線、成交量、每 20 根一條垂直格線），連同格線對應日期與價格刻度文字說明一起送給 AI（Anthropic 用 image content block；OpenAI 用 image_url data URI）。
- 形態只能從 10 種擇用（`AIBUY_PATTERNS`：圓形底、頭肩頂、頭肩底、M頭、W底、箱型、上升／下降趨勢線、上升／下降軌道），輸出 `patterns[{name,status(形成中/已確認),confidence(高/中/低),detail}]`，不給目標價；後端會丟掉清單外名稱、修正不合法的狀態／信心。
- 「頭尖頂」依用戶描述當作頭肩頂。
- `AIBUY_VER=2`：共享快取要版本相符才用，舊版結果自動重算。
- 核對 AI 看到的圖：`/api/screen?stat=aibuy&code=2327&img=1`（需推到該環境後才有）。
- 成本：圖片約 1,000～1,500 token，每次約多 US$0.0002（Haiku 5.5）。Haiku 看圖辨形態的能力有限，若判讀品質不夠，在 Vercel 設 `AI_MODEL=claude-sonnet-5-5`（約貴 20 倍、仍約 US$0.02／次）。
- 逾時由 25 秒改 40 秒（看圖較慢）；Vercel 函式本身的時間上限需留意。

### D.（10-17 晚）改用 OpenAI GPT-6.1（用戶指定）
- OpenAI 分支改走 **Responses API**（`POST /v1/responses`）：`instructions`＋`input`（`input_image` data URI＋`input_text`）、`text.format` json_schema strict、`reasoning.effort`（`AI_EFFORT`，預設 low；回 400 時自動拿掉 reasoning 重送一次）；解析 `output[].content[].output_text`，`refusal` 視為拒答。
- 預設 OpenAI 模型改 `gpt-6.1-sol`（GPT-6.1 Sol；型號與價格查自第三方整理：約 US$2／US$10 每百萬 token，**未對照 OpenAI 官方頁**）。
- 估算約 US$0.02～0.03／次；建議 `AI_DAILY_LIMIT=100`（最壞約 US$3／日）。
- Vercel 只要設 `OPENAI_API_KEY`（沒有 Anthropic 金鑰時自動用 OpenAI）；兩把都設時用 `AI_PROVIDER=openai` 指定。
- 仍未用真金鑰測過。

## 十三、2026-10-18 台指期／富台指 K 棒＋外資結算成本 改用官方源（已上 uat，未上 prod）

合夥人回報：富台指期 K 棒、台指期 K 棒、以及外資結算成本的「日盤／夜盤」數字是錯的。改用期交所官方源修正，分三處 A／B／C，同一次 commit（Andrew `a5361c7` → uat merge `f877daa`）。**只動 `api/chart.py`、`scripts/index_history.py` 兩檔，未新增 api 函式（維持 12 個上限）。**

### A. 台指期（`wtx&`）日盤 — `scripts/index_history.py`
- 原本四檔都走玩股網 Playwright 抓 `historical-daily-candlesticks`，但 `wtx&` 頁面每跑必因導頁 race（Execution context destroyed…navigation）失敗；且日盤本就該對齊期交所官方價。
- 改法：`wtx&` **不經瀏覽器**，走 `_taifex_tx_ohlc(days=15)` → 期交所 `futDataDown`（`down_type=1`，POST，`commodity_id=TX`），取近月 TX「**一般（日盤）**」OHLC。近月＝每日**成交量最大的單月份合約**（`\d{6}`，排除含「/」價差與已到期月），與 `api/chart.py fetch_tx_sessions` 同口徑。
- cookie 重用 `api/chart.py` 的 `_taifex_cookie_str()`（script 內 `sys.path` 插入 `api/` 後 `import chart`）。
- 尺度驗證：10/06 50060、10/07 49979、10/08 49349 與玩股網 `wtx&` **逐日完全一致** → 同一標的同尺度，可安全銜接表內既有 2 年玩股網歷史；市場是真的從 ~49k 跌到 ~47k。
- 表內歷史 2 年已在，每晚只補最近約 15 天；防呆改為 `<3 筆` 才略過（TAIFEX 僅回最近十幾天）。

### B. 富台指（`stwn&`）／台指VIX（`vixtwn`）／櫃買（`two`）— `scripts/index_history.py`
- 問題：玩股網 `historical-daily-candlesticks` 端點**落後約 6 天**（卡在 10/12），所以 K 棒最新幾天是舊的。
- 改法：historical（2 年 backfill）之外，再讀**頁面自身打出**的 `daily-candlesticks?after=<近幾天>`（`_recent_url(page)`，正則 `[^-]daily-candlesticks\?after=` 以排除 historical-），兩者合併，`_to_rows(code, raw + recent)`（recent 在後 → 同日後者勝）。
- ⚠️ 關鍵雷點：**不要自己回推 `after` 值**（回推 30 天會被端點拒回 null），該端點只接受靠近最新交易日的 after，所以**原樣沿用頁面打出的 after**。
- 結果：stwn& 補到最新交易日（10/19 為玩股網自己的成形中夜盤 bar，open＝前收，與其官網一致，照收不動）、VIX／櫃買補到 10/16。

### C. 外資結算成本 日盤／夜盤 — `api/chart.py`
- `fetch_tx_sessions()` 改以 **期交所 `futDataDown`（同日可得）為主**、`_tx_sessions_from_taifex()`；openapi 為備援（先前錯誤數字來自 openapi 路徑，T+1／Vercel 封鎖）。
- 回傳 `/api/chart?code=TX=F&session=split` → `sessions.day/night`：各含 `price／date／contractMonth／session`，`source_url` 指向 `futDataDown`，近月日／夜盤收盤取自官方。
- 驗證（本機跑 `a5361c7` 同一份程式、冷啟直連官方）：日盤 **47242**、夜盤 **47366**，近月 **202610**、日期 **2026-10-16**；日盤 47242 與 `index_history` 的 `wtx&` 10-16 收盤一致，兩條管線對得起來。

### 驗證與界限
- A/B 資料直接寫 uat/prod **共用的 Supabase `index_history`**，前端不等 build 即生效；四檔 REST 查詢皆已到最新交易日、OHLC 尺度正確（wtx& ~47k、stwn& ~4000、VIX ~26、櫃買 ~400）。
- C 需 uat Vercel build 後生效；uat 的 `/api/chart` 擋在 **Vercel 登入牆**（302 Protected），未登入無法直接 curl，故 C 用「相同 commit 本機直打官方源」取證，JSON 如上。要打到 uat 那台需先在瀏覽器登入 Vercel 再開圖。
- 偶發雷：B 的三檔走 Playwright，單檔偶爾抓不到 historical（如 10-18 這次 `two` 中一次），被 `<100 筆` 防呆擋下不寫壞資料，`python scripts/index_history.py --code two` 重跑即補回；`wtx&`（期交所）無此問題、穩定。

### 待辦
- 推 prod 時這節一起上，並照鐵則把 `justy-layout` 對齊 uat（`git push origin origin/uat:justy-layout`）。
- 夜間排程若遇玩股網單檔 flake，隔晚自動補；如要更穩可對 B 三檔加重試。
