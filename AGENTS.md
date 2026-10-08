# AGENTS.md — 本 repo 的 AI agent 分工規範

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
  `git fetch origin` → `git checkout uat && git reset --hard origin/uat` → `git merge <合夥人名字>-layout`
  →（有衝突就解；index.html 多半只在同區塊）→ `git push origin uat`。推完告知使用者。

### ⛔ 仍然禁止
- **不可推送或合併到 `prod`、`Andrew`**，也不可 force push 任何分支。prod 部署一律由使用者（Claude Code）處理。
- （`uat` 已於 2026-10-08 開放合併／推送，見上方「✅ 允許」；但推 `uat` 前**務必先 `git fetch` 對齊最新**，避免覆蓋 Claude Code／使用者剛推的 commit。）
- 不可修改 `.env.local`、排程（`.bat`／Task Scheduler）、Supabase 資料或 schema。
- 不可動遠端 `Duke` 分支（來源不明，非合夥人分支）。
- 改版面前先跟使用者說會動哪幾頁，避免與 Claude Code 同時改同一區塊造成衝突。
