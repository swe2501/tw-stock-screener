# AI Stock Screener — Claude 工作規則

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

### 協作（合夥人也 clone 此 repo 改版面）
- 合夥人不直接推 uat/prod：他從最新 uat 開自己的分支 `git fetch origin && git checkout -b <他的名字>-layout origin/uat`，改完 `git push origin <分支>` 並告知分支名。
- 收到後把他的分支合併進 Andrew（有衝突逐段比對、不整份覆蓋）→ 本機驗證 → 走 uat 流程。
- 他改版面前先問會動哪幾頁，避開同區塊。遠端 `Duke` 分支不是合夥人的，不要動。

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
