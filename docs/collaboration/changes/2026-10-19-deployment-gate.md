# UAT 部署額度閘門（待憑證與切換驗證）

目的：GitHub 判斷變更後才呼叫 Vercel。Ignored Build Step 仍計部署次數，不能解決額度問題。

已備妥：兩個 Vercel 設定排除 app/** 分支；GitHub 工作流對 uat 整次 push 比較（非單一 HEAD parent，使用 --no-renames 保留移出檔案），只選相關服務。App/docs 不部署；網站只部署網站；services/mobile-preview 只部署測試後端；共用與未知檔案保守部署兩者。初次或手動執行可補部署；比較失敗明確失敗，不默默略過。正式 prod 不由本工作流部署。

網站 UAT 與 App SDK/登入/API 介面不變，不修改資料庫、排程或正式站。CLI 固定官方 npm vercel@64.5.0，僅 uat 有執行入口，無 PR secrets，checkout 不留 Git credentials。

啟用順序（尚未執行）：
1. 明確授權建立 Vercel 部署 access token，限定 Andrew 團隊並設定到期日，保存於 swe2501/tw-stock-screener 的 VERCEL_DEPLOY_TOKEN Actions secret。Vercel token 權限可能涵蓋團隊其他操作，並非只有部署；不得放原始碼、公開 log 或聊天。
2. 設定 VERCEL_ORG_ID、VERCEL_WEB_PROJECT_ID、VERCEL_MOBILE_PROJECT_ID 三個非密鑰變數。
3. 手動驗證工作流可部署並檢查固定 UAT 網址、來源 SHA、登入與 API；接著將 uat 的原生 Git 自動部署停用，再開 VERCEL_FILTERED_UAT_ENABLED=true，避免雙重部署。正式 prod 流程維持原狀，後續另行驗收。
4. 驗證 App-only push 沒有任何 Vercel 新部署；web-only 與 backend-only 各一筆；共用兩筆。此項雲端驗證尚未完成，不能宣稱已解決額度。

部署失敗須在 GitHub 重跑失敗工作流或手動執行補部署；純 App push 不會代替失敗的網站發布。手動 workflow_dispatch 在預設分支 prod 的程式合併前可能不出現，應先用 UAT push 進行受控驗證，不擅自修改 prod。

回復：先關 VERCEL_FILTERED_UAT_ENABLED，再恢復 uat 原生 Git 部署，保留網站原網址與目前已上線版本。工作流目前只觀察 scope，部署開關預設未設，原 UAT 自動部署仍保留，避免未有憑證就中斷更新。

測試：test_deployment_scope.py 驗證獨立服務、全 push、刪除/改名、未知檔案、缺少基準、禁止 feature/prod 與比較失敗；真正遠端部署待憑證授權。
