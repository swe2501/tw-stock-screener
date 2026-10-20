# 交接：今日排行「所屬題材」補齊（2026-10-20，JUSTY 指定，請合夥人／合夥人的 AI 接手）

> 先讀 [docs/collaboration/README.md](docs/collaboration/README.md) 與 [AGENTS.md](AGENTS.md)。本文件只說明「今日排行（漲幅榜／跌幅榜／爆量榜）的題材顯示」這一件事：前端已改好，**題材資料本身還沒補**，請接手補資料。

## 1. JUSTY 的需求（已確認，照做）

1. **每一檔股票都要顯示它所有的所屬題材**，不能大部分都是「未分類」。
2. 顯示規則（前端已完成，見第 3 節）：
   - 首頁三張排行卡片：每檔直接顯示 **3 個**題材，其餘收成小字連結「+N 更多」。
   - 「展開 ↗」完整排行表：每檔直接顯示 **4 個**題材，其餘收成「+N 更多」。
   - 展開後的「收起」**固定在最後面**（舊版「收合」會夾在題材中間，已修掉）。
3. **不要改網站的風格、配色、版面樣式。** 有更好的想法先跟 JUSTY 討論。
4. 題材資料來源：**合夥人之前已經爬過一份題材列表**，請用那份來補，不要讓 AI 自己憑印象編題材（AGENTS.md「絕不自編 ticker／防幻覺」原則同樣適用）。

## 2. 為什麼現在大部分顯示「未分類」（根因）

- 排行榜每列的 `themes` 欄位由後端 `api/screen.py` 的 `_focus_details()` 填入，來源**只有** `THEME_MEMBERS`（同檔第 14 行起的固定字典）：
  ```python
  memberships = {}
  for name, members in THEME_MEMBERS.items():
      for code in members:
          memberships.setdefault(str(code), []).append({'id': name, 'name': name})
  ...
  r['themes'] = memberships.get(str(r.get('code')), [])
  ```
- `THEME_MEMBERS` 目前只有 **39 個題材、涵蓋 406 檔股票**（2026-10-20 實測）。上市櫃約 1,800 檔，所以多數股票沒有題材 → 前端顯示「未分類」。
- `THEME_MEMBERS` 同時被以下功能使用，改資料時要一起考慮相容：
  - `_theme_stats()`（題材強弱／資金集中／漲跌停家數，約第 1132 行）
  - 市場總覽 `stk()` 的 `themes`（約第 1230 行，取前 4 個）
  - 單一題材 `_fetch_theme()`（約第 1284 行）與全部題材 `_fetch_theme_all()`（`stat=themeall`，約第 1314 行，前端題材抽屜用）
- 產業別另有來源：`_get_industry_map()`（證交所 openapi `t187ap03_L`，**只有上市**）與備援字典 `_STOCK_INDUSTRY`（1,094 檔，只有上市）。上櫃股目前沒有產業別。

## 3. 前端已完成的部分（JUSTY 本機 justy-layout，尚未 commit／發布）

| 檔案 | 改動 |
|---|---|
| `apps/web/assets/focus-rankings.js` | `tags(row, limit)`：卡片 limit=3、完整表 limit=4；其餘放進隱藏區，「+N 更多／收起」按鈕固定 append 在最後；點按鈕 `stopPropagation`，不會誤開個股。 |
| `apps/web/assets/focus-rankings.css` | 「+N 更多／收起」改成小字底線連結（不再像題材標籤）；卡片題材區寬度 50%→64%；完整排行視窗 `position:fixed; inset:0; margin:auto` 置中、最大寬 1560→900px，表格列距與標題列縮小；欄寬重配（題材欄 46%、靠左排、可換行）。 |
| `apps/web/index.html` | ① `focus-rankings.css/js` 版本號 `?v=1`→`?v=2`（避免瀏覽器快取舊檔）。② `loadFocus()` 改成 host-aware：本機（file:／localhost／127.0.0.1）改抓正式站 API，寫法與同檔 `groupApi`、`_authEndpoint` 一致。原本本機 `tools/serve.mjs` 是純靜態伺服器、沒有 `/api`，排行榜在本機永遠停在載入中。 |

- 2026-10-20 補充：從完整排行點題材時，`#themeDrawer` 會暫時搬進 `<dialog class="fr-expand">` 裡打開（疊在完整排行上方），關閉後搬回原位；Esc 只關抽屜；抽屜內點個股會先關完整排行再開 K 線（`focus-rankings.js` 的 `openTheme`／`restoreDrawer`）。

前端**只讀** `row.themes`（格式 `[{id, name}]` 或字串陣列皆可），所以後端題材補齊後，前端不用再改。

## 4. 請接手做的事（題材資料補齊）

建議做法（實際做法請跟 JUSTY 確認）：

1. 用合夥人已爬好的題材列表，產生「股票代號 → 題材清單」的完整對照，涵蓋上市＋上櫃。
2. 把資料接進後端，讓 `_focus_details()`、`_theme_stats()`、市場總覽、`themeall` 用**同一份**題材資料。可以：
   - 擴充 `THEME_MEMBERS`（最簡單，但字典會變很大）；或
   - 改成讀資料檔／Supabase 表（例如每日或每週由排程更新）。
3. 題材排序建議：成分股少、比較精準的題材排前面（例如「高速傳輸介面IC」排在「IC設計」前），卡片只顯示前 3 個時比較有意義。
4. 選配：題材仍是空的股票，用產業別（上市 `_get_industry_map()`；上櫃需另找官方來源）當備援，前端可用灰色顯示，避免「未分類」。
5. 夜間預算：`scripts/focus_precompute.py` 寫入 `page_cache` 的 focus 快照若已是 `fields_version=2`，`_read_focus_snapshot()` 不會再重算 themes。改題材來源後要確認預算程式也帶到新題材，或提高 `fields_version` 讓舊快照重算。

## 4.5 開工前要和 JUSTY 確認的決定（2026-10-20 討論，尚未定案）

下列是 JUSTY 與 Claude 討論後整理的問題；「建議」只是建議，**實作前請先和 JUSTY 確認**，確認後把結論補在本節。

1. **題材粒度**：爬來的列表可能有數百個、名稱重複或相近（例：「伺服器」vs「AI 伺服器」、「散熱」vs「散熱模組」）。
   - 建議：先整理合併同義題材，分「大類／細類」兩層；卡片優先顯示細類（資訊量較高）。
2. **影響範圍**：`THEME_MEMBERS` 同時供排行榜、題材族群頁、市場總覽強弱勢題材、題材抽屜使用。題材變成數百個後，「今日最強題材」等統計可能被只有 2～3 檔的小題材洗版。
   - 建議：排行榜與個股顯示用「完整題材對照」；題材族群頁／強弱勢統計維持「精選主要題材」，或設最少成分股門檻。
3. **資料存放與更新**：寫死在 `api/screen.py` 每次更新都要改程式、重新部署。
   - 建議：改成資料檔或 Supabase 表，由排程定期更新。**新建表或改資料庫須 JUSTY 同意**（AGENTS.md）。
4. **來源可靠性**：說明爬取來源網站、更新頻率、是否允許抓取；每個題材要可追溯來源，不由 AI 推測。
5. **補不到題材的股票**：顯示「未分類」或改用產業別（上市 `_get_industry_map()`；上櫃需另找官方來源）當備援；ETF 可直接標「ETF」。

預計工作順序：整理題材列表 → 接後端讓排行每檔帶完整題材 → 確認題材族群頁與統計不受影響 → 推 UAT 給 JUSTY 檢查 → JUSTY 同意後才上 prod。

## 5. 必守規則

- 這是後端／共用資料變更：依 [docs/collaboration/README.md](docs/collaboration/README.md) 走 `shared/<owner>/<task>` 分支，並在 `docs/collaboration/changes/` 寫相容性說明。
- **API 上限 12 支**：不要新增 `api/*.py` 檔；修改後執行 `python scripts/check_api_budget.py`。
- `themes` 欄位格式維持相容（`[{id, name}]`），App（`apps/mobile`）也可能讀同一支 API。
- 不改 Auth、不推 prod、不動另一人的工作區；整合 uat 前先合併最新 uat，衝突逐段處理，禁止 force／整份覆蓋。
- 每個題材都要有可追溯的來源，不可由 AI 自行推測公司題材。

## 6. 驗證方式

- 本機：`node tools/serve.mjs` → `http://127.0.0.1:4173` → 今日焦點 → 今日排行。（本機排行讀正式站 API，正式站未更新前題材仍是舊資料。）
- UAT：三張卡片每檔應有題材；「展開 ↗」完整表每檔最多直接顯示 4 個，多的有「+N 更多」，展開後「收起」在最後。
- 抽查：威鋒電子 6756、富喬 1815、西勝 3625（上櫃）、律勝 3354 的題材是否合理且有來源。
