# 03｜會員・權益・任務點數

入口：先讀 `../justy-chat-guide.md`。範圍：登入註冊、會員等級與權益、任務點數、券、邀請生日、自選筆記及學習。

2026-11-12：工作入口初始化，沒有新的實作任務。保留使用者既有會員角色名稱；金額、額度、到期與領取規則須對照伺服器及資料規格，不能只改畫面。會員端 AI 不開放。後台任務／商品設定與 04 交接。

交接更新格式：日期｜問題與結果｜檔案｜驗證｜commit／部署｜待辦。

2026-11-13｜JUSTY更正不要額外視窗，已完全移除信用卡dialog，填寫與所有結果留在原方案帳務付款區，保留同卡繞光／音效｜見 ../changes/2026-11-13-payment-result-effects.md｜mock確認零dialog、原區域及同卡成功失敗通過｜本機未發布。

2026-11-13｜付款頁精簡、信用卡測試單頁 dialog；同卡繞光變綠／紅，變色完成才同步成功音或失敗音／短震，背景動畫保留｜見 ../changes/2026-11-13-payment-result-effects.md｜真實CSS同卡／時序／邊界、完整網站與付款8項通過｜本機未發布｜音效依瀏覽器／系統音量，實體震動依裝置支援；正式活動DB連線仍待處理。

2026-11-13｜付款測試模式新增成功／失敗選擇與結果動畫，可返回重試；兩種均不發送付款請求或保存卡號｜見 ../changes/2026-11-13-payment-demo.md｜mock與原付款8項通過｜本機未發布｜正式資料庫連線仍待建立。

2026-11-13｜會員權益深色 Logo 改用白金版本並提高透明度，涵蓋預設深色，裝飾不蓋文字｜見 ../changes/2026-11-13-member-dark-logo.md｜完整會員頁深淺色桌機／手機截圖通過｜本機未提交／未發布｜保留付款測試與其他聊天室本機修改。

2026-11-13｜付款頁新增可操作測試模式，測試卡填寫與完成動畫、不發付款請求、退出後恢復停用；對齊常用本機 billing｜見 ../changes/2026-11-13-payment-demo.md｜完整網站 mock 與原付款8項通過｜本機未提交／未發布｜不開正式付款、不保存卡片、不宣稱真實綁卡完成。

2026-11-13｜JUSTY 要求 5234，整合會員卡片／詳細說明／方案帳務及 04 最新已完成內容｜見 ../changes/2026-11-13-member-preview-publish.md｜62 項 Python、API12/12及 mock 瀏覽器｜功能先提交 f2b054a1，整合發布結果查 Git refs 與聊天最終回報｜付款與資料庫仍未啟用；來源草稿留存勿重複套入。

2026-11-13｜JUSTY 更正：付款關閉仍顯示方案選擇及信用卡／LINE Pay／超商介面，只隱藏價格並停用實際送單／綁卡；恢復原介面且切換方式保留方案｜見 ../changes/2026-11-13-billing-plan-methods.md｜mock 會員往返、三種方式與原付款介面 8 項通過｜本機未提交／未發布｜信用卡真實綁定與超商金流尚未串接，資料庫未改。

2026-11-13｜次數與容量補白話算法，四級卡片直接列 3/6/15/40 等已討論規劃並縮小，區分方案內容與帳號實際可用，未開放提供對應方案／工具券引導｜見 ../changes/2026-11-13-member-benefits-plain-language.md｜mock 深淺色桌手機、數字與引導驗證｜本機未提交／未發布｜額度與容量仍未啟用；勿把規劃值當剩餘可用量。

2026-11-13｜JUSTY 要求整合其他聊天室並新增 5；03 協調將 04 已完成廣告／後台修改與會員商品一起發布，已通知其他聊天室｜見 ../changes/2026-11-13-all-chats-publish.md｜60 項 Python、廣告／輪播／會員 mock 瀏覽器檢查通過｜會員功能先前已發布 930a7250；整合批發布狀態查 Git ref 與最終回報｜資料庫／付款未啟用，04 來源草稿保留但不得重複套入。

2026-11-13｜會員權益改為上架商品動態卡片，圖標／詳細說明／權益／付款開關／後台商品管理已在 shared/justy/member-commerce-settings 準備；根 AGENTS.md 加入新功能先問會員開放對象規則｜見 ../changes/2026-11-13-member-commerce-settings.md｜Python 33、Node 8、mock 深淺色桌機手機與完整網站串接通過｜未提交／未部署；SQL 未套用，付款未啟用｜需隔離資料庫驗證與正式資料庫另行授權，不把前端 gate 當完整資料 RLS。

2026-11-13｜04於shared/justy/event-vouchers準備會員方案刪除鈕（需另儲存）與新增後平滑定位／focus名稱｜見 ../changes/2026-11-13-commerce-delete-scroll.md｜Chrome mock測試通過｜未提交未部署｜整合時保留03後續改動。

2026-11-13｜04準備活動代號任務與單場核銷自動點數，member-missions新增evt任務說明、forum-member取消一般活動終身限制｜見 ../changes/2026-11-13-event-reward-tasks.md｜未發布，配套SQL未套用；不得單獨宣稱已啟用或重發舊點數。

2026-11-13｜04依JUSTY準備指定已報到會員發券，同贈券視窗，member_rewards沿現有通知來源｜見 ../changes/2026-11-13-attendee-selected-vouchers.md｜只在04來源、獨立49725demo｜新SQL未套用、不影響03前輪整合，請整合前核對新舊RPC配套。

2026-11-13｜04接續JUSTY明確SQL／UAT授權，forum-event-rewards.sql與forum-attendee-vouchers.sql已於Taiwan stock2成功套用；4支RPC service_role=true、anon/authenticated=false，trigger啟用，既有reward本人通知來源已核對。整合01掃描／玻璃與03付款demo／深色Logo，發布結果見2026-11-13-sql-uat-integration.md。未實發會員點數或券、不啟用付款。
## 2026-11-13 同時使用裝置（待雲端連線）
使用者批准 1／1／2／3 台與完整啟用。已完成商品設定、權益卡片／說明、登入裝置管理、伺服器與 Data API 租約閘道、雙開關及隔離測試，精準同步 Documents 本機，保留最新功能選取器。詳細交接 docs/collaboration/changes/2026-11-13-member-device-policy.md。Supabase 尚未安裝／連接，未執行雲端 SQL、未啟用、未推送本批 UAT；不得稱已上線。需盤點現行 Auth hook／其他客戶端與 Storage／Realtime 邊界後再啟用驗證。

## 2026-11-13 裝置 SQL 已部署、全域仍關閉
使用者明確核准後，Taiwan stock2 裝置 policy/gateway/storage 已在同一交易部署並真實驗證 PASS，ready/gate_ready=true、enabled=false；測試商品資料全部 rollback。公開 policy RPC200，匿名表存取401。未發布本批網站/API，未設定伺服器裝置旗標，未切換舊 Auth hook，未開全域限制；共用 DB 在正式站仍舊版時不可直接開啟。下一步須收到發布指令，處理網站/API部署與所有現有客戶端相容，再做多瀏覽器實測。詳見 member-device-policy 交接文件最新節。

## 2026-11-13 首席不限額與程式整合
首席領航員依固定伺服器帳號ID不限裝置（非一般vip）；DB已真實套用與確認，free=1不變，總開關仍false。12台首席與撤回測試通過。Supabase舊member_device_limit_hook真實狀態DISABLED。網站與新API已整合最新UAT功能樹，88項相關Python測試、SQL與整站深淺色桌手機回歸通過。正式站目前舊API400；新增正式站protocol握手，正式站未更新時後台不能開共用DB全域限制，避免影響現有會員。本批不推prod，待UAT部署驗證結果。

2026-11-13｜03依JUSTY指示整合04已完成首頁影片音量／靜音控制，保留裁切與輪播；音量、裁切影片播放控制、輪播三項瀏覽器測試通過。與首席不限額及會員裝置模組一起發布UAT，部署與最終commit由03核對；不推prod，不開DB全域限制。
