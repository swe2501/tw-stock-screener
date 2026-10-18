# 跟誰學 App 工作區

此目錄是同一個 GitHub 專案內的 App 原始碼位置，與既有網站分開維護。目前完成協作骨架，尚未建立 Expo runtime、可安裝 App 或上架設定。

目標平台：iPhone、Android 手機、iPad。規劃 React Native＋Expo，共用主要功能；手機採適合觸控的單欄／底部導覽，平板按視窗寬度提供並排研究工作區。深淺色、品牌與閱讀層級沿用網站設計規格。

接手先讀 [共同開發規則](../../docs/collaboration/README.md) 及本目錄 AGENTS.md。

第一個可驗收流程：品牌與主題基礎 → 首頁／個股研究原型 → 既有會員登入 → 搜尋、K 圖、自選 → 網站／App 同會員資料驗收。登入與服務設定需另外逐項核對，不能直接複製瀏覽器 localStorage 或用管理密鑰連資料庫。

後續功能與接線規格放 `docs/app/`；共用合約放 `packages/shared/`。現有網站不需要搬家，亦不以整份複製網站檔案來同步 App。
