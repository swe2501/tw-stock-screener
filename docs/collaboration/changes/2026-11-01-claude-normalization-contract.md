# 正規化收尾：刪除 stocks JSON 欄位與 otc_names 表（2026-11-01，Claude Code，用戶批准）

用戶指示「都刪掉，沒關係，現在都還在開發階段」。已在共用 Supabase 套用 `docs/database/normalization-contract-2026-11-01.sql`（uat／prod 同時生效）。

## 選股紀錄
- `member_screen_records.stocks` 欄位已刪；`member_screen_record_items` 是唯一來源。同步觸發器 `member_screen_items_sync` 與 `sync_member_screen_record_items()` 已刪，改由新函式 `_member_screen_write_items(record_id, stocks)`（不開放 anon/authenticated）在存檔時直接寫明細。
- `save_member_screen_record`、`save_member_screen_record_v2`：簽章不變，仍收 `p_stocks`；回傳 `row` 仍含 `stocks`（由 `member_screen_normalized_stocks` 重建），網站／舊 prod 前端不用改。
- `delete_member_screen_record`：改刪自己的明細。`_member_task_eligible`、`_member_task_progress`：「有股票」改看明細是否存在。`save_member_research_document` 鏡像比對改用明細重建的 stocks。`member_data_export_page` 的選股紀錄改讀新 view `member_screen_records_export`（含重建 stocks，不開放 anon/authenticated）。
- 試跑（rollback）：全部會員 × 4 種選股任務資格新舊 0 差異；匯出 15 筆 stocks 與原 JSON 0 差異；存檔寫入 1 筆明細、刪除清空。

## otc_names
- 原表已刪（連同觸發器 `security_master_otc_sync`），`refresh_security_master()` 不再以它為來源。
- 同名唯讀 view `public.otc_names(code, name)` 從 `security_master`（market=otc、instrument_type=stock）即時讀，anon 可讀 897 檔；**舊版 prod 前端與 App（apps/mobile/src/hero-api.ts）不用改**，但不能再寫入。
- `scripts/upload_otc_names.py` 改為把主檔缺的上櫃股（新上櫃初期）補進 `security_master`（source=otc_names、已存在不覆寫）。

## 備份與還原
- 資料庫：`_bak_20261101_defs`（10 個函式原文）、`_bak_20261101_otc_names`、`_bak_20261101_screen_stocks`，RLS 開且無 policy（anon 401）。預計確認穩定後再刪。
- 本機：`D:\stock_data\db_backup_20261101\*.json`（含會員資料，不進 Git、不可外傳）。
