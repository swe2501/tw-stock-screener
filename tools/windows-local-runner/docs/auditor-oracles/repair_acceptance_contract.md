# R01/R02修後同線最小驗收（尚待真release）

不改v1，不開第二實作。新源須先獨立review、外部釘住真commit/五檔size/SHA/version/encoding，不能沿用v1 source gate；未知release NOT_RUN。

|情境|舊v1實測|修後精確預期|
|---|---|---|
|R01 預存attempts欄位同但缺PK/UNIQUE|同task兩CLI 0，兩launch，FAIL|第一次即非0拒收；無launch/worker，錯DB rows/schema不變，不刪庫/重建/migration；第二次不得當新run放行|
|R02 首次驗bytes之後替換own config|verify回傳未驗deadline2.0，FAIL|只回傳原已驗bytes對應cfg（舊1.0）且pin身份來自同snapshot；或拒收。絕不可接受未驗2.0；不啟worker|

可執行基準：`independent_runner_acceptance_v2.py --out <全新名>`為原正常矩陣腳本，完整v2尚未重跑；只對已review pinned源。`independent_known_gaps.py`是凍結v1反例腳本，初始R01 mutable-ledger oracle有誤，**不可將其exit作產品結論**；兩次現存CLI由`reconcile_known_gaps.py`按immutable receipt判定，未重跑。未來修後需以上表驗收，不用舊「反例被確認 exit0」當修復PASS。`reconcile_existing_results.py`及`reconcile_known_gaps.py`只讀現成log，不啟產品；`binding_stop_probe.py`是單一新隔離Linux fixture。所有未來執行仍須在允許範圍，不能由這份文件取得Windows或模型權限。
