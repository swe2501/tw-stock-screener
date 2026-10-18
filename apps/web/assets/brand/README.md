# 先見量化智能 · FORESIGHT QUANT

品牌圖形依使用者提供的 6663.jpg 整理，保留完整雙翼、書本與幾何網路；全站主頁、登入／註冊、會員及美債獨立頁共用 .fqi-brand。

## 圖層與配色

- foresight-owl.png / foresight-owl.webp：原始透明 master 與網頁用整理來源，保留供後續素材製作。
- foresight-owl-light.png / foresight-owl-dark.png：720×480 完整透明圖層，石墨灰 #343a40／霧白 #eef1f4 主體，亮金 #e6bc62 幾何連線與眼睛、書緣點綴。
- foresight-owl-light-body.png / foresight-owl-dark-body.png：同尺寸、預先去掉眼部的主體圖層，讓眼睛可獨立放大而不重影。
- favicon.png：180×180 白底圓角圖示；../../logo.png：720×720 舊網址相容圖標。

## 顯示與互動

主標為襯線「先見量化智能」，副標為「盤後研究院 · FORESIGHT QUANT」，桌面保留 ISSUE DAILY。圖案無外框；主頁／會員桌面為 84×56px、手機 72×48px，書底對齊副標，頁首約 73px。

會員頁曾出現灰色矩形遮住圖案：桌面瀏覽器在 SVG 圖片即時換色濾鏡及遮罩疊加時出現異常。已把深淺配色與眼部去除預先輸出成透明 PNG；執行時 SVG 只做眼睛／幾何區域裁切，不再使用 image filter 或 mask。每個品牌實例有獨立裁切 ID，複製至登入／會員後重建，避免共用 ID。主題改變時同步更新所有圖層來源，不需重新整理。

原本 5.6 秒週期的短促金色亮光與 380ms hover 反應已原樣保留，沒有新增雙閃或改變節奏，取消慢速呼吸；hover／鍵盤聚焦時眼睛放大 16%、幾何微光、340ms 掃光。減少動態時停用，頁面背景時暫停。保留使用者已確認的造型、尺寸與配色。

## 策略聊天角色

member-strategy-ui.js 的共用 inline SVG mascot 是圓臉、大眼、抱書的品牌小貓頭鷹；入口、聊天室標頭與助手訊息共用。淺色輪廓加深為 #29313a、筆畫加粗、金色 #bd8d29，避免白底細節消失。浮動圖示桌面 46px、手機 42px。保留微笑、揮翅、靠邊拖曳、三秒問號及減少動態設定。

驗證：tests/foresight-brand.browser.cjs 覆蓋四種寬度及深淺兩色、登入／會員、獨立頁、圖片載入、主題切換、裁切 ID、文字邊界及減少動態。tests/strategy-assistant-full-page.browser.cjs 使用真實頁面與隔離網路確認拖曳、問號、笑容、聊天室和窄螢幕排列。沒有改動 Auth、資料庫、策略算法或 App。
