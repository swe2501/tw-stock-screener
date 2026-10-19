# App 首頁：網站主視覺區

本輪將網站首頁第一大區塊改成原生 App 元件：FIELD NOTE、短中期研究主標與摘要、股票名錄搜尋、六個觀察索引、富台指／VIX／匯率／結算、每日守紀及 TODAY’S READING 四格指標。手機上下排列，900px 以上雙欄；窄螢幕與放大字體改為單欄 KPI。頁首明暗開關同步全部頁籤，使用 SecureStore 保存裝置偏好，初次跟隨系統。

資料直接唯讀存取網站現有公開來源：網站 chart/screen API，以及公開研究 Supabase 的 inst_market_daily、margin_market、sector_turnover、market_indicators、hot_topics、daily_slogan。不修改網站、API、資料表或 Auth；會員測試 Supabase 與研究資料完全分開。公開 publishable key 只用於現有公開研究表，不是管理金鑰。

hero-reading 沿用網站已公開的 researchReading 函式；測試以網站原函式比對 100 組門檻／缺值組合，九種今日判讀也逐一對照。主要行情、廣度、法人與融資須資料日對齊；缺值顯示「—」，不補零或編造結論。結算使用台北日期與官方休市日，跨年沒有休市資料時不顯示推算值。頁面顯示盤後資料日期，支援重新整理與錯誤提示。

目前股票結果點擊進入相關研究新聞；完整個股 K 線介面不在本輪。完整報告連結開啟既有網站。題材索引同樣可進入研究搜尋。

驗證：TypeScript、會員與首頁 23 項測試、實際唯讀來源比對，以及 iOS／Android bundle。實機視覺仍需 iPhone Expo Go 重新載入後確認；編譯通過不等同實機視覺驗收。SDK57 預覽只同步本輪 App 功能提交，不合併回 UAT。
