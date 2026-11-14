# watchlist 本人檢查與錯誤回應保護

## 範圍
- 從 UAT `0b7568a1a2524adbb0d7022033f60b6e68db4d33` 建立獨立分支 `fix/watchlist-owner-check`。
- 僅改 `api/watchlist.py`、`api/broker_watch.py`，另補離線單元測試及本文件。
- 不更動 DB、schema、RLS、Auth 設定／登入流程、env、前端、prod 或其他工作區。
- 只有呼叫既有 Auth `/auth/v1/user` 取得已驗證 JWT 的身分；沒有修改 Auth 程式、設定或資料。

## owner 欄位證據（基準版本）
- `docs/database/member-task-work.sql:25,49` 以 `watchlist.user_id` 與 `auth.uid()` 對應的使用者隔離自選資料。
- `docs/database/member-service-completion.sql:313` 自選匯出使用 `watchlist where user_id=u`。
- `api/broker_watch.py:90-93` 既有註解以 `user_id` 為 owner，既有 upsert 衝突鍵為 `user_id,broker_id,code`。
- 這些是 repo 程式與 SQL 的欄位契約證據，不代表已查驗線上 schema／政策；本次完全沒有連線 DB。

## 變更
1. 每個私人操作均先檢查既有手機驗證 gate，再經 Auth `/user` 驗證 JWT，取回並正規化 UUID。未驗簽 JWT payload、body、query、user_metadata 都不是 owner 來源。
2. watchlist GET 加上本人 `user_id`；PATCH 同時限制 `id` 與本人，移除 body 的 `user_id`；DELETE 同時限制 `code` 與本人；POST 強制寫入本人 owner。
3. broker_watchlist GET、DELETE 加上本人條件（DELETE 同時比對分點與股票）；POST upsert 強制本人 owner，保留含 owner 的複合衝突鍵。原本沒有 PATCH，本次也不新增。
4. 所有上述 API 支援方法（含 OPTIONS）的未預期例外回通用 `internal_error`。上游 REST 錯誤 body 不讀、不轉傳；已知 HTTP 錯誤回固定代碼，保留失敗狀態。
5. 伺服器僅記錄固定端點／操作、狀態碼、例外類別與去除完整路徑／原始碼行的堆疊位置；不記錄例外文字、headers、token、金鑰、身分、URL、request body 或 locals。
6. broker DELETE 不再把上游失敗錯報成功。共用基底僅包含安全 helper，不繼承其他端點的操作方法。

## 測試與既有問題
- 新增 `tests/test_watchlist_owner_check.py`：22 項，全部離線；記憶體 REST 刻意不實作 RLS，驗證應用層 owner 條件。
- 覆蓋跨帳號讀／改／刪、相同股票／分點下的本人正常操作、body/query owner 偽造、POST/upsert owner、未登入、JWT 過期／驗證故障、安全 log／通用錯誤、broker 不新增 PATCH。
- 更新既有 `test_watchlist_delete.py` 的合成身分 mock，仍斷言刪除失敗不得回成功；改為驗證不洩漏的固定 403 回應。
- 既有相關 Python 回歸 104 項，加新增 22 項共 126 項通過。
- 擴大回歸另含 `test_web_layout.py`：修改前後都是 110 項中的同 3 個 `KeyError: dest`，發生在既有 route 測試對無 dest 路由的解析，不在本次改動範圍。沒有新增失敗，也沒有修改該測試／路由。
- Node 離線回歸：K 圖自選同步 5、坐下動畫 94、部門同步 23、建置範圍 2，共 124 項，修改前後均通過。
- API 預算檢查 12/12，未新增 function。Git diff 空白檢查通過。
- 目前 workflows 沒有 Node 測試命令，根目錄沒有 package.json；唯一 mobile package.json 沒有 test script，本次不安裝套件、不執行 App 建置。
- 執行環境為既有 Python 3.13.5（命令 `python3`；無 `python` 別名）、Node v24.22.1。Python 測試清空外部環境、禁止 .env* 開檔及 socket 連線。

## 尚未測試
- 未使用真會員、未發 UAT／prod API 請求，沒有線上寫入。
- 未驗證線上 owner 欄位是否與 repo 契約一致、實際 RLS／WITH CHECK、Vercel Python 打包、跨函式匯入及既有環境值。
- 未實測手機 gate 啟用時額外 Auth round trip 的延遲；保留既有手機 gate（啟用時可能有兩次 Auth /user 呼叫）。
- 未執行整個 repo 的全部 Python／PGlite／瀏覽器／App 測試；本次跑相關 Python 與前端單元回歸。
- 其他 API 不修改：`api/screen.py` 仍有 traceback 回應，見證據文件列出的精確位置；`api/alert.py` 其他自選讀寫 helper 不在本次範圍，不宣稱全站 IDOR 已消除。

## 回滾
- 若本 commit 已發布 UAT：先 fetch 並核對現況，在自己的乾淨修復分支 `git revert <本次 commit SHA>`，重跑必要測試，再以一般非 force FF 將新 revert commit 推到 uat。不得 reset 或 force 回到舊 SHA。
- 若之後有人更新 uat，先停下交由 CTO 決定整合，不自行 rebase／cherry-pick。
- 回滾會移除應用層 owner 補強，應由 CTO／創辦人評估資安風險；不自動回滾、不操作 Vercel rollback。
- 本機尚未發布時不需遠端回滾，保留新分支與 commit 待確認。

## 交測試工程師的驗收清單
1. 核對 UAT 部署 SHA／兩個 API 的 Python 匯入成功；先做靜態與離線測試。
2. 任何線上試寫之前，先取得 CTO 對合成帳號／專用測試資料／寫入範圍的確認，不用真會員資料。
3. 在獨立合成資料環境準備 A、B 各自資料，包含相同股票及相同分點＋股票。
4. A 的 GET 只能取得 A；偽造 query user_id=B 無效。
5. A PATCH B 的 id 無資料／無修改；A PATCH 自己的 id 正常，body user_id=B 不會移轉 owner。
6. A DELETE B 專有股票或分點鍵不改 B；A 刪同名鍵僅刪 A。空結果可能回 200，必須查核 B 未改動，不能只看狀態碼。
7. A 新增／broker upsert 時偽造 body/query user_id=B，仍僅建立／更新 A。
8. 未登入、過期 JWT／Auth 驗證故障均不能進入 REST；既有手機驗證未通過仍拒絕。
9. 以 mock 故障確認回應沒有 traceback、例外文字、路徑、SQL 或其他會員資料；伺服器 log 也不能有身分、token、金鑰或 body。
10. broker DELETE 上游錯誤仍為失敗；K 圖／會員自選正常讀寫與拒絕時保留畫面的既有行為不退化。
11. 驗收由 QA 與 CTO 決定；本文件與自測結果不是驗收宣告。
