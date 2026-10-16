# 交易紀錄與目標交接 — 2026-10-16

## 已實作
- 研究與學習：新增「交易紀錄」「我的目標」。交易工作台包含批次成交、代號／名稱建議、草稿、複製列、快捷鍵、整股／零股、融資／融券、期貨／選擇權、多空開平倉。
- FIFO 分攤開倉費稅、部分出場、完整結束、重新開倉分成不同交易週期。不同帳戶、實際／模擬、合約月、買賣權及履約價分開。
- 成交編號重試防重複；相同內容不同編號提醒；整批驗證後才寫入。修改／刪除重新核對後續部位；跨分頁 revision 衝突及儲存空間錯誤不假報成功。
- 交易計畫、目標價／停損、平倉後覆盤、自評遵守、情緒與錯誤自由標籤。自訂交易理由可改名、歷史快照不變。
- 帳戶資金異動、利息／股息、策略已結束樣本統計、交易日期月檢視、週報實際交易摘要、研究筆記入口。
- 參考價可手動核對；股票可從既有 chart API 帶入帶日期日線。期貨不拿現貨冒充合約報價。持倉缺價則顯示待補，不產假估值。
- PNG/JPEG/WebP 圖片限 2 MB，存 IndexedDB；詳情另存圖片。JSON 明示不含圖片。
- SheetJS 0.20.3 官方本地 vendor + Apache 授權，按需載入；Excel/CSV 工作表／欄位對照、預覽、去重、日期與合約驗證。支援原 Excel 開倉＋平倉列及本站匯出格式。未知合約年月／乘數須補，不執行公式及外部連結。
- JSON 完整備份可合併原會員資料；既有目標與覆盤不覆寫；資料格式與資金／目標驗證。Excel 匯出逐筆成交與分組交易回顧。
- 帳戶獲利、單筆價格、紀律三種目標。獲利扣已填費稅與利息、排除入金，費稅未確認不授予獲利目標。觸價不當作成交；單筆多空以已平倉加權均價核對。里程碑日期保留，現行進度仍重算。
- 九種程式原生 SVG 場景：韭菜成仙、花園、登峰、星際、城堡、小獸、海洋、晶石、列車。韭菜按目標進度縮小、仙人顯現；角色髮型／衣袍／面部／祥雲細節。男女／中性外觀獨立選擇，深淺背景、全／輕／靜態，尊重 reduced motion。
- 個資新增性別（選填）：女性、男性、非二元、不透露、暫不提供。Auth user_metadata 白名單與 enum 驗證；不改角色性別、不公開。

## 檔案
- assets/member-trade-engine.js：純計算、驗證、FIFO、目標；tests/member-trade-engine.test.cjs。
- assets/member-trade-ui.js：工作台／匯入／目標，資料 key academy.journal.v1.<userId>，draft 子 key。圖片 DB academy-journal-images，owner 前綴。
- assets/member-goal-art.js、assets/member-trade.css：場景及介面。
- index.html：樣式／script 註冊；member-center.js：導航、生命週期、個資；member-identity.js：gender；member-features.js：週報／隱私匯出。
- tests/member-trade-ui.browser.cjs：Playwright 虛構站台整合驗證，設 PLAYWRIGHT_MODULE 指向安裝套件，可用 QA_OUTPUT 指定截圖資料夾。

## 實際限制／後續
- **交易、目標、研究資料目前僅此瀏覽器，各會員分 key；尚未雲端同步。** 此變更不建立／修改 Supabase schema、實際會員資料或 .env。依 AGENTS.md 禁令未擅自啟用資料庫。
- 沒有券商委託／成交自動同步、沒有背景到價通知。頁面載入時計算目標；歷史里程碑代表系統觀察到達標之日，不推算未觀察日期。
- 融資維持率、券商保證金追繳與選擇權風險不估算；權益僅依填寫資金、部位、費稅、參考價估算，並非可用購買力。
- 期貨合約清單為通用代號建議＋手填年月／乘數，尚未串完整交易所合約規格。不可靜默猜乘數／稅率。
- 月曆目前是有交易日的卡片清單，可後續擴完整月曆格。交易理由目前每筆一個常用理由＋自由補充；可擴多標籤。
- 動畫為可縮放向量，不是生成式影片或精靈圖；各主題細節仍可按使用者喜好細修。
- 本機 storage 是信任邊界內的個人資料，非不可竄改後台帳本；未提供商業獎勵授權，會員權益不可由目標進度核發。

## 驗證
- Node 純測試：member-trade-engine、member-identity、member-strategy-engine 共 27 項通過。
- 新 UI：批次、搜尋、部分／全平倉、計畫、資金、覆盤、九主題、外觀性別、里程碑、Excel 缺合約阻擋、配對匯入、quota 失敗、深淺／手機通過。
- 截圖在本機聊天 work/journal-qa（虛構測試會員與行情，非真實績效），不納入 repo。
- 原自選／策略整合回歸另執行。

## 2026-10-16 follow-up corrections
- All trading dialogs explicitly restore `inset:0; margin:auto`, correcting host global CSS resets that placed dialogs at top-left.
- Strategy picker has inline add/manage: guided multiple entry/exit rules with independent indicator parameters, all/any and risk. Shares the existing research strategy store; historical snapshots unchanged. Reason add/rename/remove adjacent to its picker; two-click removal, retained historical labels.
- Clear-draft control reduced to secondary text-sized action plus explicit confirm dialog; cancel preserves input.
- Position detail now labels average entry / realized PnL in TWD and pending fee status. Derivatives show month and multiplier. New derivative multiplier starts blank and is required; existing contracts have an explicit confirmed batch multiplier correction that updates all matching fills and revalidates ledger.
- Replaced simple SVG characters with original imagegen illustrated atlases (see assets/goal-art/README.md, full prompts). Direct nine-companion gallery, stage and appearance preview, create-goal from preview. Immortal five-stage blend and female/male/neutral rows. CSS motion is explicitly illustrated breathing/particles/mist, not a fully rigged film clip.
- Extended browser fixture validates centering, inline strategy creation/parameters, reason create/remove, clear cancellation, nine companion previews and blank required futures multiplier.
