# Deploy AI Stock Screener

這個指令會將 AI_stock 專案的最新變更部署到 uat，確認沒問題後再部署到 prod。

## 標準部署流程

執行以下步驟，每一步都要確認成功才繼續：

### Step 1 — 確認 Andrew 分支狀態
```
git status
git log Andrew --oneline -3
```
- 若有未 commit 的變更，先詢問使用者要一起 commit 還是單獨處理
- 若 Andrew 尚未 push，先 push：`git push origin Andrew`

### Step 2 — 部署到 uat
```
git checkout uat
git merge Andrew
git push origin uat
git checkout Andrew
```
- Push 成功後，告知使用者「已部署到 uat，請確認功能正常」
- **等使用者確認 uat 沒問題**，再繼續 Step 3

### Step 3 — 確認 Vercel uat 部署完成（選做）
如果使用者要求確認部署狀態，可以透過 GitHub Deployments API 檢查：
```
gh api repos/swe2501/tw-stock-screener/deployments --jq ".[0] | {sha, environment, created_at}"
```

### Step 4 — 部署到 prod
收到使用者確認後：
```
git checkout prod
git merge Andrew
git push origin prod
git checkout Andrew
```
- Push 成功後回報：「已部署到 prod (tw-stock-screener-neon.vercel.app)，Vercel 約 1 分鐘內生效」

## 注意事項
- **永遠不要跳過 uat，直接 merge 到 prod**（除非使用者明確說「直接上 prod」）
- merge 策略使用 fast-forward（目前分支是線性歷史，不需要 merge commit）
- 部署完成後回到 Andrew 分支
- 若 merge 發生 conflict，立即告知使用者，不要自行強制解決
