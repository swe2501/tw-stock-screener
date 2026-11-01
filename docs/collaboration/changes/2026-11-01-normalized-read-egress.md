# 2026-11-01 正規化讀取與 Supabase 傳輸量減量：第一批

## 已確認的實際問題

Supabase 組織 Usage 顯示：週期 2026-10-16 至 2026-11-16，Egress 6.091 / 5 GB（122%）；Database Size 0.299 / 0.5 GB（60%），專案 Taiwan stock2 顯示 284.83 MB。警告明載前一週期 Egress Exceeded，寬限至 2026-11-30，持續超額可能回傳 402。Free 目前不計收超額費，不是 11/30 自動轉付費。

此警告已涉及正規化前的帳務週期，不能歸咎於新增三張表。表數不是本次超額指標。既有用量累計不會因刪資料倒扣；改動效益須觀察後續每日用量與下一週期，不能當天宣稱警告已解除。

## 第一批程式

- api/prices.py 保持原搜尋／報價功能，同一既有 Function 新增 public_snapshot 與 security_catalog 公開 GET 動作；Function 總數仍為 12。
- 公開快照僅允許 themes/sectors/themeall/sectorall/overview 及相應 _rt；只能讀 page_cache 的指定公開欄位，使用 anon key，不能指定任意表或傳入會員 JWT。
- 明確 scope=prod/uat，UAT 優先自己的快照，缺少才讀 prod；兩者 cache identity 不混用。盤後 warm/CDN TTL 120 秒、盤中 15 秒；沿用來源日期、資料版本與現算備援判斷，不能用 cache TTL 冒充來源更新時間。
- 同 warm instance 相同查詢併行合併，不同查詢使用各自鎖。最多 8 個快取，每筆原始資料超過 2 MB 不進記憶體快取；回應有有界讀取、失敗不快取、公開 CORS。盤後瀏覽器 max-age 30 秒，盤中 0 秒。
- 將上述五個市場頁面的 _swrJson/_swrRT 共用路徑從瀏覽器直接抓 Supabase，改成 Vercel 共用快取。這是有重建來源的公開衍生快照，應保留快取層，不為追求正規化而改成每位使用者重算／下載全量行情。
- 共用 _loadNames 優先讀取 security_catalog，一次取得現名、產業、市場與 ETF 類型。保留上櫃債券 ETF 補充與舊載入器 fallback。後端以 500 筆分頁，避免 PostgREST 1000 筆上限截掉上市／上櫃資料；目錄 warm TTL 300 秒、CDN 120 秒。
- 日曆相同帳號／月份短暫快取 20 秒，合併同時讀取，最多 8 個月，不進共用快取；帳號切換、保存、刪除失效，generation 防止寫入前請求晚到覆蓋。保存前強制重新讀伺服器日期，不能用快取決定日期或授權。
- 僅觀察到既有 6.091 GB 組織總傳輸量，尚未取得各 URL 的線上 byte 歸因。單元測試證明四個同時請求合為一次 upstream，非宣稱實際月費或總流量已下降 75%。流量透過 Vercel 仍占其額度，不是無限免費。

## 已於 2026-11-01 明確批准並線上套用的 SQL

1. member-screen-normalized-read.sql：既有 member_screen_calendar 簽章與日期政策不變，stocks 改由 member_screen_record_items JOIN security_observed_names 重建；會員只能讀本人的有效紀錄。舊寫入、任務驗證與匯出仍保留相容，暫不刪 JSON。
2. security-master-read-bridge.sql：三個現有來源表以 statement trigger 更新 security_master，採既有名稱優先序、變更才更新，serial advisory lock 保護更新；不改 Windows 排程。security_catalog view 明確投影公開的 code/name/market/instrument_type/industry，不含任何會員欄位，僅開 select。來源刪除不刪主檔，避免歷史 FK 斷裂；下市／代號重用等生命週期仍須獨立規劃。

兩份 SQL 影響共用正式資料庫；本次已取得使用者具體批准，備份現有函數／資料／來源，確認同名物件不存在後才套用。程式原保留相容回退，現在可讀取已啟用的正規化目錄與日曆明細；SQL 檔進版控本身仍不會自動執行。

## 後續批次與刪除前提

- 全站靜態候選存取清單：docs/database/website-data-read-inventory.md；產生器 scripts/audit_data_reads.py，只讀本機原始碼。168 個候選位置、59 個來源（不是線上流量排行，包含需人工判別的寫入／註解／動態路徑）。
- 日曆 Contract：還須切換保存／冪等回應、任務資格／進度、會員服務匯出，以及所有舊客戶端直接讀取，再做復原演練，才能清理 stocks JSON。本批僅切日曆讀取，不能擅自刪欄位或停用舊 trigger。
- 券商主檔：先釐清跨來源 broker_id 命名空間，再做 broker/alias，改追蹤、排行榜、歷史與通知的 JOIN；不憑名稱合併。
- 題材主檔與股票多對多：保留來源、同義詞、歷史／生效日期，搭配公開快照重建。
- 法人／ETF／市場頁：窄欄位、按日期／代號查詢、分頁、公開共用快取；已是 code/trade_date 結構的 fact 表不為拆表而拆表。
- 新聞／研究文件／派工與會員紀錄逐項盤點；帳務、條款、歷史價格等必要快照不視為可刪重複資料。會員資料不可併入公開快取。

## 驗證

- 9 個公開資料 gateway Python 測試：anon-only、scope 隔離、allowlist、防任意表讀取、併行合併、過期、錯誤不快取、盤中 TTL、1259 筆分頁完整。
- 8 個既有搜尋 Python 回歸通過；修正舊測試假設 routes[0] 是搜尋路由，改找實際搜尋 dest，未改網站路由。
- Node：公開快照 client 路由與備援；共用證券字典與 OTC ETF；日曆併行／generation／TTL／帳號隔離。
- 隔離 PGlite：主檔變更同步、anon 目錄唯讀與禁止刷新；日曆 RPC 在舊 JSON 暫空的隔離情境仍由新明細完整重建；原 RLS／歷史快照／CAS／重試／墓碑維持。
- 真實瀏覽器 mock 回歸：日曆明暗、320/375/768/1366、保存與刪除；測試直接移除伺服器 fixture 時同步清掉讀取快取，以符合新短暫快取行為。
- 50 個 inline scripts 語法與 API 12/12 預算通過。


## 線上啟用證據

- 使用者明確允許本次兩份 SQL，非沿用先前不同 migration 的批准。
- 七張相關表已分頁備份且可讀性／SHA-256 校驗通過，原日曆函數與 ACL、原來源觸發器狀態另存本機，無會員內容進 Git。
- 套用前：15 筆日曆（11 有效）、297 明細、157 觀測名稱、2259 證券；重建差異 0，security_catalog／refresh function／來源觸發器原先皆不存在。
- 兩份 migration 套用成功。線上以 authenticated 驗證歷史月份日曆的股票清單、日期政策、owner/request 欄位不外洩；換其他 claim 及 anon 驗證會員隔離。
- 來源名稱更新能同步主檔，重複相同更新不重寫 master.updated_at；歷史選股名稱不變。所有測試更新位於 BEGIN/ROLLBACK，六張歷史及來源表事後與備份完全相同。
- anon 實際分頁可讀取 2259 筆目錄，只含 code/name/market/instrument_type/industry，無會員欄位；匿名及一般會員不能寫目錄或呼叫 refresh。
- 部署 UAT 26944f2e 的 /api/prices?action=security_catalog 實測回傳 source=security_catalog、version=1、2259 筆、2259 個不同代號；上市 market=tse，0050 類型 etf，沒有 1000 筆截斷。
- 同一個共享 DB 的日曆 RPC 現在 UAT／正式站均讀新明細；本次沒有發布正式站程式。因此市場快照 gateway 與新前端目錄載入器目前只在 UAT 程式啟用。
- 不新增資料表、不清空舊 JSON、不改會員 Auth、排程或收費方案。11/30 超額警告是否解除，須後續觀察實際用量，不能以遷移成功代替帳務狀態。
