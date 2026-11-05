# 首頁市場圖表標記與 K 圖指數搜尋

網站本機改動；尚未發布。不修改共用 API、資料庫、Auth 或排程。

- K 圖搜尋同時比對個股與市場名稱/別名。既有個股精確代號優先；指數不經股票代號路由，開啟原有首頁市場圖表。搜尋個股資料未載入時，指數仍可搜尋。
- XQ 代號依官方說明核對：TSE.TW、OTC.TW、FITX*1.TF、VIX.TF、TWD.FX；台指近月數字別名 .10088。資料來源代號保持既有 ^TWII、two、wtx&、vixtwn、TWD=X，不將顯示代號當成後端資料代號。
- 富台指期用使用者指定的 SGX FTSE TAIWAN 名稱，沿用 stwn&，不加入已不同商品的舊摩根台指別名。
- 首頁通用市場圖表與加權市場列車接入獨立標記層：線段、水平線、矩形、圓形、箭頭、黃金分割、三點黃金幅度尺、橡皮擦、復原、拖曳、右鍵複製/貼上/刪除。依日期和價格保存，按商品隔離存於此瀏覽器，不宣稱會員跨裝置同步。
- 標記不參與自動價格縮放，隨時間/價格座標重新投影；大盤左軸啟用時計入軸寬。啟用繪圖只停用按住滑鼠移圖，保留滾輪縮放；右鍵/Esc 返回瀏覽。關閉 dialog 取消監聽與動畫框。
- 延用原圖均線、K棒、基準疊加、一年新高旗標；沒有開高低的來源仍不能偽造 K 棒。

核對來源：
- https://www.xq.com.tw/aphelp/DAQ/html/functionI8.htm
- https://www.xq.com.tw/aphelp/DAQ/html/functionR.htm
- https://forum.xq.com.tw/thread/請問xq可以看到-臺指選擇權波動率-嗎/

國際指數先依使用者要求調查富途代號並回報，尚未接入搜尋/行情：.DJI、.SPX、.IXIC、.NDX、.SOX、.VIX、.N225。美國 .VIX 與台指 VIX.TF 是不同指標，不可混用。

後續修正（使用者回報首頁搜不到）：原版只接 K 圖搜尋，首頁 hero 仍僅比對股票。現將首頁、舊頁首、統一導覽搜尋接到相同商品清單，加入使用者輸入 tex 的台指期別名及 XQ .0000；統一搜尋將市場結果分組，開啟市場圖表，避免送到股票路由。

七種國際指數現接入原有 /api/chart 的 ^DJI、^GSPC、^IXIC、^NDX、^SOX、^VIX、^N225，延用均線及新增標記工具。2026-11-05 實際唯讀確認七種皆有歷史行情（485～504 筆）；VIX 與 NDX 不需新增 API 或資料庫。瀏覽器新增首頁搜尋按鈕/Enter、頁首 .SOX 及所有七種代號的首頁/K 圖搜尋測試。資源版號 market-chart-tools v2，site-search market2 防止沿用舊腳本。

再次修正呈現方式：使用者要求搜尋結果在原 K 圖內切換，不開首頁走勢 dialog。所有搜尋的市場結果改走 openIndexChart；保留原 K 圖同一組均線、畫線、黃金尺及滾輪縮放。四種既有市場代號（two/wtx&/vixtwn/stwn&）由公開 index_history 讀取真實開高低收再進原 renderTVChart，缺開高低日期略過並提示，不以收盤冒充開高低。該來源沒有成交量，因此原 K 圖隱藏量能副圖並於日期說明標示；也停用無資料的小時/分時按鈕，換回其他來源恢復。台指 VIX 與美國 ^VIX 使用不同資料，不互相替代。

切換時清空上一檔分點及催化訊號、停止個股即時輪詢、解除舊清單瀏覽，保留純 K 分析模式。既有畫線按商品儲存，切換不帶走原標記、已選畫線工具保持啟用。測試斷言沒有建立 seriesChartDialog/marketTrainDialog，驗證原圖線段、跨商品隔離、週線及按鈕資料範圍。前端資源更新至 market-chart-tools v3。

驗證：tests/market-chart-tools.browser.cjs 使用真實 Lightweight Charts 4.1.3、固定行情與網站 HTML，在 Edge 深淺色驗證別名、滑鼠/Enter 搜尋、畫線、滾輪不修改日期價格錨點、拖動、重開保留、右鍵複製貼上、橡皮擦、三點尺及加權市場列車；手機與矮視窗檢查工具列換行。

整合驗證（2026-11-06）：K 圖搜尋及繪圖 browser 測試深淺色與 3 種窄版配置通過；API 12/12、協作範圍通過。Python 全回歸 269 項中有 6 項失敗（groupbook snapshot 2、web layout route parser 3、visual-pattern fixture 1）；另以未修改 origin/uat 暫存副本重跑，完全重現相同 6 項，屬既有基線問題，本次未改相關後端或測試。
