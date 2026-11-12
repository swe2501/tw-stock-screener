# JUSTY 舊分支整理（2026-11-12）

使用者要求整理指定的 17 條分支，不影響網站營運。本次只有 Git 引用清理與本文件，沒有網站程式修改、部署、資料庫或排程操作。

## 判定與備份

- fetch 最新遠端後，17 條均為 `origin/uat` 的祖先，沒有尚未合併 UAT 的提交。
- GitHub 開啟中的 PR 搜尋只回傳一個無關的 Cursor runner PR；本次未操作該 PR 或分支。
- 已先建立並通過 `git bundle verify` 的完整歷史備份：`C:/Users/JUSTY LIN/Documents/Codex/branch-archives/2026-11-12-justy/merged-website-branches.bundle`。
- 同目錄 `branches.json` 記錄 15 條原分支與完整 SHA；`protected-refs-before.txt` 記錄保護引用。
- 刪除前再次比對遠端 SHA 未變動，以 atomic delete 刪除下列 15 條遠端引用，未使用 force。

## 已刪遠端舊分支

```text
shared/justy/forum-ads
shared/justy/local-publish
shared/justy/member-learning-verification
shared/justy/zhenming6
shared/justy/zhenming89
web/justy/flow-step4
web/justy/focus-themes
web/justy/index-search-uat-20261106
web/justy/market-charts-uat-20261105
web/justy/member-perks-handoff
web/justy/member-perks-live
web/justy/member-perks-screen-log
web/justy/member-uat
web/justy/owl-brand
web/justy/strategy-studio
```

其中 `forum-ads`、`zhenming6`、`zhenming89`、兩條 index／market chart 整合分支、`member-uat` 沒有直接的 prod 祖先關係；僅確認已合併 UAT，不宣稱功能已完整發布正式站。刪除引用不移除 UAT 已有程式，也不推送 prod。

本機以 `git branch -d` 額外移除未被 worktree 使用的 `shared/justy/member-learning-verification`、`web/justy/index-search-uat-20261106`、`web/justy/market-charts-uat-20261105`。

## 保留與 agent 接手規則

- `app/justy/foundation`、`shared/justy/app-market-data` 屬 App 基礎／共用行情，保留給 App 接手者。另有未列入本次整理的 `app/justy/expo-preview-ui`，未操作。
- `shared/justy/local-publish`、`web/justy/member-perks-live`、`web/justy/member-uat`、`web/justy/owl-brand` 仍有本機 worktree 使用，所以只刪遠端舊引用，保留本機分支及完整資料夾。此次查核這些工作區乾淨，但不代表其他對話已結束，不 detach／刪目錄。
- 上述保留的舊 worktree 應視為歷史工作區，**新任務不要從舊提交直接開工／重推舊分支**。先讀協作規範，確認工作區乾淨，從最新 UAT 建立新任務分支；網站仍依 JUSTY 的數字發布流程。
- 其他未列出的本機分支／worktree 保留，不能推定都可刪。
- 主工作區 `justy-layout` 位於 `d76b0cc`，比遠端 `2543566` 多一個論壇新功能提交，且有先前雲端套用交接文件的未提交更新。本次完整保留，沒有 stash／reset／merge／push 主分支。

## 整理後保護引用核對

遠端 `ls-remote` 實際讀回與整理前一致：

| 引用 | 提交 |
|---|---|
| uat | `84415675fa580ff7a99a532a4df5b79222714e1b` |
| prod | `0129643adff0a1bead167c378c277ba45cb41bf7` |
| justy-layout | `2543566de0b8cf076263b3f02b6f933a2e72e58b` |

未修改 Vercel 設定；未逐一驗證舊分支的歷史預覽網址。若仍有人將舊分支預覽當固定入口，應改用 UAT／正式入口。

## 如需還原某條舊分支

依 `branches.json` 選定分支及 SHA，可從 bundle fetch 該精確引用到臨時還原分支。先確認同名遠端沒有重新建立，經確認後才非 force 推送還原；不批次復活全部舊分支。完整提交仍在 UAT 與 bundle，沒有刪除程式歷史。
