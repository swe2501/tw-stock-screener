# 會員功能完成度 — 2026-10-16 最後盤點

## 本輪完成的程式與驗證

- 全站搜尋改查既有 `news_feed`／`hot_topics` 公開歷史標題、前言與題材摘要，不限已載入頁面。股票／ETF、站內功能、新聞分組；新聞顯示日期、來源與摘要，原文另開視窗，沒有原文的題材開啟對應新聞日期。只查資料庫已保存的內容，並非外部網站全文搜尋。
- `/api/site_search` 僅 GET，使用既有 anon 權限，不接受表名、網址或會員 token。兩來源並行、5 秒逾時、最多 8 則；部分失敗明示，前端防過時回應、支援重試、IME、鍵盤與快取。未新增／修改資料表。
- 真正 GLB 3D 播放器：`member-companion-3d.js`，本機 Three.js 0.180.0 與 GLTFLoader；實際 skinned mesh、AnimationMixer、五種動作混合、結束回待機、階段換模、光照／接地陰影、指標緩動、離屏暫停、減少動態及 GPU 資源回收。無合格模型或載入失敗時維持插畫版本。
- 模型白名單、內嵌資源限制、大小限制、授權／人工核可欄位與機械驗證腳本已加入。**正式 manifest 保持空白**，測試四面體只存在測試程式，不作為會員角色。
- 已補會員服務缺件 SQL 草稿（點數流水／推薦統計／活動）與個人研究資料 CAS 版本衝突儲存草稿，均未連線執行。

## 仍未完成／不能宣稱已啟用

| 項目 | 真實狀態 | 下一個可驗收的成果 |
|---|---|---|
| 九角色遊戲級 3D 成品 | **0／135 個角色階段就緒**；9 主題×3 外觀×5 成長；播放器可運作，角色模型未取得 | 依 `assets/goal-models/README.md` 交付有商用授權、骨架、五動作、成長形態的模型，經視覺與手機效能驗收後才核可上架 |
| 交易／目標／研究／策略跨裝置 | 前端同步／離線／版本衝突／私有圖片程式完成，隔離 SQL 測試通過；線上文件表仍 404 | 連接 Supabase 專案管理，審查既有結構後套用遷移，再用真實會員驗收 |
| 邀請碼／推薦禮遇／點數／優惠券／回饋／活動 | 依原 `member-db-status.md`，後端表／RPC 未啟用；新補件亦未套用 | 管理者審查兩份 member-services SQL、隔離驗證、訂定真實活動／資格／點數規則，授權後啟用；不能用本機進度自動發真實權益 |
| 案件／權益通知 | 有 outbox SQL；寄送 worker、寄送服務及實際送達驗證尚缺 | 管理者設定服務、部署 worker、測試重試／去重／送達 |
| Google／手機登入與頭像儲存 | 前端已做，後台 provider／bucket／RLS 開通狀態待管理者核對 | 測試會員登入、本人頭像上傳與他人越權阻擋；勿把前端完成當成後台已開通 |

交易紀錄仍需會員手動輸入。期貨商品規格／年月與乘數仍須核對手填；目前沒有承諾券商成交自動匯入或完整交易所合約資料介接。

## 本輪驗證證據

- 30 項交易／策略／身份純測試通過。
- 7 項公開搜尋 API 測試通過，含真實本機 HTTP handler 狀態碼／快取／失敗處理，資料來源用 fixture。
- `member-companion-3d.browser.cjs`：真正 GLB 骨架測試模型、畫面隨骨架動作變化、切動作回待機、階段載入、錯誤素材降級、減少動態靜止、移除 canvas／資源生命週期。
- `site-search.browser.cjs`：未預載歷史新聞、日期／來源／摘要、原文外開、指定歷史日期、快速改字取消舊請求、重試、部分來源失敗、惡意網址排除、股票範圍不查新聞、IME／鍵盤／深色手機。
- `member-trade-ui.browser.cjs`：既有記帳／期貨口數／FIFO／月曆／九角色三外觀與插畫降級回歸。
- `validate_companion_models.cjs` 目前回報 missing personas／0 ready，這是素材未交付的誠實狀態，不是視覺品質認證。
- **四份 SQL 已在隔離 PGlite PostgreSQL 執行並驗證 RLS／CAS／圖片 policy，尚未套用線上 Supabase**；不能將隔離驗證當作已啟用線上同步。搜尋 API 的線上部署／真實資料讀取仍應在 UAT 部署完成後查驗。

## 啟用限制與交接

使用者本輪已明確授權串接資料庫，覆蓋本任務原有的 Supabase 修改限制。UAT／正式站共用 Supabase，需先審查現有結構；目前真正阻礙是尚無可管理專案的 Supabase 連線。未套用共用資料庫、未變更 provider／bucket／排程／正式站分支。詳細最新狀態以 [member-db-status.md](member-db-status.md) 為準。

準備好的檔案：

- `docs/database/member-services.sql`：原會員服務。
- `docs/database/member-services-supplement.sql`：補齊點數流水、推薦統計、活動。
- `docs/database/member-research-documents.sql`：個人研究文件與預期版本 CAS 儲存；前端已串接，線上表待啟用。
- `docs/database/member-storage.sql`：本人頭像與私有交易圖片的 Storage policy。
- `assets/goal-models/README.md`：真正 3D 素材交付、動作命名與驗收規格。

技術依據：[PostgREST URL grammar](https://docs.postgrest.org/en/v14/references/api/url_grammar.html)、[PostgreSQL view 權限](https://www.postgresql.org/docs/current/sql-createview.html)、[Three.js GLTFLoader](https://threejs.org/docs/#GLTFLoader)。
