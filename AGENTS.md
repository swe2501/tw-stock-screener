# AGENTS.md — 本 repo 的 AI agent 分工規範

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
