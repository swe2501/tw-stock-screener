# 7F review 人物頭頂待驗收提示（本機交付，未發布）

## 基準與授權邊界

- `/workspace/wt-fix-7f-seat-rest`，分支 `fix/7f-seat-rest-pose`；本輪先明確 fetch `refs/heads/uat:refs/remotes/origin/uat`，確認 HEAD 與 origin/uat 同為 `94116007c8742ed320757f0950ffd517de60dfb4`，工作樹原本乾淨，沿用既有隔離分支。
- 已讀 `/workspace/qa-7f-seat-94116007/evidence/QA-REPORT.md`，以及 `uat-ui-1111/7f-departments-and-labels.png`、`dept8-zoom-default-camera.png`。同意單靠姿勢不足以在預設樓層鏡頭辨識 review；沒有把離線數值通過當成視覺驗收。
- 不推遠端、不部署；沒有 amend／force／reset／stash，不動 Andrew；未讀 `.env*`、真實會員資料或登入 profile，未安裝任何套件。
- 只改前端顯示與離線測試。office-live.js、API、DB、Auth、RLS、輪詢與快取程式均保持原 blob。

## 實作

- `office-workroom-model.js`：在既有 `resting = seated && pose === 'review'` 增加 `reviewBadge` boolean，不改既有後靠 `-.55`、手臂／腿部、打字或座位參數。
- `office-tower.js`：每個人物建立一次匿名頭頂 DOM billboard，包含本機 inline SVG 時鐘和「待驗收」三字；使用頭部世界座標投影到既有 label layer，恆面向鏡頭。顯示尺寸是固定 CSS pixels，不隨房間／人物縮小。
- 僅目前樓層、非 stale、有座位且真正套用 review pose 的人物可顯示。狀態離開 review 或變 stale 時即隱藏；換樓層／外觀／大廳也即隱藏；離開視窗的頭部不留下懸空提示。
- 提示為 13px 粗體，至少 78px 寬，琥珀色底、高對比深字、時鐘與小尖角指向人物；`pointer-events:none`，不干擾看板點擊或鏡頭拖曳。
- 提示、SVG 子元素、小尖角皆明確 `animation:none; transition:none`；一般模式也沒有跳動／閃爍，reduced-motion 保留同一提示。鏡頭或使用者操作造成的投影位置更新不是脈動動畫。
- `ai-office.html`：六個原 seat-3 資產參照統一升為 `7f-seat-4`；管理員腳本／index.html 不變。無新外部素材、網路字型或依賴。

## 自測（不是 QA／CTO 驗收）

- 修改前既有 Node（含 build-scope）：124/124；Python office：53/53；既有 Chromium seat：104/104，部門看板4/4。
- 新增 badge 單元規格在舊版跑：0 PASS／4 FAIL，屬新需求未實作反例，不是4個既有功能故障。
- 修改後 Node：128/128；Python office：53/53；既有部門 Chromium：4/4。
- 最終 seat Chromium：112/112（14情境×桌面／手機尺寸×深淺色×一般／reduced-motion）；另外聚焦同框8/8、760×700嵌入尺寸4/4。無 Runtime exception。
- browser fixture 包含同部門一位 review、一位 work；用 `focusFloor(7)` 的原預設鏡頭（zoom=1.05、elevation=.85、angle=.6），不按放大鈕、不拖移。檢查只有 review 有提示、其他人物與非本樓層都沒有；檢查文字、字級、尺寸、pointer-events、computed animation／transition、Web Animations API，以及 reduced-motion 350ms 的位置／opacity 不變。
- 原姿勢與 13 情境回歸仍保留；新 badge-pair 形成14情境 ×8組，並另有接近管理後台 iframe 的760px×700px合成畫面。
- 首輪 badge-pair fixture 在軟體渲染鏡頭尚未收斂時，用固定1200ms就斷言預設 zoom 而失敗。`pair-browser.log`、`fixture-failure.json` 保留；改成等待既有鏡頭 zoom／elevation／target 收斂，不改產品鏡頭，也沒有放寬預設鏡頭條件。

可重跑：

```sh
node --test tests/office-review-badge.test.cjs tests/office-rest-pose.test.cjs tests/office-seat-animation.test.cjs tests/office-dept-sync.test.cjs tests/office-workroom.test.cjs tests/office-operations.test.cjs tests/web-build-scope.test.cjs
python3 -m unittest discover -s tests -p 'test_office*.py' -v
node tests/office-seat-animation.browser.cjs /workspace/7f-seat-badge-evidence/after-browser
node tests/office-dept-sync.browser.cjs /workspace/7f-seat-badge-evidence/after-dept-browser
```

所有瀏覽器測試使用既有 Chrome、全新臨時 profile、localhost 靜態頁及合成 postMessage；外部 DNS 封鎖，不連 UAT／prod API。

## 圖片、交接與限制

- 證據根目錄：`/workspace/7f-seat-badge-evidence/`，交付索引 `DELIVERY.md`。
- 已目視原預設樓層距離的 review/work 同框與 reduced-motion：琥珀色「待驗收」可直接辨識，不必看小人物後靠幅度；work 旁沒有提示。提示沒有為了截圖放大。
- 最終截圖：`01-default-review-work.png`、`02-default-review-work-reduced.png`；嵌入尺寸 `03-default-embedded-review-work.png`、`04-default-embedded-review-work-reduced.png`；額外放大 `05-zoomed-review-work.png`、`06-zoomed-review-work-reduced.png`。皆在證據根目錄；保留原始 PNG 與結果 JSON，沒有裁切縮放或上字。
- 尚未測：登入 UAT／prod 真實狀態、真實 running 兩個60秒週期、實體手機、Edge／Safari、極端多人 review 標籤相互遮擋。
- 待交辦方自行推 uat，再由 QA／CTO 驗收；本輪未宣告驗收通過。
- 回滾：`git revert <本輪新 SHA>`；若尚未整合本機 commit，直接不採用，不需改 uat。
