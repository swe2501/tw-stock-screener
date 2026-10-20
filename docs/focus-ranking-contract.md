# 今日排行擴充契約（2026-10-20）

使用者明確批准在獨立 shared 分支補齊欄位，完成原三榜改版。保留 `/api/screen?stat=focus&n=30`、原榜序、漲跌幅／量比計算及 price_window 資料源，不新增 HTTP Function。

每列保留 code/name/close/chg（爆量另有 vol/ratio），新增：

- chg_5d：快照行情日收盤相對第五個先前市場交易日收盤，百分比四捨五入至兩位。缺少指定基準日或價格無效為 null，不使用停牌股票的「第五筆可用資料」代替日期。
- themes：完整站內 THEME_MEMBERS 分類名單，`[{id:名稱,name:名稱}]`，可導向既有 `_openThemeDrawer` 族群明細；未分類為 []，不從股名或新聞推測。
- volume_lots：原 vol ÷1000，保留三位小數。fetch_prices.py 的 TWSE CSV 欄位為成交股數，upload_price_window.py 原值保留，所以 vol 單位仍為股，不改原值或量比。

回應新增 fields_version=2、five_day_base_date、volume_unit=shares、volume_lots_unit=lots、theme_source=THEME_MEMBERS。

新盤後快照產生時利用已讀取的價格窗，無額外網路請求。舊版快照在讀取時只針對上榜股票批次補欄位：最多兩次 price_window 查詢，不重排名、不重抓全市場、不逐股請求。每 worker 五分鐘快取，失敗三十秒重試；新格式快照不增加讀取。

唯讀線上驗證（沒有上傳或改 Supabase 快照）：行情日 2026-10-19、五日基準 2026-10-12，三榜各30列。5日欄位可得25／30／30列，題材分類7／12／6列；爆量30列皆有volume_lots。缺資料照實顯示，不補零。

`scripts/serve_web_preview.py` 只綁127.0.0.1，讀網站本來公開的 Supabase URL/anon key 提供唯讀 focus 端點，解決純靜態預覽 `/api/screen` 404。它不讀 env、不載入 service key、不改 Auth、不模擬其他私人 API。

Python 測試涵蓋跨市場基準日、停牌／缺值、主榜順序不變、舊快照批次讀取與快取、數字單位，以及新快照無額外I/O。網站為靜態HTML／JS／CSS，驗證使用JS語法及Playwright，沒有 npm build 腳本。
