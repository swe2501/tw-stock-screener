# 會員擴充與推薦禮遇規格

## 本次使用者已確認

- 先做一般會員，不先命名或定價其他方案。
- 生日收完整年月日，選填、不公開，用於未來生日禮遇。
- 會員擴充：生日禮、優惠券、研究工作區、學習中心、研究週報、學院活動、通知偏好、任務點數，以及裝置/隱私管理。
- 推薦獎勵觸發：新會員完成驗證，推薦人與新會員雙方都有禮。禮物內容、免費功能及天數尚未指定，不可擅自給真實權益。
- 領取方式尚待使用者確認；建議「會員中心一鍵領取＋Email/站內提醒」，不是另外寄一組優惠碼再輸入。

## 推薦流程

1. 系統為 A 核發不可猜測、可停用的推薦碼與正式網域邀請連結。推薦碼不是登入憑證，不包含 Email、手機或連續會員 ID。
2. B 開啟連結後暫存邀請上下文；在註冊前清楚顯示邀請來源並允許確認或移除。不將未驗證的碼直接寫成會員權益。
3. 伺服器以新建立的 Auth user ID 綁定 A/B 推薦關係。B 只能有一位推薦人，不能自己推薦自己，不能在領禮後更換推薦人。
4. 收到可信的驗證事件後，伺服器核對 Email/手機驗證狀態與帳號資格，確認不是已有會員；不能把登入、更新暱稱或瀏覽器回傳的 `verified=true` 當驗證。
5. 一個資料庫交易內，將推薦關係從 pending 轉 verified，為雙方各建立一筆禮遇紀錄與通知 outbox。獎勵先為 ready，不在前端授予權益。
6. 若採手動領取，按「開啟禮遇」後顯示精緻信封展開、禮遇內容、期限與「確認領取」。實際成功需等伺服器交易回傳，不在動畫開始時就宣稱已入帳。
7. Email 僅通知「你有一份新禮遇」並導向會員中心；連結不能單憑 URL 就領取，必須登入正確會員。寄信失敗不影響已存在的禮遇紀錄。

## 防止常見錯誤

- `referrals.invitee_user_id` 全域唯一；A != B；有效推薦碼只由伺服器產生與停用。
- 同一推薦事件、同一受益會員、同一獎勵類型唯一：`unique(referral_id, beneficiary_user_id, reward_kind)`。
- 每個獎勵 event key 唯一；驗證 webhook 重送、排程重跑、重複註冊回呼不得多發。
- 領取 RPC 先驗證 auth.uid()，鎖定 reward row，再判定狀態與伺服器時間。只能由 ready 變 claimed，過期/停權/取消不得領。
- 權益 grant 以 reward_id 唯一；重複點擊、兩個分頁同時領、網路逾時重試都回傳同一筆結果。
- 權益開始/結束時間使用 UTC timestamptz，顯示以 Asia/Taipei。相同功能是否延長採活動明確規則，不讓前端加天數。
- 活動規則保存版本與快照，改活動不追溯改寫已發出的禮遇。
- 已綁定的第三方身分屬同一會員，不再視為新用戶。完成驗證不等於能保證同一自然人只有一個帳號；額外設發獎上限、風險待審與申訴機制。
- 生日禮至少 `unique(user_id, campaign_id, benefit_year)`；修改生日不會重領同年度禮物。生日變更限制及 2/29 發放日期須在正式活動公布前決定。
- 點數由不可變 ledger 記錄，不能只修改餘額；撤銷使用反向紀錄，保留稽核。學習「已讀」紀錄可以自行管理，但不能單憑可編輯 metadata 自動核發可兌換點數。
- 推薦人只能看到匿名化邀請進度與自己的獎勵，不能看到 B 的信箱、手機或私人資料。

## 資料模型與權限（供合夥人建置，尚未套用線上 schema）

| 資料表 | 用途與關鍵條件 |
| --- | --- |
| referral_codes | user_id、不可猜測 code unique、active、created_at；每會員一組有效碼 |
| referrals | inviter_user_id、invitee_user_id unique、campaign_id、status、verified_at；不可本人推薦 |
| benefit_campaigns | 日期、條件、獎勵定義、版本、每人/活動上限、停用狀態；只有管理員寫入 |
| member_rewards | user_id、title、description、kind、status、expires_at、source_event_key unique、claimed_at、created_at |
| member_coupons | user_id、title、description、status、expires_at、coupon_rule_id、redeemed_at、created_at |
| membership_entitlements | user_id、feature、starts_at、expires_at、reward_id unique；僅服務端核發 |
| member_point_ledger | user_id、description、points、source_event_key unique、created_at；只能追加 |
| academy_events | title、description、starts_at、status、registration_url；只公開 published |
| event_registrations | event_id、user_id、status、created_at；unique(event_id,user_id) |
| member_research_notes | user_id、title、body、tags、created_at、updated_at、archived_at；個人研究內容不可放入 JWT metadata |
| learning_progress | user_id、lesson_id、read_at；unique(user_id,lesson_id) |
| member_notification_preferences | user_id、內容偏好、渠道、頻率；服務通知與行銷訂閱分離 |
| notification_outbox | event_key unique、user_id、template、status、attempts、next_attempt_at |

所有私人表 RLS 必須限定 `auth.uid() = user_id`。一般會員僅讀自己的禮遇、優惠與點數，不可 insert/update 這些表。資料庫推薦摘要 view 採 security_invoker，只回傳自己的 code/confirmed_count/rewarded_count/status；前端另外以已驗證 user ID 篩選，不能取代 RLS。

## 前端已做與待啟用

- 所有擴充已加入會員導覽、深淺版卡片、空狀態與功能說明。
- 研究筆記目前為依會員 ID 隔離的本機草稿，可匯出；尚未跨裝置同步，不塞入 Auth JWT。
- 三篇入門導讀可閱讀、標記已讀；小型進度與通知偏好暫存會員 Auth metadata，未來可遷移至獨立表。
- 研究週報由本人最近 7 天草稿產生，可下載，不虛構行情、投資績效或寄信結果。
- 隱私頁可匯出個資、草稿、學習紀錄與偏好；刪除帳號目前只協助撰寫草稿，沒有宣稱已送件。
- 禮遇、優惠、活動、點數及推薦進度只讀正式資料；表不存在顯示準備中，不生成假推薦碼或免費天數。
- 實際發獎、優惠券兌換、課程報名、裝置撤銷、完整帳號刪除與推播仍需後端/供應商設定與驗收，不是只靠前端就能完成。

## 驗收重點

自我推薦拒絕、舊會員拒絕、同一新會員只能綁定一次、重送驗證事件只發一次、兩分頁領取只生一次權益、領錯帳號拒絕、已過期不能領、生日改動不能重領、停用活動停止發獎、郵件失敗可重試且不重複發獎、跨會員資料不可讀、活動規則改版保留既有快照。

## 2026-10-15 實作狀態補充

前述模型為完整規劃；本次可執行的表名與約束以 `database/member-services.sql` 為準。前端已接入 ensure_member_referral_code、bind_member_referral、redeem_member_promo_code、claim_member_reward 與 submit_member_feedback RPC。推薦碼由資料庫依會員帳號生成，跨裝置保持一致；優惠碼兌換成功才建立優惠券或待領禮遇；回饋需取得案件編號才顯示送出成功。RPC 尚未在線上建立時會保留輸入並顯示尚未啟用。

撤銷其他登入工作階段已接 Auth scope=others；既有 access token 仍可能在到期前有效。完整裝置清單、客服回覆後台、寄信 worker、點數發放與課程報名仍未啟用。推薦獎勵目前先入 ready，領取再核發權益；尚未加入推薦禮通知 outbox 與活動風控上限，正式開放活動前必須補上。
