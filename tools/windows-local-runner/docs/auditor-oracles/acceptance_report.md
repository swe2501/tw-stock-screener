# WIN-RUNNER-AUD-01 — 短驗收報告

2026-11-08T15:00:13.040433+08:00（Asia/Taipei）

## 結論
**v1 REJECT；2 High實碼缺陷已獨立重現。** 舊正常路徑18 PASS與binding1 PASS只在Linux限定成立，不回填或掩蓋新FAIL。Windows/受控交付/真新release均PENDING，未啟動原任務。

### High R01 — 預存ledger缺約束仍能重執
`WIN-RUNNER-OPS-01/v1/runner.py:44–49`僅CREATE TABLE IF NOT EXISTS；不驗既有PK/UNIQUE。自己的新錯schema DB，兩次真CLI同campaign/task、不同run-id皆0，兩份launch/self-PID/result證實不同worker且exit0。`known-gaps-001/results_reconciled.json`保存逐次command、raw、schema、DB before/after。`L56`的UPDATE還會把兩列pid改為第二個pid，所以不能從最終ledger的pid欄反推只有一個worker。

最小修復：接收既有DB後、reservation/spawn前驗schema/version/必要PK(campaign,task)及UNIQUE(run_id)，錯誤拒收，不刪庫重建、靜默migration或降級。修後相同負控第一次就應拒收：0 worker、0 launch、DB schema/rows不變。既有正常DB sticky/race案例另保留，不重造全域去重要求。

### High R02 — hash驗證後二讀config可接受未驗bytes
`runner.py:31–36`驗原bytes，`L37`再read_text，`L42`再讀pin。自己的Linux隔離複本在首次config read_bytes返回舊bytes後換入新config；verify接受normal deadline2.0，而被驗與pin綁的是原1.0 config，SHA不符。這是明示deterministic IO時序注入，不是聲稱Windows遭攻擊；0 worker。

最小修復：同一pin byte snapshot，保存並只解析已驗config bytes；或察覺變動fail-closed。修後oracle：回傳cfg須精確來自原已驗bytes，否則先拒收；不得回傳替換未驗cfg，不能改原pin湊PASS。NOT_APPLIED.patch僅建議，未套v1，未當成release或功能修復。

## 七項與原始證據
詳`acceptance_matrix.md`、`evidence_index.md`、`results.json`。R03與R06 REJECT；其餘5項僅Linux/靜態LIMITED_ACCEPT，全部Windows NOT_RUN。指定source/delivery/OPS02 delivery SHA均獨算吻合；28件讀用外部來源各自接件截點到seal未變（最後一件release文件為late intake，不捏造其在首輪前已採證）。

## 測試及Auditor自身失敗透明紀錄
既有20次CLI原始測試14:55:13起（台北），終端formatter因bytes JSON exit1，未重跑；純解析復核18/18。修訂v2只驗AST/encoder，整套NOT_RERUN。另一次binding14:56:23（台北）保存實際proc來源；新兩情境14:58:14（台北）。新反例harness初始錯以最終ledger PID應不同當oracle，exit1與錯誤NOT_REPRODUCED原檔保留；immutable launch/self-PID receipts純解析更正為R01已重現，未重執。兩類Auditor問題均RCA，不隱藏成產品PASS，也不以補測洗掉舊FAIL。

## 未完成項／owner action
1. **既有cloud owner/MLOps**：只修R01/R02並交真commit、新source/release pin與size/encoding，不開第二runner。已有`external_release.PENDING.json:5,28`明示commit=null、舊baseline而非新release；本次未向repo或其他bot查詢。收到才用既有同線基準增量驗。
2. **MLOps/Aiden**：controlled inbox、固定bootstrap/受控傳遞/權限信任落地與獨立外部pin仍待；hash不等簽章。Windows固定Python/cwd目前為`commands.json:22–28`提案，installer未跑。
3. **授權人/Aiden**：若要Windows惰性runner獨驗，須另外明確批准精確來源/入口/cwd/Python/allowlist/namespace/停止條件。不是沿舊C/40步/模型批准；本Auditor不代批准或啟動。

## 既定限制（不擴成新架構）
`runner.py:81–104`deadline只覆active-child polling；Start/SQLite/fsync非整體硬有界。cleanup0.5只own direct retained child，controller crash、power-loss、tree與Windows/Git未驗，不因Linux0或Process ack說tree清空。ENV exact-inputs/tool-results均重抄、combined無獨立stderr/header；A的LASTEXITCODE非獨立exit。4 call轉述不是7項Runner原生通過，不推全機有無Runner。未讀真模型/原資料；舊Audit、FAIL、pin均未改。
