# 本場到場贈券：指定已報到會員發券

## 授權與狀態
JUSTY要求同一視窗勾選已報到者發30天券、不重複、會員站內通知與後台紀錄，先本機看。本輪不提交不發布，不操作共用資料庫、不實發券。03前輪5234仍受資料庫連線阻擋，本修改只在04來源工作區，不碰03或主checkout。

## 實作
- 原voucherBar下加入admin-attendee-vouchers.js區塊，搜尋、尚未領券／全部／已領券篩選、勾選（每批50）、券種和1–90天（預設30）、具名確認、逐人成功／重複／失敗與紀錄。已領券停用，重新讀取核對狀態，連線結果不明不假報成功。
- admin_forum_voucher_recipients/issue沿admin_forum管理授權，event存在／非測試／人數／days驗證，actor由登入管理員傳入，不接受前台冒名。API入口數12/12。後台成功操作沿既有稽核；失敗可由回應逐人核對。
- 配套SQL forum-attendee-vouchers.sql只準備：service-only函式先鎖event+user，核對本場非測試checkin、同場scope與舊technical lifetime券，已有即略過，否則_member_issue_voucher與forumvoucher:event:user成功紀錄同一交易。紀錄含reward ID、券種、天數、actor、via及時間。
- 自動贈券也改走同RPC，手動／自動共用鎖和防重複。legacy _grant先記checkin才呼叫券RPC；新活動既有交易已記checkin。原圖設定的全場次／一生限制不擴張成多張券。
- 通知沿既有_member_notification_events reward分支與券夾member_rewards，不另寄email／推播。會員端既有60秒poll／重新整理讀取，不能保證遠端會員瞬間跳toast。沒有另建不必要通知表。

## 驗證與本機體驗
- PGlite隔離SQL：已報到才可發、未到場拒絕、手動／自動同時僅一券、舊券略過、成功紀錄完整、service-only權限；載入原forum-registration-notifications.sql驗證新券只對本人產生reward通知，另一帳號不可見。
- admin-attendee-vouchers.browser.cjs：篩選、已領停用、勾選確認、30天、結果與手機邊界通過。Python論壇回歸與API預算通過。
- http://127.0.0.1:49725/ 為獨立本機demo，用示範會員、不呼叫API；畫面／勾選發券／通知示範已操作驗證並目視截圖。重新整理重設，不是常用主checkout更新。
- 上線前須另批准並核對SQL／現有通知函式及RPC相容、部署網站API；配套未套用時指定發券與自動券明確回報未啟用，不可宣稱線上已完成。來源同時有前輪未發布修改，整合時依最新盤點處理，勿重複套用已發布草稿。
