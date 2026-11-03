# 2026-11-03 會員中心自然整頁捲動：本機第二版

僅本機預覽，未提交或推送 UAT。修正位於獨立 shared/andrew/db-normalization worktree，未修改主工作區其他人的 WIP。

右側保留自然高度，移除舊 paddingTop 補償，改相對定位；渲染完成與內容尺寸變更後校準起始位置，讀者開始操作／捲動即停止自動對齊。左側沒有獨立捲軸或螢幕高度限制。保留足夠外層高度避免短內容造成位置收縮。會員中心開啟時僅鎖背景 html 捲動，會員整頁仍以原滾輪方式瀏覽，關閉時CSS條件自動解除。

測試：member-natural-scroll.browser.cjs 明暗桌面／手機自然捲動與短內容替換；member-natural-scroll-full.browser.cjs 完整網站，實際 weekly/profile/notifications/weekly 反覆切換，校驗外層位置／導覽座標不變、首張卡片對齊、無padding留白、html背景無捲軸、工具列無內捲軸。截圖位於本機 visualization/member-natural-scroll-fixed/member-natural-full.png。

將本對話確認過的預覽伺服器改為由此獨立工作區提供，仍使用 http://127.0.0.1:49997/，方便同一 origin 保留原本本機登入狀態。主目錄上一份原型檔未覆寫；後續若批准整合再安全處理，不直接蓋他人檔案。

第三版：實際 Chrome 發現向上捲過內容起點時，舊相對偏移會造成空白。新增整頁 scroll 校正：只縮減多餘偏移，不增加內捲軸；更新本機 member-center JS/CSS query version 為 20261103-natural-start-v3。完整頁回歸加上往上捲400px不露空白。使用者 Chrome 實測研究筆記→本週回顧，再 PageUp 後 contentTop=85／brandBottom=73／scroll=929，正確貼品牌列下12px。截圖 chrome-verified-v3.png；未發布。

2026-11-03 使用者明確要求推 UAT：以上本機限制改為允許發布本次第三版，正式站仍不在授權範圍。依協作流程合併最新 UAT、保留他人內容並驗證部署。
