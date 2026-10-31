# 2026-10-31 選股紀錄單一來源與資料正規化第一階段

狀態：網站第一階段已發布 UAT a5c3645d；使用者於 2026-11-01 明確批准後，兩份 SQL 已套用共用資料庫並完成線上驗證。這不是宣稱整個 115 個物件已全部正規化。

## 本次可發布

- screen-log.js 不再把新保存的整份 row/stocks 寫入 research.screen_logs，日曆 RPC 是新版紀錄唯一雲端來源。
- 裝置端單獨保存最多 1000 筆日期／策略摘要，排除研究雲端同步、無股票清單／價格／備註；月份重新讀取會替換該月份摘要，移除其他裝置已刪除的摘要。
- member-journey.js 讀摘要與舊版離線紀錄；點數仍由既有伺服器驗證，不憑本機摘要發獎。
- 原日曆、會員匯出 screens、原 RPC 格式、原保存日期規則、舊版離線記錄與其他研究資料不變。
- 研究備份 documents 不再包含新紀錄鏡像；完整帳號匯出的 screens 才是新版日曆資料。舊版 research 備份不能承諾可還原伺服器日曆。

## 已批准並套用的 expand migration

`docs/database/member-screen-normalization-expand.sql`：

1. security_master：從既有基本面／上櫃／ETF 表建立目前台股證券主檔，ETF 名稱與類型優先；不接受會員輸入污染主檔。不適用海外證券／代號重用生命週期，目前尚未將其他資料表指向它。
2. security_observed_names：保存不同代號／當時名稱組合一次；這是觀測名稱字典，不虛構名稱生效區間。下市／無主檔代號保留 source_code，security_code 可為 null。
3. member_screen_record_items：按原 position 保存名稱 ID、當時 close/chg；額外欄位、缺值與 null 另保留相容描述。此階段沒有刪除原 stocks JSON，儲存暫時增加，目的先驗證相容性。
4. 新紀錄／stocks 或 deleted_at 更新時，trigger 在同一交易維護明細；原 RPC 不改，舊客戶端也可寫入。既有有效紀錄以 UPDATE stocks=stocks 回填，超過 1000 筆整個 migration 停止，改採另行設計的分批回填；鎖超過 3 秒／執行超過 60 秒即回滾。
5. 所有新表 RLS；觀測名稱只能透過本人有效紀錄讀取，非會員不能讀使用者提供的歷史名稱。附 member_screen_normalized_stocks(uuid) 供影子比對，未切換日曆讀路徑。
6. 既有日曆 RPC、墓碑、冪等、user_id、request_id、日期與條件一律保留。

`docs/database/member-screen-mirror-guard.sql`：

- 保留原研究文件 RPC 簽章、revision/CAS、8 種文件類型及帳號驗證。
- 未來寫入 research 時，只剔除 id、版本、股票、策略、條件、備註及日期都能與本人有效日曆紀錄確認的鏡像。
- 內容不符、不同會員、未知 ID、legacy 全保留。沒有批次 UPDATE 現有研究文件，避免與其他裝置編輯衝突。
- 舊客戶端下次讀取會取得經整理的雲端版本。新前端已不再製造新版鏡像。

## 啟用前檢查／驗收

- 執行唯讀 DBA 基線（原審查附件 verify-readonly.sql），檢查線上索引避免重複、空間／TOAST、現行 RPC 定義和授權。repo SQL 不是完整線上 schema dump。
- 檢查主檔來源交集名稱／市場差異、code 是否均屬台股命名空間；主檔不能直接擴張成海外持股的唯一鍵。
- 先備份受影響表及函數定義，驗證備份可讀取。UAT/prod 共用 Supabase，Git 分支不是資料隔離。
- 在隔離測試通過且使用者明確批准後才套用。舊 JSON 保留；可在不切讀的狀態觀察新明細與舊 JSON 是否一致。
- 禁止在本階段刪 JSON、合併來源口徑不同的資料、清空舊歷史，或自動 VACUUM FULL。
- master 目前只在 expand seed 初始化；在正式成為其他功能的權威來源前，必須接每日受控更新、衝突檢核／別名生命週期。尚未改任何 Windows 排程。
- 回退：前端可單獨回退；資料庫若停用 shadow trigger，需要另行批准，保留新增表不刪資料。原 JSON 和原讀取 RPC 一直存在，不需逆向重建原歷史。

## 後續階段

實體統計與影子比對通過後，才切換日曆 JOIN 讀取並移除原 JSON；券商主檔、題材多對多、office_tasks 專表、大表保留政策分別做獨立 migration。禁止把不同資料口徑或稽核／會計快照當重複資料直接刪除。

## 驗證

- 隔離 PGlite SQL：schema 語法、回填、同名共用、精確重建、缺值/null、未知代號、舊版額外欄位、A/B RLS、匿名拒絕、更名保留快照、刪除墓碑與重試。
- 研究文件：只移除完全確認的本人鏡像，保留 unknown／legacy／不同內容、其他分類，CAS 仍拒絕舊 revision。
- 日曆瀏覽器回歸：保存不產生 research 全量鏡像、摘要不含股票、重試／刪除、深淺色、320/375/768/1366 寬度。


## 2026-11-01 線上啟用與驗證

- 已核對線上函數簽章、Security Definer、ACL、既有 RLS 與索引；原日曆只有 PK 和 user_id/request_id 唯一索引，故新增日期查詢索引不重複。
- 已備份 15 筆 member_screen_records、10 筆 member_research_documents 及三個主檔來源表，JSON 可讀性與 SHA-256 校驗通過；原研究 RPC 定義另存本機回退檔。備份及會員內容不進版控。
- 來源 stock_fundamentals 與 otc_names 同碼異名衝突 0。主檔精確 2,259 筆；11 筆有效紀錄對應 297 明細、157 筆觀測名稱，逐筆重建差異 0。
- 線上以 authenticated 角色與現有會員範圍驗證：本人讀取、精確回填、新 RPC 保存觸發器、同 request_id 冪等、防鏡像守門、CAS、刪除後重試墓碑；換成其他會員 claim 與 anon 權限驗證不可讀。
- 所有測試包在 BEGIN/ROLLBACK，未留下測試紀錄。測試後原 15 筆日曆、10 筆研究文件與備份完全一致，觀測名稱也回復 157 筆。Identity 序列因 PostgreSQL rollback 語意可能留 gap，非遺失資料。
- 這次只啟用 expand／影子明細與寫入防重複守門；正式日曆仍走原讀取 RPC，原 JSON 未刪，現有研究文件未批次清理。容量暫時增加屬過渡成本，不能宣稱已全面節省空間。
- 未修改 Auth、排程、prod Git 分支或付費方案；共用資料庫變更已同時對 UAT／正式站生效。
- Supabase 管理頁顯示組織前一帳務週期超額，若仍超額將從 2026-11-30 限制專案。僅記錄觀察，不因本次操作擅自升級方案。
