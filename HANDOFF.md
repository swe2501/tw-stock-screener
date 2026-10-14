# 交接文件 — AI_stock 盤後研究院（2026-10-05；最後更新 2026-10-13）

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
- **推 prod**：第六/七/八節累積全部在 uat，等用戶說「推 prod」；推完依鐵則把 justy-layout 對齊 uat（`git push origin origin/uat:justy-layout`）。
- option_sr 乾淨版、官股 money-link 皆只動 uat；排程腳本已就位，下一個交易日盤後跑 `run_daily_job.bat` 即生效。
