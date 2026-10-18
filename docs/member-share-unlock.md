# 分享解鎖：3 天體驗與每 3 人 7 天獎勵

## 目前交付狀態

前端入口、彈窗、邀請進度、本人領取與到期顯示，以及 PostgreSQL RPC 已完成並以隔離資料庫／瀏覽器測試。`database/member-share-unlock.sql` **尚未套用線上共用資料庫**。該 SQL 初始活動關閉，預設要求手機驗證；現有簡訊服務未開通，所以不得宣稱目前能正式領取。

本次不改 Auth provider、會員裝置限制、既有 Auth triggers、私有資料 RLS、管理員白名單或任何正式會員資料。不新增 HTTP Function，維持 12 支上限。

## 對外規則

- 入口「分享解鎖，立即使用 →」，外資空單溫度計／大盤多空廣度的鎖定頁、會員權益與邀請好友頁均可開啟。
- 私訊分享給 3 位不同 IG 好友，由本人勾選誠信確認，每帳號一次 3 天。網站不讀取 IG 私訊，不聲稱已驗證 3 位收件人。
- 動態可放專屬邀請連結。獎勵依邀請碼所屬的新會員紀錄判定，不驗證動態是否發布，不要求正面評價。
- 新會員必須在本活動開始後註冊，於註冊後 7 天內綁定邀請碼且完成活動驗證。預設以 `auth.users.phone_confirmed_at` 驗證，不能用可修改的 user_metadata 取代。
- 每滿 3 位不同有效新會員，自動核發 7 天。每人只歸屬一位邀請人；相同已驗證手機不重複計入，自我推薦不計入。邀請關係沿用既有 `bind_member_referral` RPC，註冊後仍需確認介紹人，不偷偷覆蓋另一位介紹人。
- 有效新會員數與已核發組數分開記錄。未滿一組保留進度，每組僅核發一次。開啟、重新登入、更新按鈕與彈窗開啟時每 30 秒核對，並非即時推播。
- 3 天／7 天從核發時開始；已有使用權則從最晚到期時間接續。到期後重新顯示工具入口，會員自己的研究文件不刪除。
- 分享使用範圍僅 `research_tools`：外資空單溫度計與大盤多空廣度。不開放 `_isOwner`、管理操作、算法檢視、私有訊號資料與明燈冥燈專項授權。

## 伺服器與前端界線

`member_share_unlock(p_claim_trial boolean default false, p_confirm_shared boolean default false)` 只授權 authenticated 執行；主體取 `auth.uid()`。前端不能傳 user ID、天數、功能、日期或邀請計數。

查詢會按活動起訖、註冊時間、綁定時間、驗證時間與不同已驗證聯絡方式重新核對邀請。獎勵以 `share-unlock:share-v1:<user>:trial` 與 `...:round:<n>` 唯一事件鍵寫入既有 member_rewards／member_entitlements，同一會員／功能採交易 advisory lock，重複領取、重試與多視窗操作不增加相同獎勵。

資料表無匿名／會員寫入權限，內部發獎函式不能由會員直接執行。既有個人檔案更新仍不包含權益欄位。

前端僅保留當次伺服器快照，不把使用權放 localStorage；換帳號、登出或服務錯誤會清除快照，不清除登入狀態。期限以伺服器時間加單調計時器判斷，頁面恢復時再核對。這是**指定公開研究畫面的使用權呈現**，不是替既有公開行情資料新增保密能力；原先資料端的公開／私人 RLS 維持不變。若未來要讓資料本身按期限限制，須另行審核資料端授權，不能僅以隱藏 DOM 代替。

## 實際啟用前

1. 取得對 UAT／正式站共用 Supabase 套用這份新 migration 的明確批准；不可把先前會員初始 migration 的批准當成所有新 schema 的批准。
2. 確認正式前端／簡訊服務與新會員手機驗證可完成，先在隔離環境驗收。
3. 檢查舊 `member_referral_campaigns` 是否有啟用活動。這次不修改其規則，避免同一邀請還觸發既有每人獎勵；需要營運方確認是否有意疊加。
4. 套用 `database/member-share-unlock.sql` 後，活動仍關閉。另行確認營運起始時間，再啟用 `member_share_campaign` 的 `share-v1`。不得回溯把既有會員全部當成新邀請。
5. 暫停活動只停止新獎勵，已核發期限仍有效。取消／人工風控、營運統計後台與詐欺覆核介面未包含在本次交付；誠信分享不能宣稱已防止所有多帳號濫用。

App 可沿用同一 RPC、同一會員與研究使用權，不需複製計數邏輯。網站文字更新不是法規合規認證；實際服務及獎勵模式仍需專業法律審閱。

## 驗證

- `node tests/member-share-database.test.cjs`（PGLITE_MODULE 可指定本機 PGlite 路徑，純記憶體 PostgreSQL）
- `node tests/member-share.browser.cjs`（Playwright + Edge；全數攔截網路，不碰真實會員）
- 原有 `tests/member-identity.test.cjs`、`member-signin-security.browser.cjs`、`member-controls-full-page.browser.cjs`。

測試涵蓋活動關閉、未驗證拒絕、體驗冪等、3 人門檻、3+7+7 天接續、舊會員與過期綁定排除、聯絡方式去重、跨帳號 RLS、活動暫停／權益到期、匿名與內部發獎權限、分享不增加邀請計數、複製失敗手動備援、服務錯誤保留登入、換帳號、桌面／390／320px 深淺色與原有登入綁定登出回歸。
