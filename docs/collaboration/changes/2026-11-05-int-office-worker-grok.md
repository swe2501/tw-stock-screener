# INT-001：Grok 執行端 token 端點與 executor 分流（2026-11-05）

- 分支：`int/office-worker-grok`（base `40492ced`），僅本地 commit，未 push／未部署
- 未改 DB schema／Auth／RLS，未改 `scripts/office_task_worker.py`，未寫入任何 token 值

## 變更摘要
- `api/auth.py`：新增 `action=office_worker`（不需管理員 JWT）。header `x-office-worker-token` 以 `hmac.compare_digest` 比對 env `OFFICE_WORKER_TOKEN_GROK`；env 缺或 <32 字元、長度不符或不相同 → 401。`role` 白名單 `ceo|cto|sec|eng|qa`（否則 400）；伺服器固定 `worker=grok-<role>`，覆蓋 body.worker。只開放 `claim|heartbeat|submit|fail|block|list`，其他 → 400。例外 → 500 `{"error":"internal error"}`，不含 traceback。
- `lib/office_tasks.py`：
  - 任務選填 `executor`（`''`／`claude-local`／`grok`），空值視為 Claude；僅非空時寫入（舊任務冪等雜湊不變）；summary 帶出此欄。
  - worker claim/list 依身分分流：`grok-*` 只看／領 `executor=grok`；Claude 只看／領空值或 `claude-local`；不符 → 403。
  - 同一 worker 名稱已有其他 running 任務時 claim → 409。
  - online：Claude 仍寫 `office_task_worker_uat_v1`（mode=claude）；`grok-*` 寫 `office_task_worker_uat_v1:grok`（mode=grok）。
  - approve：對**所有** execution（含 manual／人工任務），若 actor 等於 task.worker → 403（禁止自行驗收）。此為行為變更：既有「人工任務自領自驗」不再允許，須由另一位管理者驗收。worker 路徑仍完全不能 approve。

## 回滾
- 尚未合併：`git worktree remove C:\Users\User\.codex\worktrees\int-office-worker-grok`，再 `git branch -D int/office-worker-grok`。
- 若已合併：對相關 commit 使用 `git revert <commit>`（例如本分支上的 INT-001 相關 commit），**不要**使用 `git reset --hard`。
## 創辦人在 Vercel（UAT）設定 OFFICE_WORKER_TOKEN_GROK
1. 本機產生一組新值（不要貼到聊天、檔案或 commit）：`python -c "import secrets;print(secrets.token_urlsafe(48))"`
2. Vercel → 專案 → Settings → Environment Variables → Add：Key `OFFICE_WORKER_TOKEN_GROK`，Value 貼上剛產生的值，Environment 只勾 UAT 對應環境（Preview／UAT），勿勾 Production。
3. 同一值存放在 Grok 執行端的安全儲存處（密碼保管庫），呼叫時放在 header `x-office-worker-token`。
4. 需重新部署環境變數才生效；部署另案處理、需另行核准。
5. 輪替：產生新值 → 更新 Vercel 與執行端 → 重新部署；舊值即失效。

## 後續補丁（禁止全部自行驗收）
- 拿掉 approve 僅限 `execution=='ai'` 的條件；manual 亦禁止 actor==worker。
- 測試改為：人工自領後自行 approve → 403；改由另一 actor 驗收才成功。
