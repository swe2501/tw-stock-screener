# 登入版面與同帳號綁定

2026-10-17：登入視窗採跟誰學現有 Logo、帳號密碼在前、社群入口在後；輸入框 18px 圓角、主要及社群按鈕膠囊形。滑光只作用在本站視窗外框，第三方 Logo 保持原樣。遵循 reduced-motion；視窗可捲動、Esc／背景可關閉、Tab 留在視窗內。

## 真實開通狀態

公開 `/auth/v1/settings` 唯讀檢查：Email、Google 開啟，Apple、Facebook、Phone 關閉。LINE 沿用最新 uat 已驗證的 `custom:line-web` 設定，公共 settings 不會列出 custom provider，不要據此錯誤停用它。未開通的供應商有圖示及明確停用狀態；不建立假授權成功狀態。

`member-provider-icons.js` 共用原廠圖形，來源見 `assets/auth-brands/README.md`。Email 和手機用原創通用線條圖示。

## 綁定流程

- OAuth 新增登入方式：必須先登入原會員，以目前 token 呼叫 `GET /auth/v1/user/identities/authorize`。帶 PKCE、`skip_http_redirect=true`，再導向伺服器回傳的 HTTPS 授權網址。
- sessionStorage 暫存這次操作的 `intent=link`、由 Auth 驗證的原會員 ID、PKCE verifier、10 分鐘期限和 `#member/security` 返回位置；不含 provider secret。
- 回呼在換取／接受新 session 前後分別檢查本機會員與 Auth 驗證的會員 ID；不符時保留原帳號，不默默切換帳號。綁定完成後重新讀取伺服器 profile，再更新狀態。
- 手機／信箱補綁定：authenticated `PUT /auth/v1/user`，再使用 `phone_change`／`email_change` 驗證碼。**不使用建立帳號的 OTP 登入路徑**。新舊信箱雙重驗證仍依伺服器設定執行。
- 已驗證 Email 可寄送登入密碼設定信；未驗證 Email 可重送驗證信。只有伺服器確認後才顯示已綁定。

OAuth 手動綁定還需要 Supabase Auth 開啟 **Allow manual linking**。未用真實會員執行授權，不能宣稱正式環境手動綁定已經實測成功。若未開啟，伺服器回傳 `manual_linking_disabled`，前端顯示需要管理員開通，不改走註冊／新建會員。此改版不修改專案認證設定、不改 SQL／資料庫、不新增部署 API（維持 12/12）。

## 驗證

- `node --test tests/member-identity.test.cjs`：PKCE、原會員回呼、身分不符拒絕、manual linking 失敗清理、authenticated 手機補綁、驗證結果以伺服器為準。
- `tests/member-signin-security.browser.cjs`：完整 index 與真實模組、隔離假的 Auth／郵件／簡訊／provider，檢查 Logo、排序、320/390px、深淺色、reduced-motion、綁定回呼、手機驗證後更新、設定密碼信。
- 會員控制列與完整交易表單回歸通過。沒有對真實帳號新增綁定，沒有寄出真實簡訊或驗證信。

官方依據：
- https://supabase.com/docs/guides/auth/auth-identity-linking
- https://github.com/supabase/auth-js/blob/master/src/GoTrueClient.ts （linkIdentityOAuth）
- https://supabase.com/docs/guides/auth/phone-login （phone_change）
- https://developers.google.com/identity/branding-guidelines
- https://developer.apple.com/design/human-interface-guidelines/sign-in-with-apple/
- https://developers.line.biz/en/docs/line-login/login-button/
