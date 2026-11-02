# 2026-11-02 主力訊號 K 圖左右導航保留分點箭頭

問題：主力訊號列表第一次點入會設定 _chartFocusBroker，但載入後即消耗；通用左右導航只保留股票代號，下一檔不再指定該列分點／日期，回上一檔也失去自動勾選。

修正 chart-list-navigation.js 的列表項目保留 _sigOpenChart 原有的 label、brokerId、date；切換時透過原訊號開圖函數，按每檔自己的分點重新載入紅買／綠賣箭頭。一般列表仍維持原開圖流程。更新 asset query version 避免舊快取。

_loadBrokerEntries 捕獲該次 focus，使用 generation 與本地 entries，完成前才原子發布；快速 A→B→A 時舊的同代號請求也不能覆蓋目前狀態。沒有資料庫／API／Auth／排程改動。

驗證：broker-signal-navigation.browser.cjs 明暗兩種主題，實際點下一檔／上一檔、鍵盤左右，確認各自分點選取與紅綠箭頭；普通開圖不沿用訊號分點。broker-loader-race.test.cjs 驗證 A→B→A 舊請求回覆不覆蓋。既有 broker-candle-markers.browser.cjs 明暗紅綠箭頭、同日去重、提示／勾選及週月年週期通過；fixture 改等待載入完成，避免固定300毫秒競態，並略過導覽。49段 inline JavaScript 語法及導航腳本語法通過。

使用獨立 shared worktree，沒有更動主目錄其他人未提交修改；保留最新 UAT 內容，未發布 prod。
