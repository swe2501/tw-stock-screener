# 2026-10-31 AI 研究室：恢復「排程看板」切換按鈕（Andrew）

- **範圍**：網站（`apps/web/assets/admin-office.js`、`apps/web/index.html` 版本號 v7→v8）。不動 API、資料庫、Auth、排程。
- **原因**：10/30 改版成「先見金融大廈」後，原本的排程看板被包進 `#aoLegacyPanel hidden`，切換鈕 `#aoJobsTab` 也帶 `hidden`，後台「AI 研究室」分頁沒有入口回到看板。Andrew 要求兩者並存。
- **改法**：只拿掉 `#aoJobsTab` 的 `hidden`。預設仍是「金融大廈」，切換列為「金融大廈｜排程看板｜任務中心」；`setView` 等既有邏輯未改。
- **給 JUSTY**：若之後要把看板整合進大樓，可再收回此按鈕，但請保留一個能看到排程看板的入口（Andrew 每天用它看排程燈號）。
