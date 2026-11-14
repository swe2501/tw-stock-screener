# 商品分類權益與兌換範圍

JUSTY明確確認自訂點數商品開放所有登入會員兌換，要求分類展開細項，同樣套用會員商品與付款設定（售價取代所需點數），並核對首頁與會員權益。

## 分類與權限
共用admin-feature-picker：首頁／市場觀察、題材研究、K圖／選股、ETF、個人研究／學習；每類可展開收合、全選可用細項與計數。會員商品沿現有9個FEATURES代碼，不新增會員AI或管理員功能。首頁行情、籌碼報告、法人／槓桿、璞玉等非獨立授權區塊清楚標示，不因商品而鎖原公開內容。使用券僅能選member_feature_catalog中member_research且voucher_enabled項目，其他功能顯示未接通，伺服器重複驗證。

## 介面
新增點數商品改為名稱、內容、使用天數、所需點數、分類權益，移除固定商品角色空白選單與selectedOptions空值例外；未讀到權益時停用建立並提示。商品與付款設定共用分類，保留售價、原權限代碼、付款關閉與版本快照。會員權益詳細區依商品勾選顯示分類功能與天數；兌換選項／確認區顯示描述與工具名稱。

## 配套SQL，準備階段紀錄
member-custom-exchange-products.sql只準備：新service-only admin_member_exchange_create原子建立research類型的固定功能券與下架兌換商品，用request UUID去重；research只是券內部代碼，不授與整個會員方案；重用原扣點兌換與啟用流程，快照保留已核發功能。member_point_exchange_options仍只允許authenticated，增加描述與feature_titles。未修改任何線上資料，未自動開付款；雲端新自訂兌換商品須另明確批准配套SQL才可建立。舊固定券API維持相容。

## 驗證
34項論壇Python、5項會員商品Python、分類UI與付款售價／權益保存、既有刪除／定位回歸、PGlite建立去重／下架不可見／非登入拒絕／原券核發與啟用保留固定快照／service-only權限通過。SQL檢查為隔離環境，不代表雲端已啟用。

## 2026-11-13 正式配套啟用
依JUSTY「幫我可以讓她正式使用」與繼續指示，已在指定Supabase SQL Editor套用member-commerce-settings.sql及member-custom-exchange-products.sql，兩次均回傳Success。唯讀驗證確認4個管理／授權函式僅service_role可執行；兌換選項僅authenticated，anon不可執行；commerce_features快照欄位已建立。當前可用券功能為breadth、fhedge、hottopics、selltrack，其他未接通功能仍停用。

沒有建立示範商品、發券或扣真實會員點數；沒有建立member_commerce_v1設定或開啟付款。管理員首次儲存商品設定後，沿原revision與快照規則運作。新增隔離SQL測試確認版本衝突、付款關閉拒單、已購權益在修改／下架後保留、券功能白名單及私有函式權限。

發布排除03聊天室正在開發的裝置限制／Auth草稿；其獨立工作區內容保留，不因本次發布宣稱已啟用。
