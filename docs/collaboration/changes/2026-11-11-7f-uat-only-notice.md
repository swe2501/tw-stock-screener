# 7F 任務中心僅 UAT 啟用：顯示環境說明並停止重試（未發布）

## 基準與唯讀診斷

- 按指定先 `git -c credential.helper= -c 'credential.helper=!gh auth git-credential' fetch origin`；clone 的 fetch refspec 原本只追蹤 prod，因此再明確 fetch uat tracking ref。
- 確認 `origin/prod=0129643adff0a1bead167c378c277ba45cb41bf7`、`origin/uat=ed96d9c8b56d7cfd9d61a6c64ab30d0d8f620b8f`。新 worktree `/workspace/wt-fix-7f-uat-only`／新分支 `fix/7f-uat-only-notice` 基於後者。
- prod／uat 的 `lib/office_tasks.py:69–71` 都是：VERCEL=1 且 VERCEL_GIT_COMMIT_REF != uat 時，`Problem(403, '任務中心目前僅在 UAT 啟用')`；356 呼叫 guard，407 轉成 `{error:...}`。
- `api/auth.py:454–464`：admin_* 先核管理員，失敗的另一種403為 `forbidden: 僅限管理員`（459），只有通過才把 admin_office_tasks_list/get/create/update 交給 lib.office_tasks。這兩種403不可混同。
- prod／uat `apps/web/index.html:4516–4518` 的後台 post 確實呼叫 `POST (window.__API||'')+'/api/auth'`，JSON 包含 `action`。原本只取 r.json()，HTTP status 被丟棄，並非 _authFetch 的401刷新流程。
- `admin-office.js:172–178` 接 iframe workroom-request → `taskBoard.snapshot` → postMessage 回 iframe。
- 舊 `office-task-board.js:33,48–54,97–101`：error 變成普通 Error，再轉為泛用「任務資料暫時無法讀取」，scope 原因和 status 都丟失；snapshotAt 未成功更新，錯誤不能命中成功快取。121 的任務中心另有15秒計時器。
- prod `office-live.js:91–99,126–136`：error snapshot received=0，60秒刷新照常；133–134 的 visibility／selection 也可再請求。prod `office-workroom-model.js:22–27` 和 `office-tower.js:52` 將錯誤畫成「載入失敗」。目前 UAT ed96d9c8 已改用 freshness／roomPlan，因此同一錯誤是「資料過舊」，不是「載入失敗」，但兩者都繼續重試。

## 離線舊版反例

`tests/helpers/office-uat-only-fixture.cjs` 使用真實 index.html post、task board、iframe live／model／tower bridge，只有 fetch、DOM 和時鐘為合成。分別用 OFFICE_SOURCE_REV=origin/prod 與 ed96d9c8 跑 git objects，沒有切換或修改 prod 工作區。

- 0／60／120／180秒：任務列表請求為 **1／2／3／4**；prod 右列和3D一直「載入失敗」，UAT一直「資料過舊」。
- 再觸發 visibility、focus（原本不會單獨請求）、selection、force、invalidation 後，兩版本都累積 **8** 次。
- 每筆均是 mock `POST /api/auth`，action=`admin_office_tasks_list`，HTTP 403。
- 證據 `/workspace/7f-uat-only-evidence/prod-before-repro.json`、`uat-before-repro.json`。
- 這證明來源程式能造成重複403；未取得 QA 那24次請求的逐筆 HAR/payload，不能宣稱24次全是此 action，也不能排除獨立的管理員403。

## 修正與範圍

- index.html 的既有後台 post 僅在失敗且 action 為 admin_office_tasks_* 時，把真實 Response.status 保留為 httpStatus。成功回應與其他 action 原樣返回；URL、method、token、headers、認證／refresh 邏輯都沒有改。不保留 status 就無法符合「只有403才鎖定」的條件。
- task board／workroom-model 都精確辨識 httpStatus=403，且 error 或 message 字串包含穩定片段「僅在 UAT 啟用」。500帶相同訊息、401、其他403都不鎖定。
- task board 對該錯誤鎖定本 mount 的 unavailable、清掉舊任務／細節快取，顯示環境說明、停15秒任務輪詢；後續 snapshot(force)、refresh、show、開部門或其他任務 call 都不再 fetch。
- iframe live 接到可驗證的當次回應後，鎖定本頁 terminalSnapshot、清掉舊任務和人物綁定、停60秒任務刷新；所有 requestData 入口（包含 visibility、selection、invalidation、工作室手動更新）均有 guard。晚到成功回應也不能覆蓋 terminal 狀態。
- model 的 roomPlan 直接回傳「僅 UAT 啟用」、無任務 actor，不偽稱0件／無任務／資料過舊。兩個更新時間提示改說「本頁已停止重試」，工作室也有說明。
- 此鎖定只在本頁／board mount 記憶體，不寫 localStorage；重新載入或新 mount 可重新判斷環境。
- 不停止既有排程狀態 admin_office 的獨立60秒更新；不處理其他403／Auth。所有原輪詢間隔（60秒、15秒、2秒）保留，只有指定 scope403 分支取消任務 timer。
- ai-office.html 六個相關資產與 index.html task-board/admin-office 兩個腳本統一 `7f-uat-only-1`。不改 API／lib／scope_guard／DB／RLS／認證或付費服務，沒有安裝、讀.env、動Andrew/prod/main、force/reset/stash/amend、push或部署。

## 驗證與圖片

- 修改前 Node 128/128、Python office 53/53、既有 Chromium seat112/112／dept4/4。
- 新9項規格對舊前端：5 PASS／4 FAIL（精確scope停止與清舊資料未實作）；不是9個既有缺陷。
- 修改後 Node 137/137、Python53/53；既有座姿 Chromium112/112、部門看板Chromium4/4，新增UAT-only Chromium20/20（桌機／手機、深淺色×5情境）皆通過；最後一輪位於final-uat-only-browser與final-dept-browser。
- 修補後同一0／60／120／180秒與額外事件重播，任務請求一直 **1** 次，右列／3D皆「僅 UAT 啟用」：after-repro.json。
- 新 Chromium 用真實 AdminOffice＋實際 post wrapper＋iframe，mock fetch Response保留HTTP status；合成時鐘逐次跑原60秒/15秒 callback，不等待或宣稱實機3分鐘。包含 error/message 兩種scope403、管理員403、同訊息500、正常UAT，桌面／手機尺寸、深淺色。
- 圖片：證據根目錄 `01-prod-403-uat-only.png`（右列＋3D同時「僅 UAT 啟用」）、`02-uat-normal.png`（排隊1＋待驗收1正常對照），另附深色message版與手機版。已開圖目視確認桌面兩張標籤可辨讀；不是登入prod的截圖、不是QA驗收。
- helper 初版曾有 start 命名衝突，跨版本讀大index又碰 execFileSync 預設緩衝限制；均是本機fixture執行前失敗，已保存記錄並修復，沒有產品請求或權限繞過。本機 git var 身分預檢另因未設定 identity 回128，尚未嘗試commit；以本次命令的 Grok Bot／grok-bot@localhost 身分提交，不改全域或repo設定，原始錯誤另存identity-precheck-failure.txt。

可重跑：

```sh
node --test tests/office-uat-only.test.cjs tests/office-review-badge.test.cjs tests/office-rest-pose.test.cjs tests/office-seat-animation.test.cjs tests/office-dept-sync.test.cjs tests/office-workroom.test.cjs tests/office-operations.test.cjs tests/web-build-scope.test.cjs
python3 -m unittest discover -s tests -p 'test_office*.py' -v
node tests/office-uat-only.browser.cjs /workspace/7f-uat-only-evidence/uat-only-browser
node tests/office-seat-animation.browser.cjs /workspace/7f-uat-only-evidence/after-seat-browser
node tests/office-dept-sync.browser.cjs /workspace/7f-uat-only-evidence/after-dept-browser
```

## 交接

未推送，交辦方自行推uat；QA／CTO驗收，不自行宣告通過。回滾 `git revert <本輪新SHA>`。

未測：登入UAT／prod、真實3分鐘輪詢與網路回應、QA24次逐筆HAR、Edge／Safari／實體手機。頁面重載／新mount會重新探測一次是刻意行為；其他403依要求仍可能持續出現在console，不能承諾所有403都消失。
