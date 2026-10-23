# 會員服務 SQL 套用紀錄（2026-10-23，台灣時間）

使用者本回合明確批准「套用這次新的會員服務 SQL」。已在共用 Supabase Taiwan stock2（`bruqrbvbjxntgoljxsne`，main）成功執行 `docs/database/member-service-completion.sql`，畫面回覆 `Success. No rows returned`，並在另一份獨立查詢完成唯讀驗證。

執行檔 SHA-256：`0D2A9E3363A4D0DA76F9F6E8D23C0355BF8C07345E69C31230D00E1CD20FAA3E`。SQL 檔頭 PREPARED ONLY 是準備階段原始註記；目前套用狀態以本紀錄為準，無須再次執行。

## 部署前後核對

| 項目 | 部署前 | 部署後 |
| --- | --- | --- |
| 帳本筆數 | 6 | 6 |
| 帳本總點數 | 150 | 150 |
| 現有使用券 | 0 | 0（缺少條件快照為 0） |
| 啟用任務 | 31 | 31 |
| 啟用商品 | 8 | 8 |
| AI active | false | false |
| stored_enabled | false | false |
| 新管理員表／啟用管理員 | 原表不存在 | 0 |

## 唯讀驗證結果

- all_rpcs_present：true。
- rpc_permissions：true（authenticated 可呼叫、anon 不可呼叫）。
- private_tables_protected：true（八張私人表均啟用 RLS，authenticated 無直接讀寫／刪除權）。
- admin_helper_private：true。
- ledger_capture_enabled／reward_capture_enabled：均 true。
- rewards_missing_terms：0。

使用 `member-service-verify.sql`，顯示方式將結果轉成 check_name／result，另外列出 active_tasks 與 active_products；共 14 項結果。沒有使用真人帳號製造測試案件、發點或補扣點。

## 安全執行選項

Supabase 靜態檢查未辨識 SQL 中 DO 迴圈已啟用 RLS，出現警告。自動核准審查拒絕 Run without RLS；未繞過該拒絕，改採介面提供的 Run and enable RLS 成功執行。後續唯讀檢查再次確認私人表 RLS 與權限均通過。

## 證據與目前範圍

- SQL 執行頁：<https://supabase.com/dashboard/project/bruqrbvbjxntgoljxsne/sql/31375da1-d30c-49ec-945e-c1e3453a6f39>
- 唯讀驗證頁：<https://supabase.com/dashboard/project/bruqrbvbjxntgoljxsne/sql/54e78b33-e230-4dcd-bea0-37ec09af42b3>
- 本機成功截圖：`member-service-migration-success-2026-10-23.png`。
- 本機驗證截圖：`member-service-migration-proof-2026-10-23.png`。
- 截圖及部署前／後 AX 文字存於 `C:/Users/JUSTY LIN/Documents/Codex/2026-10-08/new-chat/`，不包含 token／密鑰或會員內容。

本次只批准並完成資料庫套用；前端仍在本機 shared 分支，沒有重新執行 234，UAT 畫面尚未包含這批會員服務 UI。管理員仍未指定。真人登入與新 UI 的線上驗收須待之後發布；外部金流與寄信服務仍未接通。
