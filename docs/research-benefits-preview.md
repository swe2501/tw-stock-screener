# 研究畫面與使用券前端（本機預覽）

2026-10-19～20：依七張截圖修正。

- 題材索引分頁與圖卡留 20px 間距。
- 產業地圖／題材列表選方塊不再捲動整個文件。桌面右側檢視器保持標題可見並重設內部捲動；手機保留底部展開面板，從清單開頭閱讀。
- 今日型態卡提供向上／向下與 15 種型態選單。目前資料管線有箱型、假突破、假跌破；其餘顯示尚未接入，沒有冒用箱型結果。只列最新加權交易日與同日型態快照中、突破日期也為當日的訊號。快照落後顯示待更新，不把歷史訊號冒充今日。
- 強／弱產業標頭各用紅／綠漸層與主題底色融合，深色保持可讀。
- 禮品信封有短促金光、滑過抬升與鍵盤反應，點擊進入自己的禮遇；減少動態時停用。兌換按鈕獨立留白。
- 使用券區區分待啟用／使用中／過期。領取任務券不直接發權限；須確認啟用。已用券存在時提醒重疊倒數。
- 邀請好友直接顯示伺服器核發的本人專屬碼；登入後嘗試補齊已有會員代碼，失敗不影響登入，不產生假碼。新註冊即配碼需要 shared 分支的資料庫 trigger。

## 未部署的依賴與最新方向

shared/justy/benefit-vouchers 分支準備 docs/database/member-share-vouchers.sql、隔離資料庫測試與規格。尚未套用共用資料庫或啟用活動，前端服務未就緒時顯示準備中。

使用者於 2026-10-20 追加 VIP＋三階與自選券：詳見該 shared 分支 docs/member-voucher-tiers.md。現有 research_tools 券僅為流程原型，不代表已落實所有等級。新版等級、各級功能與自選數量確認前，不可部署目前單一 research_tools 發券設定。

驗證：research-polish.browser.cjs 覆蓋真實頁面深淺色、桌面／390／320、地圖點擊不跳頁、當日／過期資料、自選型態未接資料、領券不啟用、明確啟用後更新、信封與減少動態。member-identity.test.cjs 保留 OAuth／綁定／手機驗證回歸並加入邀請碼補齊重試。member-controls-full-page.browser.cjs 驗證實際會員頁深淺與登出。

發布：尚未 push。本機在 justy-layout；按使用者數字流程，收到 23 才先推 JUSTY，再整合 UAT。
## 2026-10-20 會員快捷面板與排行榜追加需求

- 頭像 hover（桌面）、ArrowDown／Escape（鍵盤）、點擊（手機）開啟非模態快捷面板。資料取本人會員 API，沒有複製參考站點數或稱號。
- 面板入口：個人檔案、任務、自選、帳號安全、使用券、邀請好友、會員權益、登出。任務點數／儲值點數分開；member_wallet_summary 尚未部署時顯示尚未接通，不把最近 100 筆流水加總冒充餘額。
- 儲值尚無付款服務、儲值 ledger、換算／使用／退款規則，不開放付款或自行加值。完整帳務須 shared 後端設計與驗收。
- 自選券已確認每張選 1 項；VIP 與三個等級功能組合仍是討論稿。
- 排行榜缺 5 日漲跌及題材識別資料，依使用者第 6 點暫停該改版；詳細欄位盤點見 focus-ranking-field-audit.md，未改 API。

## 會員面板細節驗證

統一 24px 線性 SVG 圖標、網站藍灰／金色點綴；淺色墨灰字、深色白字。瀏覽器檢查主文字與點數文字相對面板背景對比至少 4.5:1；320、375、1366px 深淺色均檢查界線、滑鼠移入橋接、觸控展開、鍵盤選取／Escape、頁面導覽與真正登出。儲值未開通不顯示假零餘額。

## 本次修改檔案

網站：
- apps/web/index.html
- apps/web/assets/research-polish.css（新增）
- apps/web/assets/pattern-focus.js（新增）
- apps/web/assets/member-quick-menu.js（新增）
- apps/web/assets/member-center.js
- apps/web/assets/member-features.js
- apps/web/assets/member-identity.js
- apps/web/assets/member-share.js
- apps/web/assets/member-signin.js

檢查與規則：
- tests/research-polish.browser.cjs（新增）
- tests/member-quick-menu.browser.cjs（新增）
- tests/member-identity.test.cjs
- tests/member-share.browser.cjs
- docs/focus-ranking-field-audit.md（新增）
- docs/research-benefits-preview.md（本文件，新增）
- docs/collaboration/README.md
- AGENTS.md

shared/justy/benefit-vouchers 的獨立準備檔：
- docs/database/member-share-vouchers.sql
- docs/member-share-vouchers.md
- docs/member-voucher-tiers.md
- docs/member-wallet-plan.md
- docs/collaboration/changes/2026-10-19-benefit-vouchers.md
- tests/member-vouchers-database.test.cjs

上述 shared 檔均未套用共用資料庫；分級與儲值只是規格／準備，不宣稱已正式開放。
## 2026-10-20 快捷面板縮小與頭像修正

面板寬度 334 → 286px（約縮小 14%）；桌面壓縮項目間距與內距，總高度約縮短 20%，仍保留可讀文字。觸控維持 44px 目標。頭像覆寫通用按鈕 hover 背景／掃光，僅在照片外側顯示細圈；圖片保持 opacity=1、無 filter 或 blend。測試覆蓋真實圖片、深淺色、桌面及 320／375px 邊界、功能導覽與登出。靜態資源版本更新為 v2，避免刷新仍取舊選單。
## 2026-10-20 會員總覽／任務／禮遇重整

新增 member-journey.js，在 member-center.js 中承接 overview、tasks、benefits。總覽顯示真實服務回傳的任務點、有效待啟用券與本人邀請碼；失敗顯示準備中。研究足跡只統計本機已載入紀錄，不聲稱為全部雲端紀錄。

任務分五類共 25 個提案，可切換分類並前往既有功能；提供兌換草案但不開放發點／兌換。以 100 任務點＝觀察券 1 天為營運提案；3 天券自選 180、觀察 300、研究 600、進階 1200、VIP 2400。尚未成為正式規則，沒有與現金兌換。

會員權益頁提供禮遇入口、三級與 VIP 稱號、單項自選券說明。側欄分類 14px，功能文字桌面 17px／手機 16px；登出移除通用按鈕背景、陰影及框線，滑過只用文字提示，鍵盤保留可辨識焦點。

新增檔案：apps/web/assets/member-journey.js、tests/member-journey.browser.cjs；修改 member-center.js、research-polish.css、index.html、member-quick-menu.browser.cjs。shared 分支另增 docs/member-missions-and-points.md，供後端任務驗證、發點與兌換交易接續。沒有修改正式資料庫或收款。

測試：8 組深淺／320、375、768、1440px 真實頁面驗證，檢查資料真值與不可用狀態、任務分類、關閉兌換、分級、側欄大小、無水平溢出、減少動態。既有會員深淺／登出與快捷面板測試一併通過。
