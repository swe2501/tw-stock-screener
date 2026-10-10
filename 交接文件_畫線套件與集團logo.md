# 交接文件 — K 圖畫線套件改版 + 集團作帳 logo 補齊

> 建立日期：2026-10-10
> 作者：Claude Opus 4.8（swe250165 帳號 session）
> 交接對象：下一個帳號 / AI
> 專案：AI_stock「跟誰學｜盤後研究院」台股盤後研究網

---

## 0. 最重要的三件事（先看這段）

1. **全部改動都只在 `uat` 分支，尚未推 prod。** 依鐵則：prod 一定要「用戶明確說推 prod」才能推，禁止自作主張。
2. **推 prod 時要多一步**：把 `justy-layout` 分支對齊到 uat → `git push origin origin/uat:justy-layout`（若 justy-layout 有獨立 commit 先回報、不硬推）。
3. **動 uat 前務必先 `git fetch`**（合夥人也會直接推 uat）。

### 部署環境速查
- Repo：`github.com/swe2501/tw-stock-screener`
- 本機主檔：`C:\Users\User\Desktop\AI_stock\index.html`（單檔 SPA，~14,600+ 行，**非 git 目錄**）
- Git 透過 worktree：`...\scratchpad\uat_wt`（分支 uat）、`...\scratchpad\prod_wt`（分支 prod）
- 開發流程：改 Desktop 的檔 → `cp` 到 uat_wt → commit → `git push origin uat`
- prod 網址：`tw-stock-screener-neon.vercel.app`（Vercel Hobby，team andrew250165s-projects）
- uat 預覽（登入後可看）：`tw-stock-screener-git-uat-andrew250165s-projects.vercel.app`
- Commit 屬名結尾：`Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`
- ⚠️ Vercel CDN 有 ~15–60s 傳播延遲，驗證時常需加 `?v=隨機` 強制避開快取。

---

## 1. 本次完成的工作（uat commit 由舊到新）

| commit | 內容 |
|--------|------|
| `df77f6f` | 畫線套件改版：走勢→今日走勢；刪趨勢線鈕；線段/水平線/垂直線/通道/箭頭收進「畫線工具」下拉；矩形/圓形/文字收進「圖形註解」下拉；橡皮擦(圖案icon)+清除；矩形圓形改小畫家式拖拉即時預覽；文字改原地內嵌輸入(非popup)；新增圓形工具 |
| `02e0f95` | 斐波那契鈕移到圖層工具列；橡皮擦啟用時鼠標改成橡皮擦 SVG cursor |
| `34e9be3` | K圖工具列重排：斐波那契移入圖表左上「均線圖例」(比照 BBAND，琥珀金 `#D99A2B`)；畫線工具群移到第二排圖層工具列最右端；清除→全部清除 |
| `4fca460` | 斐波那契改**開關邏輯比照 BBAND**：再按一次即清除 fib 線；下拉改 fixed 定位；斐波那契自成一列與 BBAND 垂直並排 |
| `a33d6ff` | 修下拉跑版：選單改 `append 到 body` + `position:fixed` 依按鈕實際座標定位(先前留在 overflow 工具列內會跑到圖表中間) |
| `7362f09` | **🔴 集團 logo 全不顯示的根因修正**（見 §3） |
| `60a88a0` | 修手機無法畫線：為 `_setupDrawTools` 補 touchstart/touchmove/touchend（見 §2） |
| `43d3018` | 全部清除不再清斐波那契(斐波那契改用再按一次斐波那契清除) |
| `0497444`~`0d773f4` | 集團 logo 補齊與修正（見 §4） |

---

## 2. 畫線套件（index.html 內，純前端）

### 工具列結構（K 圖 modal 內）
- **第一排 `.chart-tool-btns`**：＋ － ｜ 框選放大、↺還原
- **第二排 `.chart-layer-toolbar`**：大盤K 支撐壓力 價量分析 主力分點 [標記chips] ｜ 標記 … **（最右端）畫線工具▾ 圖形註解▾ 🧹橡皮擦 ✕全部清除**
- **圖表左上 `#maLabel` 圖例**：均線列 / BBAND(20,2) 箱型列 / **斐波那契列**（獨立一列，琥珀金 `#D99A2B`）

### 關鍵函式（搜尋即可定位）
- `_setupDrawTools()`：綁定 overlay 的滑鼠 **與觸控** 事件（`_drawSetupDone` 一次性）
  - `_DRAG_TOOLS=['rect','circle']`（拖拉即時預覽）、`_CLICK_TOOLS=['seg','hline','vline','parallel','arrowup','arrowdown']`（點擊放點）
  - `_DRAW_NEED={seg:2,hline:1,vline:1,parallel:3,arrowup:1,arrowdown:1}`
  - **手機支援**：touch 事件鏡射滑鼠邏輯，`touchend` 用 `preventDefault` 避免重複放點
- `_drawShapesOnCtx(ctx)` / `_distToShape` / `_eraseAt`：渲染 / 橡皮擦命中距離（含 circle 橢圓）
- `_showTextInput(px,py,time,price)`：小畫家式內嵌 `<input class="draw-text-input">`，Enter 送出 / Esc 取消 / 失焦自動送出（**不用瀏覽器 popup**）
- `window._toggleDrawDD(which)`：下拉開關，**選單 append 到 body + fixed 定位**（因 `.chart-layer-toolbar` 有 `overflow:auto` 會裁切 absolute 下拉 → 這是跑版根因）
- `window._setDrawTool` / `_pickDraw` / `_syncDrawDDActive`
- `_deactivateAllModes()`：切換模式時清 `_drawTool/_shapeDrag/dd-active`；fib 的 active 依 `fibLevels.length>0` 保留

### 斐波那契（開關邏輯比照 BBAND）
- `toggleFibMode()`：**已有 fib 線時再按一次 → 清除**(移除 6 條 priceLine+標籤)；無 fib 線時 → 進入拖拉繪製模式。
- `finishFib()`：畫完後保留 `fibBtn.active`（表示 fib 顯示中，再按才清）。
- `clearAllDrawings()`（全部清除）：只清 `_drawShapes/_drawPending/trendLines`，**不動 fibLines/fibLevels**。
- 注意：fib 需拖拉選高低區間才畫；這是它與 BBAND 唯一不同處。

### 橡皮擦 cursor
- `_setDrawTool` 內：工具=eraser 時 overlay cursor 設為自訂 SVG 橡皮擦圖案（熱點 `5 20`）。

---

## 3. 🔴 集團 logo 根因（最關鍵，務必理解）

**症狀**：集團作帳研究台卡片 logo 全部變房子圖示。
**根因**：`vercel.json` 用舊式 `builds` 陣列，**只部署 `index.html / logo.png / api/*.py`**，`group-logos.js`、`group-catalog.js`、`assets/` 整個資料夾**沒有被部署**。catch-all route `/(.*) → /index.html` 把這些路徑全改寫成首頁 HTML（等同 404）→ `window.GROUP_LOGOS` 變 `undefined`、所有 logo 圖 404。**uat/prod 皆然。**

**修法**（commit `7362f09`，`vercel.json`）：
```json
"builds": [
  {"src":"api/*.py","use":"@vercel/python"},
  {"src":"index.html","use":"@vercel/static"},
  {"src":"logo.png","use":"@vercel/static"},
  {"src":"group-catalog.js","use":"@vercel/static"},
  {"src":"group-catalog.json","use":"@vercel/static"},
  {"src":"group-logos.js","use":"@vercel/static"},
  {"src":"assets/**","use":"@vercel/static"}
],
"routes": [
  {"src":"/api/(.*)","dest":"/api/$1.py"},
  {"handle":"filesystem"},            // 實體檔先於 SPA fallback 提供
  {"src":"/(.*)","dest":"/index.html"}
]
```
⚠️ **日後若在根目錄新增任何要被瀏覽器載入的靜態檔，都要加進 `builds`**，否則一樣被 catch-all 吃掉。

---

## 4. 集團 logo 資料機制與補齊狀況

### 卡片 logo 載入優先序（index.html `card()` 函式，約 line 3372）
`src = g.logo || GROUP_LOGOS[name].path || ('https://'+logoDomains[name]+'/favicon.ico')`，失敗 `onerror` → 房子 SVG placeholder。

### 三個資料來源
- `group-logos.js`：`window.GROUP_LOGOS = { "集團名": {path, source, site, coreCode} }`（**本地檔，首選**）
- `logoDomains`（index.html 約 line 3356）：`{ "集團名": "domain" }`（favicon 即時掛載 fallback）
- `assets/group-logos/<集團名>.<ext>`：實際 logo 檔（檔名含中文，Vercel 服務正常）

### 本次成果
- 合夥人原本已建 171 筆 GROUP_LOGOS + 233 檔（但因 §3 根因全都沒顯示，修 vercel.json 後才出現）。
- 我補/修後 **GROUP_LOGOS 現有 176 筆**。
- **我新增/修正的真實 logo（約 23 個）**：台苯、訊聯、金鼎、宏盛、國碩、聯發、南訊、漢唐、旺旺、友嘉、萬泰、友華、廣運、台航、和大、威盛、美利達、國產建材、百容、億光、中航偉聯、圓剛、鉅祥。

### ✅ 2026-10-10 第二輪補上 12 個（uat `c28a017`，GROUP_LOGOS 現 188 筆）
- **新機制：logo 框深色底**。`GROUP_LOGOS[name].bg = "dark"` → 卡片 `.gb-logo` 加 `.gb-logo-dark`（底色 #0f172a）。官網只給白色版 logo 的集團直接用官方原圖，不必另找。
- 深色底：卜蜂、巨大、富鼎先進、王品（皆為先前因「白底看不見」被撤回的官方白色 logo，從 git 歷史取回）。
- 白底：國揚、威剛（蜂鳥圖示）、盛弘（SH 方塊；字標 10:1 太寬不用）、錸德（`ritek.com/apple-touch-icon.png`）、寶成（`pouchen.com/images/logo.png`；**先前抓到的是網站範本的 vertex 圖，為錯圖**）、退輔會（官網徽章 favicon）、明基友達（AUO 頁首 `auo-logo.svg`，藍色 #005087）、駐龍（DPI logo，需用 https 抓）。
- 驗證：本機以 canvas 合成各自底色做像素檢查，12 個可見像素 8%～48%（<2% 才算看不見）。
- 注意：logo 框只有 46×30，長寬比 >6:1 的字標放進去會小到看不清，優先選方形圖示。

### ⬜ 仍是房子圖示／只靠 favicon（剩 8 個，待補）
新纖、新光、利華、立益紡織、健喬信元、志超、太欣、中環。
> 原因：新光/新纖官網無 logo 圖檔（只有情境圖，疑似 CSS 繪製）；志超首頁只有 banner；立益只有 16px favicon；健喬信元首頁為 JS 轉址、抓不到圖；利華、太欣、中環官網連線逾時或拒絕連線。
> **建議**：請用戶直接提供 logo 圖或官方媒體包連結；或改從公開商標庫找。

### ⬜ 次要：16px favicon 過小（放大會糊，非 focus 錯，可日後升級）
中鋼、聯電、劍麟、聚亨、倍微、漢來美食、森崴能源/正崴、正崴。

### logo 品質驗證方法（可重複使用）
在 uat 頁面 console 跑 **像素級 QA**：把每個 logo 畫到 canvas（同源不污染），算「可見(非近白)像素比例 ink、平均顏色 dark、長寬比 asp」。判定：
- `ink < 0.02` → 空白/隱形（白色 footer logo 或 CSS 依賴 SVG）
- `dark > 205` → 太淺
- `asp >= 7` 且超寬/超大像素 → 可能 banner（注意：**寬 wordmark 也會 asp>7，屬誤判，需人工確認**）
- `naturalWidth <= 20` → 過小 favicon

### 抓 logo 的腳本（在 scratchpad，可重跑）
- `scratchpad/scrape_logos.py`、`scratchpad/rescrape.py`、`scratchpad/apple.py`
- 重點技巧：Python urllib 關 SSL 驗證（`verify_mode=CERT_NONE`）可抓到 Chrome 因憑證錯誤載不進的老站；評分要**懲罰** banner/hero/slide/index/footer/white 等 URL 關鍵字、優先 logo 命名與 apple-touch-icon。

---

## 5. 其他狀態與待辦

- **prod 落後很多**：本次 15 個修正 + 合夥人其他改動都在 uat，等用戶說「推 prod」。推時記得對齊 justy-layout。
- **uat_wt worktree 有一筆與本次無關的既有未提交刪除**：`scripts/mingdeng.py`、`sql/mingdeng.sql`。我每次 commit 都**刻意只 `git add` 指定檔**、不碰它。若要處理請先確認是否誤刪。
  - ⚠️ 注意：commit 指令別用 `grep -c xxx` 串在 `&&` 鏈裡——grep 無匹配會回 exit 1 中斷整條鏈（我踩過一次，commit 沒跑成）。
- **daily_slogan RLS** 已上鎖（只開放 anon 讀今天），與本次無關但相關背景。
- **融資維持率**另有獨立交接文件 `融資維持率_交接文件.md`。

---

## 6. 給下一棒的建議起手式
```bash
cd <uat_wt>
git fetch origin && git rev-list --left-right --count HEAD...origin/uat   # 先對齊
```
改 `index.html` 一律改 `C:\Users\User\Desktop\AI_stock\index.html`，再 `cp` 進 uat_wt commit。
驗證前端用 uat 預覽網址 + `?v=亂數`，logo 品質用 §4 的 console 像素 QA。
