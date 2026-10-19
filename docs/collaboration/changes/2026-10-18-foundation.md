# 網站與 App 協作底座

新增獨立 App／共用規格目錄、同步整合工具、PR 範本、唯讀 GitHub 檢查及 AI 接手規則。

現有網站畫面、API 參數、會員與資料格式皆不變。尚未建立可安裝 App，也沒有安裝 Expo 依賴或啟用雲端建置。iPhone／Android／iPad 會在 App 階段共用主要程式並分別驗收排版與裝置行為。

不需要資料庫、OAuth、環境變數或排程修改。GitHub ruleset／強制 PR 保護沒有啟用；既有 uat 整合方式保留，新增工具以乾淨工作區、正常 merge 及非 force atomic push 避免過時更新覆蓋對方。

回復方式：停止使用新增工具即可繼續既有非強制整合流程；不需回復任何會員或資料庫狀態。工具的 dirty workspace、同檔衝突、遠端並發、重試整合與工作區隔離由 tests/test_collaboration.py 驗證。
