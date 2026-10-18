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

## 完整首頁閱讀流程（後續開發）

使用者確認 App 與網站一致「先讀懂大盤」，首頁內容從頭到尾保留，呈現方式由開發者負責統整。

這一輪採混合方式：大盤入口使用原生品牌列／章節選單，內文以 WebView 載入同一份網站首頁，保留既有圖表、展開說明、權限與算法。不是已完成的全原生首頁。切換 App 分頁保留閱讀頁面；原生章節選單平滑移動到對應區塊，尊重減少動態效果設定。保留網站原導覽，避免先移除尚未有原生替代的功能。

| 閱讀順序 | 網站來源 | App 章節 |
|---|---|---|
| 今日摘要、觀察索引、今日判讀 | homeView .gs-hero | 今日判讀 |
| 指數歷史、週期與圖表 | homeView .hx-card | 市場走勢 |
| 每日台股籌碼報告、國際指標、官股等總覽 | cbSheet／cbPulse／cbOverview | 籌碼總覽 |
| 現貨法人 | hpInst | 三大法人 |
| 資券餘額 | hpMargin | 融資融券 |
| 上市／上櫃漲跌與參與度 | hpBreadth | 市場廣度 |
| 占比儀表、比較期間及明細 | hpStruct | 資金結構 |
| 背離與維持率歷史 | hpMaintSec | 融資槓桿 |
| 法人留倉、散戶、外資結算成本 | hpFut／hpForeignCost | 期貨籌碼 |
| 法人留倉矩陣、支撐壓力 | hpOpt／gsOptSR | 選擇權 |
| 日期、來源、限制 | hpNote | 資料說明 |

完整內容使用 `EXPO_PUBLIC_WEBSITE_URL`，須為 HTTPS 根網址，預設既有 UAT。實測預設 UAT 會重新導向 Vercel 登入頁，**目前是明確的存取阻擋，尚未完成完整行情閱讀驗收**。App 顯示重試、瀏覽器開啟與完整章節順序，不把授權頁當行情，也不繞過存取保護。提供可讀的已授權測試網站後，仍須驗證每個圖表與交互。沒有開啟正式資料庫寫入，也沒有修改 Vercel 保護。

網頁圖表、內容與樣式可跟隨同一網站部署更新；原生導覽不會自動追蹤網站 DOM 改名。章節映射有回歸測試，找不到章節時顯示提示而非空白。這只是逐步共用的第一步，尚未建立網站／App 共用設計 token 管線，也未接入原生會員同步。

後續按功能逐步替換：大盤原生摘要與資料合約 → 個股詳情 → 自選與筆記同步 → 探索分類 → 策略與回測 → 交易紀錄與目標。每項保留網站對照、資料來源、權限、空狀態與實機驗收。涉及 API／Auth／共用格式時另走 shared 分支，不把網站代碼搬進此 SDK 57 分支。

## 原生大盤日資料已接通本機服務

配合 shared/justy/app-market-data 新增的隔離公開 API，大盤入口預設先顯示原生「大盤摘要」：證交所加權指數盤後收盤、漲跌、上市整體成交金額與股數、近期交易日與計算說明。完整網站報告為另一分頁，需要使用者主動開啟，避免首頁進入受保護網站即卡住。

在獨立 shared worktree 執行 `python services/mobile-preview/serve_local.py --host 192.168.1.38 --port 8788`。再於 App 執行 `npm run preview:lan`，腳本使用 Wi-Fi 私有 IPv4 的 8788 作為 EXPO_PUBLIC_MARKET_API_BASE_URL，可明確覆寫。更換 API 環境變數須重新啟動 Metro；請勿結束他人的 server。沒有本機服務時呈現錯誤與重試，不拿不存在的資料代替。

原生資料 client 開發模式才接受私有 IPv4、8788 的 HTTP；正式版本只接受 HTTPS 根網址。請求不帶會員憑證、拒絕重導向及 HTML、驗證資料序列與漲跌幅。提供下拉更新、更新失敗保留上次資料並標示、資料過期提示、來源與取得時間、近 5 日／全範圍切換；字體放大時成交卡片轉單欄。

端到端以 App 同一份 loadMarket 程式實測 LAN API 成功，來源 TWSE FMTQIK、11 個交易日、資料日 2026-10-16。這是開發電腦持續開機時可用的真實官方資料接線，不代表固定雲端服務或 App 商店正式上線。固定 HTTPS 部署、其他首頁指標、實機顯示與原生登入仍待逐項驗收。舊 Metro 日誌出現 ExpoAsset／原生常數載入錯誤，已重啟目前 SDK 57 預覽；不能將 bundle 成功當作此裝置問題已解決。
