# 後台廣告、商品與論壇報名整合（2026-11-11）

## 本次範圍

獨立分支 `shared/justy/admin-management`。網站後台論壇活動與站內廣告、點數任務／兌換商品分頁；會員論壇報名、通知與新增商品顯示。沒有修改 App、定價、會員 AI、排程或金融大廈。

## 論壇規則與操作位置

- 會員於站內論壇場次視窗報名；已驗證 Email 或手機才可報名。每位會員帳號一生限實際參加一次。
- 同時最多保留一場未結束的報名；開始前可取消，取消不算未到場。
- 活動結束仍無報到紀錄才計未到場；三次後第四次報名拒絕並建立站內通知。相同封鎖期間不重複通知。
- 後台「論壇活動 → 場次 → 報名名單」按狀態分頁查看；未到場者可填原因解除報名封鎖。保留原紀錄；解除不會移除已參加過的終身限制。
- 掃 QR 或補發代碼使用同一個 `forum-attend:<會員ID>` 唯一領點鍵，1,000 點一生限領一次，跨場次不重複。
- 到場需實際掃碼／核銷，不能只靠報名視為到場。系統以會員帳號識別，無法僅憑本功能辨認同一自然人多帳號，仍需既有電話唯一綁定與現場核對。
- 有報名或報到紀錄的場次禁止刪除，可關閉。測試場次不發點、不進正式報名流程。

## 廣告與其他後台

- 「站內廣告 → 新增廣告」：選版位 → 編輯文字／圖片／影片 → 桌機／手機預覽 → 儲存草稿或確認儲存。
- 圖片 JPG/PNG/WebP 上限 5 MB；MP4 上限 30 MB，不自動播放。建議首頁／會員中心 1200×600、結果上方1200×400、右下角640×480。公告條純文字。
- 圖片調整裁切位置，以 CSS 顯示、不修改原圖；素材也能輸入 HTTPS 網址。管理員取得一次性簽名後直接上傳 Storage，不讓大檔通過32KB auth JSON API。
- 素材為公開廣告內容，不可上傳個資；素材上傳後放棄或刪除廣告不自動刪檔，後續清理須另行核准。
- 補發代碼分批持久保存，關閉再開可讀；每頁10筆，未使用可作廢，已使用保留。不直接刪除核銷紀錄。舊代碼可貼入查核／作廢。
- 場次有內部備註，不出現在公開 API。點數搜尋可清除；手動調整沿用真實 ledger 通知，會員端既有刷新間隔約60秒。
- 商品下拉選擇既有角色、自訂1～366天；預設不上架，確認點數再上架。名稱天數置後。新增上架商品經既有商品 API 出現在會員兌換頁，扣點沿用原交易與重試單號。
- 任務表頭與欄位對齊，次級分頁與主導覽分隔；管理彈窗採原生 dialog 頂層與不透明內文，避免背景文字透出及遮罩擋點。

## 共享 API 與相容性

仍只有既有 `/api/auth`，沒有新增 Function 入口，預算12/12。
新增 action：`admin_ads_media_upload`、`admin_products_create`、`admin_forum_codes_list`、`admin_forum_code_revoke`、`forum_registration_status`、`forum_register`、`forum_cancel`、`admin_forum_registrations`、`admin_forum_registration_reset`。
管理 action 沿用管理員驗證；會員 action 以伺服器登入身分傳入 RPC，不接受客端指定會員 ID。新增媒體／備註欄位皆可選；舊純文字廣告和 QR／代碼流程相容。舊版網站無站內報名按鈕，App 沒有新增必要欄位；尚未串接 App 報名介面。
資料讀取失敗時不當作未領過；代碼歷史分頁讀取避免1000筆上限造成誤判。

## 雲端啟用：僅準備，尚未執行

本機測試不能代表共用 Supabase 已更新。依 AGENTS.md／協作規範，正式資料庫 migration 與活動啟用須另行明確批准。

1. `docs/database/forum-registration.sql`：私有報名／名額／未到場／管理解除 RPC，僅 service_role 可呼叫。依賴既有 admin_settings 與唯一 source_event_key 點數表，不新增公開寫入權。
2. `docs/database/forum-registration-notifications.sql`：保留既有通知來源並加入本人論壇封鎖通知。依賴現有 member-notification-inbox.sql 及其相關會員表。
3. `docs/database/site-ad-media.sql`：新增 public `site-ad-media` bucket與格式限制；不開匿名／一般會員上傳。後台使用既有 SUPABASE_URL／SUPABASE_SERVICE_KEY，沒有新增密鑰。

未套用1時站內報名明確顯示未連線、不能假報名成功；未套用2無法驗證線上鈴鐺的論壇通知；未套用3直接檔案上傳不可用，仍可用 HTTPS 素材網址。沒有更動 OAuth／簡訊／付費服務。

## 驗證與回復

- `python -m unittest discover -s tests -p test_forum_ads.py`：24 項，含跨場 QR＋代碼一生一次、批次作廢、2001筆分頁、備註、商品、授權／讀取失敗。
- `python -m unittest discover -s tests -p test_admin_ad_media.py`：3項，含格式大小、簽名路徑與故障。
- `node tests/forum-registration.sql.cjs`（PGLITE_MODULE 指向本機 PGlite）：在隔離記憶體 PostgreSQL 測名額、重複送出、取消、三次未到、一次通知、解除後仍禁止已參加者、RPC執行權限。
- `node tests/admin-ad-editor.browser.cjs`（NODE_PATH 含 Playwright）：Chrome 實際操作選檔、預覽、模擬簽名上傳與儲存；1366×900／390×844 深淺色可讀與視窗邊界。不是實際雲端上傳驗證。
- `node tests/forum-registration.browser.cjs`：模擬會員報名、取消、三次未到場拒絕與手機版邊界；不是正式 API 驗收。
- 發布前仍需核准後在測試帳號實測線上註冊、掃碼、名單、通知及 Storage，不能把上述測試視為全站驗收。
- 回復程式使用此功能提交的 Git revert，不刪會員 ledger／核銷紀錄。尚未套用 SQL 無需回復資料。若已啟用，先暫停入口並保留記錄，再依審核決定撤銷新 RPC執行權；不要刪公開 bucket中的現用素材。
