# /deploy — 手動觸發部署

通常不需要手動呼叫這個指令，因為每次 commit 後會自動執行部署流程。
若自動流程中斷，可用此指令手動補跑。

## 執行步驟

1. `git push origin Andrew`（確保 Andrew 是最新的）
2. `git checkout uat && git merge Andrew && git push origin uat && git checkout Andrew`
3. 告知使用者：「已部署到 uat，請確認功能正常後告訴我，我再上 prod。」
4. **等使用者確認**
5. `git checkout prod && git merge Andrew && git push origin prod && git checkout Andrew`
6. 回報：「已部署到 prod（tw-stock-screener-neon.vercel.app），約 1 分鐘生效。」
