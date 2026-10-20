# 排行榜前端改版：欄位缺口檢查

2026-10-20，依使用者「若現有 API 無 5 日漲跌或題材資料，先停止，不改 API」。

首頁今日排行榜呼叫 /api/screen?stat=focus&n=30。api/screen.py 的 _read_focus_snapshot 讀 page_cache 的 focus；scripts/focus_precompute.py 從 _fetch_focus 產出同一資料。此處只讀原始碼，未變更抓取或後端。

| 榜單 | 現有每列欄位 |
|---|---|
| gainers / losers | code, name, close, chg |
| volume_surge | code, name, close, chg, vol, ratio |

缺少：

- chg_5d 或等價的五個交易日漲跌幅；前端不能拿當日 chg 當作 5 日。
- themes/tags 清單，以及對應穩定 ID 或可導向族群頁的識別碼；不能從股名猜題材。
- vol 的單位契約須確認。數值源自 price_window 的 volume，不能未核對就標成「張」。

後續使用者明確批准「補齊欄位，完成完整版」。已在 shared/justy/benefit-vouchers 補上 chg_5d、完整 themes、volume_lots 與單位契約；網站兩行列、題材 +N 展開與族群明細、五欄排序表格、紅／綠／香檳金標題與前三名獎牌已完成。原排行計算、來源及網址保留。詳見 docs/focus-ranking-contract.md。

網站是靜態 HTML/JS/CSS，目前根目錄及 apps/web 沒有 npm build 腳本，不能回報 npm build 通過。現有驗證採 JS / inline script 語法檢查及隔離 Playwright 瀏覽器測試；不以 App build 代替網站驗證。
