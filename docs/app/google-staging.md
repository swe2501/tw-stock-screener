# Google login: native staging

App membership page now uses a browser authorization-code PKCE flow against isolated staging Supabase ebwtkcsmpvgyjvosbofx. Exact App callback: academy-mobile://auth/callback. Google OAuth client redirect: https://ebwtkcsmpvgyjvosbofx.supabase.co/auth/v1/callback. These are different URLs for different legs of the flow.

Required external setup (not applied by this code): configure a Google Web OAuth client for staging, paste its Client ID/Secret into the staging Google provider, enable that provider, and allow the exact App callback in staging Supabase Auth redirect URLs. Never change production provider configuration. Credentials are entered by the user in provider dashboards; never commit a Google secret. Configure EXPO_PUBLIC_STAGING_SUPABASE_KEY with the staging public publishable key when building the App.

Access token stays in memory; only the refresh token is stored in Expo SecureStore with WHEN_UNLOCKED_THIS_DEVICE_ONLY. No provider tokens or user profiles persist. Launch/foreground restore rotates the refresh token, validates /user and saves the replacement. Network failures retain credentials for retry. Logout requests scope=local and deletes the local credential only after successful revocation; errors remain visible. No two-device policy changes.

The PKCE verifier lives only in the running login attempt. A terminated process cannot resume its OAuth callback: restart login instead. Callback scheme/host/path, code multiplicity and absence of token fragments are checked. Use a native development build; Expo Go cannot establish this custom scheme flow. Changing native plugins requires rebuilding. iOS/Android real-device cancellation, cold start, restore, refresh and logout remain required acceptance checks. Compilation is not an actual Google login test.

Validation: TypeScript, both platform exports and three isolated OAuth/session boundary tests passed. npm audit reports 22 dependency findings (15 high, 7 moderate); force fixes downgrade core frameworks and were not applied. Impact assessment below permits isolated internal APK testing, not a production release.

2026-10-18 dependency assessment: the three underlying advisories are braces recursive-pattern DoS, node-forge RSA verification and uuid v3/v5/v6 caller-buffer bounds. Android production source map (627 source entries) contains zero braces, node-forge, uuid or xcode sources. Its single @expo/cli entry is metro-require/require.js, not the affected dependency chains. xcode uses uuid.v4(), outside the reported affected algorithms. braces/node-forge advisories currently list no patched version; avoid speculative overrides. Use only trusted repository files in builds, no public Metro dev server and no OTA/signature-verification workflow in this test. Keep the lockfile pinned, revisit advisories before production and treat toolchain risks as still open. Sources: https://github.com/advisories/GHSA-vfj7-8cjw-p6xm, https://github.com/advisories/GHSA-86w9-cpqp-85rv, https://github.com/advisories/GHSA-w5hq-g745-h8pq.

## Email 登入（2026-10-18）
App 可直接對獨立測試 Supabase Auth 進行 Email／密碼登入、驗證 user、保留裝置安全儲存的 refresh token、恢復登入與只登出本裝置。密碼不持久保存，送出後清空輸入欄；錯誤密碼、未驗證信箱及頻率限制分別顯示訊息。Expo Go 預覽須設 EXPO_PUBLIC_EXPO_GO_PREVIEW=1 隱藏 Google 按鈕，因其無法測試自訂 scheme OAuth。測試環境 EXPO_PUBLIC_STAGING_SUPABASE_KEY 使用既有公開 key；不修改正式會員、資料表或 Vercel。

驗證：五項 auth 測試與 TypeScript 通過；公開 Auth settings 已確認 email=true、mailer_autoconfirm=false。尚待使用者在 iPhone 輸入已驗證的測試帳號完成真機登入／重開／登出驗收，不能以 mock 測試宣稱真機登入成功。網站既有會員尚未接入。
