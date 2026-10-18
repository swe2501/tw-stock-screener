# App connectivity preview

Independent Vercel root: `services/mobile-preview`. Project: `tw-stock-mobile-preview`. Framework Other. No install/build override, outside-root files or cron. Shared repository, uat deployment branch; existing website project unchanged.

Staging project created by user: ebwtkcsmpvgyjvosbofx. Set STAGING_SUPABASE_URL to its HTTPS origin and STAGING_SUPABASE_PUBLISHABLE_KEY to its public publishable key, only in this preview Vercel project. Health checks public Auth settings with redirects forbidden; production origin and privileged keys are rejected before network access. supabase_connected means public Auth reachability; database_connected, research_ready and member_login_enabled remain false until separately implemented. No table/schema/identity changes are included. Live Data API root rejects publishable keys (401); do not add a secret key to work around this.

GET /api/prices?action=market_summary now provides official TWSE FMTQIK daily TAIEX and market activity, with source/date/units, bounded fetch and 5-minute memory cache. It requires no database or credentials. Search still returns 503 until its isolated data source is implemented; market readiness is separate from research/member readiness. Writes return 405 and unknown routes 404. Exactly one standard-library Python function.

The same function supports market_candles (six official monthly MI_5MINS_HIST requests, three in parallel, validated month/OHLC, 15-minute cache) and stock_catalog (listed stocks/ETF only, STOCK_DAY_ALL with dates and units, 10-minute cache). Partial results and stale cache are explicit; no fabricated prices, no private database access. All sources are server-constructed official HTTPS URLs. The published service can be used by the App without sharing website deployment cookies. These endpoints do not make site_search or member login ready.

market_context adds same-date listed institutions, margin balances and listed-stock sample breadth. Official BFI82U foreign amounts exclude foreign dealer double counting; dealer and trust totals must reconcile exactly. MI_MARGN finance amounts convert thousands of TWD to TWD; short units retain the official trading-unit label. Each part independently reports availability and source; dates must match FMTQIK, no unavailable value is replaced with zero. Breadth excludes ETF, OTC and invalid quotes and is clearly a stock sample, not the exchange's whole-market breadth report. Cache is five minutes.

### JUSTY-owned public data deployment

On 2026-10-18, the user authenticated as qa5518556130-dot. That account could not access the existing tw-stock-mobile-preview project; its unrelated genzuixue site was left untouched. A separate Hobby project academy-mobile-data-justy was created for public data only, with stable URL https://academy-mobile-data-justy.vercel.app (project prj_JRWOnfsRlDWlBCthtbXBCvYM2Onc). No database, member Auth, paid plan or existing project settings were changed. The first deployment was automatically assigned this new test project's production alias by Vercel; it is not the website production project or Git prod branch.

The .vercelignore allows only service sources/config by excluding environment files, local runner and cache. CLI-generated local OIDC env was removed without reading/printing its contents. Local .vercel project binding is ignored. This project is not assumed to have a Git integration: updating UAT alone did not update the older test endpoint, so always verify the public HTTPS response after an explicit deploy. Do not use existing website production credentials or silently switch another developer's account.

Trusted-LAN development: `python services/mobile-preview/serve_local.py --host <computer-Wi-Fi-IP> --port 8788` from the repository root. The App uses this HTTP endpoint only in development mode and only on a private IPv4 LAN with port 8788. Release configurations require HTTPS. Do not expose this local server to the public internet. Remote availability requires deployment of this shared change to the existing isolated preview project; a local success does not mean the cloud endpoint was updated.

Do not copy production environment variables, service keys or Auth configuration. Do not change the App URL as though research/login were complete. Verify connectivity without a Vercel cookie. Public access is a separate explicit decision limited to this new project; keep existing UAT protected.

Next: authorize isolated Supabase testing, configure schema and test fixtures, implement search, then native OAuth with secure credential storage. Shared Supabase and two-device policy stay unchanged.


### 個股 K 線（2026-10-18）
`GET /api/prices?action=stock_candles&code=2330` 回傳最近六個月上市股票／ETF 未還原日 OHLC 與成交股數。代號須在官方名錄內；逐月檢查官方標題代號、日期、OHLC 與整數成交股數。錯誤代號 400／404，不接受自訂上游 URL。缺少月份或無有效成交資料標記 partial，不製造 K 棒；官方失效最多保留 24 小時快照並標示 stale。最多快取 32 商品。未計除權息、分割、減資，不可宣稱含息還原績效。

### App 公開研究搜尋（2026-10-18）

`GET /api/prices?action=site_search&q=台積電` 讀取網站現有的公開 `news_feed`、`hot_topics`，回傳最多八筆標題、日期、摘要與 HTTPS 原始來源。關鍵字限 2～80 字；來源部分失敗明示 partial，全部失敗回 503。設定 `PUBLIC_RESEARCH_PUBLISHABLE_KEY` 為網站已公開的 publishable key；只發出固定欄位的 GET，不使用會員 token 或服務密鑰，不新增資料表或寫入資料。更新沿用既有新聞／題材管線。此節取代上文搜尋尚未實作的狀態；獨立測試會員與公開研究資料來源分開。health 的 research_configured 只表示設定存在，實際可用性以搜尋回應為準。
