# 分享解鎖相容性

- 網站：入口與會員分享彈窗，指定公開研究畫面的限時使用權。
- App：未修改 App 檔案；可於未來沿用新的 authenticated `member_share_unlock` RPC。沒有變更既有 RPC 的參數或輸出。
- 資料庫：新增 migration 準備檔 `docs/database/member-share-unlock.sql`，尚未線上套用；活動預設關閉且要求手機驗證。沿用 member_rewards、member_entitlements、member_referrals，無 Auth trigger／provider／既有 RLS 變更。
- 舊端：既有邀請綁定、禮遇領取、會員資料與專項授權維持；新 RPC 未部署時前端顯示尚未啟用，不發假獎勵、不清除登入。
- 驗證／啟用／退回：見 `docs/member-share-unlock.md`。活動關閉停止新核發；既有已核發期限仍履行。
