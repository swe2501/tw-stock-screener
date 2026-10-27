# 學習任務伺服器核驗（2026-10-22 已核准套用）

發布狀態：前三步網站修正已發布 UAT（功能提交 `2c6fa7f`），JUSTY 明確批准後已套用共用資料庫；未推 prod 前端。實際驗收與限制見 [發布紀錄](../../member-learning-release-2026-10-22.md)。下列部署步驟保留供後續維護參考。

目的：個人資料中的 member_learning、member_learning_challenges 可由會員編輯，不可作發點依據。這次以伺服器完成表判斷 7 項學習任務，不改其他 member_report 任務的既有規則。

## 行為與影響

- 網站保留個人已讀標記，另提供「核驗閱讀進度」。展開文章時由伺服器記錄開始時間；至少 30 秒且在 24 小時內、文章測驗答對至少 80% 才建立完成紀錄。這是流程與測驗核驗，不宣稱能證明真人實際閱讀。
- 每篇文章只記一次完成。每日閱讀點數需要當天首次完成另一篇文章，依台北日期判斷；重讀既有文章不重複累加領點依據。
- 每週挑戰須先核驗指定文章，採伺服器當週輪替題組、伺服器評分與台北 ISO 週。每會員每週一筆完成，不接受瀏覽器傳入分數、通過旗標或時間。
- 既有 `_member_task_eligible` 與 task status 包裝保留其他驗證器、期間上限、帳本唯一鍵、既領紀錄與任務開關。讀 10／30 篇、4 次挑戰等新任務仍不啟用；不回收或重算已發點數。
- 會員只能讀本人完成紀錄，不能直接新增／修改完成表或讀伺服器題庫。完成核驗不直接發點，仍經既有 `claim_member_task` 領取並遵守上限。
- website capability flag `learning_verification:1`：舊後端未升級時，新網站暫停這 7 項領點，保留閱讀與個人進度。舊網站／舊 App 不懂新 RPC 仍可保留進度，但無法建立新的學習獎勵核驗，需升級 UI。iPhone／Android／iPad App 本次未修改。
- 其他筆記、模擬、回顧等 member_report 仍待逐項接上可靠資料，不能把本次稱為所有任務防作弊完成。連續打卡任務也不因這次而開放。

## 共用資料庫：需另行批准

UAT 與正式站共用 Taiwan stock2。本次 migration 已獲 JUSTY 明確批准並套用；沒有新增 Vercel API，也沒有啟動任務或收費服務。

1. 先完成網站與所有仍使用中客戶端的相容驗收，安排短暫暫停學習領點的過渡。
2. 經明確批准後依序套用 `docs/database/member-learning-verification.sql`、`docs/database/member-learning-catalog-v1.sql`。前者建立核驗與門檻，後者提供題庫。兩檔可重跑；不得在這之後重新套用舊 tasks-v2/v3 migration 以覆寫新 verifier。
3. 登入測試本人閱讀、錯答／正答、週挑戰、任務領點與帳本。確認後再討論啟用仍關閉的新任務，啟用是另外的決定。

題庫由 `node scripts/build_learning_catalog.cjs` 產生，`--check` 確認和網站 76 篇文章、10 組週挑戰一致。題目和答案原本就是教學公開內容；後端評分避免偽造完成紀錄，並非考試防作弊或保密題庫。後續改題須人工審閱題庫更新與舊紀錄政策，不可自動改線上資料。

## 驗證與回復

- 隔離 PGlite 跑 `tests/member-learning-verification.test.cjs`；不連線 Supabase，測試內自行開啟任務僅為驗收，資料庫結束即丟棄。
- 瀏覽器 `tests/member-learning-gate.browser.cjs`、`tests/learning-center.browser.cjs` 驗證能力旗標、核驗流程、原進度保留及深淺桌機／手機。
- 若上線後核驗故障，優先暫停這 7 項領點、保留完成表及既有帳本、修復前端／服務。不還原成 `member_report=true`；不刪帳本或完成紀錄。個人閱讀與進度可以繼續使用。
