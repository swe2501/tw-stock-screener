# API 部署預算與抽離交接

2026-10-16 使用者要求：新增前盤點，最多 **12 支部署 API**，超過必須先合併。本次將公開站內搜尋併入 prices，從 13 降為 12。

## 盤點

以 `vercel.json` 的 `builds` 匹配的 Function 入口計算，目前為 `api/*.py`。靜態資產、網址別名、Supabase RPC 不各算一支；12 是本專案要求，不是所有 Vercel 方案的通用限制。

現有 12 個入口：`alert`、`auth`、`broker_watch`、`chart`、`dividend`、`pc_ratio`、`prices`、`realtime`、`realtime_batch`、`screen`、`vol_notify`、`watchlist`。

新增 API 前、修改部署設定後、提交與部署前執行：

```powershell
python scripts/check_api_budget.py
python -m unittest discover -s tests -p test_api_budget.py
python -m unittest discover -s tests -p test_site_search.py
node tests/site-search.browser.cjs
```

瀏覽器測試需要 Playwright 與 Edge，可透過 `PLAYWRIGHT_MODULE` 指定套件路徑。數量檢查超過 12 會非零退出；未知 runtime／部署模式也會失敗，必須先更新盤點邏輯。這是專案必跑檢查，尚未接成平台自動部署閘門。

## 已合併位置

- 新前端：`/api/prices?action=site_search&q=關鍵字`。
- 舊 `/api/site_search` 與 `/api/site_search.py` 保留優先 route，轉到 `/api/prices.py?action=site_search`。原 `api/site_search.py` 已刪除，避免被 glob 重複部署。
- `api/prices.py` 內 `BEGIN MERGED_PUBLIC_SITE_SEARCH` 到 `END MERGED_PUBLIC_SITE_SEARCH` 是抽離範圍；`_SiteSearchMixin` 提供搜尋方法，主 GET 依 action 或舊路徑分流。
- 原 `/api/prices?codes=2330,0050` 的格式與快取維持；搜尋獨立驗證參數及回應快取，只以匿名 key 查公開新聞／題材，不讀私人會員資料，不用 service-role。
- 選同為公開 GET 的 prices 共用部署，避免和會員授權混合。legacy route 的 destination 可附 query，參見 [Vercel routes 設定](https://vercel.com/docs/project-configuration/vercel-json)。新前端直接帶 action，不依賴別名。

## 未來升級後抽離

1. 先取得使用者同意調整上限，或合併其他入口騰出名額；方案升級不自動解除目前 12 支要求。
2. 將標記區塊移回 `api/site_search.py`，讓搜尋 JSON／GET 方法接回獨立 `handler`。
3. prices 移除搜尋區塊、mixin 繼承及 GET 分流，保留行情邏輯。
4. 刪除搜尋轉到 prices 的優先 route，讓通用 route 指向新檔；若保留 `.py` 舊 URL，明確配對同一入口，避免重複副檔名。
5. 更新前端 URL、瀏覽器 fixture、後端模組 import 與路由測試。保留行情不受影響、匿名權限、安全網址與來源部分失敗測試。
6. 更新盤點與測試斷言；除非使用者明確改上限，`API_LIMIT` 維持 12。跑上面檢查，在 UAT Preview 驗證搜尋與行情。

本機檢查證明來源部署設定為 12 個入口；Git push 成功不代表實際 Vercel build／網站版本已更新，仍需有專案權限者確認。原 auth、排程、正式站部署不在本次變更範圍。
