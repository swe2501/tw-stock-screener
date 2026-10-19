# 小書靈引導規則與公開策略庫

## 固定流程

1. 允許直接說明明確規則；不知道時介紹可觀察的量價／指標。
2. 若先提出勝率、報酬或回撤目標，將它標為研究目標，不能當作保證。先問商品範圍、持有偏好與優先評估面向。
3. 從已整理的公開方向比較 2～3 個，列出原理、可能失效情境及支援狀態。分類不代表風險較低或績效較好，不依假造勝率排名。
4. 確認買進／賣出條件、週期、比較方式、門檻、風控與名稱。區分持續高於與剛穿越、含當日與前 N 根。範例值未被選取前不能作為交易設定。
5. 參數不足要詢問；不支援的商品或函式要說明。布林通道與 ATR 動態停損只能討論，不能產生可回測草稿。
6. 最後顯示待確認提案；使用者明確套用後才進入未儲存草稿。不得自動保存、回測、委託或覆蓋後續編輯。
7. 檢視結果時一起看成本、交易次數、勝率、賺賠幅度、回撤與樣本外表現。不依少數交易或樣本內最佳參數宣稱目標達成；本次未新增樣本外引擎。

目前是有限句型／狀態引導，並非已連線的生成式 AI。生成式 AI 服務預留同樣規則，但未啟用、未做付費或真實模型呼叫。

## 公開策略方向

以下為原理參考，由本站另外實作與驗證自己的規則，來源不替本站回測或策略績效背書。搜尋目前只比對這份有限公開庫，不會即時上網，也不讀取會員策略或網站私有算法。

| 方向 | 現況 | 原理來源 |
| --- | --- | --- |
| 均線趨勢 | 可逐步設定及驗算 | [TradingView：Moving Averages](https://www.tradingview.com/support/solutions/43000502589-moving-averages/) |
| RSI 回升 | 可逐步設定及驗算 | [TradingView：RSI](https://www.tradingview.com/support/solutions/43000502338-relative-strength-index-rsi/) |
| MACD 動能 | 須確認快／慢／訊號 EMA 週期 | [TradingView：MACD](https://www.tradingview.com/support/solutions/43000502344-moving-average-convergence-divergence-macd-indicator/) |
| KD 交叉 | 須確認 RSV 週期與 K/D 平滑；本站初值為 50，並非宣稱與每家平台相同 | [TradingView：Stochastic](https://www.tradingview.com/support/solutions/43000502332-stochastic-stoch/) |
| 區間突破 | 本站另定義前 N 根最高／最低價、不含當日 | [趨勢及支撐壓力原理參考](https://www.tradingview.com/support/solutions/43000502589-moving-averages/) |
| 成交量確認 | 可設定前期均量倍數；不代表價格方向 | [TradingView：Volume](https://www.tradingview.com/support/solutions/43000591617-volume/) |
| 布林通道 | 僅討論，尚缺標準差及完整通道規則 | [TradingView：Bollinger Bands](https://www.tradingview.com/support/solutions/43000501840-bollinger-bands-bb/) |
| ATR 波動風控 | 僅討論，尚缺 ATR 與動態停損成交模型 | [TradingView：ATR](https://www.tradingview.com/support/solutions/43000501823-average-true-range-atr/) |

## UI 驗收

- 視窗放大／還原及縮小收起不清除本次對話；切離工作台才清理。
- 助手泡泡靠左，使用者靠右；文字以 textContent 顯示，不執行 HTML。
- 公開策略搜尋有空結果與來源；選方向只重新開始引導，不自動套用草稿。
- 拖曳放開只回到左、右、下邊緣；減速動畫需覆寫全站按鈕 transition，減少動畫設定優先。拖曳不誤開聊天室，視窗變小仍在可見範圍。
- 單元測試用合成行情確認引導只採已確認參數；瀏覽器 fixture 驗證左右泡泡、來源搜尋、尺寸與手機／深色排版。這不是對真實模型或實盤策略的認證。
