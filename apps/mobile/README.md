# 跟誰學原生 App

React Native + Expo SDK 58 / TypeScript。iOS、Android 共用原生介面；iPad 依視窗寬度切換並排卡片，支援深淺色與系統字體縮放。

在本目錄執行 npm ci，再執行 npm start。npm run typecheck 檢查型別；npm run export:native 產生兩平台 JS bundles。這不是 IPA/APK，也不等於實機驗收或上架完成。

目前：原生總覽、底部四分頁、新聞／題材搜尋，透過 packages/shared/news-api 使用既有公開 API。資料預設來自 UAT，可用 .env.example 的 EXPO_PUBLIC_API_BASE_URL 指定 HTTPS 服務根網址。搜尋明示載入、空結果、部分來源失敗、逾時與原始來源連結；不附會員 token。

會員登入、自選同步、原生 K 圖與集團詳情尚未接通，介面明示開發狀態。Google／LINE 原生回呼與安全憑證保存需另行驗收；本次不更改 Supabase 或兩台限制。集團研究與會員中心暫由使用者明確點擊後開啟網站，不偽裝為原生功能。

Vercel 只部署網站與共用 API。手機用 Expo 本機工具／EAS 另行建置，再分別送 Apple／Google 商店。eas.json 只準備建置 profile，尚未設定 EAS 專案、商店 bundle ID、簽章、正式圖示或帳號，不會自動啟用付費建置或上架。

先讀本目錄 AGENTS.md 與 docs/collaboration/README.md；共用調整另走 shared 分支。不要在此複製網站原始碼或加入管理金鑰。
