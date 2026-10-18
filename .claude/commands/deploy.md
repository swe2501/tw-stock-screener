# /deploy — 手動觸發部署

> 2026-10-18：先讀 docs/collaboration/README.md。以下只供原負責人的既有 Andrew 網站流程；App／其他開發分支使用自己的 worktree 與 `scripts/collab.py integrate --publish-uat`，不切換別人的工作目錄。整合先 fetch／merge 最新 uat；有衝突保留雙方工作並停止發布，禁止 force／整份覆蓋。正式站必須取得明確「推 prod」授權。

通常不需要手動呼叫這個指令，因為每次 commit 後會自動執行部署流程。
若自動流程中斷，可用此指令手動補跑。

## 執行步驟

1. `git push origin Andrew`（確保 Andrew 是最新的）
2. 在獨立 uat worktree 先 `git fetch origin`，以最新 `origin/uat` 為基底正常 merge 自己已提交的網站分支，檢查後正常 push。遠端有新提交則重新同步，禁止強制推送；不要在另一人的工作目錄 checkout。
3. 告知使用者：「已部署到 uat，請確認功能正常後告訴我，我再上 prod。」
4. **等使用者確認**
5. 僅在使用者明確授權「推 prod」後，依 CLAUDE.md／HANDOFF.md 的獨立正式部署流程發布已確認的 uat。
6. 回報：「已部署到 prod（tw-stock-screener-neon.vercel.app），約 1 分鐘生效。」
