# Claude Code 交接：資料庫正規化與網站讀取遷移

交接日期：2026-11-01（Asia/Taipei）
交接範圍：本輪資料庫正規化、Supabase 傳輸減量與網站讀取遷移；不是整個網站歷年功能的交接。

## 1. 接手先看

- 使用者目標：逐步把網站資料讀取轉至正規化資料，處理 Supabase Egress 超額；不是單純刪表。
- 已完成下述 Expand／部分讀取切換及有限鏡像清理，**全站未完成，原 stocks JSON 不可清空或刪除**。
- 最新已發布 UAT 程式提交：`365d31e5a5fa8d9b9156c1f46e56f8d868be0383`；GitHub Vercel 網站狀態為 Deployment has completed / success。
- 正式站 Git 程式未由我發布；但 UAT 與正式站共用 Supabase，已批准並套用的 SQL 同時影響兩站。
- 先讀根目錄 AGENTS.md、docs/collaboration/README.md，以及本文件所列 SQL／變更說明。不要從過時主工作區整份蓋回去。

## 2. 工作位置與安全整合

- Repository：swe2501/tw-stock-screener。
- 我的分支：`shared/andrew/db-normalization`。
- 我的獨立 worktree：`C:/Users/User/.codex/worktrees/exhibition-calendar-shared-andrew-office-tasks-shared-andrew-db-normalization`。
- 共用主目錄：`C:/Users/User/Desktop/AI_stock`，位於 Andrew 且有其他人的工作；**不切換、不 reset/stash、不覆蓋其未提交修改**。
- 網站原始碼：apps/web/index.html；根目錄 index.html 為相容轉接。
- 本文件提交只推上述 shared 分支，沒有為文件另發網站版本；接手可 fetch 後讀該分支，程式已在 UAT。
- 檢查 git status、目前分支、最新 origin/uat；另建自己的 worktree 或在確認沒有其他 agent 同時使用後接手本 worktree。合併保留雙方內容，禁止 force。
- 已持續授權網站改動測試後同步／推 UAT並查 Vercel；不包含 prod、App、Auth、排程、付費或任意資料庫變更。

## 3. 實際超額原因與限制

2026-11-01 查核帳務畫面：組織 ezhbjjzkananvxejiqhl、專案 Taiwan stock2／bruqrbvbjxntgoljxsne。

- 週期 2026-10-16～2026-11-16：Egress 6.091 / 5 GB（122%）。
- Database Size 0.299 / 0.5 GB（60%）；專案大小 284.83 MB。
- 前週期已 Egress Exceeded，寬限至 2026-11-30；持續超額可能 402 限制。
- **不是 11/30 自動扣款或新增三張表造成必須付費**。Free 當時不計收超額費；不要擅自升級。
- 過去累計流量不會因刪資料倒扣。尚未取得每 URL 線上傳輸 byte 歸因，沒有證據宣稱本次已解除警告或省下某固定比例。
- Vercel 共用快取仍占用 Vercel 額度；不等於無限免費。後續需看真實每日用量及新週期。

## 4. 已在線上套用的 SQL（不要盲目重跑）

使用者針對下列變更明確批准備份後套用；不是其他 schema／資料操作的通用授權。

### 4.1 member-screen-normalization-expand.sql

位置：docs/database/member-screen-normalization-expand.sql。

新增三張表：

- security_master：code 主鍵、current_name、market、instrument_type、source、updated_at。
- security_observed_names：觀測名稱，以 source_code/name 唯一；security_code 可空 FK 主檔，保留歷史名稱。
- member_screen_record_items：record_id/position 複合主鍵，name_id 指向觀測名稱；close_snapshot、change_pct_snapshot、extra 保留歷史數值及原 JSON 特殊欄位。

member_screen_items_sync trigger：原 member_screen_records 新增或更新 stocks/deleted_at 時原子同步明細。member_screen_normalized_stocks(uuid) 由明細 JOIN 歷史名稱重建相容 JSON。新增會員日期索引。原資料、舊 RPC 和 JSON 保留。會員明細／觀測名稱受 RLS 限制，anon 不可讀私人明細。

### 4.2 member-screen-mirror-guard.sql

位置：docs/database/member-screen-mirror-guard.sql。

既有 save_member_research_document RPC 保留簽章及 CAS。之後 research 寫入只移除已確認屬於本人、version=2 且完整匹配權威紀錄的 screen_logs 鏡像。未知、舊格式或不一致紀錄保留；不是一律丟棄 screen_logs。

### 4.3 已執行一次的鏡像清理

輕量驗證後，依使用者授權，從 3 份 research document 移除 11 筆完全匹配鏡像，使用 user_id/kind/revision CAS；備份在本機。**沒有清空 member_screen_records.stocks**。

### 4.4 member-screen-normalized-read.sql

位置：docs/database/member-screen-normalized-read.sql。

既有 member_screen_calendar(date) 簽章、latest-market-v2 日期政策與會員隔離維持；stocks 由 member_screen_normalized_stocks JOIN 明細重建，不靠原 JSON 讀取。UAT／正式站共用 RPC 已切換。

### 4.5 security-master-read-bridge.sql

位置：docs/database/security-master-read-bridge.sql。

- refresh_security_master() 僅 service_role 可執行；security definer、空 search_path、advisory xact lock。
- 三個來源 stock_fundamentals、otc_names、etf_products 的 statement trigger 更新主檔；優先序 etf_products > stock_fundamentals > otc_names。
- 名稱／市場／類型／來源實際變更才更新 updated_at。
- 刪來源不刪主檔，保護歷史 FK；下市及代號重用生命週期仍待規劃。
- security_catalog view 僅公開 code/name/market/instrument_type/industry，JOIN 主檔、基本資料、ETF 資料；不含會員內容。anon/authenticated 僅 SELECT。
- **沒有改 Windows 排程、Auth、付費設定**。

## 5. 備份、驗證與復原資料

僅存本機，不進 Git，內含會員資料，不可貼進對話、PR、公開網頁或日誌：

`C:/Users/User/.codex/visualizations/2026/10/12/01a1308c-6895-7e12-a65a-9588d0dacff3/db-audit/`

- activation-2026-11-01：第一次 schema／函數／資料備份；含 restore-live-research-function.sql。
- cleanup-2026-11-01：3 份 document 清理前備份與驗證。
- read-activation-2026-11-01：第二輪七表分頁備份、manifest.json、schema-before.json、restore-calendar.sql、executed-*.sql、live-verification.json、postflight.json、uat-catalog-smoke.json、verification.jpg。
- egress-2026-11-01/usage-before.jpg：帳務查核畫面。

這些是本輪快照，不是持續備份服務。任何復原前先比對目前 schema／函數與新增資料，不可直接覆蓋後續他人更新。已附函數復原材料，不宣稱有一鍵完整回滾。

查核時數量（非永遠固定）：原紀錄 15（有效11、墓碑4）、明細297、觀測名稱157、主檔2259、研究文件10。

已驗證：明細重建差異0；本人日曆、其他 claim、anon 隔離；主檔來源更新同步及 noop 不重寫；歷史名稱不隨現名改；線上測試變更在 BEGIN/ROLLBACK；六張歷史／來源表事後與備份一致。原備份有雜湊核對。沒有把會員資料放公開快取。

## 6. 已發布的程式讀取改動

### 第一批（26944f2e，後續 merge 已包含）

- api/prices.py：既有 Function 新增 action=public_snapshot、action=security_catalog，不新增 Function。
- public_snapshot allowlist：themes/sectors/themeall/sectorall/overview 及其 _rt。只讀公開 page_cache 指定欄位，用 anon；不能指定任意表或沿用會員 JWT。
- scope=uat/prod 隔離；UAT 缺自己的快照才 fallback prod。盤後 warm/CDN 120秒、盤中15秒；錯誤不快取，有界讀取、併行合併、記憶體上限。
- security_catalog：每頁500、上限6000，warm300秒／CDN120秒，避免1000筆截斷。
- apps/web/index.html：五個市場頁面 _swrJson/_swrRT 改走 gateway；保留來源日期、版本判斷與現算備援。
- _loadNames：正規化目錄優先，合併現名、產業、市場、ETF；保留 OTC 債券ETF 補充及舊 loader 備援。
- apps/web/assets/screen-log.js：本人月份快取20秒、最多8個月、合併併發；保存／刪除／換帳號失效，generation 防晚到覆蓋。保存前強制 fresh 伺服器日期。
- 新保存不再將完整選股資料鏡像寫 research。裝置 summary key academy.screen-receipts.v1.<uid>，最多1000筆，只有 id/date/saved_at/strategy；不是權威備份。member-journey 相容舊資料與摘要。
- scripts/audit_data_reads.py、docs/database/website-data-read-inventory.md：168個靜態候選、59來源；不是實測流量排行，含需人工判斷的寫入／註解／動態路徑。

### K線（1b6b0768，UAT merge ddeb7d9d）

api/chart.py _is_otc：security_catalog 單代號查 market，成功快取300秒，上限4096。目錄失效／缺漏僅查相同代號 otc_names，不再全量下載，失敗不永久快取為上市。保留 Yahoo .TW/.TWO 補查行為。使用既有公開憑證，未接會員資料。

### 排行榜與漲跌停（340401f1）

api/screen.py _current_security_names：code/name 批次200、成功快取300秒、上限4096；失敗不快取。未知代號只查對應 otc_names 備援。_focus_details、_read_focus_snapshot（含v3）與 _fetch_limitup 套用目前顯示股名。價格、日期、排序、連續天數、量比與會員歷史名稱不改。

### 市場總覽與公開目錄（365d31e5）

api/screen.py：

- _normalized_catalog／_load_normalized_catalog：固定公開5欄位、500筆分頁、6000上限、300秒快取、鎖合併並行冷查詢、回傳副本。部分讀取／重複代號／錯誤不當完整目錄快取。
- _get_industry_map：正規化股票產業優先，缺欄位以既有靜態分類補；ETF category 不混入股票產業。失效保留原官方／靜態備援。
- stat=names/industries/industry：改用上述目錄，公開 CDN300秒／瀏覽器60秒。
- _fill_overview_names：只補缺名代號，保留官方已知名稱，不再下載整份 otc_names。
- 保持 env_screen.py 從 Git 動態載入單檔 screen.py 的相容性，沒有引入新 lib 相依。
- 公開 anon 線上讀取2259筆，股票產業1976筆，2330=tse、0050=etf。

## 7. 測試與執行環境

Python：`C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe`
Node：`C:/Program Files/nodejs/node.exe`
gh：`C:/Program Files/GitHub CLI/gh.exe`

在正確 worktree 執行（依自己的環境調整 python/node；不讀寫正式會員資料）：

```powershell
python -m unittest discover -s tests -p test_public_data_gateway.py
python -m unittest discover -s tests -p test_site_search.py
python -m unittest discover -s tests -p test_chart_market_directory.py
python -m unittest discover -s tests -p test_screen_security_names.py
python -m unittest discover -s tests -p test_screen_catalog_reads.py
python -m unittest discover -s tests -p test_focus_ranking_fields.py
python scripts/check_api_budget.py
node tests/calendar-read-cache.test.cjs
node tests/public-snapshot-client.test.cjs
node tests/security-directory.test.cjs
```

最近各批通過：gateway9、搜尋8、K線4、股名5、目錄7、排行榜4；先前另通過日曆PGlite／browser及50個inline script語法。不是每次提交全部重跑，按批次變更執行相關測試。舊排行榜測試更新為現行fields_version=3並隔離外部題材資料，沒有改回v2。

PGlite 測試需 PGLITE_MODULE 指向 db-audit/test-tools/node_modules/@electric-sql/pglite/dist/index.cjs。Browser測試支援 TEST_OUTPUT_DIR。Windows sandbox 的 child-process EPERM 曾靠提升執行權限解決，不是產品錯誤。

API預算目前12/12。新增helpers放lib而非api；但須顧及單檔動態載入。修改API／部署設定後提交前跑 check_api_budget.py。

Vercel：上述程式提交均驗證網站 Deployment has completed/success；文件合併 de44633f 曾因 Ignored Build Step 取消，不能把它說成新程式部署成功。最近HTTP方式取UAT曾拿到非JSON頁面，因此沒有把該次HTTP嘗試當作功能通過；第一批曾用已登入Chrome確認實際UAT目錄JSON。最新兩批功能證據以單元測試＋公開DB唯讀驗證為主，部署證據以Vercel status為主。

## 8. 下一步（未完成）

優先先盤點目前 origin/uat，避免把本文件當永久精確的schema快照。

1. 完成選股紀錄 Contract：保存／冪等回應、任務資格及進度（搜尋 _member_task_eligible、_member_task_progress）、會員匯出（member_data_export_page）、舊客戶端／直接stocks讀取與重試。逐項改讀明細並驗證。
2. 原 trigger 仍由 stocks 生成明細。**直接把 stocks 設空會讓 trigger 清掉明細**；不能先刪JSON再補程式。須設計新版權威寫入／觸發器切換、版本相容、備份及復原演練，再準備具體migration請使用者批准。
3. 其他公開行情／法人／ETF：窄欄位、日期／代號條件、分頁與公開快取；現有 code/trade_date fact 表不為拆表而拆表。
4. 券商主檔／alias：先確認跨來源broker_id命名空間，不能同名即合併；會員追蹤／通知不得進公開快取。
5. 題材多對多、新聞／研究／派工等仍需逐項盤點來源、歷史、有效日期及同義詞；必要快照不當冗餘刪除。
6. 監看實際用量，評估11/30前是否已回到額度；目前沒有新建帳務監測排程，也不自動續建使用者取消過的權杖排程。

不要刪原表、stocks、觀測名稱、歷史價格、未知research紀錄；不要停舊trigger或改Auth。新增共用DB方案需具體SQL、影響、備份及驗證，再取得新授權；前次授權不涵蓋全站任意改表。

## 9. 相關文件

- docs/collaboration/changes/2026-10-31-screen-normalization.md
- docs/collaboration/changes/2026-11-01-screen-mirror-cleanup.md
- docs/collaboration/changes/2026-11-01-normalized-read-egress.md
- docs/collaboration/changes/2026-11-01-chart-market-directory.md
- docs/collaboration/changes/2026-11-01-ranking-security-names.md
- docs/collaboration/changes/2026-11-01-overview-security-catalog.md
- docs/database/website-data-read-inventory.md

## 可直接給 Claude Code 的接手指令

請先讀這份交接文件與 AGENTS.md、docs/collaboration/README.md，在獨立 worktree 同步最新 origin/uat，保留所有合夥人修改。接續全站正規化讀取遷移，優先盤點會員選股紀錄的保存、重試、任務驗證及匯出仍讀 stocks JSON 的路徑；先實作相容讀寫與測試，暫不刪 stocks 或停 trigger。網站修改測試後可依既有授權推 UAT並查Vercel；新共享資料庫變更先備妥具體migration、備份及驗證方案再取得授權。不得碰prod、App、Auth、排程或付費設定。
