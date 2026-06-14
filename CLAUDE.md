# AI Stock Screener — Claude 工作規則

## 部署流程（每次修改完畢後強制執行）

每當完成一次程式修改並 commit 到 Andrew 分支後，**必須自動執行以下部署流程，不需要使用者另外下指令**：

### 1. 確認 Andrew 已 push
```
git push origin Andrew
```

### 2. 部署到 uat
```
git checkout uat && git merge Andrew && git push origin uat && git checkout Andrew
```

### 3. 告知使用者確認 uat
回報：「已部署到 uat，請確認功能正常後告訴我，我再上 prod。」
**停在這裡，等使用者明確說 OK / 沒問題 / 上 prod。**

### 4. 使用者確認後，部署到 prod
```
git checkout prod && git merge Andrew && git push origin prod && git checkout Andrew
```
回報：「已部署到 prod（tw-stock-screener-neon.vercel.app），約 1 分鐘生效。」

## 注意事項
- **絕對不要跳過 uat 直接上 prod**，除非使用者明確說「直接上 prod」
- merge 完永遠回到 Andrew 分支
- 若 merge 發生 conflict，立即告知使用者，不要自行強制解決

## 專案資訊
- Repo：swe2501/tw-stock-screener
- 分支：Andrew（開發）→ uat（測試）→ prod（Vercel 正式環境）
- 正式網址：tw-stock-screener-neon.vercel.app
