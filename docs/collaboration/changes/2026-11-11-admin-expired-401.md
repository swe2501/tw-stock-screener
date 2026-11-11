# admin_* 登入失效回401，權限不足保留403（本機修補，未發布）

## 基準、授權與工作樹

- 依本輪明示授權修改登入過期回應；未自行讀取Mochi或創辦人的私有對話。
- 指定credential helper先fetch origin，再明確fetch uat tracking ref；確認最新origin/uat=`8e2497ebedb78fc6ae489a8a335eec666a1c14dc`。
- 新worktree `/workspace/wt-fix-admin-expired-401`、分支 `fix/admin-expired-401`，只做本機新commit。未push、未部署；交辦方自行推uat，不觸碰Andrew/prod/main工作區。

## 唯讀根因（8e2497eb行號）

- `api/auth.py:124–136` 原 `_verify_admin` 只回email或None，缺漏token、Auth回401/403、成功但無user、有效非管理員及上游故障都被混在None。129–134已有一次 `/auth/v1/user`，真正授權依 `ADMIN_IDS`，不是email白名單。
- `api/auth.py:455–459` 的admin_*分支把上述None全部回403「forbidden: 僅限管理員」。前端不會把此403當作需要續期。
- 同helper還被 `api/auth.py:429` 的algo_info及 `api/alert.py:521–527` 呼叫；不能無條件改回tuple，否則未授權的truthy tuple可能放行。需保留預設email/None契約。
- 另一個實際問題：`index.html:4516–4518` 後台post使用raw fetch，**不會進入**既有 `_authFetch`。因此僅改後端401仍不足以讓後台真正續期。
- `index.html:14025–14062`：既有 `_tryRefreshToken` 以_refreshing共用promise；`_authFetch`只有一個if401，成功後用原生fetch重試一次，沒有遞迴。14064–14070在續期HTTP401時清session並顯示重新登入。續期失敗或第二次仍401時直接返回並停止本次請求。

## 最小修正

### 後端（新行號124–142、461–469）

`_verify_admin(token, with_status=True)` 在同一次驗證中回 `(status, email)`；預設仍只回email/None，algo_info／alert不受影響。

| 狀況 | admin_*回應 | JWT驗證/Auth user呼叫數 |
|---|---|---:|
| 缺漏／空token | 401 unauthorized | 0（與舊版相同） |
| /auth/v1/user HTTP401／403 | 401 unauthorized | 1（與舊版相同） |
| 成功JSON但無有效user id | 401 unauthorized | 1 |
| 有效user但非ADMIN_IDS | 403 forbidden: 僅限管理員 | 1 |
| 管理員ID但無稽核email | 原樣拒絕403，不增加權限 | 1 |
| 有效管理員 | 繼續原action dispatch（測試200） | 1 |
| 5xx／429等其他HTTP錯誤、連線或timeout、壞JSON | 通用503 authentication unavailable | 1 |

不讀或回傳上游錯誤body／exception文字；上游故障不誤標401，不觸發不必要的續期。沒有第二次Auth驗證查詢，沒有改ADMIN_IDS、Supabase設定、env、DB或RLS。

### 必要前端例外（依本輪步驟3）

- 僅 `index.html:4517` 一行，把後台post導向既有 `_authFetch`；沒有該函式的隔離宿主保留raw fetch fallback。完整頁面該函式在全域main script宣告，後台路由於DOMContentLoaded後初始化。
- `_authFetch`、`_tryRefreshToken`、refresh API分支及所有watchlist／broker_watch呼叫者逐字不變。沿用現有共用續期與單次重試，不另造Auth流程。
- 返回401代表本次請求停止，不表示把所有頁面輪詢永久停掉；第二次401不新增自動登出，沿用既有返回行為。續期端401仍會登出；續期暫時503或無refresh token則不重試原請求。
- 保留前輪 `7f-uat-only-1` 的HTTP metadata與scope403停止輪詢功能；不改輪詢間隔。此次沒有改外部script資產，只有inline transport一行，因此沒有另升資產版本。

## 其他403與會員API的保護證據

- 原operation not allowed 403（舊255／新261）、MEMBER_DEVICE_LIMIT 403（舊345／新351）完全不動。
- `lib/office_tasks.py:69–71` scope_guard完全不動；新增測試有效admin在非uat仍得到原403文字。
- `api/watchlist.py`、`api/broker_watch.py`、`api/alert.py`、`lib/office_tasks.py`與基準逐byte一致。
- `_token_user`、`_sb`、refresh branch、其他handler分支完全不動。protected-scope-check.txt還核對整個api/auth.py只能有兩個指定區塊差異，index只能有上述一行差異。
- 兩個既有Python測試只調整opt-in helper mock契約；guest任務403期望改成需求中的401，非管理員pattern403仍保留。

## 驗證紀錄

證據根目錄 `/workspace/admin-401-evidence/`，原FAIL不覆寫。

| Suite | 修改前 | 修改後 |
|---|---:|---:|
| Node相關既有＋member identity | 167/167 | 加新10案後177/177 |
| Python office | 53/53 | 53/53 |
| Python *_auth | 43/43 | 43/43 |
| Python watchlist／broker_watch | 23/23 | 23/23 |
| Python pattern_review | 7/7 | 7/7 |
| 新admin401 Python方法 | 16方法，舊版有16個失敗斷言（含subtests） | 16/16 |
| 新admin transport Node | 舊版5 PASS／5 FAIL | 10/10（含在177） |
| 既有座姿／badge Chromium | 112/112 | 112/112 |
| 既有部門看板Chromium | 4/4 | 4/4 |
| 前輪UAT-only Chromium | 前輪交付20/20，非本輪重跑before | 20/20 |
| 新admin401 Chromium | 不適用 | 4 viewport/theme組×10情境，40/40 |

Python各suite有重疊（例如office auth），不將表格直接相加當獨立測試總數。新Node/Chrome包含：實際post收到401→續期→用新token重試一次；第二次仍401停止；續期401清session；續期503停止而不誤登出；無refresh token停止；其他403／scope403／503不續期；兩個同時失效請求共享一次refresh、各只重試一次；watchlist／broker_watch成功transport不變。

新Python使用真實handler／_verify_admin、mock urllib的/auth/v1/user與task store，涵蓋缺漏／401／403／無user／非管理員／管理員／上游故障／一次Auth查詢／legacy helper／scope_guard。新Chromium跑真實擷取的inline函式、不是完整登入UI，也不打真服務。

重跑：

```sh
node --test tests/admin-expired-401.test.cjs tests/office-uat-only.test.cjs tests/office-review-badge.test.cjs tests/office-rest-pose.test.cjs tests/office-seat-animation.test.cjs tests/office-dept-sync.test.cjs tests/office-workroom.test.cjs tests/office-operations.test.cjs tests/web-build-scope.test.cjs tests/member-identity.test.cjs
python3 -m unittest discover -s tests -p 'test_admin_expired_401.py' -v
python3 -m unittest discover -s tests -p 'test_*auth.py' -v
python3 -m unittest discover -s tests -p 'test_office*.py' -v
python3 -m unittest discover -s tests -p 'test_watchlist*.py' -v
python3 -m unittest discover -s tests -p 'test_pattern_review.py' -v
node tests/admin-expired-401.browser.cjs /workspace/admin-401-evidence/admin-auth-browser
node tests/office-seat-animation.browser.cjs /workspace/admin-401-evidence/after-seat-browser
node tests/office-dept-sync.browser.cjs /workspace/admin-401-evidence/after-dept-browser
node tests/office-uat-only.browser.cjs /workspace/admin-401-evidence/after-uat-only-browser
```

## 交接與限制

未push／部署、未讀.env*、未安裝工具、未動Andrew/prod/main、無amend/force/reset/stash。回滾 `git revert <本輪新SHA>`，實際SHA在 `/workspace/admin-401-evidence/DELIVERY.md`。

未測：真實Supabase JWT過期／refresh rotation、登入UAT/prod／真會員／完整後台登入UI、跨tab session同步、真網路故障、Safari/Edge/實體手機、全repo CI。既有refresh API本身的上游錯誤映射未改，並非此次admin驗證503政策適用於所有Auth action。仍需QA／CTO實環境驗收，不能宣稱已部署或真正使用者登入恢復成功。
