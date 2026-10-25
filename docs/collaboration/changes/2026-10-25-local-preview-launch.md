# 本機篩選啟動入口

使用者從 file:///apps/web/index.html 開啟網站時，隱藏式需使用 127.0.0.1:49675 的本機後端；前次僅啟動當次程序，程序停止後會出現服務未連線。這次確認程序已不存在並恢復，以實際公開行情及本機 HTML 瀏覽器試跑今天＋均線成功。

新增根目錄「啟動本機預覽.cmd」，使用既有本機 Python 執行 scripts/start_local_preview.py。先檢查健康端點；已啟動時重用，不重複建立程序。未啟動時以隱藏背景程序執行本機服務，等待就緒才打開原 file 網頁，保留既有 file-origin 登入與偏好。不註冊開機常駐／排程、不改系統安全設定、不修改正式站或資料庫。診斷 log 存系統暫存的 foresight-local-preview/screen.log。

服務未連線提示改為明確指出此入口。驗證：實際 HTML 頁面可連本機後端並回傳 zhenming_hidden_applied=true；啟動器在既有服務時成功重用；zhenming-hidden.browser.cjs 通過。依使用者後續 234 指令提交並同步 UAT。
