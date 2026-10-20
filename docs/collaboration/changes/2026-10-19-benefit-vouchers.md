# 使用券相容性變更（準備，未部署）

member-share-vouchers.sql 新增 member_rewards.activation_deadline，分享達標改發待啟用券。舊使用權不回收；既有 RPC 欄位保留，新增 reward_delivery=voucher、pending_vouchers。網站需要辨識新模式才開放體驗券領取；一般舊獎勵保持舊行為。App 須實作本人啟用及一個月期限顯示後再提供領券入口。未變更 provider、正式資料或服務開關。

以隔離 PostgreSQL 驗證券核發、同一受邀人唯一歸屬、五人保留兩人進度、延後啟用完整天數、重複操作、期限、跨帳號及 RLS。發布前仍須確認功能範圍與驗證政策，取得共用資料庫 migration 明確批准。
