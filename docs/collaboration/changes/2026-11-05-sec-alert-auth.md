# FIX-001：alert.py cron／sell／test 授權收緊

日期：2026-11-05（Asia/Taipei）
分支：sec/alert-auth（獨立 worktree，未碰 Andrew 工作區、未碰 org/ceo-cto-roles）

## 改了什麼

- pi/alert.py cron 判定改為只接受 Authorization: Bearer <CRON_SECRET>，以 hmac.compare_digest（先比長度）驗證。
- **不再**把 x-vercel-cron 或單獨的 x-cron-secret 當成 cron 通過條件；CRON_SECRET 未設定或空字串時 is_cron 一律 false。
- cron 通過後仍用 SUPABASE_SERVICE_KEY or SUPABASE_ANON_KEY 當內部 token（維持現況）。
- kind=sell：只允許 cron 或管理員（_verify_admin_email → uth._verify_admin）；收件人固定模組層 ALERT_EMAIL，不從 body email 取值；否則 403 {"error":"forbidden"}。
- ody.test：只允許管理員；收件人固定 ALERT_EMAIL；否則 403。
- _handle／sell／health／test／主流程與 _boss 回傳給呼叫端的 	raceback.format_exc() 改為 {"error":"internal error"}，避免 stack 洩漏。
- CORS Allow-Headers 移除 x-cron-secret（與實作一致）。
- 新增離線單元測試 	ests/test_alert_auth.py。

## 風險

- 低風險、可逆程式修補；**本任務未**設定線上環境變數、未部署、未 push、未碰資料庫／Auth／RLS／金鑰、未對線上發請求。
- 若線上尚未設定 CRON_SECRET，合併部署後既有依賴 x-vercel-cron 標頭的 cron／外部呼叫會失敗（預期行為）；必須先備妥下方設定再部署。
- 依賴 ody.email 指定 sell／test 收件人的呼叫會失效（改固定 ALERT_EMAIL）。

## 回滾

於本 worktree：git reset --hard 40492ced37403cb93c7f056d9eeebd8a1c21d68e（或刪除此 commit）。
若要移除整個 worktree：於主倉執行  
git worktree remove C:\Users\User\.codex\worktrees\sec-alert-auth  
後再刪分支 sec/alert-auth。

## 上線需要的設定清單（本任務未實際設定）

1. Vercel 專案環境變數必須設定 **CRON_SECRET**（足夠長度的隨機字串；Production／Preview 依需求）。
2. Vercel Cron 對應的 Job 會自動帶 Authorization: Bearer （與平台文件一致）；確認 cron 路徑仍指向 /api/alert（含 kind=sell 若適用）。
3. 若有外部／本機排程仍依賴 x-vercel-cron 或 x-cron-secret 標頭，改為改送 Authorization: Bearer <CRON_SECRET>。
4. 若有外部呼叫 sell／test 時在 body 帶任意 email，改為依賴伺服器端 ALERT_EMAIL（或另提方案經批准後再改）。
5. 確認 ALERT_EMAIL、RESEND_API_KEY、SUPABASE_SERVICE_KEY（cron 內部讀庫）仍正確；本任務不輪替金鑰。

## 測試

`
C:\Users\User\AppData\Local\Python\bin\python.exe -m unittest tests.test_alert_auth -v
`
（於 worktree root 執行；離線 mock，不打外網。）
