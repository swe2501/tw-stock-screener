# 會員使用券與任務資料庫：2026-10-20 套用完成

> **2026-10-20 21:06 追加**：JUSTY 批准並親自在 SQL Editor 套用 `member-perks-exchange-v2.sql`＋`member-perks-tasks-v2.sql`，回報 Success。新增任務 32 個、兌換 7 個、hottopics／selltrack 可由券開通；全部仍 active=false。開放步驟見 [../HANDOFF_MEMBER_PERKS_2026-10-20.md](../HANDOFF_MEMBER_PERKS_2026-10-20.md)。

使用者本回合明確批准套用到 UAT／正式站共用的 Supabase「Taiwan stock2」／bruqrbvbjxntgoljxsne，**活動、券定義、發點與兌換先保持關閉，不啟用儲值**。OpenAI 裝置登入由使用者在 iPhone 本人核准；授權已完成，不再重問相同批准。

## 已執行

透過 Supabase SQL Editor 對照完整審閱稿，貼入後先以全選複製確認與來源逐字一致，再執行單一 transaction bundle；畫面顯示 `Success. No rows returned`。

來源依序為 shared/justy/benefit-vouchers 中：member-share-unlock.sql、member-share-vouchers.sql、member-voucher-levels.sql、member-vip-read-access.sql、member-task-wallet.sql。prepare_member_rewards_migration.py 產出附 SHA256 的同一交易審閱稿；初次套用專用，不能再次執行。

既有註冊推薦碼 trigger 保留，沒有增加第二個 Auth trigger、修改 Auth provider、寄信或產生真實獎勵。

## 線上九項驗證全部 true

| 檢查 | 結果 |
|---|---|
| admin_policies_unchanged | 管理員研究表原有政策指紋一致 |
| admin_tools_excluded | sig / brank / mingdeng 不在會員研究目錄 |
| anon_private_rpcs_denied | 私人 RPC 不授權匿名執行 |
| campaigns_inactive | 邀請活動關閉 |
| exchanges_inactive | 點數兌換關閉 |
| member_cannot_issue_vouchers | 會員不可呼叫內部發券函式 |
| new_tables_rls | 六個新增資料表全部啟用 RLS |
| tasks_inactive | 任務發點關閉 |
| voucher_definitions_inactive | 各級券定義關閉 |

管理員政策比較範圍：broker_rankings、broker_highwin、broker_streaks、broker_trades、signal_stats、mingdeng_calls、mingdeng_scores；升級前後 MD5 均為 `9ce89b2647088d0f18cba54e54a3dd4b`。只針對出場追蹤 broker_sell_alerts 增加會員工具 SELECT policy，沒有提供管理寫入權。

HTTP 匿名探測 member_usage_vouchers、member_feature_access、member_wallet_summary、member_task_status、member_point_exchange_options：五個皆 **401 / 42501**，服務已存在且拒絕未登入者，不是 404 缺服務。

驗證查詢：[Supabase SQL Editor](https://supabase.com/dashboard/project/bruqrbvbjxntgoljxsne/sql/4d455f5e-cb76-425e-bc9f-9c602f4079bb)。本機畫面證據位於本對話 member-rewards-review/live-validation.png。

## 仍需區分

- 資料庫已部署，不等於本機新版網站已 push／Vercel 已部署。網站仍待使用者發布指令 23。
- 活動尚未啟用：現在不會自動核發 VIP、發點或讓會員兌換。啟用另需明確批准。
- 邀請滿三位驗證新會員 → 待啟用 VIP 7 天券；VIP 與自選券 **不包含主力訊號、分點回測、神燈與冥燈**，三項只限管理員。自選券一張一項、核發後一日曆月內啟用，啟用享完整天數。
- 中間等級工具組合與任務點數正式兌換率未核定；25 項介面提案不等於 25 項伺服器任務已上線。儲值服務保持關閉。
- 隔離 SQL／瀏覽器測試已通過；沒有以真實會員核發或消耗券做端到端測試。
