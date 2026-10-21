# 共用選股紀錄日期修正

Migration：`docs/database/member-screen-latest-market.sql`。隔離分支 shared/justy/calendar-market-date；網站尚未發布，資料庫執行證據見文末。

- 新增 market_date，原資料依原嚴格同日政策回填 record_date，不改原保存時間／日曆日期／研究內容。
- 原讀取 RPC 增加可選欄位 save_policy、latest_market_date；最新行情取現有 price_window 中不晚於台灣今天的最大 trade_date，無新行情源或付款／點數變更。
- 新增 v2 保存 RPC，伺服器檢查客戶確認日等於台灣當天、行情日等於最新入庫行情日；記錄日期仍由伺服器寫今天，記錄時間採原 clock_timestamp。
- 網路重試先回原單號既有結果；已刪除 tombstone 不復活；新的跨日請求或過時行情拒絕。等待帳戶鎖後重新取得日期，寫入前再次檢查午夜切日。
- 不放寬 RLS，不提供 update/delete 資料權限，原刪除 RPC 保留。原同日保存 RPC 不改，保留舊網站／App 呼叫相容性；新欄位對舊 client 為增量。
- 仍沿用既有策略／股票快照驗證範圍，未宣稱伺服器重新運算或認證選股策略。price_window 可用日期不代表完整入庫批次，此處不改行情入庫流程。

隔離 PGlite：member-screen-latest-market.test.cjs 驗證週末／延遲（三日前最新行情）、行情／保存日期分離、過時／未來行情、跨日表單、行情更新競爭、原單號重試、不可修改、本人刪除、tombstone、帳戶隔離、無行情、未登入拒絕。原 member-screen-calendar.test.cjs 仍通過。

正式部署順序：先人工明確批准並套此 SQL，唯讀確認政策／最新日，再整合網站 UI 到 UAT。不可先發布 UI 造成原服務無法保存。

2026-10-21：使用者已明確批准日期修正 SQL，並自行確認 Supabase Run query；回傳截圖顯示 `Success. No rows returned`，畫面可見 v2 RPC 及授權敘述。已取得人工執行成功證據，無須重新批准或重跑 migration。瀏覽器工具仍回報本機瀏覽器停用，尚未獨立執行 `docs/database/verify-member-screen-latest-market.sql` 或真實會員保存驗收；不能將截圖視為完整端到端驗證。
