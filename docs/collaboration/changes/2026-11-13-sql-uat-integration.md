# 2026-11-13 活動點數與指定到場者發券整合

JUSTY明確授權SQL更新、UAT發布與justy-layout／Documents本機對齊。01、02、03、05聊天室均idle，04單一協調。

## SQL實際套用
- Taiwan stock2（bruqrbvbjxntgoljxsne）SQL Editor：forum-event-rewards.sql及forum-attendee-vouchers.sql皆Success. No rows returned。
- 核對既有報名函式、資料欄位與_member_issue_voucher簽章；保留既有報名限制與本人通知來源。
- 四支新業務RPC為service_role可執行、anon／authenticated不可直接執行；forum_event_task_points_sync為O。
- 無舊點數重發、無會員真實測試資料寫入。隔離測試驗證跨活動各一次、QR／code去重、手動／自動券共用去重與本人通知。

## 合併範圍
- 04活動代號／每場點數／指定報到者贈券、廣告五版位動畫預覽、後台霧玻璃／短欄位／表格平衡。
- 01保留雙層取景框細光慢掃描及glass-skin排除全螢幕dialog不透明背景。
- 03保留付款demo及深色會員Logo；付款測試不是真實綁卡或付款。
- 三方逐塊合併保留兩方；舊來源工作區不重套。測試截圖artifacts不提交。

發布驗證與最終commit另依Git refs及聊天室回報；未完成、App、prod、排程與付款啟用均不在本批。

## 發布前檢查
32項論壇Python＋5項會員商品Python通過；API12/12；兩份PGlite SQL交易、廣告編輯、指定發券、活動任務、點數後台、贈券／新增論壇玻璃深淺×玻璃一般、首頁輪播、會員商品刪除、付款demo與完整會員網站旅程通過。付款測試確認不送金流且不存卡。
