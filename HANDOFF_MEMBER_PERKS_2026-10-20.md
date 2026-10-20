# 交接：會員任務點數與兌換「正式開放」（2026-10-20，JUSTY 指定交給 Codex）

> 先讀 [docs/collaboration/README.md](docs/collaboration/README.md)、[AGENTS.md](AGENTS.md)。完整規則與點數設計見 [docs/member-perks-program-2026-10-20.md](docs/member-perks-program-2026-10-20.md)。
> 本文件只做一件事：**把已建好的任務與兌換正式開放，並把網站上「尚未開放」的展示改成真的能領、能換。**

## 1. 目前狀態（2026-10-20 21:06 確認）

| 項目 | 狀態 |
|---|---|
| 資料庫 v2 | **已由 JUSTY 在 Supabase「Taiwan stock2」SQL Editor 套用成功**（`docs/database/member-perks-exchange-v2.sql`＋`member-perks-tasks-v2.sql`） |
| 任務定義 | 34 個（原 2＋新 32），**全部 active=false** |
| 兌換商品 | 7 個，**全部 active=false** |
| 券可開通工具 | 4 項：外資空單溫度計 fhedge、大盤多空廣度 breadth、話題研究 hottopics、出場追蹤 selltrack |
| 隔離測試 | `tests/member-perks-v2.test.cjs` 通過（需 PGlite：`PGLITE_MODULE=<路徑> node tests/member-perks-v2.test.cjs`） |
| 網站 | 任務頁、兌換票券、全年禮遇已上 UAT，但都是**靜態展示**，按鈕寫「尚未開放」 |

開工先在 SQL Editor 跑一次確認（應為 tasks 34/0、exchanges 7/0、voucher_tools 4/4）：
```sql
select 'tasks' kind, count(*) total, count(*) filter (where active) active from public.member_task_definitions
union all select 'exchanges', count(*), count(*) filter (where active) from public.member_exchange_definitions
union all select 'voucher_tools', count(*), count(*) filter (where voucher_enabled) from public.member_feature_catalog;
```

## 2. 要做的事

### A. 網站（先做，推 UAT 給 JUSTY 看）

檔案：`apps/web/assets/member-journey.js`（任務卡、兌換票券）、`apps/web/assets/member-missions.js`（目前的「帳號任務與兌換」區塊）、樣式在 `apps/web/assets/research-polish.css`。

1. **任務卡接上伺服器**：網站任務 id 加 `-v1` 就是伺服器 id（例：`daily-screen` → `daily-screen-v1`；`verify-contact-v1`、`invite-first-v1` 沒有對應網站卡片，可另外顯示）。用 `AcademyIdentity.taskStatus()` 取得 `rows[].{id,points,period,claimed,eligible,review_only}` 與 `caps.{daily_research,weekly_research,daily_video}.{used,limit}`。
   - 按鈕狀態只能三種，文字要一眼看懂：`領取 +N 點`／`本期已領`／`尚未完成`（或審核制顯示「由管理端審核」）。
   - 「回報」類任務（伺服器 `eligible` 恆為 true）：**網站端仍要用 `member-journey.js` 的 `ready()`／`screenReady()` 判斷這台裝置確實做過才開放按鈕**，避免沒做就能領。
   - 按下呼叫 `AcademyIdentity.claimTask(id)`；成功後重新讀 status 並更新點數。錯誤碼轉成白話：`MEMBER_TASK_LIMIT_REACHED`＝今天（本週）點數已達上限、`MEMBER_TASK_INCOMPLETE`＝還沒完成、`MEMBER_TASK_REVIEW_ONLY`＝由管理端審核發點、`MEMBER_TASK_UNAVAILABLE`＝任務未開放。
   - 任務頁上方顯示「今日 x/30、本週 x/150」。
2. **兌換票券接上伺服器**：票券的 `data-exchange-id` 已對應伺服器 id（`choice-3d-v1`…`vip-30d-v1`）。用 `AcademyIdentity.exchangeOptions()` 判斷哪些已開放；按鈕依餘額顯示 `兌換`／`點數不足（還差 N 點）`／`尚未開放兌換`。
   - 兌換前要有確認視窗：寫清楚「扣 N 點，取得〇〇券 N 天，存進使用券夾，一個月內按開始使用才計時」。
   - 呼叫 `AcademyIdentity.exchangePoints(id, requestId)`；requestId 沿用 `member-missions.js` 的做法存在 sessionStorage，重試不重複扣點。成功後導到「使用券夾」（route `gifts`）。
3. 「帳號任務與兌換」舊區塊（member-missions.js）與新卡片不要重複顯示同一件事：保留餘額與結果訊息，任務／兌換清單以新卡片為主。
4. 開放後把頁面上「尚未開放」「獎勵草案」等字樣，依伺服器狀態改成實際狀態；**伺服器沒開的任務仍維持「尚未開放」，不能假裝能領**。
5. 深淺色都要檢查；手機 375px 不可左右溢出；不改網站既有風格。

### B. 資料庫開放（網站上 UAT 並經 JUSTY 確認後才做）

UAT 與正式站共用同一個 Supabase，**開放＝正式站會員立刻能領點**。JUSTY 確認後，由他在 SQL Editor 執行：
```sql
-- 開放伺服器可確認與回報類任務（審核制、獎勵影片先不開）
update public.member_task_definitions set active=true where verifier<>'admin_review' and id<>'ad-video-v1';
-- 開放券與兌換
update public.member_voucher_definitions set active=true where id in ('observation-v1','research-v1','advanced-v1','vip-v1','choice-v1');
update public.member_exchange_definitions set active=true;
```
- 獎勵影片 `ad-video-v1`：等 Google Ad Manager 獎勵廣告申請通過、網站接好「看完才發」後才開。
- 審核制 `feedback-v1`、`event-v1`：不需開放給會員；管理端用 service role 呼叫 `admin_award_member_task(user_id,'feedback-v1',點數,'原因','案件編號')` 發點（點數 1～1000，同一案件編號不重發）。

## 3. 驗收清單

- 未登入：任務與兌換按鈕不可按，提示登入。
- 一般會員：做完「記錄今日選股」→ 領 5 點 → 同日再按顯示「本期已領」；每日領到 30 點後其他每日任務顯示上限。
- 生日當月（會員資料生日月份＝本月）可領生日禮，並在使用券夾看到研究券 3 天。
- 點數不足時兌換按鈕顯示還差幾點；兌換成功後點數減少、使用券夾多一張待啟用券；重新整理後不重複扣點。
- 深色／淺色、桌機／手機截圖確認；console 無錯誤。

## 4. 規則

- 網站改動走 `web/justy/<task>` 分支，完成後用 `python scripts/collab.py publish-justy`（JUSTY 的「2、3」）同步 UAT 與 justy-layout；**不推 prod、不推 Andrew**。
- 除第 2B 節三行開放語句外，**不得再改資料庫結構或權限**；需要再改先寫 SQL 草稿、跑隔離測試、問 JUSTY。
- 不讀取、不把會員研究內文當發點依據（沿用 docs/member-rewards-db-status.md 原則）。
- 主力訊號、分點回測、神燈與冥燈只限管理員，任何券都不能開通。
