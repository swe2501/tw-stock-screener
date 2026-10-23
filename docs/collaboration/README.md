# 網站與 App 共同開發入口

> 2026-10-23 使用者對本對話 Andrew 網站工作流程的持續授權：網站修正完成並通過相關測試後，直接同步最新 UAT、保留雙方修改、以非 force 推送 UAT，並確認 Vercel 部署結果，不必逐次等待「推 UAT」。此授權不包含 prod、資料庫／Auth、排程或付費服務，也不改變合夥人 JUSTY 的數字流程。

## JUSTY 的網站更新固定流程（使用者最新指定）

- **1**：在乾淨的本機 `justy-layout` 修改、預覽與測試，先不推送。
- **2**：提交已完成修改，先 push `justy-layout`；未完成 2 不進 3。
- **3**：fetch 最新 UAT，在隔離整合分支／worktree 合併已發布 JUSTY 與 UAT，保留雙方內容並檢查，再非 force push UAT；最後安全更新本機版本。
- **4**（2026-10-21 新增）：推送後再 fetch 最新 UAT，把本機與 `justy-layout` 對齊最新 UAT（只用 merge／fast-forward，保留雙方修改，不 reset／force），最後確認本機、`justy-layout`、UAT 三者 commit 一致並回報。若需同步遠端 `justy-layout`，只用非 force 推送；不得因 4 自行再發布 UAT／prod，或以 stash／覆蓋來強行對齊。
- **23／2、3**：依序完成 JUSTY push → 合併最新 UAT → UAT push → 本機版本確認。
- **234／2、3、4**：再加上第 4 步的最終對齊與版本核對。

這取代舊 `scripts/collab.py publish-justy` 一次同時推 JUSTY/UAT 的預設方式。該舊命令保留相容，但不再用於新的數字指令。沒有發布指令時先提供本機預覽。

本機有未提交修改、未發布提交或合併衝突時保留內容，不 stash/reset/force 或覆蓋。共用 API／資料庫在自己的 shared 分支與工作區準備；正式資料庫 migration 與活動啟用須另行明確批准。App、hot_topics、prod、Andrew、Duke 不在本流程範圍。遠端 push 不代表另一個 worktree 自動更新，也不代表 Vercel 部署成功，必須分別驗證並回報。

> **最新分工（2026-10-18）**：使用者取消本對話／JUSTY 的 App 開發動作，App 由合夥人接續。本網站工作區只繼續網站需求，不自動恢復 JUSTY 的 App 工作。既有 App 程式、共用規格與合夥人分支保留，不因取消個人工作而回退。下列 App 操作說明供接手人參考，不代表本對話仍有待執行的 App 任務。

2026-10-18：由 JUSTY 明確要求建立，目標是合夥人完成網站工作後可直接接續 App，共用同一個 GitHub 專案且不互相覆蓋。本文件是新 App 與日常協作的共同規則；不改變正式站必須另外取得發布授權的要求，也不適用 hot_topics 排程。

## 工作範圍與獨立工作區

| 範圍 | 位置 | 分支慣例 |
|---|---|---|
| 網站 | `apps/web/` | `web/<owner>/<task>`；既有 `justy-layout`、Andrew 工作流可繼續 |
| App | `apps/mobile/`、`tests/mobile/`、`docs/app/` | `app/<owner>/<task>` |
| 共用規則、API、資料格式 | `packages/shared/`、`api/`、`lib/` | `shared/<owner>/<task>` |

owner 是實際開發者／負責人的簡短代號，不能讓兩人共用一條功能分支。各自電腦的 clone 各自獨立；同一台電腦的兩個同時工作的對話必須使用不同 worktree。App 原始碼的專案內路徑永遠是 `apps/mobile`；worktree 只是整份專案的另一個工作副本。

由開發 AI 執行以下命令（依環境使用可用的 Python 執行檔；不要要求使用者處理工具細節）：

```sh
python scripts/collab.py start --lane app --owner justy --task foundation
```

它先確認沒有未完成修改、取得最新 `origin/uat`，再建立鄰近的獨立工作資料夾與 `app/justy/foundation` 分支；不切換或清空原網站工作區。若目錄或分支已存在就停止，由 AI 檢查並接續原工作，不能刪掉重建。

## 每次工作與整合

1. 讀本文件、根目錄工作規則及範圍內 AGENTS.md，先確認 `git status` 與目前分支。
2. 開始新工作前，在自己乾淨的工作分支執行 `python scripts/collab.py sync`。未提交變更先由 AI 確認並保存；工具不會自動 stash、reset 或丟棄。
3. App 功能分支不直接修改網站、Auth、API、資料庫或部署設定。需要調整時，另開 shared 分支，寫 [相容性變更說明](changes/README.md)。不要把不相關工作混在一起。
4. 提交自己這次的檔案，執行適當的網站／App 測試。適合審閱的工作提出指向 uat 的 PR；PR 說明標示影響平台與測試結果。
5. 有既有使用者授權直接整合 uat 時，可執行 `python scripts/collab.py integrate --publish-uat`。工具先取得並合併最新 uat，再檢查 API 12 支上限及分支範圍，最後用不帶 force 的 atomic push 同時更新自己的分支與 uat。
6. 如果對方在檢查期間推了新版，Git 拒絕過時的更新；重新 sync、檢查再試，不能 force。如果合併有衝突，保留 Git 衝突狀態，逐段整合；禁止 `-X ours/theirs` 或把整個舊檔複製蓋回去。

`integrate` 不加 `--publish-uat` 只同步與檢查。工具拒絕從 prod／uat／Andrew／Duke 或 detached HEAD 發布；這不是授權他人修改既有 Andrew／Duke 分支。既有網站開發者若仍採自己的 Andrew 流程，仍需合併最新 uat、驗證並正常推送，不能整份覆蓋。

## 自動檢查與邊界

`.github/workflows/collaboration-checks.yml` 在 uat 的 PR 與 push 執行 API 預算、協作工具回歸，以及 PR 功能分支的範圍檢查。PR 權限為唯讀，不使用會員／部署密鑰，不自動合併或發布 prod。

App 分支只允許 App 範圍；web 分支不能混入 App 程式；shared 分支的服務變更須附網站／App 相容性說明。既有分支名稱保留相容，逐步採新慣例。

**檢查工作流不等於 GitHub 強制分支保護。** 這次沒有更改 GitHub 管理端的 ruleset／required status checks，也沒有把 PR 設成強制門檻。若日後要強制所有 uat 更新都經 PR，須先確認兩位開發者均已切換流程並具備管理權限，再將 `collaboration-checks` 設為必要檢查；不能在合夥人工作中途突然阻擋既有流程。

## 資料、登入與同步

- 會員仍規劃使用原有 Supabase 身分，App 登入回呼另行設計；不可自動新建另一套正式會員、調整裝置限制或啟用簡訊。
- 目前 UAT 與正式站共用 Supabase。Git 分支不隔離資料庫；本次沒有建立測試資料庫、執行 migration 或修改 Auth 設定。
- 行情／研究等雲端資料可由網站與 App 共用服務讀取；只存在瀏覽器的草稿、聊天或偏好，必須另行設計保存與同步，不能宣稱已同步。
- API 保留相容路徑與欄位；舊版 App 尚未更新時仍須可用。新增非必要欄位優先，刪除／改名需版本與過渡安排。
- 私有算法與服務密鑰留在後端；App 安裝包、公開共用模組與網站 JavaScript 不能用來藏秘密。
- 不自動推 prod、不啟用收費服務、不改排程、不移除舊快照；正式發布與線上資料變更仍依使用者授權。

## 合夥人接手時只需提供這句話給開發 AI

> 請同步共同專案最新 uat，先讀 docs/collaboration/README.md，再依 AGENTS.md／CLAUDE.md 確認工作範圍。App 在 apps/mobile；用自己的獨立工作分支／worktree 接續，不動另一人的工作區。共用 API 或會員變更要附相容性說明，整合前合併最新 uat，遇衝突逐段處理，禁止 force／整份覆蓋，不推 prod。

規範依據：[Git 原生 worktree](https://git-scm.com/docs/git-worktree)、[Git push atomic 選項](https://git-scm.com/docs/git-push)、[GitHub 分支保護](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches)。本工具測試使用本機隔離 bare repositories，實測同時推送拒絕、重試保留雙方工作與衝突停止。
