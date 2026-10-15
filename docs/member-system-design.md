# 會員系統第一版與資料架構

## 已實作

- 深淺背景會員中心，頁首頭像入口、意見回饋入口，隱藏頂部 Email。
- 會員總覽、個人資料、會員權益、登入與安全、我的回饋、通知中心。
- 直接沿用現有 Supabase Auth 連線驗證會員、讀取個人資料，避免本機 file:// 呼叫尚未部署 API。
- 暱稱與選填個資存在 Auth user_metadata；此欄位不能作權限或訂閱依據。會員權益展示讀 app_metadata，不能透過個資更新修改。
- 頭像顯示第三方提供的 HTTPS 圖片；沒有圖片時使用圓形人像圖示。選檔支援圓形裁切預覽、放大，儲存使用 member-avatars Storage（待管理員建立 bucket / RLS）。
- Google、LINE、Apple、手機入口放在登入與註冊共用區域，依實際供應商設定啟用。PKCE 與手機 OTP 串接流程已備妥，供應商尚未完成開通，真實帳號流程仍待驗收。
- 回饋僅為依會員 ID 隔離的瀏覽器草稿，沒有虛構案件、寄信成功或通知。
- 會員中心利用 History API 返回原畫面；背景頁面不重建，保留原本捲動與篩選。

## 資料責任與建議資料表（待核對線上 schema 後建置）

| 資料 | 欄位與用途 | 讀寫權限 |
| --- | --- | --- |
| auth.users / identities | Supabase 管理登入、已驗證信箱與手機、第三方身分 | Auth 管理，所有業務資料以 user UUID 關聯 |
| member_profiles | user_id PK/FK、display_name、avatar_path、locale、timezone、created_at、updated_at | 本人讀改自己的非權限欄位 |
| member_preferences | user_id PK/FK、theme、reduced_motion、notification_preferences、version | 本人讀改；Email 類型區分服務通知與行銷 |
| feedback_tickets | id UUID、ticket_number unique、user_id、category、subject、status、source_path、created_at、updated_at | 本人讀與建立；狀態只能客服或管理員改 |
| feedback_messages | id、ticket_id、author_id、body、visibility、created_at | 本人僅讀自己的案件公開留言；內部筆記只有客服 |
| feedback_attachments | id、message_id、storage_path、mime_type、size | 私有儲存、短效簽名連結，依案件授權 |
| member_notifications | id、user_id、type、ticket_id、read_at、created_at | 本人讀與標記已讀；伺服器建立 |
| notification_outbox | id、event_key unique、recipient_id、template、status、attempts、next_attempt_at、provider_message_id | 只有寄信工作程序；重試與防重複寄送 |
| member_roles | user_id、role、granted_by、created_at | 只有管理員；不可由 user_metadata 決定角色 |
| membership_entitlements | user_id、feature、starts_at、expires_at、source | 伺服器授權；預留訂閱而不預設付費權益 |
| member_devices | id、user_id、platform、push_token、last_seen_at、revoked_at | 本人管理裝置；推播 token 不公開 |
| admin_audit_log | actor_id、action、target_type、target_id、created_at | 伺服器追加，管理員查閱；不記錄憑證與敏感內容 |

所有 public 表都要開 RLS。一般會員只能存取自己的資料；管理員角色與案件歸屬必須在伺服器/資料庫檢查。外鍵刪除、帳號刪除與案件保留政策需一併定義。

## 正式回饋流程

1. 已登入會員提交案件。伺服器驗證身分、輸入長度、附件與頻率，產生案件編號。
2. 同一交易建立案件與 outbox 事件；資料成功後才回傳收件成功。
3. 寄信工作程序將確認信寄至已驗證通知信箱；失敗可重試，會員仍可查看已儲存案件。
4. 客服回覆建立公開留言、站內通知與寄信事件；內部筆記不寄出也不公開。
5. 使用者補充、狀態變更有歷程；未讀數從伺服器取得。

## 登入與 App

- Google / Apple 設定各自 web、iOS、Android client、允許回呼與 PKCE；不得從網址任意接受 redirect。
- LINE 驗證 OIDC token 並綁定統一 user ID；先核對目前 Supabase 自訂供應商能力，再決定整合方式。
- 手機使用簡訊 OTP，需供應商、速率限制、驗證次數限制、國碼正規化與真人防護；不預先宣稱手機等於自然人永久身分。
- 綁定/解綁供應商需最近登入或重新驗證，不能靠相同暱稱、未驗證 Email 自動合併。
- Apple 隱藏 Email、LINE 無 Email、手機會員都須獨立處理通知信箱驗證。
- 跨網站/App 共用會員 UUID；App 安全儲存 token，註銷裝置移除推播 token。
- 不在前端放 service_role、OAuth secret 或簡訊密鑰。

## 尚需設定與實作

尚未操作線上 schema、儲存 bucket、OAuth 控制台、簡訊或寄信服務。尚未提供正式回饋提交、客服後台、付費購買、第三方帳號綁定與裝置註銷功能。新社群/手機登入及頭像雲端儲存須由合夥人完成設定並實測後才正式啟用，詳見 member-activation-checklist.md。

## 驗收

需包含跨會員越權測試、未登入/過期憑證、暱稱長度、第三方回呼錯誤、同帳號綁定、寄信重試防重複、附件存取、返回原頁與手機/深淺背景。
