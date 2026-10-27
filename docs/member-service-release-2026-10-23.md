# 會員服務網站發布批次（2026-10-23）

使用者於資料庫套用與驗證完成後說「推上去」，本批依 234 流程發布至 UAT，不推 prod。

功能提交：`eece19a`。內容包含點數／AI 分頁帳本與期間完整匯出、私人客服案件與附件、研究備份還原、帳號資料匯出、登入更換復原、分權管理核對台與規則／使用券快照。

資料庫先決條件已滿足：Taiwan stock2 已取得獨立批准並套用 `member-service-completion.sql`，唯讀驗證權限／RLS／trigger 均通過，原帳本維持 6 筆、150 點，任務 31／商品 8，沒有新增管理員或開啟 AI／付款。發布網站時不再次執行 migration。

流程為先更新並推送 justy-layout，再於隔離 worktree fetch 並合併最新 origin/uat／origin/justy-layout；檢查後推送 UAT，最後 fetch 並以 fast-forward／merge 對齊本機與 justy-layout。僅一般非 force 推送；保留既有其他作者內容，不改 App、prod、Andrew、Duke 或排程。

測試詳見 `member-service-completion-2026-10-23.md`；40 項登入／同步、隔離 PGlite 與深淺桌機手機的相關功能測試通過。已知既有登入整體測試在導覽列相鄰位置斷言停止，乾淨舊版亦同；不宣稱該支通過。API 入口仍為 12／12。

本檔隨發布提交，實際推送與 Vercel 結果以本批 Git commit／部署狀態驗證；推送本身不等於 Vercel 已成功。使用者線上驗收入口為點數帳戶、案件紀錄、資料與隱私、登入與安全、規則與權益紀錄。管理員仍須另行指定網站 UUID 與明確權限，不因發布自動取得角色；外部金流／寄信仍未接通。
