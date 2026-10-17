# 外資結算成本的盤別切換

首頁摘要與期貨分析共用日盤／夜盤選擇。切換收盤價、圖上價位、距估算成本及狀態；結算估算基準不隨盤別改變。

使用既有 `/api/chart?code=TX%3DF&interval=1d&session=split`，不增加 Function。來源為期交所公開 `DailyMarketReportFut`，僅接納 TX、有效年月與正有限收盤價。使用最新公布交易日的最近月份合約，日／夜均取同一合約；不採價差合約、其他商品、加權指數替代值或較舊盤別填補。一般為日盤，盤後／夜盤為夜盤。

畫面明示「期交所公布行情，非即時報價」，日期為期交所交易日。缺少所選盤別或上游失敗時顯示待更新，清除價格點及差額，不保留另一盤的數字。原有未帶 session 的 chart 路徑維持既有行為。

驗證：`python -m unittest discover -s tests -p test_tx_sessions.py`、`node tests/foreign-cost-sessions.browser.cjs`（Playwright），涵蓋不同收盤價、同合約、無資料、上游失敗及 390px 排版。2026-10-17 實際公開來源讀取得到交易日 2026-10-16、202610 合約日盤 47,242、夜盤 47,366；這只是該次來源回應，不是即時行情承諾。
