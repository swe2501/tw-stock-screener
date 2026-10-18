# App 開發車道

- 先讀根目錄工作規則與 docs/collaboration/README.md；hot_topics 自動任務不得因此取得 App 開發權限。
- 本車道使用 `app/<owner>/<task>` 分支與自己的工作目錄，可改 apps/mobile、tests/mobile、docs/app。
- 初期網站仍在積極開發；App 分支不可順手修改根 index.html、assets、api、lib、vercel.json、Auth、資料庫或排程。需要共用調整時另開 shared 分支並寫相容性紀錄。
- iPhone 與 Android 同步設計，iPad 依寬度調整，驗證直向／橫向／分割視窗與字體放大；不可只把手機介面等比例放大。
- 金鑰／私人算法不能打包進 App。沿用既有會員身分，但原生登入回呼、憑證安全保存與同步要正式設計、分別測試。
- 不替使用者啟用付費建置、簡訊、AI 或商店帳號。不自動修改共享 Supabase，測試用隔離資料。
- 同步前先保存自己確定的改動；合併保留雙方內容。不要切換另一個工作目錄的分支，不 force／reset／整份覆蓋。
- 使用既有協作工具與檢查；發布到 uat 的既有授權不包含 prod、上架商店或遠端資料異動。
