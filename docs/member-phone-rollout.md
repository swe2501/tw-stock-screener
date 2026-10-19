# 手機登入與必綁手機上線交接

本次程式可測試的流程已實作；**正式 SMS 與全站資料層強制綁定尚未啟用**。

## 目前完成

- 同一視窗以 Email、Google、LINE、電話作為入口；電話表單取代帳密內容，不往下附加。
- 1366×768、390×844、375×667 的登入與註冊主畫面可完整呈現。放大字級、鍵盤開啟、邀請碼展開、錯誤訊息變長或極矮螢幕仍保留捲動，不能用 overflow:hidden 裁掉功能。
- 手機登入：`/auth/v1/otp` 發簡訊，再用 `sms` 驗證；未驗證或不符合原號碼的 Auth user 不接受 session。
- 其他方式的既有會員補綁手機：authenticated `PUT /auth/v1/user`，再用 `phone_change` 驗證。不呼叫建立新會員的 `/otp`。驗證前後檢查同一個 Auth user ID，保留原帳號資料。
- 已存在於其他會員的手機依 Auth 的 phone_exists 拒絕，不自動合併不同會員資料；需先證明兩個帳號的所有權並由管理流程處理。
- 未綁定的啟用狀態無法按背景／Esc／X 略過；可「登出並返回首頁」。所有會員入口與雲端客戶端會檢查 gate，權限仍以後端為準。
- `/api/auth` 新增 `action=phone_policy`，不增加 Function。伺服器開關 `MEMBER_REQUIRE_VERIFIED_PHONE=1`。
- API 的 watchlist、broker_watch、vol_notify、使用者 alert、strategy_assistant 以共用 `lib/member_phone.py` 向 Auth `/user` 查詢。忽略客戶端及 user_metadata 宣稱的 phone_verified；必須有 phone 與 phone_confirmed_at。逾時失敗關閉，不通過。既有排程／服務帳號路徑保留原授權方式。
- 登入／refresh 回應保留 phone 與 phone_confirmed_at；不變更 Auth 的密碼、Email／OAuth 認證規則。

## 正式上線前必要工作（本次沒有執行）

1. 在 Supabase Auth 啟用 Phone 與 SMS 供應商、模板、驗證碼有效期、服務端發送速率限制與 CAPTCHA。SMS 可能產生供應商費用；目前沒有建立供應商帳號、付款、發真實簡訊或更改遠端 Auth 設定。
2. 先完成同一會員的真機簡訊測試、不同會員重複電話測試、既有 Email/Google/LINE 回歸。
3. **資料庫 RLS / RPC / Storage 必須先部署手機驗證限制**。會員資料多數直接從瀏覽器存取 Supabase；只改網站與 Vercel API 不足以阻擋直接 REST 呼叫。因此目前不宣稱已完成全站後端強制。
   - 盤點 watchlist、broker_watchlist、會員研究／文件／圖片、回饋、點數、禮遇、推薦人等私人表／RPC 與 member-avatars 等 Storage。
   - 新增僅回傳本人是否有已確認手機的安全函式：比對 auth.uid() 與 auth.users 的 phone / phone_confirmed_at，固定 search_path，不接受任意會員 ID，不暴露 auth.users 資料。
   - 私人表以 restrictive policies 同時限制 USING 與 WITH CHECK，保留原 owner 條件；避免新增 permissive policy 以 OR 意外繞過原限制。Storage 對本人資料同樣生效。
   - Security-definer RPC 必須在函式內檢查，不能假設 RLS 會保護 bypass-RLS 的函式；公開市場資料與 Auth 綁手機流程不可一併封鎖。
   - 直接 REST/RPC/Storage 測試：未綁手機與偽造 metadata 均拒絕、已驗證本人成功、已驗證其他會員仍拒絕；公開資料與排程不受影響。
   - 依專案 AGENTS.md 不直接改遠端 Supabase schema；以上需由資料庫負責人確認盤點與部署。
4. 最後才在伺服器設定 MEMBER_REQUIRE_VERIFIED_PHONE=1 並重新部署。前後端讀同一個後端 policy，避免簡訊未開通就鎖住所有會員。不要只修改前端旗標。
5. 回滾需同步處理上述 policy / RPC 與伺服器開關；不能只關網站提示。

手機補綁定不是 MFA，也不能防止所有多帳號或 SIM 換卡風險。

## 驗證

- `node --test tests/member-identity.test.cjs`
- `node tests/member-phone-gate.browser.cjs`：隔離完整頁面，無真實簡訊；無捲軸主畫面、OTP、倒數、改號、不能略過、同帳號補綁定。
- `node tests/member-signin-security.browser.cjs`
- `python -m unittest discover -s tests -p test_member_phone.py`
- `python scripts/check_api_budget.py`

官方參考：https://supabase.com/docs/guides/auth/phone-login 、https://supabase.com/docs/guides/database/postgres/row-level-security
