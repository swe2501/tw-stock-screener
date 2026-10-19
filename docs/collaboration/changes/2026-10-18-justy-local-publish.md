# JUSTY 遠端與本機發布連動

使用者要求每次網站更新都同步 UAT、JUSTY 與其本機工作區，避免 push 完卻在本機檔案看到舊版。新增 `scripts/collab.py publish-justy`；既有 start/sync/integrate 與其他開發者流程保持相容。

影響：開發協作工具與文件；不改網站 API、會員登入、資料庫或 App 程式。App 分支禁止呼叫此命令，不會把 SDK 預覽降版帶進 UAT。

安全邊界：發現本機未提交／未發布工作時停止；合併保留 UAT 與 JUSTY 雙方內容；三個遠端 ref 原子快轉推送；最後只快轉本機登記的 justy-layout。發布後本機若被其他操作改動，明確報告遠端成功、本機未完成，保留現場。

驗證：tests/test_collaboration.py 使用隔離本機 bare repositories，涵蓋正確更新、冪等、工作目錄含空格、本機草稿／提交保護、App／其他 owner 拒絕、檢查期間修改、並行推送拒絕與重試，以及發布後本機變動的部分成功報告；無正式資料寫入。
