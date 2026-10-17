# 集團研究台名錄與季度研究

完整名錄以 group-catalog.json 為準；group-catalog.js 為相同 groups 的瀏覽器版本。不可用行情 API members 覆蓋完整名錄。assets/groupbook-model.js 依 code 合併統計，保留原名錄順序、關係、文字與證券市場資訊；切換視窗會清除未回傳股票的舊統計。

台積電關係依使用者 Word 分為核心直屬與轉投資5筆、CoWoS設備9筆、廠務化材5筆。verified只表示股票代號經既有名錄核對，並非股權關係經官方背書。

零樣本不產生分數或勝率，排名排除這些集團。統計涵蓋數獨立於完整名錄數；本次未補寫資料庫歷史行情，也沒有改動既有分數公式。未完成季度仍沿用既有API的暫計結果，頁面明示，不可當成已完成季底績效。

季度理由使用每個集團的 quarterlyReasons：鍵為2026Q4等季度，值為股票代號映射，例如 {"2026Q4":{"2330":{"text":"已核對研究內容","source_urls":["https://官方或可核對來源"]}}}。只呈現文字與HTTP(S)來源均具備的條目；沒有內容時顯示資料尚未建立，不把Word固定內容冒充當季更新。靜態thesis與focus保留，分成文件慣性、標的理由兩區。

目前提供Word沒有帶季度鍵值及逐季來源，quarterlyReasons沒有填入任何杜撰資料。後續蒐集有來源的研究內容後，需同步JSON與JS檔；目前沒有自動新聞更新排程。

分類新增綜合，讓原補充88個集團可篩選，未擅自建立它們的產業歸屬。農林維持既有2913，不把Word的2906覆寫到可交易代號。

驗證：node tests/groupbook-model.test.cjs。Chrome本機確認192組578筆、台積電19筆3類、明星20組、綜合88組、TOP30不含無樣本群組、季度切換及缺資料標示。

## 統計完整性修正
- 行情分頁取消 60,000 筆截斷；任一頁失敗則回報錯誤，不將部分資料當成完整統計。
- 以台灣日期判斷季度，只納入已結束季度，集團與個股樣本一致。
- 研究台改呼叫同站 API，UAT 可驗證自己的後端。
- 大量行情仍逐頁讀取，實際部署需觀察回應時間；本次未改資料表或補寫行情。

## 每日預先計算
- `scripts/page_cache_push.py` 在每日行情上傳後呼叫 `groupbook_precompute.run`。
- 行情只讀一次，算出 5／10／20 日完整結果，一次原子 upsert 至既有 page_cache 的 groupbook_5、groupbook_10、groupbook_20。失敗保留前次結果。
- 公開 groupbook API 僅讀 page_cache，不提供訪客現算 fallback。payload.date 為行情資料日，updatedAt 為預算產生時間。
- 初次執行：python scripts/groupbook_precompute.py --env-file <既有環境檔路徑>。可加 --dry-run 驗證而不寫入；金鑰不送至前端。
- 本機每日排程使用主 checkout 的程式碼；需要將此版 scripts/page_cache_push.py、scripts/groupbook_precompute.py、api/screen.py 與 group-catalog.json 同步到實際排程執行的 checkout。worktree 或 UAT push 本身不會更新另一個 checkout。

## 首批有來源的季度研究（2026-10-17）
台積電生態系：2026Q4 收錄 2330 公司展望、3374 第三季月營收追蹤背景、3443 預定財報事件；2026Q3 收錄 3583 法說紀錄。資料核對日、公告／活動日及實際涵蓋期間各自記錄。事件僅記錄已公開時程，未將未發生的活動當成已公布業績。其餘股票仍待逐筆核對；沒有自動生成或自動更新內容。

## 官方數據每日更新（2026-10-17）
每日 page_cache_push 透過 groupbook_research_push 從 TWSE、TPEx 月營收官方 OpenAPI 建立本季背景摘要；保存至既有 page_cache 的 groupbook_research_YYYYQn。前端透過 groupresearch API 只讀取資料庫，不即時下載全市場資料。摘要與人工附來源研究分區，不將營收變化說成接單或季底上漲原因。人工核對的當季 editorial 一併存入快照；未有人新增的研究理由不會自動編寫。第一批 558/563 檔、191/192 集團，缺 1271、3454、4544、910322、911622。來源失敗保留前次快照；逾3個月或未來月份不冒充當期資料。這版自動化先含月營收，逐季財報與完整人工題材研究仍待擴充。
