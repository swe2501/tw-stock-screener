# screen_cache 後端憑證分流（2026-11-12）

## 授權與範圍

依創辦人 11/11 23:54 核准範圍，只調整 `api/screen.py` 的 `screen_cache` 憑證；基底 `origin/uat d973ed57c0207b6adbfd82e8ef4cbb037c9f70b2`，分支 `fix/screen-cache-service-key`。本次只產生本機 commit，不推送、不部署、不實打 UAT 或 prod。

不改 SQL、RLS、grant、env、Auth、DB schema、前端或篩選演算法；不讀 `.env*`，不安裝工具，不處理既有 traceback 回應問題。

## 實作與唯讀證據

- 舊版 `api/screen.py:59–62,118–135`：`SUPABASE_KEY` 固定讀 `SUPABASE_ANON_KEY`，所有 `_cache_sb` 請求的 `apikey` 與 `Authorization` 都使用它。舊註解「RLS 已開放 anon 全操作」已更新。
- 新版 `api/screen.py:64`：與 `api/auth.py:7` 相同名稱／讀法的 `SUPABASE_SERVICE_KEY`。
- 新版 `api/screen.py:122–141`：保留共用 transport 與既有函式介面，但只對精確路徑 `/screen_cache` 分流憑證：優先 service，未設定才使用原 anon。`security_catalog`、`price_window`、`page_cache`、`stock_themes`、`stock_dividends`、`taiex_daily`、`candle_combo_hits` 等其他路徑仍使用 anon；沒有把整個共用 client 升權。
- `api/screen.py:65–66`：缺 service 時，每次模組冷啟動僅一行固定 warning；不輸出任何金鑰值、請求標頭或上游 body。service 已設定但遭 401/403/5xx 不會自動降級重試 anon，維持原本 `(0, None)` 失敗處理。
- `api/screen.py:144–157`：既有兩次 DELETE、一筆 POST 與 GET 領取路徑、gzip、timeout、回傳契約全部保留。
- `api/screen.py:4573–4586`：POST 先運算，帶 `job_id` 才存結果，再回傳；原 traceback 分支逐字未改。完整 AST／hash 證據見 `/workspace/screen-cache-evidence/scope-proof.json`，僅 `_cache_sb` 的函式內容改變。

## 離線測試

正式新增 `tests/test_screen_cache_service_key.py`（9 個測試）：

1. 存、取、兩種刪除的 `apikey`／`Authorization` 皆使用假 service key；保留清理參數、job_id、POST body 與呼叫次序。
2. 有 service、無 anon 仍能使用 screen_cache。
3. 缺 service 回 anon，冷啟動只記一次安全 warning。
4. 非 screen_cache 路徑仍為 anon，且不能因缺 anon 而擅自改用 service。
5. gzip 領取行為不變。
6. service 的 401／403／500 不重試 anon。
7. 假 service／anon 即使出現在 transport exception，也不進應用回應、stdout、stderr 或 log。
8. mock 真正 handler：POST 一次運算／保存，GET 同 job_id 多次直接領取，未知 job_id 回 pending；不需另打 Auth。

最終正式測試對不可變舊碼快照：9 個測試方法中 5 FAIL、4 PASS（共 7 筆 failure，含 HTTP 子測試）；對新碼：9/9 PASS。可用 `/workspace/screen-cache-evidence/run-probe-against-baseline.py` 重現，不會退回或改寫 worktree。

既有測試前後詳列於 `/workspace/screen-cache-evidence/DELIVERY.md`。Node 增列會員篩選 SQL fixture 測試中，5 個在修改前即因缺少 `@electric-sql/pglite` 無法啟動；遵守不安裝工具，未修補依賴或 SQL。不得將這些項目宣稱為通過。其他 Node／Python／既有離線 Chromium／部門看板結果與原始 log 均保留。

結果：Node 前後皆 196 PASS／5 缺套件 setup FAIL；Python 11 組前後通過（screen 12→21，新增 9/9）。Chromium 前後部門 4、UAT-only 20、Auth 84 均通過；seat 修改前 112 通過，修改後首次在多個 Chrome 並行時出現既有椅子座標斷言 FAIL，未改前端或測試，單獨重跑 112/112 PASS。原 FAIL 與重跑均保留，並行負載假說尚未證實，不擴大處理前端。

## UAT 實測方式與重要界線（本輪僅調查）

- 由擁有人自行推送 UAT、核對已完成部署 SHA 後，使用該 UAT 的同源 `POST /api/screen`，JSON 帶新的隨機 `job_id` 與一般有效篩選條件；只送一次 POST。
- 再 `GET /api/screen?job_id=<同一 id>` 領取。GET 回完整結果且與 POST 一致，才能證明快取存得進／領得回；只有 POST 200 並不足夠，因為既有程式會忽略快取儲存失敗。
- 不是用「同條件 POST 兩次」驗快取：每次 POST 都重新運算；screen_cache 的 GET 沒有 `cached:true` 命中欄位，不能拿別的 page_cache 標記充數。
- handler 本身沒有使用者 token 驗證；網站 UI 的 `doScreen` 有會員檢查。Vercel Deployment Protection 是平台設定，repo 無法證明是否啟用。若受保護，只能使用擁有人已正常解鎖的同源瀏覽器上下文；不得匯出 cookie、讀取 token、繞過保護或修改 env。
- **既有 `_cache_save` 不只是新增一筆：還會刪除所有逾 15 分鐘的 screen_cache，以及相同 job_id 的舊列。UAT 與 prod 共用 DB，舊列清理可能涵蓋 prod 快取。** 本次沒有改清理流程。若實測的硬邊界是「完全只能動一筆」，現有端點不保證符合，應停止實測並請擁有人決策，不擅改程式、SQL 或手動清理。
- 一般篩選的寫入在 screen_cache；既有 AI `aibuy` 是其他 GET 分支，可能寫 page_cache，不列入此測試。不得操作會員選股日曆「儲存」等額外寫入。完整操作／證據採集方案見 DELIVERY。

## 收權限與上線順序

**收權限 SQL 只能由創辦人執行，且必須等 prod 後端也已換上使用 service key 的新版本並確認可用，才可執行。UAT 與 prod 共用 DB，不能因 UAT 已換版就先收 anon 權限。**

本次不附加、不執行 SQL，不調 RLS／grant／env，不部署 prod。未設定 service 的 fallback 仍仰賴現有 anon 權限，不能用 fallback 測試通過當作可以收權限的依據。

## 回滾

由擁有人在欲回滾的分支執行 `git revert <本次 commit sha>`，產生新的反向 commit；不 reset、不 force。若未來創辦人已另行收緊 anon 權限，回滾成 anon 後端可能無法存取快取，必須先由創辦人評估權限相容性；本次不代執行任何權限變動。
