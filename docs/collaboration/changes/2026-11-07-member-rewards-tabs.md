# 任務與點數：上方切換與角色券名

2026-11-07，本機完成，未發布、未變更共用資料庫或啟用兌換。

- 任務與點數頁新增做任務／點數兌換頁籤與我的使用券捷徑；鍵盤方向鍵、Home／End 可切換，不改瀏覽器歷史、不觸發扣點。
- 精簡上方說明，點數狀態改為緊湊摘要；兌換模式只留餘額、上限及更新入口，核驗任務收合，讓商品更早出現。
- 指定工具 choice 券顯示市場觀察員，research 券顯示趨勢研究員，vip 券顯示先見領航員，天數獨立；確認彈窗與商品名稱一致。見習研究生是免費基礎身分，不建立付點兌換券。
- 名稱是券種展示，不更改服務端商品 ID、價錢、天數、啟用或既有券權利。明示工具體驗券不等於完整會員升級。
- 會員兌換卡不再列管理員限定持股觀察站，也不再稱四項工具全部開放。舊後端授權與券快照仍需 shared 權限遷移核對，前端改名不代表後端已完成隔離。
- 按鈕為小圓角半透明、細邊框，深色香檳金／淺色藍，點擊不垂直位移；保留鍵盤焦點辨識。
- 原有伺服器定價、確認後才扣點、重試單號、跨帳號隔離及跨分類領取流程不變。
- 已通過 member-missions.browser.cjs、member-task-bulk.browser.cjs；member-rewards-tabs.browser.cjs 驗證實際頁面八種尺寸／深淺、篩選、頁籤、鍵盤、刷新及關閉商品。

新會員五天券僅為待確認建議：信箱驗證後終身一次核發「市場觀察員 5 天功能體驗」，手動啟用後起算，僅多空廣度與外資溫度計完整頁面；免費篩選額度與容量維持。未建立商品、未發券。若採用，歡迎券須和邀請每月七天上限分開定義：歡迎券一次、邀請每月一次，避免被原上限吞掉或默默疊加。


## 最值得文字光暈與內容核對

- 最值得徽章的文字加上柔和 text-shadow，淺色藍底白字、深色暖金深底；3.6 秒低幅亮度呼吸，不變更尺寸、位置或透明度；減少動態偏好停用動畫但保留靜態文字光暈。
- 已明確回報使用者：角色名稱已改，但舊兌換券的指定工具／工具組授權不等同整級會員權益，尤其 choice 仍單工具；新分級次數與容量尚未接入。不能宣稱同名券的內容已完全對齊會員權益。
- 此次未擴張任何兌換授權、未改價格、未套用資料庫。完整等級體驗券與指定工具券須在產品規則與伺服器分流後，才能修改對外承諾。


## 手機迎新規則補充（2026-11-07）

- 使用者核定：手機驗證送市場觀察員五天功能體驗券，每帳號一次、每電話一帳號；每日 60／每週合計 300 點。
- 網站加入活動資格提醒與驗證後自動申領，僅依伺服器回傳；不自動啟用、不自行發點。淺色藍光／深色金色小卡，無焦點搶奪，可略過。
- 點數畫面支援 v4 共同上限與新手例外；舊伺服器仍顯示其真實上限，不能只改網站數字假裝已生效。
- 後端 migration 與 PostgreSQL 測試位於 shared/justy/member-lifecycle 隔離工作區；正式 DB／Auth／SMS 未改動。
- 依最新畫面要求，90 天領航員卡改「比三次 30 天少 2,400 點」，拿掉「買」字。


## 任務卡縮短與分頁

- 最新回饋：卡片過高、整頁太長。改精簡名稱／點數／進度／操作，內容與完成指引收在「任務詳情」，同時只展開一張。
- 分類桌機每頁 4 項、手機每頁 3 項，窄內容區自動單欄。保留所有任務與跨分類一鍵領取；上下頁不改網站路由，不移動到首頁。
- 驗證包含 320／375／768／1440 深淺模式、分頁前後項目、收合高度、說明獨立展開與領取回歸。


## 點數紀錄分頁與分頁置中

- 任務與明細上一頁／下一頁均以固定 SVG 線條圖標呈現，頁碼與兩顆圓形按鈕整組置中。
- 點數帳戶的任務／儲值／AI 歷史紀錄改桌機每頁最多 4 筆、手機 3 筆；前頁使用快取，較舊資料沿用伺服器時間＋ID 游標，不改 API。
- 查詢／切換來源重置第一頁；原有時間快照、完整期間匯出、無資料／失敗區分、帳號隔離保留。核對明細預設收合，一次只展開一筆。

## Supabase points policy applied (2026-11-07)
- User explicitly authorized applying the prepared points rules in project bruqrbvbjxntgoljxsne (Taiwan stock2, main).
- Applied docs/database/member-rewards-policy-v4.sql from the shared member-lifecycle worktree through the authenticated SQL Editor.
- Verified daily_limit=60, weekly_limit=300, policy_v4=true. Existing ledger stayed at 6 rows / 150 points and claims stayed at 6 rows before and after.
- Verified authenticated members can execute the public claim RPC and cannot execute the private predecessor directly.
- Future ordinary awards are capped at 40 per task, weekly-notes is 30, and future streak voucher configuration is removed; task activation flags and previously issued vouchers were not modified by this migration.
- Phone welcome / SMS campaign and membership lifecycle migrations remain separate and were not applied in this operation.

## Member page flow containment correction
- Replaced visual-only content top offsets with in-flow padding, so expanded content contributes to shell height and pushes the shared footer below it.
- Kept member route switching scroll position and navigation rail behavior; ensured the sticky brand row masks scrolled content in glass mode.
- Added real full-page regressions for benefits, gifts, referrals, tasks and wallet after deep scroll / route switching and detail expansion, including light/dark glass at desktop/mobile widths.
- Passed member-benefits.browser.cjs (320/375/768/1440), member-natural-scroll-full.browser.cjs, JS syntax and diff whitespace checks. Local only; no publish performed.

## Points expiry v5 and member-facing rules
- Added shared member-point-policy.js/css, mounted in tasks and wallet as collapsed numbered rules with server-confirmed effective / legacy expiry dates and visible 30-day / 7-day warnings.
- Standard new voucher issuer now uses three calendar months to activate. Existing vouchers retain recorded deadlines.
- Shared migration: member-rewards-expiry-v5.sql; old net TASK balances become legacy lots with a full year grace; future credits get individual one-year lots; earliest-expiry-first consumption; expiry adds a separate negative ledger event, never rewrites original history. Stored / AI balances excluded.
- Applied on explicit approval in Supabase bruqrbvbjxntgoljxsne, 2026-11-07 Taipei 02:34. Verified ledger 6 rows / 150 TASK points unchanged; private expiry helper inaccessible to authenticated role; new issuer three-month deadline verified.
- Passed isolated SQL tests for grace, FIFO, partial expiry, idempotence, insufficient balance rollback, stored isolation, issuer deadline and ACL. Website files local only, no Git publish requested.
