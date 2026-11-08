# 官方重大公告更新管線

## 已實作與目前狀態（2026-11-08）

- 獨立 Windows 工作：`AI_stock_OfficialAnnouncements`。週一至週五 07:00–14:30（台北時間），每 5 分鐘巡查；不是交易所休市日曆，平日國定假日仍會查公告。
- 首輪／再次實測：18 個來源中 17 個正常；環境部 HTTPS 憑證鏈驗證失敗，保留 error，不關閉 TLS 驗證、不繞過防護。
- 首批本機快取 1,517 則（包含來源 feed 提供的歷史公告，不表示當天新公告數）。
- 下一次排程：2026-11-09 07:00。已驗證工作啟動、非時段略過、exit 0；公開來源抓取另以 `--force` 實測。
- **目前 local-only，網站尚未讀取新管線。未套用 Supabase SQL，也未啟用雲端同步。**
- 不修改既有新聞工作、不執行舊腳本的清除／上傳流程，不呼叫 AI，不新增訂閱或付費服務。

## 來源目錄與抓取

權威設定：`scripts/official_sources.json`。來源種類：國庫署、金管會、央行、國發會、經濟部與澄清、主計、財政部、能源署、環境部、證交所新聞、上市／上櫃 MOPS、Fed、BIS、金管會法令函釋、證交所注意及處置（各自獨立）。

大部分來源 5 分鐘；能源署 10 分鐘，環境部／BIS 15 分鐘。這是輪詢，不是推播，也不能保證公告後五分鐘內可見；官方 feed 延遲、停機或封鎖會影響新鮮度。最多三個來源並行，每次 HTTP 20 秒，4MB 回應上限，使用 ETag/Last-Modified，失敗不清空舊資料，回傳非零。

只抓官方列表／RSS/OpenAPI，保留標題、短摘要、來源網址。關鍵字僅標記「待核對的投資事件候選」，不宣稱利多／利空，不預測股價。BIS 列表缺發布日期的列保留 unknown，不用發現時間回填 K 線；央行列表只有日期也不補造 16:30 等時間。政策生效日只有原文提供結構化依據時才寫入。

## 本機路徑與操作

目前執行程式工作區：
`C:/Users/User/.codex/visualizations/2026/10/12/01a1308c-6895-7e12-a65a-9588d0dacff3/official-announcements`

持久狀態目錄：
`C:/Users/User/.codex/visualizations/2026/10/12/01a1308c-6895-7e12-a65a-9588d0dacff3/official-announcements-runtime`

內含 `announcements.sqlite3`、`health.json`、每日 log（30 天）、單一程序鎖。抓取必須電腦開機、Windows 使用者登入且可連網；不喚醒休眠、不保證離線執行。錯誤可由 health.json 的各來源 last_success/error、Windows LastTaskResult 及 log 核對。這不是已接通的寄信警報或 AI Office 打卡。

程式入口 `scripts/official_announcements.py --state-dir <目錄>`；手動非時段查詢加 `--force`。避免同時開多份。停用：`Disable-ScheduledTask -TaskName AI_stock_OfficialAnnouncements`。保留程式工作區，移動／刪除前先更新任務 Action。既有排程沒有被停用或覆蓋。

## 正規化與待批准的雲端遷移

來源主檔、公告、標籤關聯及證券關聯分離，股名／產業不複製。共用雲端腳本：`docs/database/official-announcements-expand.sql`，準備新增四表：

- `official_sources`：來源定義與最新抓取健康狀態。
- `official_announcements`：短摘要與公告／生效／首次發現時間，冪等 hash 主鍵。
- `official_announcement_tags`：公告與分類關聯。
- `official_announcement_securities`：原始代號＋可解析的 `security_master(code)` 外鍵。權證或尚無主檔的代號不杜撰股名。

`ingest_official_announcements(jsonb,jsonb)` 僅 service_role 可執行；每批最多100公告，公告與標籤／證券原子寫入；初始階段不授予 anon/authenticated 表讀寫、不修改現有 Auth／RLS。套用前需核對既有 schema、主檔欄位並備份。回滾先停雲端同步；無需刪除既有業務資料，也不要自動刪除新增公告。

`publish_official_announcements.py` 預設 dry-run，不讀取金鑰、不發雲端寫入。批准 migration 後，使用明確 `--env-file ... --apply` 測試，核對來源／公告筆數、權限與冪等性，才建立 runtime 的 `cloud-sync-approved.json`（只有 env_file 路徑，不含金鑰）。排程每次從本機讀已變動的資料；保留 cursor 避免全量重寫，部分批次失敗可安全重試。不寫回舊 news_feed，避免新造重複的股名 JSON。

網站/K 線下一步：從既有授權 API 查詢公告與來源 JOIN，限日期／筆數，來源健康資訊留管理後台；分開顯示市場政策、產業政策、公司申報、注意與處置。不得把目前本機收集成功說成網站已上線。新讀取入口應維持12支部署 Function 上限。未實作 K 線事件標記或前端輪詢。

## 驗證

`python -m unittest discover -s tests -p test_official_announcements.py -v`

涵蓋台北日期精度、時段邊界、官方 URL allowlist／轉址、拒絕 DTD／HTML偽RSS、無公告零列、部分來源失敗保留資料、重跑冪等、分類避免 Taiwan 誤中 AI。

SQL 尚未線上執行或驗證；雲端 publisher 只做 dry-run。來源真實網路實測紀錄見 runtime logs/health.json。


## 2026-11-08 啟用驗證補充（取代上方 local-only 狀態）

使用者已明確批准備份後套用官方公告四表與同步。已在共用 Supabase 建立四表與 ingest_official_announcements；所有新表 RLS=true，anon/authenticated 無表讀取及 RPC 執行權限，service_role 可執行。沒有修改既有表／Auth／RLS。

備份：`C:/Users/User/.codex/visualizations/2026/10/12/01a1308c-6895-7e12-a65a-9588d0dacff3/official-announcements-db-backup-20261108`，含 API schema、2379筆公開證券主檔與 hash manifest。

同步驗證：來源18、公告1517、標籤關聯424、證券關聯15；全部公告content_hash與本機一致。原security_master完整hash未變；匿名REST讀取回401/403。第二次同步changed_documents=0，未重複新增。runtime已建立不含金鑰的cloud-sync-approved.json，僅記錄原.env.local路徑。

網站讀取沿用api/auth，action=official_announcements，先驗證會員JWT，再由後端JOIN取得來源、標籤；日期上限31天／筆數上限50，回應no-store。每日新聞加入官方公告區、來源篩選、手動更新與可見頁面5分鐘自動更新。最近7天最新30則研究候選，來源失敗明示。未實作個股K線事件標記，不能把關鍵字匹配視為確定產業影響。

測試：7項Python測試通過；實際雲端JOIN讀取200／30則／18來源；明暗色、1440／390寬度、摘要安全顯示、來源異常、手動更新與登出清除的瀏覽器測試通過；API入口維持12支。
