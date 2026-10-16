# 會員中心、自選、策略與私房篩選器交接

更新日期：2026-10-16（Asia/Taipei）。使用者要求本次工作完成後交由另一個 AI 接手。

## 1. 接手入口與合作規範

- 專案：`C:/Users/JUSTY LIN/Documents/Codex/tw-stock-screener`。
- 先讀本 repo 的 `AGENTS.md`，再讀本文件及相關 docs；舊 HANDOFF 中 Andrew／prod 的操作範例不能代替本機適用規範。
- 本機工作分支 `justy-layout`；使用者的「123」表示同步最新 UAT、提交／推送自己的分支、合併／推送 `uat`。不得 force push，不碰 `prod`、`Andrew`、`Duke`。
- 不修改 `.env.local`、排程或 Supabase schema／資料。既有公開資料的唯讀核對已做過；不能把此事解讀為授權資料庫寫入。
- repo 為單頁 `index.html` 加獨立會員 assets。新增 API 之前要核對既有 Vercel function 數量上限；這一輪沒有新增 API。

## 2. 最新 Git 狀態與本輪交付

- `5653afe`：分類與自選的拖曳排序、縮小均線圓點。
- `09755a2`：自選編輯列精簡、分類單列與更多分類。
- 本次推 UAT 曾因他人剛更新而遭 Git 拒絕（不是自動審批拒絕）。重新 fetch 後正常合併，未覆蓋任何一方。
- `7f3cc82`：合併 `origin/uat` 的 `aa9f33e`（產業地圖市值加權，以及盤中價格修正／35 秒更新）。這些市場功能是另一位開發者的變更，本輪只正常承接，沒有重寫。
- 本文件與上述改動一併提交至 `uat`，並同步 `justy-layout`；接手以遠端最新 HEAD 為準。請執行 `git fetch origin`、`git status -sb`、`git log -5 --oneline` 核對實際最新狀態。
- 不要把「Git 已推送」當成 Vercel 已成功發布；本輪沒有進行真實會員帳號的完整線上驗收。

## 3. 使用者已確定的產品設計

### 自選與分類

- 收藏來源以完整 K 圖的金色星星為主；搜尋列表、題材／ETF 列表原本的星星已移除。會員「我的自選」另保留搜尋後直接按「收藏」，選中股票名稱旁的星星可取消收藏。
- 首頁與會員搜尋共用代號／名稱匹配；會員選取建議只填入代號，不會開啟 K 圖。先前誤開背景 K 圖的原因是首頁的 document click 接了所有 `.gs-sd-item`，已限制為 `#hpSearchDrop .gs-sd-item`。
- 自選詳情「看完整 K 圖」使用原有 `openChart()`，疊在會員中心上方，關閉回到原位置，不跳首頁。曾被 ETF 嵌入的圖先釋放。
- 技術觀察已併為每檔的「觀察紀錄」，舊記錄及條件保留；重複分頁和建立按鈕已移除。未連結自選的舊觀察有重新收藏入口。
- 「放入分類」是下拉複選，摘要顯示已選分類與名稱，隨收藏理由一起儲存。
- 上方分類標籤是唯一分類篩選入口，重複的分類下拉已移除。
- 標籤保持單列；依寬度顯示可容納的分類，其餘收進可搜尋的「更多分類」，目前選取分類優先顯示。「管理分類」固定可見。長名稱可在更多分類看到完整內容。
- 管理分類沿用使用者喜歡的置中簡潔視窗；分類多時，只有清單限高捲動，新增及編輯入口留在上方。
- 分類與自選表頭都有圖示＋「編輯順序」，進入後按住把手拖曳；也可刪除／移除，按完成退出。
- 自選編輯列已改為把手、股票資訊、移除同列，沒有額外一排操作；選取底色只套整列，避免把手和移除按鈕出現不自然的色塊。
- 拖曳支援位移動畫、邊緣捲動、觸控把手與上下鍵；Esc／失焦／pointercancel 取消當次拖曳。尊重 reduced-motion。
- 自選另有「我的順序」。分類／搜尋結果局部排序只交換可見股票的位置，其他股票相對順序保持。排序自動保存到此會員在此瀏覽器的資料。
- 取消收藏後可在「最近移除」逐檔恢復，含理由與原到價設定。此清單只保留這次開啟會員中心期間；關閉中心或換帳號即清除。刪除分類不刪股票。

### 圖表與研究

- 會員圖表基礎均線為 **5、10、20、60、120、240 日**。曾經依使用者早期輸入做過 2／130，但已依較新指示改回 5／120，接手不要改回去。
- 配色：5 黃、10 藍、20 紅、60 橘、120 紫、240 灰藍。每條可開關；顯示開關不改策略。策略額外用到的週期可另外顯示。
- 均線及相關副圖 crosshair 彩色圓點縮至半徑 1.5px、外框 0；原本隱藏的系列維持隱藏。
- 研究入口標清去向：收藏理由→我的自選，觀察→各檔觀察紀錄，研究筆記→研究工作區，回測→策略回測，手動模擬交易→原 K 圖內功能。點研究入口不是自動保存紀錄。

### 策略與私房篩選器

- 策略支援自行新增、命名、儲存、複製、刪除及復原；每條件有自己的參數，可 all／any 組合。引導入口共用會員策略編輯器。
- 條件包含價格／均線、兩均線、突破、均量倍數、RSI、MACD、KD；回測另設定賣出與停損／停利／最長持有、投入比例／固定金額、費用與滑價。
- 回測用當日收盤確定條件、隔日開盤執行；日 K 跳空／同棒雙觸價採明確保守規則。不是自動下單。
- 掏金篩選器最後一格固定為「私房篩選器」；新增同層分類後仍自動維持最後。
- 第一版範圍已由使用者選擇「全市場股票」：網站上市／上櫃四碼個股清單，排除 ETF／興櫃；不是只篩我的自選。
- 共用同一份會員儲存策略與 JS engine 的 `scan()`／`run()`；私房只看買進條件，結果帶原策略 ID 與股票開啟回測。買進持有不能當選股規則。
- 私房獨立執行，不混入上方內建掏金條件。畫面有此說明。
- 讀既有公開 `price_window`，以 2330 最近可用日線為共同資料日，固定歷史窗，20 檔一組、最多三組並行、每頁 1000 筆，可停止。不能改成每檔呼叫 Yahoo 圖表 API。
- 未指定股票直接全表 `order=trade_date.desc` 曾回 500；加 `code=eq.2330` 的錨點查詢與多股票分批查詢已唯讀確認成功，包含上市 1101／2330 和上櫃 5483。當時共同日為 2026-10-15。
- 符合／不符合／資料不足／非同日／讀取失敗分開統計。歷史窗不足時不假裝不符合。回測與篩選資料窗可能不同，EMA／RSI 初始化差異可影響臨界訊號，不要宣稱所有資料源結果絕對相同。
- 修改策略會清除舊篩選結果；取消及帳號切換會停止舊任務，避免把舊結果當新結果。

## 4. 檔案分工

- `assets/member-research.js`：收藏 API、金星入口、分類／自選、拖曳共用 helper、觀察紀錄、最近移除、分類 overflow。
- `assets/member-strategy-ui.js`：完整策略表單、共用搜尋、真實日 K 與副圖、回測執行／保存／還原。
- `assets/member-strategy-engine.js`：純 JS 決定性指標、`scan()`、`run()`；選股和回測不要各寫一份計算。
- `assets/member-private-screen.js`：私房篩選器 UI、固定最後類別、公開歷史分頁、進度／停止／覆蓋率、連回測。
- `assets/member-strategy.css`：會員研究介面、深淺色、手機、dialog、拖曳、overflow。尾端後加覆寫不少，後續整理 CSS 時要對照畫面。
- `assets/member-center.js/css`：會員殼層、側欄、Logo、返回位置、個資／頭像。
- `assets/member-identity.js`、`member-signin.js`：登入、供應商、會員資料與頭像串接。
- `assets/member-features.js`：研究工作區、學習、週報、禮遇、推薦、回饋等會員頁。
- `index.html`：原網站、完整 K 圖、公開資料常數、首頁搜尋與搜尋增強函式；底部依序 defer 載入會員模組。
- 更詳細規格見 `docs/member-research-tools.md`、`member-custom-strategy.md`、`member-system-design.md`、`member-referrals-and-benefits.md`、`member-activation-checklist.md`。

## 5. 真實保存範圍與尚未啟用項目（不可混淆）

- `/api/watchlist` 既有帳號收藏及 note／到價條件走真實服務，刪除失敗不得顯示成功。
- 本機研究資料 key：`academy.research.v1.<uid>`，包括 groups、labels、favorite_order、context、reason_drafts、observations、strategies、runs。研究筆記另有 `academy.research.drafts.<uid>`。這些尚未跨裝置同步，並非完整雲端會員研究服務。
- Supabase 專案為 Taiwan stock2，ref `bruqrbvbjxntgoljxsne`。不要在交接／聊天貼私鑰或 service role key。
- 先前確認 Email 可用；Google／Apple／LINE／手機正式開通仍需接手時核對管理後台、callback／開發者設定，不能只放按鈕就宣稱完成。
- 頭像有選圖／裁切及 Storage 串接程式，但 `member-avatars` bucket／權限正式是否開通尚需有權限者核對；不要承諾正式上傳已驗收。
- `docs/database/member-services.sql` 是準備好的 schema 草稿，本輪未在正式 Supabase 套用；需符合權限後才處理。
- 回饋正式案件後台／寄信工作者未確認開通，不能把草稿當已送件，不能假稱已寄 Gmail 收件確認信。
- 推薦規則使用者選擇「新會員完成驗證，雙方領禮」。每帳號獨立邀請碼，區別邀請碼與優惠兌換碼；正式資料庫與冪等發獎需配套，不得只靠前端發權益。
- 會員權益目前先一般會員，付費方案待定；權益不可由會員個資自行修改。新增個資皆選填；生日改完整年月日，供未來生日禮使用。
- 不要在另一個 AI 工作時一次擴大改寫資料庫／OAuth／付費：先核對真實配置與使用者接下來要做的項目。

## 6. 驗證與重現

repo 單元測試（目前 15 項通過）：

```powershell
& 'C:/Users/JUSTY LIN/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' --test tests/member-strategy-engine.test.cjs tests/member-identity.test.cjs
```

本機瀏覽器整合 fixture（非 repo 檔；使用假的會員與合成 OHLC，不寫真實帳號）：

- `C:/Users/JUSTY LIN/Documents/Codex/2026-10-08/new-chat/work/verify-strategy-workbench.cjs`
- 同目錄 `lightweight-charts-4.1.3.js` 為測試用官方圖表套件。
- 使用 bundled Playwright 的 headless Edge；若 sandbox 不允許啟動，需按工具權限機制執行。
- 執行：上述 node 路徑加 fixture 絕對路徑。
- 測項：真實 candle canvas、搜尋前綴排序／同名解析、首頁事件隔離／Logo 返回不誤開圖、分類複選、觀察整併、自選原地開圖、理由保存、獨立恢復多檔、分類新增改名排序、真實滑鼠拖曳／Esc 取消、filtered 局部順序、鍵盤與焦點、20 長分類名稱 overflow／搜尋／選取、390px 深色不溢位、策略參數／all-any／風控／成本／保存／副本／刪除復原／結果快照、私房結果覆蓋率／保持最後／帶策略回測／修改清舊結果／停止。
- fixture console 的 PASS 摘要文字較早，實際附加測試比其摘要更多；查看腳本尾端。
- `work` 內截圖只供版面 QA，合成價格不能當真實市場資料交付。
- 舊的其他 member browser fixture 未必對應目前 markup，不要把舊 selector 失敗當成產品壞掉，也不要跳過必要修正。
- 最後另跑 JS 語法與 `git diff --check`。不因這次變更去重跑他人市場新邏輯的整套資料工作。

## 7. 下一位 AI 建議工作順序

1. 同步並確認自己的分支／乾淨工作區，遵守 AGENTS，讀本交接。
2. 先問使用者下一步重點；本輪自選精簡樣式及 overflow 已完成，不要重新做一遍。
3. 如使用者驗收樣式：看 UAT 實際部署版本、深淺色與分類很多時畫面，確認不是舊 CDN；切勿直接推 prod。
4. 如要真正跨裝置會員資料：盤點現有 schema／RLS 與服務授權，先規畫遷移／失敗恢復，再做正式串接。不得把 localStorage 稱為雲端同步。
5. 如要開登入／回饋寄信／推薦發獎：依 activation checklist 處理實際供應商、郵件與後台，明確區分已實作 UI 和已啟用服務。
