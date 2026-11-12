# 後台點數表格、背景與商品封存（2026-11-12）

- 接續既有shared/justy/ad-media-display本機修改；未提交／未發布，未更改正式會員、兌換紀錄或資料庫schema。
- 統一adminView與afa-sheet表單為主題藍灰底，去除白膠囊大陰影，任務欄位定寬對齊；手機表格保留橫捲。
- 商品新增「刪除（封存）」及顯示封存／還原入口。archive先PATCH active=false，再按商品ID寫admin_settings product:archived標記；不物理刪除商品或已兌換使用券。還原維持下架；已封存商品拒絕一般save重新上架。兩次寫入非交易，第二步失敗會回錯誤，商品可能已下架，允許重試。
- 自訂任務既有delete僅未被領取可執行，系統任務不可刪；新增領取紀錄讀取失敗則拒絕刪除，保留歷史。
- 新admin_products_archive/restore沿用既有admin認證、api/auth與稽核列表，沒有新增Function或migration。舊會員／App仍只見active商品，既有權益完整保留。
- 論壇贈券實為forum:voucher全域設定；UI加上全場次共用、不回溯說明。不是特定台中場設定，不變更發券規則。
- 驗證：27項forum_ads單元測試，含封存還原、未授權、保留definition、封存後save阻擋、任務讀取失敗拒刪；新增點數瀏覽器測試自訂刪除按鈕、商品封存還原、深淺底色與手機邊界，mock API；API12/12。尚未線上驗收。
- 本機49724獨立體驗頁加入點數／商品與論壇預覽入口；示範資料僅本頁記憶體，不寫雲端。
