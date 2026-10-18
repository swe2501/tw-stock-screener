# 共用模組規則

- 在 shared/<owner>/<task> 分支修改；先讀 docs/collaboration/README.md。
- 共用變更要附 docs/collaboration/changes/ 下的網站／App 影響與舊版相容性說明。
- 不將管理金鑰、會員 token、私人算法或整份環境設定放入共用程式。
- 不假設網站與 App 同時升級；資料格式新增應向後相容，破壞性變更需獨立版本與過渡安排。
