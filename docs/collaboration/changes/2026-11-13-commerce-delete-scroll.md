# 會員方案刪除與新增定位

- 04跨會員商品範圍修正admin-member-commerce.js：卡片摘要加入刪除鈕，確認後僅移出編輯清單，需儲存才生效；至少保留一個方案（沿既有伺服器限制）。不操作線上資料、不刪訂單／授權期間／券，沿既有commerce_save與revision衝突檢查。
- 新增後展開最後卡片，focus名稱preventScroll，再smooth scrollIntoView，scroll-margin-top96px避開導覽；減少動畫偏好即時定位。
- Chrome mock瀏覽器測試通過：確認／儲存前不寫入／保留其他商品／最後商品保護，以及新增展開與名稱焦點。既有完整commerce測試在本機Edge啟動失敗，未宣稱整組通過。
- 未提交未部署；付款開關與權益設定不變。
