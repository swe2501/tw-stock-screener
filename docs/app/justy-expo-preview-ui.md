# SDK 57 App 介面預覽交接

2026-10-18 使用者明確重新授權本對話接續 App 開發，覆蓋較早取消個人 App 任務的指示。

- 基底：`origin/app/andrew/expo-go-preview`，初始提交 `91f72d5`。
- 自有分支：`app/justy/expo-preview-ui`。僅推此分支，這批 SDK 57 變更不可整合 UAT。
- 自有 worktree：`tw-stock-screener-app-justy-expo-preview-ui`；未修改網站或他人工作區。
- 使用者確認 Expo CLI／iPhone Expo Go 本次均使用 `qa5518556130`。不變更既有 EAS owner／project，不建立建置或憑證。

## 預覽

在 `apps/mobile` 安裝依賴後執行 `npm run preview:lan`，使用 8086 埠；若被占用，先確認占用者，不停止他人服務。
這次電腦 Wi-Fi 位址為 `192.168.1.38`，連線 `exp://192.168.1.38:8086`。IP 隨網路變動，應以 Metro 當次列印值為準。iPhone 須同 Wi-Fi 並登入同一 Expo 帳號；區域網路預覽依賴本機 Metro 持續執行。

啟動腳本明確使用隔離預覽 API `https://tw-stock-mobile-preview.vercel.app` 及 `EXPO_PUBLIC_EXPO_GO_PREVIEW=1`。網站研究台連結標明外開，仍前往原 UAT 網站。研究測試資料未就緒時如實顯示服務狀態，不造行情或搜尋結果。

## 介面與限制

總覽、研究搜尋、我的觀察及會員分頁；真實品牌圖、系統／淺色／深色切換；平板雙欄、字體放大時回單欄；原生安全區保護。搜尋支援鍵盤送出、建議關鍵字、錯誤／部分結果與取消舊請求。觀察與會員同步未完成，畫面明確說明。

Expo Go 不支援目前獨立安裝版的登入 callback；預覽會員頁不觸發登入或還原 token。原生 Auth 模組與伺服器設定未更改。

## 驗證

- Expo install --check：相容。
- Expo Doctor：21/21 通過（需 npm 可在 PATH 找到）。
- TypeScript：通過；既有 Auth 3 項測試通過。
- iOS／Android Hermes JS 匯出成功，包含安全區元件。
- LAN iOS／Android manifest HTTP 200，SDK 57；CLI whoami 確認 qa5518556130。
- 尚須在實機確認：iPhone／iPad／Android 排版、深淺切換、字體放大、旋轉與分割視窗；上述打包不等於裝置驗收完成。

依賴安裝修復基底 lockfile 的 ws 巢狀版本；未升降 Expo SDK。未變更共用 API／Auth 設定、正式資料庫、付費服務或 UAT。
