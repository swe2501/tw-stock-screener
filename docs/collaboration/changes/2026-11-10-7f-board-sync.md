# 7F 部門看板同步修補：工程交測（尚未驗收）

## 範圍與基準

- 基準 UAT：`4568abc4b91ba6550dcf2e78edc1712f7b3eccbd`。
- 獨立分支 `fix/7f-board-dept-sync`／worktree `/workspace/wt-fix-7f-board`。
- 僅前端、離線測試與文件；不改後端、DB/schema、Auth、RLS、部署環境變數，不碰 prod 或 Andrew。
- 既有調查只是證明前端存在缺陷路徑，不能認定就是創辦人截圖當時的事件時序。

## 七項修補

1. live 與任務中心各保存按 task ID 的最大 revision；失效只清 freshness，不清 revision 高水位。工作室／總覽／房間／右列都使用 canonical 任務。
2. invalidation 同步重繪 activity、右列與工作室；可見時立刻重讀 overview，並作廢事件前的請求。
3. 回應需符合 request、預期 department、該部門最新 request；拒收未知／過期／錯配回應。錯誤不得標記為新鮮成功；source/origin 防護保留。
4. 共用 task-only 狀態／徽章文字，分列「待執行」「待驗收」「舊排程 N 組」。工作室亦明示任務分項與角色口徑；排程工作不當作 running 任務數。
5. cancelled／approved 只顯示已結束，不回退「待確認」。任務中心保留取消卡片以供稽核，並增加已取消摘要格，不將其計入 active。
6. 房間文字／徽章先 select 該 ID，再開其看板；工作室入口也同步選取。父頁先設定部門，部門／單任務入口清搜尋。
7. snapshot 分開傳輸完整既有列表摘要與最多 24 筆 detail；徽章不再從 detail 切片推算數量。沿用 API `total` 判定 200 筆上限，超出標示「列表未完整」，缺席部門不武斷顯示無任務。

保留既有執行語意：running 的工作優先、AI 租約中斷判定；不擴充 agent 心跳／重派政策。工作室舊的四格混合角色與任務計數仍有明確口徑說明，額外列出 task-only queued/review。

## 資產與建置

`ai-office.html` 與 `index.html` 將變更 JS/CSS 加上 `?v=7f-sync-1`；model 提前載入。`vercel.json` 使用靜態資產，`scripts/should_build_web.cjs` 對 apps/web 變更回傳 build；沒有需提交的生成 bundle。`2722a883` 是過去環境變數調整後的重建用 commit，這次已有真實網頁變更，不需改 API 或建立無關重建 commit。

## 可重跑自測

```sh
node scripts/repro_7f_board.cjs 4568abc4b91ba6550dcf2e78edc1712f7b3eccbd /workspace/7f-board-fix-evidence
node --test tests/office-dept-sync.test.cjs
node tests/office-workroom.test.cjs
node tests/office-operations.test.cjs
node tests/web-build-scope.test.cjs
python3 -m unittest discover -s tests -p 'test_office*.py' -v
node tests/office-dept-sync.browser.cjs /workspace/7f-board-fix-evidence/browser
```

- 同一組 23 個期望行為測試：基準 4 PASS／19 FAIL，修補後 23 PASS／0 FAIL。基準失敗為預期的回歸證據，不是修補後測試失敗。
- 精確合成 witness：基準 invalidation 後右列「待執行 2」／房間「待執行 3 項」、工作室舊 rev1；修補後兩處均「待執行 1 · 待驗收 1」、active=2、工作室 rev3。
- 既有 workroom、operations Node 測試通過；web-build-scope 2 項通過；Python office 共 53 項通過，完全 mock。
- 新增真實 Chrome 整合（Node 內建 CDP，既有 `/usr/bin/google-chrome`，無安裝）：1440／390 × light／dark 四組通過，含四個入口 ID、底部、看板、工作室、搜尋、同步失效、未知 request、24/200 上限、已取消及實際寬度；沒有未捕捉 browser exception。
- 舊 Playwright browser suites 沒有執行：box 沒有 Playwright 套件，遵守不得安裝；新 Chrome 測試不宣稱替代所有舊 browser 覆蓋。
- 新 Chrome fixture 初跑因測試 HTML 缺 charset，中文期望字串誤解碼而失敗；補 UTF-8 後重跑四組通過，無放寬產品斷言。
- 證據保留 `/workspace/7f-board-fix-evidence/`，包含前後 TAP、JSON、Python／Node 輸出、Chrome 四組結果及截圖。

## QA UAT 驗收清單（由測試工程師／CTO 判定，不是工程自行驗收）

先確認 UAT deployment SHA／資產 `7f-sync-1`，使用正常登入；若登入失敗停止，不加 bypass。URL：
`https://tw-stock-screener-git-uat-andrew250165s-projects.vercel.app/`

1. **revision 一致**：用瀏覽器測試攔截／非敏感 fixture（不寫 UAT DB），先載 QA8 的 queued rev1，再載 overview 的同 ID cancelled rev3。右列、3D、工作室皆採 rev3。之後另一部門14失效，再回 QA，不能重新算入 queued。
2. **同步失效**：在上述序列觸發既有 task-updated/invalidation；同一個事件後截圖／DOM 記錄右列和房間，不能再出現右2／3D3；工作室關閉時亦須發起 overview refresh。
3. **回應關聯**：mock hold/release 兩個同部門 request，後發先回、舊的後到；再送錯 department、未知 request、事件前 response、失敗回應；確認均不汙染最新資料，失敗可重取，來源／origin 防護仍在。
4. **文字口徑**：7F 法遵14 的原「1 組」須明示「舊排程 1 組」，右列與房間相同；QA 用未逾期 queued1＋review1＋cancelled1 fixture，兩處分列待執行1／待驗收1，不將三筆紀錄誤稱三筆待辦。實際任務若逾期仍依既有需處理政策，不硬套未逾期數字。
5. **終結任務**：核對 cancelled／approved，不進 running、queued、review／待確認；全終結 fixture 兩處均已結束，取消卡片及摘要仍可稽核。不得重設或修改舊六任務／既有試驗任務來湊結果。
6. **四入口與搜尋**：對 `[9 資安,14 法遵,27 智財,8 QA]` 逐一點右列、3D 房間文字、3D 徽章、底部工作室→查看部門任務，記錄 selectedDepartment、底部中英名、message.department、看板下拉值與卡片 department。看板先留一段不匹配搜尋，再由另一部門入口開板，確認搜尋清空；返回大廈選取一致。桌機／手機、淺深色皆檢查字樣換行與清單捲動。
7. **detail cap 與完整性**：使用 mock 的 0/24/25/200/201 筆列表（禁止為測數量而寫真實 DB）。第25筆才出現QA仍須有徽章；每次 detail 讀取最多24筆。total201／摘要200時顯示未完整，不能對未出現部門說無任務；不得宣稱已做無上限全量。

## 殘餘限制與回滾

- 列表 API 本身上限200，這次不新增 aggregate/pagination API。超過上限只報已載入範圍且明示未完整。
- 列表與 detail 不是交易一致讀取；最大 revision 防退版，不代表跨任務原子快照或外部更新零延遲。外部變更沿用既有事件／刷新週期。
- 部分任務只有摘要，歷程／成本／KPI 已標示可能不完整；不得當成全量績效。
- 回滾提案：在最新 UAT 的隔離分支 `git revert <本次 fix(office) commit SHA>`，本機測試後非 force FF push uat；不做 reset、force 或回退他人的後續 commit。先前 UAT SHA 為上列基準；如要 Vercel 回升前次部署，需另依發布授權執行。本交付未執行回滾。
