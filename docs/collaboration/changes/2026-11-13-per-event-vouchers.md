# 論壇場次獨立贈券設定

- 基底24cdc1ec，shared/justy/event-vouchers，獨立工作區；原已發布來源草稿未碰。未提交／未發布／未寫雲端資料。
- 場次列表各自提供本場贈券彈窗，開關、券種、1–90天獨立；移除全域修改入口。管理API強制指定存在的event_id，沿用管理員驗證與稽核。
- 使用admin_settings forum:voucher:<event_id>保存，不需schema migration。新建場次預設關閉。舊場次尚無單場值時讀既有forum:voucher以保留已設定行為；儲存單場設定不改全域、不影響別場。新版後台搭配新版API；舊版無event_id寫入會明確拒絕。
- QR與補發代碼共用_grant並按ev.id取設定；到場1000點與贈券仍每人一生一次，不回收已發券、不重設資格；測試場次不發點券。
- 驗證28項forum_ads單元測試，含兩場開關互不影響、QR／code共用單場設定、既有券保留、未指定／不存在場次與未授權拒絕。JS語法、API12/12與diff檢查通過；未線上實測。
