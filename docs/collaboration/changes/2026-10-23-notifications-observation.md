# 站內訊息與觀察資料串接

狀態：本機 UI／伺服器隔離測試完成；使用者本回合「批准」後，通知 SQL 已套用到 Taiwan stock2。新前端尚未發布，前一批 234 為 1210f94。

共用變更是 `docs/database/member-notification-inbox.sql`：增加 RLS 私人已讀表、本人訊息 keyset 分頁／逐筆或全部已讀／唯讀個人匯出 RPC；事件取自本人帳本、客服回覆、禮遇及既有公開規則，不另造送達紀錄。沒有新增 Vercel Function、管理員或活動開關；網站及 App 舊 RPC 簽章不變。舊 App 不需立即更新，亦未修改 apps/mobile。

此檔分兩段套用：主體與後補的本人已讀匯出，最終完整 SQL SHA-256 為 `678CB4F90C1FD5CAB6B3D64CD53533779620C6B14EDB981878BB235CA88654D4`。原主體 SHA-256 為 `93E0385A5CCBC80C5C6EFC71D975BC97D6A97FB8DAC5D7115FF4FD6874D32416`。

主體查詢：7a600e70-e775-47e8-addd-f3b729889e2b；唯讀核對：fa2e9195-b925-4edf-8567-1a94af1b840c；已讀匯出補充與權限核對：29986664-b75c-47c7-8a30-c7b40c737e89。皆在 `bruqrbvbjxntgoljxsne`。read_rows=0、ledger_rows=6、ledger_points=150，AI 與儲值皆 false。feed_ready／read_ready／RLS／private_read_state／restricted_rpc 均 true；export_ready／private_export 另驗為 true。沒有用真人帳號建立測試通知或已讀。

後續可用 `member-notification-inbox-verify.sql` 重做唯讀核對。已讀資料不能由匿名或 authenticated 直接讀寫；export 也只查 auth.uid 對應資料。前端使用既有 serviceRpc 的 token 切換保護；訊息不寫入未區分帳號的共用快取。

前端可回復先前版本；私人已讀表應保留，不能刪除消費者紀錄來回復。沒有自動資料搬移或強改舊回測／持股工具入口。完整用途盤點及測試見 `docs/member-observation-linking-2026-10-23.md`。

追加排行榜文字修正：完整排行原用 float 排名搭配 19% 股票欄，長英文名稱會把股票按鈕推到排名下方。改為同列 flex 容器、桌面股票欄 27%，題材欄 42%，手機仍沿用原卡片配置。深淺色、320／375／768／1366 寬度回歸通過，包含第 27 名 6902 GOGOLOOK 在桌面完整同列顯示。修正既有測試的題材展開資料不足及已過時的抽屜關閉預期，產品抽屜行為未更改。無 API／資料庫變更。
