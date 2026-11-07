# 共用會員服務相容性：手機迎新與上限 v4

尚未套用正式／共用 DB；不新增 Vercel Function、不啟用 SMS 或活動。套用順序及驗收見 `docs/member-phone-rewards-review.md`。

- 新增唯讀資格 RPC `member_phone_welcome_status()`、本人領券 RPC `claim_member_phone_welcome()`；都只開放 authenticated，舊網站與 App 無須呼叫，既有 API 不刪改。
- 新增 Auth 驗證電話唯一預留 trigger。既有正規化電話重複時整筆 migration 失敗並要求人工核實，不能自動分配。需與共用 Auth 負責人共同審查。
- `member_task_status()` 保留原欄位，新增 `rewards_policy_version=4`、逐列 `global_caps`；原 caps 欄位在 v4 代表一般任務共用每日 60／週 300 總額。
- `claim_member_task()` 與既有批次領取由伺服器強制同一額度；舊客戶端雖可能未即時顯示共同上限，仍無法繞過。
- 不重寫帳本或舊券。會員容量、支付、推薦活動及點數商品目錄不在這次 migration 中變更。
- 資料庫測試使用本機 PGlite，網站測試使用模擬帳號與 API，不碰合夥人工作區或正式會員。
