# 會員獎勵與型態資料補完（本機準備，未發布）

網站前端在 `justy-layout`；資料庫／辨識程式在 `shared/justy/benefit-vouchers`。尚未推送。使用者後續明確批准會員升級、活動先關閉；已完成共用資料庫套用及九項線上驗證，詳見 docs/member-rewards-db-status.md。

## 已確認規則

- 每人保留原隨機唯一邀請碼；既有 member_auth_insert 已負責註冊建立，不加第二個 Auth trigger。
- 每位受邀會員只能綁一位介紹人、可補填、不重複計數；原活動資格窗口仍七天。
- 每滿三位註冊驗證新會員，核發待啟用 **VIP 7 天券**；五位剩餘兩位保留。
- 核發後一個日曆月內啟用，啟用後享完整天數；自選券僅選一項並固定。
- **主力訊號 sig、分點回測 brank、神燈與冥燈 mingdeng 只對管理員開放**。不進 VIP／自選券；catalog 的 CHECK 直接禁止將這三項設定成會員研究權限。
- VIP 只涵蓋已準備好的會員研究功能；存在未完成的授權整合就拒絕核發，不能把兩工具券冒充 VIP。現有免費功能不加鎖。管理員、私有公式與管理寫入不變。

## 已實作並以隔離資料庫測試

- typed voucher 定義快照、固定券／自選券啟用 RPC、逐工具到期判斷、重送冪等、跨會員不可讀／不可啟用。
- 伺服器驗證任務：完成信箱／手機驗證、第一位有效邀請。其他 25 項介面提案仍需對應可驗證研究文件，不能靠 localStorage 自動發點。
- 完整 ledger 餘額、無儲值服務時明示未開通；任務發點唯一事件。
- 扣點＋核發待啟用券同交易，餘額不足不扣、發券失敗整筆回滾，相同請求單號重試不重複扣點。
- `member-vip-read-access.sql` 只準備出場追蹤所需 broker_sell_alerts 的 SELECT policy；不授予三項管理員工具的表權限。遇缺表、view、未啟用 RLS 或 restrictive policy 直接中止，不繞過。

## 型態

新增 chart_pattern_rules.py 與唯讀 scanner；既有箱型／假突破狀態機保留。其他 12 類採版本化候選辨識、確認線越界及前 20 日均量 1.3 倍，保留證據與規則版本；無未來資料洩漏。這些是工程版研究規則，尚未以真實全市場標註樣本驗收，不宣稱準確率。

scanner 不讀金鑰、不改排程；CLI 只輸出本機 JSON。只有另外的 publish_snapshot 入口可供經批准的每日資料作業使用。前端讀既有 page_cache / chart_patterns，不新增 Function。舊日期、不完整或缺快照明示等待，不冒充零訊號。

本機沒有 `D:/stock_data/wantgoo_full.db`，因此本次只能用測試 OHLC 建立快照驗證，沒有產出真實市場名單，也沒有改每日作業。

## 上線邊界

`prepare_member_rewards_migration.py --output <path>` 組成單一交易、附來源 SHA256 的可審閱 SQL；不執行 SQL。任何檢核失敗整批回滾。

已核對共用 Supabase catalog／現有 policy 並經明確批准套用，所有活動、任務、兌換與券定義均保持 inactive，沒有發真實點數、VIP 或寄信。之後的活動驗證方式（手機目前未開）與三個中間等級工具組合、點數兌換率仍需確認，不能以測試設定視為正式營運規則。網站發布仍依 2 → 3，啟用活動另需批准。
