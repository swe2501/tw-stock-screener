# 會員補強前三步發布紀錄（2026-10-22）

JUSTY 明確批准「可以上線啊！可以批准」後，先發布 justy-layout，再整合發布 UAT。功能提交為 `2c6fa7f9db05be1f5a0b8b8a677ec87d6ed2a555`。本紀錄為後續文件提交；未推正式站 prod 前端。

## 已發布內容

1. 點數兌換：餘額、按鈕與確認視窗統一使用任務＋儲值總點數。
2. AI 轉入／轉回：未確認交易保留帳號、單號、方向與點數；跨分頁 Web Lock、帳號切換防護、原單號重試。AI／儲值開關維持關閉。
3. 學習任務：保留個人已讀進度，另外建立伺服器閱讀核驗、測驗評分、週挑戰紀錄及任務資格判斷。

## 共用資料庫

登入既有 Supabase Taiwan stock2 SQL Editor，先只讀核對既有 verifier、任務與 AI 開關，確認和測試版本一致，再將以下兩檔以**單一 transaction**套用：

- `docs/database/member-learning-verification.sql`
- `docs/database/member-learning-catalog-v1.sql`

SQL 執行後結果：課程 76 篇、週挑戰 10 組、核驗函式已安裝；讀 10／30 篇、4 週挑戰及 7／15／30 天連續任務全部維持關閉（active 共 0）。既有學習任務 active 與 points 保留，只有 verifier 改為查伺服器證明。

後續只讀核對：5 張新表均啟用 RLS；會員不能直接 INSERT 完成表、不能直接執行內部評分器；可以執行本人閱讀核驗 RPC。AI active=false、stored_enabled=false。

本次未新增／修改會員餘額、未補發或回收點數、未以真實會員領取測試點數；未啟用任何新任務。

## 驗證

- Vercel 網站部署成功：[功能版本部署](https://vercel.com/andrew250165s-projects/tw-stock-screener/2NeYoAkEeSyK4uYhLQEpSPTnRvPf)。
- UAT 網頁重新載入後，DOM 確認載入 member-identity ai2、member-missions points9、member-ai-points v2、member-learning-verification v1、learning-center v7。
- 25 項 identity 測試、AI PGlite 測試、學習核驗 PGlite 測試、題庫一致性檢查通過。
- 瀏覽器兌換、AI 重試／跨分頁、學習資格旗標及完整學習中心深淺 1440／375 版面測試通過。
- API 12/12 與 shared 分支協作範圍檢查通過。

**實帳限制**：目前 Chrome 的 UAT 網站是未登入狀態，未完成登入後本人實際核驗／領點測試；不可把隔離測試或資料庫結構檢查宣稱為真人帳戶驗收通過。用戶登入後可在文章完成測驗、按「核驗閱讀進度」，再到任務查看資格。

其他筆記、模擬及回顧 member_report 任務尚未在本次改成伺服器證明，後續須分項補強。清除瀏覽器資料或換裝置會失去 AI 未確認操作的本機單號，仍需核對伺服器明細。
