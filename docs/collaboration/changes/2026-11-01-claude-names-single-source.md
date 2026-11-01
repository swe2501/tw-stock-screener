# 股名單一來源：上櫃 ETF 併入主檔、移除寫死股名表（2026-11-01，Claude Code，用戶批准）

- **主檔補上櫃 ETF**：`scripts/upload_otc_names.py` 夜間另抓櫃買 `tpex_mainboard_daily_close_quotes` 的 00 開頭代號，補進 `security_master`（market=otc、instrument_type=etf、source=tpex_etf，已存在不覆寫）。目前 118 檔，目錄共 2,377 筆。`otc_names` view 仍只含上櫃股票（897）。
- **網站**：`apps/web/index.html` 移除內嵌上市股名表（約 108KB，每次開頁都下載、且名稱過時），開頁即呼叫 `_loadNames()` 讀目錄；兩個 loader 都不再另抓 `/api/screen?stat=otcetf`（上櫃 ETF 由目錄提供）。`member-private-screen.js` 一處未防呆的 `window._names[...]` 補防呆。
- **後端**：`api/screen.py` 移除內嵌 `_STOCK_NAMES`，改用 `_stock_name(code, default)`（讀 `_normalized_catalog`，同 worker 5 分鐘快取一次、不逐次複製）。目錄失效時顯示代號（或呼叫端指定的預設），不再退回過時清單。`scripts/themes_push.py` 同步改用。
- **保留**：`/api/screen?stat=otcetf` 端點保留（App `hero-api.ts` 仍使用）；`_SHARES_FALLBACK`、`_STOCK_INDUSTRY` 為官方來源失敗時的股數／產業備援，非股名，本次不動。
- **夜間腳本**：`breadth_daily.py`、`intraday_push.py` 讀目錄時加 `instrument_type=eq.stock`，上櫃清單維持 897 檔、與原 otc_names 相同，不把 ETF 算進廣度／盤中範圍。
- 測試：gateway9／搜尋8／K線4／股名5／目錄7／排行榜4、node security-directory（改為驗證只發 1 個目錄請求且含上櫃 ETF）／public-snapshot／calendar 通過；`test_groupbook_statistics` 2 個錯誤在原 uat 即存在（`_snapshot_rows` 未納入測試範圍），非本次造成。本機預覽：股名 2,369 筆、00679B 標為上櫃 ETF、頂部搜尋找得到、無 JS 例外。
