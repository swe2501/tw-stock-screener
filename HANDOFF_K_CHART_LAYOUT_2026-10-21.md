# Claude 交接：K 圖版面與縮放重新調整

> 2026-10-21 後續要求（本機準備中）：JUSTY 再次授權調整，工具收合後改成 K 圖 70%、成交量 15%、技術指標 15%。只保留一條比例尺，外觀比照掏金篩選器的內容縮放（不是日曆高度尺）：2px 細軌、9px 低調圓點，深淺主題沿用網站變數。改變 K 圖占比時，量與技術指標自動平分剩餘空間；還原或重新收合回到 70/15/15。2026-10-22 JUSTY 選定第 2 款「分段圓角」，已本機套用並加入 hover／按下／焦點回饋，尚未發布。以下交接內容保留作歷史背景。

## 使用者最新決定

JUSTY 不滿意目前 K 圖的縮放比例，指定交由 Claude 接手。本次 Codex 只修正「策略小書靈」按叉叉／減號吸回浮動按鈕的動畫，並依 234 發布；**沒有繼續改 K 圖比例**。接手請先 fetch 最新 UAT，保留其他修改，再處理圖表版面。交接建立時的基準為 `82187cf`；動畫與本交接的後續提交請從最新 Git 歷史確認。

## 不可遺漏的要求

- **貪婪指標的既有外觀不可改**：保留原 SVG 造型、色段、指針、數值與文字，也保留一進 K 圖就能看到的行為。使用者先前允許稍微縮小，但後來強調不能改外觀；不自行重畫、換儀表、隱藏或改成另一套呈現。
- 使用者認為原來 K 圖版面本身不差，主要希望在正常字體大小下，同時看到完整 K 圖、成交量和技術指標，減少內部捲動。
- 曾指定圖表區為 K 圖 60%、成交量 25%、技術指標 15%，但看到目前版本後明確表示**不滿意**。這組數字是歷史偏好，不能當成已驗收的最終版面；先用實際瀏覽器可用尺寸溝通確認問題，再提出調整。
- 工具列可以收合，按鈕可以精簡，不能擠字；字體要易讀。保留右側研究工具的功能與入口，不擅自刪除。
- 深淺主題、桌面、手機、一般視窗與全視窗都要考慮；不能只用寬大的生成示意圖判定放得下。
- 不改行情、均線、指標計算、繪圖內容、時間範圍、選股／會員紀錄或權限；不得以 `fitContent()` 偷換使用者看的區間來掩飾版面問題。

## 現有程式入口與處理方式

1. `apps/web/assets/chart-viewport-fit.js`
   - 新增的高度控制器。掛在 `#chartModal`，將原 `.chart-toolbar`、`.chart-layer-toolbar`、`.chart-draw-console` 節點移入 `details.chart-fit-tools`，沿用原事件與按鈕。
   - `#subTabs` 加入 MACD／RSI 選擇器；技術模式預設顯示一個指標，另一個用 `data-fit-hidden` 隱藏。
   - 依 `.chart-content` 剩餘高度設定 `--chart-fit-height`，最低 360px；展開工具或低矮畫面仍可能有內部捲動。
   - ResizeObserver／MutationObserver／resize／fullscreenchange 觸發更新，對既有主圖、成交量、MACD、RSI 實例套用 width/height。此檔不改圖表數據及主圖時間範圍。
   - 僅對一般 K 線技術頁加 `.chart-fit`；籌碼頁、分時走勢及 `.etx-embedded` 留原排版。
2. `apps/web/assets/research-layout.css`
   - 圖表規則集中在 `#chartModal.chart-fit` 區段：`#chartWrapper` 四列為 `60fr / 30px分頁 / 25fr / 15fr`；成交量、技術列含小標頭，實際繪圖高度會扣掉標頭。
   - 同檔亦包含已完成的策略工作台、面向、多空按鈕、新手引導樣式。**不要整檔移除或回退**；只改圖表相關規則。
3. `apps/web/index.html`
   - 原始 modal：`#chartModal`、`.modal-header`、`#greedGauge`、`.modal-body`、`.chart-content`、`#chartWrapper`、`#chartNotePanel`。
   - 原主圖 `#chartContainer` 固定 400px，手機 300px；舊 `.kfull #chartContainer` 另有最低 420px。新 CSS 用 height:100%!important 配合 grid 覆寫。
   - 原 `renderChart` ResizeObserver 會同步寬度，主圖會帶高度；成交量／MACD／RSI 建圖時仍有 70／100／90px 預設，新增控制器負責後續高度更新。
   - `_setChartFull()`、`_chipTab()`、`toggleChartPanel()` 和 ETF 嵌入仍保留原邏輯。改版要驗證這些切換，避免舊尺寸被再次套回或已收合子圖佔空間。
   - 原儀表還有 pro-greed 外觀增強，須等 `.pro-greed-svg` 載入後再比較，不要把初始 SVG 與增強後版本差異誤認為此次改動。

## 尚待確認／風險

- 使用者沒有具體說明目前不滿意哪個圖區，不能直接猜成全部縮小或把技術指標再壓扁。
- 原貪婪儀表獨佔一整列，右側研究面板有寬度，主圖文字與圖層標籤也會佔可視範圍。請在使用者實際螢幕與瀏覽器縮放下觀察，不只看 DOM 高度比例通過。
- 一般技術頁、子面板收合／重開、MACD／RSI 切換、籌碼頁回來、分時切 K 線、全視窗還原、ETF 內嵌及會員日曆開圖都要保留可用。
- 精緻與好讀是最終標準，測試通過不代表使用者已接受視覺效果。

## 已有驗證及預覽

- `tests/research-layout.browser.cjs`：實際 Lightweight Charts 4.1.3，隔離行情與身分；測 1366×768、1440×900、1920×1080、390px 手機、深淺背景、全視窗、三區高度／畫布、MACD／RSI、籌碼、貪婪 SVG 保留、主圖時間範圍。
- `tests/strategy-studio.browser.cjs`：五步驟、保存／上架／垃圾桶、做空回測、聊天室和私房多策略。
- `tests/companion-suction.browser.cjs`：本次專注聊天室縮回終點幾何、叉叉／減號、大小視窗、左右停靠、深淺手機、對話保留及減少動態效果。
- 測試需 Playwright。Lightweight Charts 測試資源可用 `CHART_LIBRARY_PATH` 指定；本機既有檔案：`C:/Users/JUSTY LIN/Documents/Codex/2026-10-08/new-chat/work/lightweight-charts-4.1.3.js`。
- 本機截圖：`C:/Users/JUSTY LIN/Documents/Codex/2026-10-08/new-chat/strategy-layout-review/`，其中 `layout-light-chart-1366x768.png` 等為前次實作的**測試行情**截圖，使用者已表達不滿意；不得當作最後設計定稿。

## 發布協作

先讀根目錄 `AGENTS.md` 和 `docs/collaboration/README.md`。網站唯一原始碼在 `apps/web`；不要碰 App、prod、Andrew、Duke、排程或共用正式資料庫。沒有新的發布指令時做本機預覽；234＝先推 JUSTY，整合最新 UAT 後推 UAT，再 fetch 對齊本機／JUSTY／UAT。保留雙方內容，不 force/reset/stash/整檔覆蓋。此次改版無須資料庫 migration。
