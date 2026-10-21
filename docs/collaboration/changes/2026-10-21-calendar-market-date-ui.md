# 選股保存：最新行情日期與今天分開

網站本機修正；尚未推 UAT。資料庫執行狀態見文末。

- 前往選股捷徑修復另見同日 calendar-screen-navigation。
- 新版 `member_screen_calendar` 需回傳 `save_policy=latest-market-v2` 及 `latest_market_date` 才開放保存。舊版服務仍可保存行情日期等於今天的結果，維持原 RPC 簽名；跨日結果則清楚指出仍需伺服器升級，不把原功能全部關閉。
- 表單顯示記錄日期與行情日期。新版 RPC `save_member_screen_record_v2` 傳入伺服器確認的記錄日期，送出仍由伺服器重新判定，客戶不能任意回填。
- 最新行情可停留在昨天或假日前一交易日，存入保存當天日曆，歷史查看頁分開顯示行情日期與伺服器保存時間。
- 行情更新或跨日錯誤需關閉重新確認／篩選；網路不明結果重試沿用原 UUID，已確認的舊紀錄不重複新增；不自動更改 UUID 或把舊請求移到今天。
- 原策略、結果快照、備註不可編輯，仍可刪除。新版日期政策尚未套用時不會宣稱跨日已修復；未識別的政策版本關閉保存。

共用 SQL 及隔離資料庫測試放在獨立 `shared/justy/calendar-market-date` 工作區：`docs/database/member-screen-latest-market.sql`。原 migration 不修改、不重跑。使用者已另行明確批准本次日期修正 SQL。

驗證：screen-calendar.browser（含最新行情為三日前、今日保存、行情日期保留、跨日停用、舊服務同日相容與跨日阻擋、重試、刪除與唯讀）、screen-calendar-full.browser（完整網站深淺／手機）、navigation-history.browser（捷徑與返回）均通過；JS 語法、差異格式及 API 12/12 通過。

2026-10-21：使用者已明確批准套用 member-screen-latest-market.sql，但瀏覽器工具回報 Work 本機瀏覽器操作停用，且環境無可用 Supabase/psql 管理連線；尚未執行正式 SQL。

2026-10-21 後續：使用者自行確認 Supabase 的 Run query，提供 SQL 編輯器截圖顯示 `Success. No rows returned`；畫面可見 v2 RPC 與授權敘述。此為人工執行成功證據，不再視為等待批准。瀏覽器工具仍回報停用，尚未獨立執行唯讀驗證或真實會員保存驗收；網站新版尚未提交／發布 UAT。
