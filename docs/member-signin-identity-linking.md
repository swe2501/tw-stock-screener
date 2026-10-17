# 登入版面與同帳號綁定

2026-10-17：登入視窗採跟誰學現有 Logo、帳號密碼在前、社群入口在後；輸入框 18px 圓角、主要及社群按鈕膠囊形。滑光只作用在本站視窗外框，第三方 Logo 保持原樣。遵循 reduced-motion；主畫面依螢幕高度緊湊排列；額外內容必要時可捲動、一般登入 Esc／背景可關閉、Tab 留在視窗內。

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

手機登入與強制綁定的啟用狀態、API guard 與必要的資料庫權限部署見 [member-phone-rollout.md](member-phone-rollout.md)。目前正式強制尚未啟用。

## 聯絡資料更改與手機入口（2026-10-17）

已綁 Email／手機提供「更改 Email」／「更改手機」，沿用同帳號 authenticated contact-change 與驗證流程，不解除其他登入方式，不建立新會員。拒絕填入原本相同的聯絡方式；既有資料只在伺服器確認新聯絡方式後更新。

手機登入入口即使 SMS 尚未開通也可開啟獨立頁面，只顯示手機與傳送驗證碼步驟；發送按鈕依真實服務狀態停用並說明原因，不發假驗證碼。登入與安全也能預覽手機綁定／更改頁。

底部偶發橫向捲軸已重現：ma-auth-light 的 translateX(170%) 把裝飾 pseudo-element 推出卡片，438px 可視寬度變成 478px scrollWidth。動畫端點調整為 -20%～130%，滑光整段都在卡片範圍內；沒有以隱藏捲軸裁掉表單。測試涵蓋桌面、390px、320px 與動畫各時點。

## 密碼二次確認與已登入狀態修正

註冊與密碼重設頁加入確認密碼，必須一致才送出；新版 register API 同時檢查 password_confirm。登入與安全仍先寄設定密碼確認信，使用者由信件連回後輸入兩次新密碼，不直接跳過原有驗證。

已登入卻跳登入視窗的原因包括：本機靜態預覽沒有 /api/auth；目前共用登入 API 對 phone_policy 回 400「email and password required」（唯讀確認）。本機預覽改用既有登入服務位置。針對舊版 API 明確的 unknown action / email and password required 回應，視為該版本尚未部署手機 gate，維持既有會員入口；新版後端與 RLS 仍是授權依據，不因前端相容處理而放行被伺服器拒絕的操作。

503／網路失敗改顯示獨立可重試通知，不清登入資訊、不自動開登入視窗。若 Auth 明確回 401，才提示重新登入，仍由使用者按按鈕開啟。密碼 mismatch、正常登入、服務失敗重試與舊版 API 相容均有完整頁面測試。

## 統一閱讀與綁定管理

`assets/site-readability.css` 提供一般內文 16px、操作文字約 14～15px、輔助資料約 14px 的階層，表格與導覽依可用寬度換行，保留圖表繪圖座標及登入表單既有緊湊布局。搜尋橫列移除底部 20px margin、外框與陰影，接齊導覽。首頁選項減少 padding，已選導覽以柔和呼吸光提示；reduced-motion 停用動畫。

聯絡資料與綁定管理的 native dialog 使用 fixed/inset:0/margin:auto 置中，桌面及手機皆驗證。未開通 provider 仍可開啟狀態說明，不能假造授權。已綁社群帳號提供「更改綁定」：會員明確確認後才處理，先查 Auth 身分與另一個已驗證的可用登入方式，先預檢 manual linking 開通，再重新讀取同會員與相同 token，最後解除選定 identity 並導向新授權。只有一個可用入口、服務未開通或手動綁定未開通時，不解除原身分。取消新授權不復原舊綁定，操作前清楚說明可用其他已綁方式登入；會員 ID 與研究資料不變。未對真實會員執行 unlink 或 OAuth 更換。

官方身份更換限制：https://supabase.com/docs/guides/auth/auth-identity-linking

首頁外資成本只保留估算成本、盤別、價差與簡短基準資訊。未平倉口數與完整行情來源說明只在外資空單溫度計詳細頁建立 DOM，首頁不顯示；首頁卡片以內容高度排列，不再隨右側明細拉長。
