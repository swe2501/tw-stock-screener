# 網站與 App 共同開發入口

## JUSTY 的網站更新固定流程

JUSTY 已要求：以後由 AI 完成網站更新時，一起做「更新網站 → 同步 UAT／JUSTY → 更新本機資料夾」。使用者說「2、3」也代表同一流程，不必再讓使用者手動 pull。本機瀏覽器重新整理只會重讀本機檔案；遠端 push 本身不會更新另一個 worktree。

在自己的乾淨網站功能分支（`web/justy/...`）或 JUSTY 共用工具分支（`shared/justy/...`）提交完成的修改後，由 AI 執行：

```sh
python scripts/collab.py publish-justy
```

工具會先找到 Git 登記為 `justy-layout` 的本機工作區，檢查它沒有未提交修改或未發布提交；取得最新 UAT 和 JUSTY，逐段合併到自己的功能分支並執行既有檢查，再以不帶 force 的原子推送同步「自己的分支、UAT、justy-layout」。最後只在原本的本機 `justy-layout` 上做快轉更新，驗證檔案與發布版本一致，不切換其他工作區的分支。

- 本機有未完成工作：停止，不 stash/reset/覆蓋，不在此情況下推送。
- 合夥人剛推新版：原子推送全部拒絕，重新同步再檢查，保留雙方內容。
- 遠端成功後本機才有人開始修改：保留本機內容，明確回報「遠端已發布、本機同步未完成」，不能宣稱全部完成。
- App 與其他 owner 不得使用此命令，SDK 預覽分支仍與 UAT 分開。prod／Andrew／Duke 不變。

這是 AI 每次完成網站任務時的發布步驟，不是背景監看服務；不會在使用者未工作時輪詢 GitHub。同步後另確認正在使用的本機預覽網址服務正常；必要時啟動既有本機預覽，不重新設定正式站。

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
