# 剩餘 otc_names 讀取改讀正規化目錄（2026-11-01，Claude Code，接續 Codex 正規化）

- 範圍：網站／API／本機排程腳本中仍讀 Supabase `otc_names` 的備援路徑。寫入端 `upload_otc_names.py` 與 `security_master` 的來源觸發器不動（`otc_names` 仍是主檔上櫃股名來源，停用前需另行改寫來源並經用戶批准）。
- `api/chart.py` `_is_otc`：移除 `otc_names` 單代號備援；目錄失效時回上市且不快取，既有 `.TW` 失敗改 `.TWO` 重試保留。
- `api/screen.py` `_current_security_names`：移除 `otc_names` 備援；查不到的代號由呼叫端沿用快照原名。
- `apps/web/index.html` 舊股名 loader（正規化目錄失敗時的備援）：上櫃股名改讀 `security_catalog?market=eq.otc`。
- `scripts/breadth_daily.py`、`scripts/intraday_push.py`：上櫃代號改讀 `security_catalog`（分頁 1000）。
- 驗證：目錄上櫃 897 檔＝otc_names 898 檔扣除已轉上市的 8908（stock_daily 已標 twse），名稱 0 差異；兩支腳本線上唯讀各取得 897 檔；單元測試 gateway9／搜尋8／K線4／股名5／目錄7／排行榜4、node 三支皆通過；API 12/12。
- 相容性：API 欄位與回應格式不變；App（apps/mobile/src/hero-api.ts 仍讀 otc_names）未改，屬 App 車道，停用 otc_names 前需通知合夥人。
- 本機 `D:\stock_data\otc_names.json` 為本機檔案，不在本次範圍。
