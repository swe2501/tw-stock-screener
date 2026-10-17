# 兩個登入工作階段上限

狀態：SQL 尚未套用，Auth Hook 尚未啟用。推送 UAT 程式不等於限制已生效。

以 Supabase 核發憑證前的 Custom Access Token Hook 控制 Google、LINE、Email、OTP 及 refresh。每位會員使用交易鎖序列化名額分配；不信任前端提供的裝置編號。兩個有效 Auth session 以外拒絕核發憑證，原兩個 session 可繼續更新。

同瀏覽器各分頁共用 session，算一台。不同瀏覽器或無痕視窗分開算。實際限制的是登入 session，不能辨識實體硬體或阻止複製 token。關閉瀏覽器不等於登出；access token 到期但仍可 refresh，也不會釋放名額。成功單台登出、Auth session 被撤銷或設定的絕對期限到期才釋放。未實作閒置逾時，不可聲稱離線幾分鐘就自動釋放。

啟用前先檢查 catalog 與既有 Auth Hook，不能覆蓋另一個 hook。經明確授權後執行 database/member-device-limit.sql 一次，新增一個 RLS 保護的名額表與僅 Auth 管理角色可呼叫的函式。沒有改 auth.sessions schema，沒有保存 token 或更動研究文件。然後在 Authentication > Hooks 選擇 public.member_device_limit_hook 作為 Custom Access Token Hook。

注意：UAT 與正式站共用 Supabase 專案 bruqrbvbjxntgoljxsne。啟用會同時影響兩站，必須取得此範圍的確認。既有帳號採最早兩個未過期 session；不刪除 Auth sessions，超出兩個的舊 token 在下次 refresh 才被拒絕，已發出的 JWT 仍可使用到其有效期限。部署不能承諾立即踢除既有第三台。

一般登出改為 scope=local，避免連另一台也一起登出。登出網路失敗會保留登入狀態並提示重試，不能假裝名額已釋放。UAT 的 Email／refresh／logout 改呼叫同源 /api/auth。

隔離驗證：tests/member-device-limit.test.cjs 測兩名額、第三台拒絕、原台 refresh、帳號隔離、登出／絕對期限釋放、claims 保留、匿名與會員不可直接存取。隔離測試無法代替 Auth 真實交易流程與並發驗收。

線上驗收須使用三個獨立瀏覽器 profile：前兩台成功、第三台含中文錯誤且拿不到 token；測同步第三台請求不超額、原兩台 refresh、單台登出後第三台可登入、多分頁不占新名額、Google／LINE／Email 各流程、原本機草稿保留。Auth Hook 啟用前必須確認現行託管版本的 hook 錯誤與 session 交易回滾行為。

回復方式：先停用此 Auth Hook，即解除新增登入限制；保留名額表供查核，不刪會員或 Auth session。此 SQL 為初次遷移，不可盲目重跑。

官方依據：https://supabase.com/docs/guides/auth/auth-hooks/custom-access-token-hook
