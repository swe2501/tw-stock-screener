# 7F 工作人物坐到電腦前：本機交測候選（未推送、未驗收）

## 基準與邊界

- 基準 `origin/uat`：`b468c9f2efff1365d0288a3e40c3f9caf6f18ea9`。
- 隔離分支 `fix/7f-seat-animation`，worktree `/workspace/wt-fix-7f-seat`。
- 只改前端、離線測試與文件；沒有 push、部署、UAT/prod API、任務寫入、後端、DB、Auth、RLS 或環境變數變更。不動 Andrew／prod 工作區，不安裝工具。
- 本文件的 PASS 只指工程自測，不能取代 QA／CTO 驗收。推 UAT 由交辦者另行確認創辦人授權後處理。

## 六項範圍與實作對照

|範圍|實作與檔案|
|---|---|
|1 狀態與一致文字|`office-workroom-model.js` 的 `taskVisual`／`roomPlan` 決定文字與姿態；`office-live.js` 將同一份 plan 給右列、3D 與工作室。manual running 需有 worker，顯示「人工執行中 N」；agent/ai running 需 worker 且有效租約，顯示「工作中 N」。queued 為「排隊中 N」，manual 加「尚未領取／無人執行 N」；review「待驗收 N」坐著不打字；blocked／failed 警示；approved／cancelled／無任務走動。|
|2 真實桌椅|`office-tower.js` 在建立 chair 時註冊其座位，逐層套用 desk 的平移／旋轉；不再使用 x=±1.05、z=.95 的虛構工位。資安唯一電腦椅 x=0、z=1.45，面向 -Z（人物朝向 π）。`office-architecture.js` 改成髖／膝與肩／肘關節，坐姿腿彎到真實座高、手朝鍵盤。其他房間沿用原家具，不新增假電腦；非電腦椅不能當工作工位。|
|3 reduced-motion|純函式 `personPose` 保留同一個座標／朝向與坐姿，只停走動／打字擺動；`office-tower.js` 不再提前跳回站姿位置。|
|4 每人綁定|依已領取 worker key（`agent-...`）或 assignee 綁定，manual 用匿名人物；同一人多任務只一個 avatar。保留活動中人物的工位，重排任務／新增人物不任意換位；已被別人使用的舊空位不會被返回者搶走。`office-task-board.js` 在既有 summary payload 保留原 API 已有 worker／executor，不讀取或增加憑證。工作室名片會反映該人的真實任務，不再一律 idle；人物與任務不重複計數。|
|5 租約／時效|manual 不要求租約；agent/ai 缺租約、非法／到期（包含等於現在）均「回報中斷／待確認」，不打字。快照未讀、錯誤、失效、未來時間或 ≥150 秒都「資料過舊」，不顯示工作中。150 秒為兩個 60 秒刷新週期加既有 30 秒快取的保守上限；這是前端呈現閘門，不是續租、重新領取或後端狀態變更。|
|6 維持刷新／延遲提示|保留 30 秒快取與 60 秒輪詢。沿用既有 2 秒本機顯示 timer，只重算租約／時效跨界，不發網路請求、不增加 3–5 秒刷新。`office-task-board.js` 回傳實際成功 list 讀取時間，快取重讀不偽造更新時間；錯誤保留最後成功時間但標成過舊。HTML／CSS 在右列與 3D 畫面顯示「資料最後更新時間 HH:MM:SS（台北）／可能延遲約 1 分鐘」。手機置於畫面下方，避免被收合清單遮住。資產版本 `7f-seat-1`。|

N 是任務數，不是人物數。工位不足顯示「工位不足／未展示 N」且不疊人；排程只顯示「舊排程 N 組」，不把整房帶成工作姿態。完整視窗沒有父頁任務來源時明示資料過舊，不自行登入或增加讀取 API。

## 修改檔案

- `apps/web/assets/ai-office/office-workroom-model.js`：可測試純函式。
- `apps/web/assets/ai-office/office-tower.js`：真實椅子註冊、逐人姿態、供測試用的唯讀人物／座位狀態。
- `apps/web/assets/ai-office/office-architecture.js`：彎曲腿／手臂的顯示骨架。
- `apps/web/assets/ai-office/office-live.js`：同源 plan、動態名片、本機時效閘門。
- `apps/web/assets/ai-office/office-workroom.css`：時間提示與換行。
- `apps/web/assets/office-task-board.js`：既有 summary 的 worker/executor、真正快照來源時間。
- `apps/web/ai-office.html`、`apps/web/index.html`：時間提示與 cache-busting。
- `tests/office-seat-animation.test.cjs`、`tests/office-seat-animation.browser.cjs`：新增純函式與真實 Chrome 離線測試。
- `tests/helpers/office-dept-fixture.cjs`：假時鐘、timer 與真實容量的測試支援。
- `tests/office-dept-sync.test.cjs`、`tests/office-dept-sync.browser.cjs`：維持原覆蓋，僅按新需求調整「排隊中」、失效立即標過舊及 agent 租約斷言。原「running」fixture 補 worker／有效租約；並未略過失敗項目。parent postMessage 是非同步，瀏覽器驗證傳輸前或失效後文字，但右列／房間始終一致；同步失效由單元測試另覆蓋。
- 本文件。

## 可重跑自測與證據

```sh
node --test tests/office-seat-animation.test.cjs
node --test tests/office-dept-sync.test.cjs
node tests/office-workroom.test.cjs
node tests/office-operations.test.cjs
node tests/web-build-scope.test.cjs
python3 -m unittest discover -s tests -p 'test_office*.py' -v
node tests/office-seat-animation.browser.cjs /workspace/7f-seat-evidence/browser
node tests/office-dept-sync.browser.cjs /workspace/7f-seat-evidence/dept-browser
```

- 修改前：既有 dept-sync **23/23**，Python office **53/53**；workroom、operations 與 build-scope（2 項）皆自測成功。
- 修改後：新單元測試 **86/86**，既有 dept-sync **23/23**，Python office **53/53**；workroom、operations 與 build-scope（2 項）皆自測成功。
- 新單元矩陣為 7 狀態 × 3 execution × 有效／失效／缺失租約（63 項），另測領取資訊缺失、精確座位與旋轉、reduced-motion、一人多任務、多人／返回人物、超容量、快照過舊／錯誤、假時鐘台北時間、2 秒本機變化不送 request、快取來源時間與 24 筆細節限制。
- 同一新規格用 `OFFICE_SOURCE_REV=b468c9f2efff1365d0288a3e40c3f9caf6f18ea9` 重播：基準 **0 PASS／86 FAIL**。主要因舊版沒有新純函式介面；不可當作 86 個獨立產品缺陷的證明。
- 新 Chrome：1440／390 × light／dark × 一般／reduced-motion 共 8 組，每組 running、queued、review、expired、stale、error、manual 共 **56 個情境**；running／queued 共 **16 張截圖**。既有 dept-sync Chrome 四組亦重跑。
- Chrome 使用既有 `/usr/bin/google-chrome` 與 Node 原生 CDP；僅 127.0.0.1 靜態伺服器、合成資料、全新臨時 profile，限制外部 DNS。不呼叫 UAT/prod，也不用登入 session。
- 證據根目錄 `/workspace/7f-seat-evidence/`：前後 TAP／Python 輸出、`browser/browser-results.json`、`dept-browser/browser-results.json`、各截圖。
- 開發中曾有 fixture 等待 DOM 尚未建立的錯誤、非同步 postMessage 斷言時序錯誤；已修正 fixture 後重跑。手機截圖另發現時間提示被收合清單遮擋，已改位置並加上防遮蔽檢查，不能把前次失敗當作最終結果。

## 尚未測／殘餘限制

- 沒有做真實 UAT 管理員領取／提交、部署或 running 兩個實際刷新週期；需 QA／CTO 授權與驗收。
- 沒有 Playwright 套件，未安裝，舊 Playwright suites 未執行；新 Chrome 不宣稱等同所有舊 browser suites。
- 沒有執行全 repository 的非 office Python／會員／mobile 等測試；本輪覆蓋上述 office 與既有相關套件，不宣稱全 repo green。
- 其他瀏覽器與各房間全部狀態的人工視覺驗收未做；其他家具的座位採實際註冊，沒有電腦工位的房間只顯示數量／未展示。
- 前端仍受 200 摘要／24 detail 與原快取／輪詢延遲限制；資料過舊並非伺服器把任務改成中斷。舊排程不是新任務執行證據。
- repo 沒有可用的 user.name／user.email 設定；本機提交採單次命令沿用基準提交已有的作者 swe2501，不改全域或 repo 設定；交付文件會記錄實際 commit。

## QA／CTO UAT 驗收清單（尚待執行）

先確認創辦人原話、發布授權、UAT SHA 與 `7f-seat-1` 資產。登入失敗停止，不繞過；不能自行宣告驗收。

1. **寫入界線先確認**：若需試驗任務讓 running 維持兩個 60 秒刷新週期，試驗任務的建立／領取／心跳／提交／清理等寫入範圍，必須先經 CTO 明確確認。不要改原六筆或正式任務湊驗收，不自行 approve，不呼叫未授權的 worker/token 路徑。
2. 資安房 agent／ai running 有有效 worker＋租約：僅對應人物坐到唯一電腦椅 x=0、z=1.45、朝向 π；手朝鍵盤。旁人仍走動；右列與 3D 同為「工作中 N」。跨兩刷新週期記錄來源時間與任務 revision。
3. manual queued 顯示「排隊中 N · 尚未領取／無人執行 N」，不打字；經核准用既有正常流程領取後，顯示「人工執行中 N」，匿名人工人物就座，不顯示管理員識別。
4. review 坐著不打字；blocked／failed 顯示警示文字與異常姿態；approved／cancelled／無任務照常走動。無任務不代表排程自動停止。
5. agent／ai 租約到期／缺失／無效，或快照 ≥150 秒／讀取錯誤／失效：不能再打字或顯示工作中；應顯示「回報中斷／待確認」或「資料過舊」。使用前端假資料／假時鐘驗證，別任意中斷正式 worker。
6. 一人多任務／多人／工位不足：一人只一個人物；重排清單不換工位；超出顯示任務數而不把整房一起工作；回到工作室名片核對對應人狀態與匿名人工。
7. 1440、390，淺／深色，reduced-motion 開／關：人物仍就座；手機展開／收合右列、3D 房間與時間提示不互相遮蔽；兩處同字樣可讀，無橫向溢出。非電腦會議椅不當作工作電腦。
8. 核對請求紀錄維持 60 秒輪詢／既有 30 秒快取；2 秒只做本機呈現，不增加 API。右列與 3D 都顯示台北的最後成功時間及「可能延遲約 1 分鐘」，快取重讀不能把時間偽裝成現在。
9. 回歸原 7F 四部門 ID、看板入口／搜尋、取消卡片、revision 高水位、失效／錯配回應、24/200 筆上限與舊排程分列。

## 發布與回滾（本輪均不執行）

- 本地提交由父代理另行處理 UAT；本分支未推送，UAT SHA 未變更。
- 以交付時 `git merge-base --is-ancestor origin/uat <commit>` 及遠端唯讀 SHA 判斷是否可 FF；真正發布前必須重查遠端，若已分歧不得 force／reset／stash，交回整合處理。
- 回滾提案：在最新 UAT 的隔離工作分支執行 `git revert <本次 commit>`，重新自測後，按授權以 fast-forward 非 force 更新 UAT。不是 reset 回舊 SHA，不丟棄他人後續變更。
