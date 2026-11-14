# 會員商品、付款開關與動態權益比較

2026-11-13。JUSTY 授權本機實作，未要求 234；未提交、未推送、未部署，未寫入線上資料或開啟金流。

## 本次結果

- 後台「點數與商品」增加「商品與付款設定」：新增商品、個別上下架、排序、名稱、簡介、詳細說明、八款品牌線條圖標、價格、期間、測試模式、逐項會員功能，以及付款總開關。
- 商品與後端 tier 分離。會員比較卡依上架商品清單動態產生，不限三／四／五張；全數下架時顯示空狀態，不以舊四級卡偷偷補位。保留既有 tier 代碼與 advanced 相容。
- 付款關閉時公開 catalog 不含金額與 plan_code，前台不提供購買或卡號表單；仍可查自己的既有付款紀錄。伺服器新建訂單會再次檢查付款開關、上下架與金流環境。
- 商品設定有版本衝突檢查；寫入與建立新訂單使用同一 transaction advisory lock，避免下架或關閉付款的競態。價格／期間／授權範圍變更建立不可變的 member_plans 版本，舊訂單確認不查新商品條件。
- 下架不撤回既有已付款期間，已建立的 pending 訂單允許按原條件完成付款確認。關閉付款不阻止既有訂單履約。付款金鑰移除則仍依原付款模組限制。
- 權益 API 只回目前登入者的有效權益；付費期間取購買時快照，工具券僅取原券 scope。網站導航、K 圖操作與學習／自選／筆記入口接此服務。
- 新增功能先詢問 JUSTY 開放對象的規則已加入根 AGENTS.md；純修錯且不改權限時不重問。

## 檔案與相容性

網站：`apps/web/assets/member-benefits.*`、`member-catalog.js`、`admin-member-commerce.js`、`admin-forum-ads.js`、`member-payments.js`、`guest-access.js`、`member-center.js` 與 `apps/web/index.html`。

共用：既有 `/api/auth` 新增 catalog/access/admin actions；新增 `lib/member_commerce.py`，調整 `lib/payments.py`。沒有增加 Function，API 預算仍為 12/12。所有 admin action 都在既有管理員 JWT 白名單驗證後 dispatch；會員 access 先驗 JWT；回應沿用 no-store。

App：未修改或建置 iPhone／Android／iPad。原本付款回傳欄位保留；舊客戶端不支援新後台開關時仍由伺服器拒絕新購買。未新增必要的舊客戶端輸入欄位。

## 尚須另行批准與驗收

`docs/database/member-commerce-settings.sql` **僅準備，未執行**。依賴原 admin_settings、member_plans、會員期間／券表。需在隔離資料庫先實際驗證 SQL、交易鎖、不可變權益快照與 RLS，再獲得共用正式資料庫明確授權後套用；不能把目前 mock 測試當作 SQL 或線上付款已驗證。

目前是會員方案服務與網站操作入口的權限整合，**沒有改寫所有現有 Supabase 資料表的 RLS 或公開行情來源**；不能宣稱前端入口限制等於所有資料請求均不可繞過。若將公開資料改為付費專屬，須另盤點每個原始資料端點與資料授權，完成伺服器／RLS 驗權後才正式出售這類承諾。

本次不啟用會員 AI、管理員專用工具、每週分級額度與容量限制，不改 Auth／環境密鑰／排程／正式資料。新功能可設定項目需按 AGENTS.md 先詢問對象，並實作對應授權後再上架。

## 驗證

- Python 33 項：付款、LINE Pay 與 catalog 測試通過；既有付款測試 fixture 已補新 catalog 與建立訂單 RPC。
- Node 付款介面 8 項通過。
- mock 無頭瀏覽器：0／1／2／3／4／5／7／12 項動態比較、付款關閉隱藏金額、開啟顯示、詳細解說、方案帳務往返與歷史、後台新增／選權益／上架／儲存／預覽；深淺色 1440／768／375／320。
- 完整網站 mock：5 個方案、權益 → 方案帳務 → 權益，深淺色桌機／手機。
- Python／JavaScript 語法、git diff whitespace 與 API 12/12 檢查。

截圖位於工作區 `artifacts/member-commerce/`（測試產物，不提交）。

## 回復與發布順序

未部署前保留本機變更即可，不執行 destructive reset。發布前先完成上述 SQL 隔離驗收、重新核對其他聊天室未完成內容；按 JUSTY 數字流程整合 shared 改動，經另行批准才套用 migration。付款預設關閉，首次設定商品先測試模式與下架；正式開啟由管理員明確操作，不隨部署自動啟用。

原 `Documents/Codex/tw-stock-screener` checkout 中本聊天室先前的初版會員 UI 草稿仍保留，未清除、未提交；此次完整版本在本 shared 工作區。之後整合時須辨識本聊天室草稿與其他聊天室變更，不直接整批提交原 checkout。
