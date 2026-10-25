# 任務核驗、完成指引與一鍵領取（資料庫已套用／網站待發布）

## 目的與範圍

原有 41 項任務逐項列出完成位置及條件，新增 5 項待審核里程碑。修正本機筆記、模擬覆盤、選股策略欄位與獎勵核驗來源不同造成的卡關。通知從右上角小鈴鐺進入，名稱「通知」；儲存全部關閉仍是有效偏好。通知發送服務未因此啟用。

網站增加私人任務紀錄提交、可重試同步、進度與跨分類一鍵領取。原有研究草稿仍可保存，短筆記不強迫湊字，但不冒充符合獎勵條件。舊本機筆記可在目前日期同步資格，不偽造過去任務日期。

## 共用資料庫與相容性

**使用者於 2026-10-22 明確批准這兩份 SQL；已依序套用到 Taiwan stock2 (`bruqrbvbjxntgoljxsne`) 並驗收成功。新增五項任務仍未啟用。網站前端納入 2026-10-23 這次 234 發布；Vercel 實際部署結果需另行核對。** 依 `docs/collaboration/README.md`，正式 migration 與活動啟用須另行明確批准；本次批准未包含新活動啟用。

前置：現行任務點數／onboarding v3、已部署 learning verification 與 catalog、screen calendar。此次依序執行：

1. `docs/database/member-task-work.sql`：私有任務內容、伺服器日期、來源核對與完成進度。
2. `docs/database/member-task-bulk-claim.sql`：替換完成核驗、完整領取回執與一鍵領取。保留現有點數、活動狀態、額度、過去領取；五項新任務預設 `active=false`。

新 RPC：`member_task_work_context`、`submit_member_task_work`、`claim_completed_member_tasks`；`member_task_status` 增加可選欄位 `bulk_claim_version/server_verified/progress/verification_note`。原單項領取 RPC 及帳本格式保留。未升級資料庫時，新網站顯示核驗準備中，不以本機完成旗標代替發點。

iPhone／Android／iPad 沒有程式變更；舊 App 可繼續讀既有帳本、領取已有伺服器核驗任務。舊版依賴 generic member_report 的任務無法繞過新核驗，需接新提交 RPC 才能完成；不得宣稱舊 App 已支援新任務。私人雲端備份本身仍不是直接授權／點數依據。

每次提交與批次領取綁定登入者及 request UUID。重送回傳原回執；跨帳號隔離。批次沿用單項領取、鎖定帳戶、核對每期唯一及每日／每週上限；遇未知錯誤整批回滾。前端保留不確定結果的原 UUID，禁止修改後冒充同一請求。

## 驗證與界線

隔離 PGlite 覆蓋重跑 migration、關閉通知、內容／日期／自選／模擬來源、同內容去重、跨日計數、額度、重送、回滾、RLS 及跨帳號。隔離瀏覽器覆蓋深淺與手機、提交及領取斷線重試、原筆記工作流、通知入口與儲存失敗。完整對照表見 `docs/member-task-audit-2026-10-22.md`。

唯讀部署驗收 `docs/database/member-task-bulk-verify.sql`：兩支新 RPC 存在；新任務啟用數 0；啟用任務總數維持 31；帳本筆數維持 6、點數淨異動維持 150；RLS／私有權限 PASS；AI／儲值維持 CLOSED。沒有以真實帳號提交或領取測試，也沒有新增測試點數。

原始套用 SQL SHA256：work `92714BD87813324E0BF291C8E2DDF5BA994DB9A1E761E0CEE6B3F76283B173F1`；bulk `1911566875B81945B46AEB29D29AE0015D642F87E2A149E1D35D60F221D113C1`。檔案內 PREPARED ONLY 是套用前的授權提醒，部署狀態以本紀錄為準。

核驗代表符合保存、測驗、來源與日期規則，不保證內容的投資品質或真人實際閱讀。尚未以真實帳號做前端發布後驗收；未更動 prod 分支、Auth、付費／AI 開關或排程。新增里程碑點數仍需審核。

回復時先停用受影響任務或停用批次入口，保留私人證據與帳本；不要降回弱核驗，也不要刪除已核發回執。不得重跑舊 v2/v3 migration 覆蓋新驗證器。

## 同輪網站修正：ETF 成分股開啟 K 圖

使用者另報 ETF 抽屜蓋住後開的個股 K 圖。原因為兩者原本皆為 z-index 9995。只將獨立 `#chartModal:not(.etx-embedded)` 提升至 10000，保留 ETF 技術面內嵌 K 圖的 auto 層級，樣式快取升至 v13。

`tests/etf-stock-chart-layer.browser.cjs` 使用實際成分股名稱點擊、真實網站 CSS 與視窗／歷史處理，僅替換行情圖繪製為確定性 fixture；驗證 K 圖位於上層且可點擊、Esc／關閉／前進後 ETF 頁籤仍保留、內嵌圖不受影響，通過深淺桌機／手機四種組合。`tests/navigation-history.browser.cjs` 原有整站歷史回歸亦通過。此修正同樣納入 2026-10-23 這次 234；未完成的會員服務不包含在此次發布。
