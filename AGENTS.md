# AGENTS.md — 本 repo 的 AI agent 分工規範

> **JUSTY 最新數字流程（使用者於 2026-10-18 明確更改）**：1＝在乾淨的本機 `justy-layout` 修改、預覽與測試，先不推送。2＝提交並先 push `justy-layout`。3＝取得最新 UAT、合併保留雙方內容、檢查後再 push UAT，最後確認本機一致。「23／2、3」依序執行 2 再 3，每一步成功才繼續。這取代舊 `publish-justy` 同時推 JUSTY/UAT 的流程；未收到發布指令時先做本機預覽。禁止 force/stash/reset/覆蓋未完成工作，不動 App、prod、Andrew、Duke 或其他人的工作區。共用 API／資料庫規則另走獨立 shared 工作分支，準備不等於批准修改共用正式資料庫。

> **2026-10-18 使用者最新分工**：JUSTY 已取消本對話的手機 App 開發，交由合夥人接手。本網站工作區後續專注網站修正，不繼續建立／建置／發布 JUSTY 的 App。保留合夥人已有的 `apps/mobile`、共用規格與分支；取消個人任務不等於回退共同專案或刪除合夥人成果。原根目錄 `index.html` 僅作本機相容轉接，網站唯一原始碼仍在 `apps/web/index.html`。

> **2026-10-18 人工指定的網站／App 協作設定**：先讀 [docs/collaboration/README.md](docs/collaboration/README.md)。使用者已要求在同一專案建立 App 協作骨架；App 位於 `apps/mobile`，使用獨立工作分支／worktree。此規則適用人工指定開發，**不擴張 hot_topics 自動排程的權限**。保留既有網站分支；整合前先合併最新 uat，禁止 force、整份覆蓋、清空未完成工作或動另一人的工作區。新工具見 `scripts/collab.py`；不自行推 prod、變更 Auth／資料庫或啟用付費服務。

> **先判斷你在做哪一種任務：**
> - 若你正在執行「**話題族群 hot_topics 排程**」（網搜新聞 → 產 `scripts/hot_topics.json`）→ 適用下方「Codex 的唯一任務」，**禁止任何 Git 操作**。
> - 若你是在**合夥人的電腦**、由合夥人本人要求**修改版面／開自己的分支** → 下方 Git 禁令**不適用**，改依本檔最後的「**合夥人協作規範**」：可以從 uat 開自己的分支、commit、push 自己的分支，**也可以把自己的分支合併並推送到 `uat`**（但仍不可碰 `prod`／`Andrew`）。

本專案由兩個 AI agent 共用，**各有車道，不得越界**。

| Agent | 負責 | 讀哪份規範 |
|---|---|---|
| **Claude Code** | app 程式碼(index.html / api/*.py / scripts/*)、git 分支與 commit、uat/prod 部署、資料庫 schema | 其記憶系統 |
| **Codex（本檔對象）** | 只做 **P1 話題族群管線**：搜新聞 → 產 `hot_topics.json` → 上傳 | **本 AGENTS.md** |

---

## Codex 的唯一任務

依照 `scripts/codex_hot_topics.md` 執行：網搜台股話題族群 → 產出 `scripts/hot_topics.json` → 執行
`python scripts/upload_hot_topics.py` 上傳到 Supabase `hot_topics` 表。就這樣，不做別的。

### ✅ 允許
- 網路搜尋新聞、題材、展覽資訊。
- **只**寫入 `scripts/hot_topics.json`（此檔在 .gitignore，不進版控）。
- 執行 `python scripts/upload_hot_topics.py`。
- 讀取 `scripts/tw_listed_codes.json`、`scripts/codex_hot_topics.md` 作為參考。

### ⛔ 禁止（會破壞另一個 agent 的工作）
- **禁止修改任何其他檔案**：`index.html`、`api/*`、其他 `scripts/*.py`、`.bat`、`.env.local` 等一律不准動。
- **禁止任何 git 操作**：不 `add`／`commit`／`push`／切分支／merge。git 與部署一律由 Claude Code 負責。
- **禁止部署**、禁止碰 uat / prod。
- **禁止改動 `hot_topics` 以外的任何 Supabase 表**。
- 禁止改排程（Windows Task Scheduler / `run_daily_job.bat` / `run_rankings_weekly.bat`）。

## 防幻覺鐵則（產 hot_topics.json 時）
- 每則話題**必附至少一個真實新聞 `source_urls`**；沒來源就不要放。
- `codes` **只能用 `scripts/tw_listed_codes.json` 裡的代號**，名稱以該檔為準；**絕不自編 ticker**。
- 只陳述新聞內容，**不預測、不給投資建議**。寧缺勿濫，一次 5~15 個族群即可。

## 若你（Codex）覺得需要改程式或改上傳邏輯
**停手，交給 Claude Code / 使用者處理**，不要自己動手改，以免與另一個 agent 的變更互相覆蓋。

---

## 合夥人協作規範（2026-09-29 新增；與上方「話題族群排程」是不同任務）

上方的 Git 禁令**只適用於本機每小時跑的「話題族群 hot_topics」排程任務**。
若你是在**合夥人自己的電腦 clone**、由合夥人本人明確指示「修改版面／程式並開分支」，改適用本段：

### ✅ 允許（僅限合夥人明確指示時）
- 從最新 uat 開**自己的分支**：`git fetch origin && git checkout -b <合夥人名字>-layout origin/uat`
- 在該分支修改 `index.html` 等檔案、`git add`／`git commit`。
- 推送到**自己的分支**：`git push origin <合夥人名字>-layout`，並告知使用者分支名稱。
- **（2026-10-08 更新：開放合併／推送到 `uat`）** 可以把自己的分支合併並推送到 `uat`：
  **務必先對齊最新 uat**，否則會覆蓋別人剛推的 commit 或被遠端拒絕。步驟：
  在自己的乾淨功能分支執行 `python scripts/collab.py integrate --publish-uat`：先 fetch、merge 最新 origin/uat、檢查，再以非 force 的 atomic push 更新自己的分支與 uat。
  有衝突就保留雙方內容逐段處理，不切換或 reset 另一人的工作區。推完告知使用者。

### ⛔ 仍然禁止
- **不可推送或合併到 `prod`、`Andrew`**，也不可 force push 任何分支。prod 部署一律由使用者（Claude Code）處理。
- （`uat` 已於 2026-10-08 開放合併／推送，見上方「✅ 允許」；但推 `uat` 前**務必先 `git fetch` 對齊最新**，避免覆蓋 Claude Code／使用者剛推的 commit。）
- 不可修改 `.env.local`、排程（`.bat`／Task Scheduler）、Supabase 資料或 schema。
- 不可動遠端 `Duke` 分支（來源不明，非合夥人分支）。
- 改版面前先跟使用者說會動哪幾頁，避免與 Claude Code 同時改同一區塊造成衝突。

## API 數量規範（2026-10-16 使用者指示）

- 新增 API 前依 `vercel.json` 盤點部署 Function 入口，最多 **12 支**；超過必須先合併，不能先部署第 13 支。
- 修改 API／部署設定後、提交與部署前執行 `python scripts/check_api_budget.py`。未知 runtime／部署模式不得略過，先更新盤點程式。
- 合併時維持原網址相容、參數驗證、授權與快取邊界，優先合併同類公開入口，不混淆私人會員權限。
- 站內搜尋已合併至 `api/prices.py`；抽離步驟見 `docs/api-budget.md`。升級方案不自動解除使用者上限。
