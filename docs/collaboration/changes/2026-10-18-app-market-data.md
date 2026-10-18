# App 公開大盤日資料

使用者授權繼續操作流程並讓 App 讀到資料。獨立 shared/justy/app-market-data 分支；App UI 仍在 app/justy/expo-preview-ui，SDK 57 不合併 UAT。

services/mobile-preview 原有單一 prices Function 增加 GET action=market_summary，直接向 TWSE 官方 FMTQIK HTTPS 固定網址讀取。不讀寫 Supabase，不需要金鑰，不變更網站 API、登入、Vercel 保護或資料庫。原 health、site_search 的 unavailable 狀態與拒絕寫入維持相容。網站 12 支與隔離預覽 1 支入口不增加。

回應 schema_version=1：available、latest、history、as_of、retrieved_at、source、stale、cached、notice。金額 TWD，股數 shares；change_percent=(close-(previous close))/(previous close)*100，其中 previous close=官方 close-change。資料是上市整體成交金額與加權指數盤後日值，不是即時、夜盤、電子成交占比或預測。歷史範圍取官方實際提供日期，不補不存在交易日。

拒絕未驗證數值、未來日期與同日衝突資料；抓取大小上限 1 MiB、10 秒逾時、拒絕重導向。成功資料快取 5 分鐘；更新失敗最多保留 24 小時並顯示 stale，無快取時 503。不將會員 cookie/token 轉送至上游。瀏覽器首頁仍受保護，不把此新 endpoint 宣稱完整首頁已接通。

本機 serve_local.py 以明確 LAN host:8788 啟動供同 Wi-Fi App 使用；本機模式只在開發時使用，不是永久上線。遠端版本仍需將此 shared 變更經相容性審閱部署到既有隔離 preview 專案；不自動合併 UAT、不推 prod/Andrew。回復方式：App 關閉本機覆寫、回復此新增 action；舊版 App 不受影響。
