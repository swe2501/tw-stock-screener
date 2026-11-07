# 2026-11-08 論壇簽到、補發代碼、站內廣告、點數與商品後台

分支：`shared/justy/forum-ads` → justy-layout → uat（經 `scripts/collab.py integrate --publish-uat`）

## 變更
- 新增 `lib/forum_ads.py`，由 `api/auth.py` 轉接。
  - 會員／公開端 action：`forum_events`、`forum_pass`、`forum_checkin`、`forum_redeem`、`site_ads`、`ad_click`。
  - 管理端 action（沿用既有 `_verify_admin` 管理員白名單）：
    - `admin_forum_list`、`admin_forum_save`、`admin_forum_delete`
    - `admin_forum_qr`、`admin_forum_attendees`
    - `admin_forum_codes`、`admin_forum_code_check`
    - `admin_ads_list`、`admin_ads_save`、`admin_ads_delete`
    - `admin_points_find`、`admin_points_adjust`、`admin_points_recent`
    - `admin_products_list`、`admin_products_save`
  - 寫入類操作記入既有的 `admin_audit_log`。
- 後台新增三個分頁：論壇活動、站內廣告、點數與商品（`assets/admin-forum-ads.js`）。
- 會員端新增 `assets/forum-member.js`：
  - 網址 `?checkin=` 開啟簽到視窗。
  - 網址 `?forum=1` 開啟論壇場次視窗。
  - 會員中心「活動兌換」遇到論壇代碼時，改走 `forum_redeem`。
  - 負責站內廣告版位的顯示。
- 樣式：`assets/forum-ads.css`。
- QR 元件 `assets/vendor/qrcode-generator-1.4.4.js`（MIT，僅後台載入）。
- 測試：`tests/test_forum_ads.py`，14 個。

## 規則
- 現場 QR 每 60 秒換一次，接受最近約 2–3 分鐘內的 QR。
  - 掃到有效 QR 後發 40 分鐘的簽到憑證，讓現場註冊、驗證的人來得及。
  - 開放時間：活動開始前 60 分鐘到結束。
- 補發代碼格式：`TPE1122-XXXXX-XXXX`。
  - 隨機產生，用伺服器簽章驗真，不另存清單。
  - 一碼只能用一次（`forumcode:<碼>` 寫入衝突即視為已用）。
  - 兌換期限：活動開始起，到活動後 N 天（每場可設 1–60 天，預設 14 天）。
- 每位會員一生只能領一次論壇點數：寫入 `member_point_ledger`，`source_event_key='forum-attend:<user>'`，靠既有的 unique 限制。
- 必須是已驗證 Email 或手機的會員才能簽到或兌換。
- 測試場次只記錄簽到，不發點數。
- 手動調整點數：
  - 寫入 `member_point_ledger`，`source_event_key='admin-adjust:<request_id>'`（重送不會重複入帳）。
  - 原因必填，會員看得到。
  - 扣點不能扣到負數。
- 兌換商品：只能修改 `member_exchange_definitions` 的 `title`、`points`、`active`。
  - 名稱擋買賣、進出場、停損、保證獲利等用語。

## 相容性
- **不新增資料表、不改 schema、不動 Auth、不加排程或付費服務。**
- 只讀寫既有的 `admin_settings`（鍵值，僅 service_role）、`member_point_ledger`、`member_exchange_definitions`。
- `admin_settings` 新增的鍵：
  - `forum:events`
  - `forumcheckin:<場次>:<會員>`
  - `forumcode:<碼>`
  - `site_ads`
  - `adclick:<廣告>:<日期>`
- 簽章金鑰：預設由既有的 `SUPABASE_SERVICE_KEY` 衍生，可用環境變數 `FORUM_CODE_SECRET` 覆蓋。
  - 換金鑰會讓尚未兌換的代碼與現場 QR 一起失效。
- 既有的 `redeem_member_promo_code` 與一般優惠碼不受影響（格式不同才會分流）。
- App 端如要支援論壇簽到，呼叫相同的 action 即可，回應皆為 JSON。
- uat 與 prod 共用同一個 Supabase：在 uat 用正式場次簽到會真的發點，測試請勾「測試場次」。
