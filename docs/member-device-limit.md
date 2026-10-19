# 兩個登入工作階段上限

目前狀態（2026-10-18 事故處置）：共用專案 bruqrbvbjxntgoljxsne 的 Custom Access Token Hook 已停用，管理頁確認 Disabled；使用者已在原先被擋的裝置重試並明確回覆「已可以登入」。UAT 與正式站目前均不執行兩台限制。不要重新啟用原函式。

原因與證據：初次遷移依 created_at 選每個帳號最早兩筆 auth.sessions 直接占名額，無法代表目前使用的兩個瀏覽器。線上僅讀彙總確認 14 筆保留名額皆對應一天以前仍存在的 Auth session，沒有讀取或輸出 token。若使用者登出的是另一筆較新的 session，這些舊名額不受影響。這是可重現的啟用設計缺陷；尚未取得各裝置請求紀錄，不能斷言每次登出都因同一原因失敗。

修復候選（尚未套用）：database/member-device-limit-recovery.sql 保留舊名額歷史、增加 policy_epoch 與預設 false 的政策開關。新政策只計實際核發時登記到該 epoch 的 session，不從歷史 Auth sessions 預占名額；停用不分配名額。需要 Dashboard Hook 與資料庫政策雙重明確啟用。tests/member-device-limit.test.cjs 已加入兩筆舊 Auth session 的既有帳號 fixture，驗證舊版 bootstrap 的占位、修正版預設不阻擋、不新增名額、前兩筆實際登入可用、第三筆拒絕、登出釋放後可重試、權限隔離。這仍不是三個獨立瀏覽器的真實 Auth 驗收，不可因此重新啟用。

前次啟用紀錄：2026-10-18 使用者明確同意後，初次 SQL 套用至共用專案並啟用 Hook。以下為當時驗證紀錄，保留供追查，不代表目前仍啟用。

線上驗證：既有物件預檢為 NULL，確認沒有既有 Auth Hook 後才建立。可回滾 SQL 測試通過前兩名額放行、第三名額拒絕、原 session 重用、刪除測試 Auth session 後釋放名額；所有測試資料 ROLLBACK。SQL Editor 不允許 SET ROLE supabase_auth_admin，因此未假稱完成此角色的實際執行測試。Catalog 確認 RLS 已啟用、Auth 角色具有函式與表權限、authenticated/anon 無直接執行權限、所有帳號名額均未超過二個。驗證查詢：https://supabase.com/dashboard/project/bruqrbvbjxntgoljxsne/sql/460934de-d330-4ddb-b886-c7608333e03a 。啟用後以既有瀏覽器登入進入 UAT 會員總覽，會員資料仍可讀取。

尚未完成：三個獨立瀏覽器的實際 OAuth／Email 登入與並發核發測試，不能以 SQL 測試替代。單台登出修正已推 UAT；正式站前端與 API 的版本未在本次推送 prod，需經既有正式發布流程帶入；舊版正式站的登出仍可能登出全部裝置。

以 Supabase 核發憑證前的 Custom Access Token Hook 控制 Google、LINE、Email、OTP 及 refresh。每位會員使用交易鎖序列化名額分配；不信任前端提供的裝置編號。兩個有效 Auth session 以外拒絕核發憑證，原兩個 session 可繼續更新。

同瀏覽器各分頁共用 session，算一台。不同瀏覽器或無痕視窗分開算。實際限制的是登入 session，不能辨識實體硬體或阻止複製 token。關閉瀏覽器不等於登出；access token 到期但仍可 refresh，也不會釋放名額。成功單台登出、Auth session 被撤銷或設定的絕對期限到期才釋放。未實作閒置逾時，不可聲稱離線幾分鐘就自動釋放。

啟用前先檢查 catalog 與既有 Auth Hook，不能覆蓋另一個 hook。經明確授權後執行 database/member-device-limit.sql 一次，新增一個 RLS 保護的名額表與僅 Auth 管理角色可呼叫的函式。沒有改 auth.sessions schema，沒有保存 token 或更動研究文件。然後在 Authentication > Hooks 選擇 public.member_device_limit_hook 作為 Custom Access Token Hook。

注意：UAT 與正式站共用 Supabase 專案 bruqrbvbjxntgoljxsne。啟用會同時影響兩站，必須取得此範圍的確認。既有帳號採最早兩個未過期 session；不刪除 Auth sessions，超出兩個的舊 token 在下次 refresh 才被拒絕，已發出的 JWT 仍可使用到其有效期限。部署不能承諾立即踢除既有第三台。

一般登出改為 scope=local，避免連另一台也一起登出。登出網路失敗會保留登入狀態並提示重試，不能假裝名額已釋放。UAT 的 Email／refresh／logout 改呼叫同源 /api/auth。

隔離驗證：tests/member-device-limit.test.cjs 測兩名額、第三台拒絕、原台 refresh、帳號隔離、登出／絕對期限釋放、claims 保留、匿名與會員不可直接存取。隔離測試無法代替 Auth 真實交易流程與並發驗收。

線上驗收須使用三個獨立瀏覽器 profile：前兩台成功、第三台含中文錯誤且拿不到 token；測同步第三台請求不超額、原兩台 refresh、單台登出後第三台可登入、多分頁不占新名額、Google／LINE／Email 各流程、原本機草稿保留。Auth Hook 啟用前必須確認現行託管版本的 hook 錯誤與 session 交易回滾行為。

回復方式：先停用此 Auth Hook，即解除新增登入限制；保留名額表供查核，不刪會員或 Auth session。此 SQL 為初次遷移，不可盲目重跑。

官方依據：https://supabase.com/docs/guides/auth/auth-hooks/custom-access-token-hook
