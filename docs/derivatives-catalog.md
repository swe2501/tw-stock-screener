# 交易記帳的期貨商品目錄

`assets/member-derivatives-catalog.js` 是期交所公開資料的本地快照，透過既有靜態資產載入，沒有新增 Function。更新指令：`python scripts/update_derivatives_catalog.py`。更新失敗會保留既有檔案；提交前應核對商品數與 CDF/QFF。

來源：[股票期貨／選擇權交易標的](https://www.taifex.com.tw/cht/2/stockLists)、[交易系統商品代碼](https://www.taifex.com.tw/cht/4/contractName)。2026-10-16 擷取：320 個股票／ETF 標準期貨，加上九個指數期貨和 TXO。交易系統使用 TXF/MXF，搜尋同時接受常用 TX/MTX。期貨與選擇權依交易方式分開搜尋，不再把現貨股票代碼包裝成期貨。

搜尋支援商品代碼、台／臺名稱與標的證券代號。例如 2330 列出 CDF 台積電期貨和 QFF 小型台積電期貨；標準乘數分別由當日交易標的表的 2,000 股、100 股帶入，仍可修改。指數期貨與 TXO 現在也自動帶入乘數；**成交價格維持手填，合約年月由使用者選擇**。

2026-10-16 核對的標準新臺幣乘數如下；每筆目錄附官方規格來源與核對日，更新腳本的 `INDEX_SPECS` 也同步保留。更新股票清單不會自動偵測指數規格變更，須重新審查來源。歷史、調整型與其他未列契約請依成交單覆寫。

| 商品 | 每點乘數 | 官方規格 |
|---|---:|---|
| TXF／TX 大台 | 200 | [臺股](https://www.taifex.com.tw/cht/2/tX) |
| MXF／MTX 小台 | 50 | [小型臺指](https://www.taifex.com.tw/cht/2/mTX) |
| TMF 微台 | 10 | [微型臺指](https://www.taifex.com.tw/cht/2/tMF) |
| EXF 電子 | 4,000 | [電子](https://www.taifex.com.tw/cht/2/tE) |
| FXF 金融 | 1,000 | [金融](https://www.taifex.com.tw/cht/2/tF) |
| XIF 非金電 | 10 | [非金電](https://www.taifex.com.tw/cht/2/xIF) |
| ZEF 小電子 | 500 | [小型電子](https://www.taifex.com.tw/cht/2/zEF) |
| ZFF 小金融 | 250 | [小型金融](https://www.taifex.com.tw/cht/2/zFF) |
| G2F 富櫃200 | 50 | [富櫃200](https://www.taifex.com.tw/cht/2/g2F) |
| TXO 臺指選擇權 | 50 | [臺指選擇權](https://www.taifex.com.tw/cht/2/tXO) |

自動帶入只發生於選商品、更換商品或還原乘數空白的已知商品草稿；不覆寫明確填寫的乘數，也不修改歷史成交。選另一商品會更新乘數；單純重選同商品保留已填乘數。提示顯示商品標準乘數或自訂乘數，並換算目前口數每點變動金額。未知商品沒有猜測的預設值。既有 FIFO 損益引擎沿用填寫的乘數。

目錄不是即時掛牌月份查詢，不包含全部調整型、週契約或海外商品。未列商品仍可手填完整代碼、年月、乘數。不要將標準股數套用到除權息調整契約。更換期貨／選擇權或現貨類型時清除不相容的標的、價量、年月與乘數，避免誤把股票當期貨；保留理由、策略與分析面向。

數量選單只列適用單位：現貨類為整張／零股，期貨與選擇權為可用的口。原本現股下灰色的口選項已移除；引擎仍要求衍生商品口數為正整數，且年月、乘數有效。
