# AI Stock Screener — Claude 工作規則

> **網站／App 接手入口（2026-10-18）**：[docs/collaboration/README.md](docs/collaboration/README.md)。先確認目前工作目錄與分支。原網站可保留 Andrew 工作流程；新 App 放 `apps/mobile`，在自己的 `app/<owner>/<task>` 分支與 worktree 開發。App 分支不要套用下方 Andrew 的自動部署指令，也不要切換原網站工作區。共用 API／規則另開 shared 分支並附相容性紀錄。uat 整合先取得並 merge 最新遠端；不 force、不整份覆蓋、不清空未提交工作。此協作設定不授權修改共享資料庫、登入設定、排程、付費服務或 prod。

## 部署流程（每次修改完畢後強制執行）

每當完成一次程式修改並 commit 到 Andrew 分支後，**必須自動執行以下部署流程，不需要使用者另外下指令**：

### 1. 確認 Andrew 已 push
```
git push origin Andrew
```

### 2. 部署到 uat（2026-09-28 起一律 git merge，禁止複製 index.html 覆蓋；在 uat worktree 操作，路徑見 HANDOFF.md §2）
```
cd <uat_wt> && git fetch origin && git checkout --detach origin/uat && git merge --no-ff origin/Andrew -m "merge Andrew → uat: <摘要>" && git push origin HEAD:uat
```
- 有衝突：停下來告知使用者衝突檔與兩邊差異，不自行 --ours/--theirs 整份覆蓋。

### 協作（網站與 App 可並行開發）
- 共同規範以 docs/collaboration/README.md 為準。justy-layout 既有 uat 整合授權保留，不要求合夥人把所有修改先交回 Andrew。
- 各自使用獨立 clone／worktree 與功能分支。App 車道、網站車道與共用變更分開；不能在另一人開著的工作目錄切分支。
- 在自己的乾淨功能分支可使用 `python scripts/collab.py integrate --publish-uat`，先合併最新 uat、檢查，再以 atomic 非 force push 整合；此工具拒絕從 Andrew／Duke／prod／uat 直接執行。
- 既有 Andrew 網站工作由原負責人維持，仍需在獨立 uat worktree 合併最新 origin/uat，禁止複製檔案覆蓋。有衝突逐段處理；不可強制採整份 ours/theirs。

### 3. 告知使用者確認 uat
回報：「已部署到 uat，請確認功能正常後告訴我，我再上 prod。」
**停在這裡，等使用者明確說 OK / 沒問題 / 上 prod。**

### 4. 使用者確認後，部署到 prod
```
cd <prod_wt> && git fetch origin && git reset --hard origin/prod && git checkout origin/uat -- . && git checkout HEAD -- .github && git commit -m "prod: <摘要>" && git push origin HEAD:prod
```
- prod＝已確認的 uat 快照；保留 prod 專屬 `.github/`（雲端排程）。
回報：「已部署到 prod（tw-stock-screener-neon.vercel.app），約 1 分鐘生效。」

## 注意事項
- **絕對不要跳過 uat 直接上 prod**，除非使用者明確說「直接上 prod」
- 主工作區永遠留在 Andrew 分支（uat/prod 在各自 worktree 操作）
- 若 merge 發生 conflict，立即告知使用者，不要自行強制解決

## 專案資訊
- Repo：swe2501/tw-stock-screener
- 分支：Andrew（開發）→ uat（測試）→ prod（Vercel 正式環境）
- 正式網址：tw-stock-screener-neon.vercel.app
