# 2026-11-03 會員中心導覽與內容獨立捲動

使用者要求：點會員中心左側功能時，左側工具列保持位置，只讓右側新內容回頂，不再整頁跳頂。

- member-center.js 新增 mc-content-group，包住 main；切換功能／會員路由上一頁僅重設此區 scrollTop。原頁面關閉／返回的背景捲動恢復保留。
- member-center.css 將會員工作區設為固定視窗內 flex/grid，左導覽與右內容各自 overflow-y:auto，限制外層捲動傳遞。手機保留有界兩欄導覽區，其下內容獨立捲動，避免完整長工具列推走內容。
- 回到頂端按鈕依右側捲動距離顯示，僅重設右側。screen-log.js 日曆開圖返回記錄改存正確的右側 scrollHost。
- brand-footer 移到穩定的右側 wrapper，不會被 main 重新渲染刪掉；寬度、換行與底部留白適應較窄容器，公開頁仍維持滿版頁尾。包含腳本先於會員中心載入時的動態掛載。
- 更新相關靜態資產 query version，避免舊 JS/CSS 快取。

測試：member-split-scroll.browser.cjs 用實際會員中心／頁尾腳本，明暗模式 × 320/390/768/1366，確認功能切換／返回只重設右側、左側捲動及座標不變、外層不跳、回頂端／頁尾可用且無橫向溢出。member-controls-full-page.browser.cjs 完整真實模組的主題、手機、登出返回首頁通過；brand-footer.browser.cjs 公開頁／會員頁掛載、明暗與390/768/1366、資訊視窗與連結通過。既有兩個測試略過迎賓／導覽，並改用新捲動容器；頁尾斷言計入容器底部留白。日曆快取回歸與修改 JS／49段 inline 語法通過。

無 API、資料庫、Auth、App 或排程改動。獨立 worktree 修改，保留主目錄他人未提交內容；依持續授權合併最新 UAT後非 force 發布，未發布 prod。
