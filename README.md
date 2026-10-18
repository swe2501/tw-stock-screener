# 跟誰學 · 網站與 App 共同專案

網站與手機／平板 App 放在同一個 GitHub 專案，各自在獨立工作分支與工作目錄開發，共用會員與資料服務的規格。

**合夥人／開發 AI 接手：先讀 [共同開發入口](docs/collaboration/README.md)，再讀自己的工作範圍。**

- 網站：既有 `index.html`、`assets/`、`api/`、`lib/`。
- App：[apps/mobile](apps/mobile/README.md)，規劃 iPhone、Android、iPad；目前是協作架構，尚未建立可安裝 App。
- 共用規格：[packages/shared](packages/shared/README.md)。
- 現有網站交接：[HANDOFF.md](HANDOFF.md)。

同步由各自的 AI／開發者操作；不讓使用者手動解 Git 衝突。遇到衝突應保留雙方工作、逐段合併，不能強制覆蓋。
