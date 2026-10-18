# App connectivity preview

Independent Vercel root: `services/mobile-preview`. Project: `tw-stock-mobile-preview`. Framework Other. No install/build override, outside-root files or cron. Shared repository, uat deployment branch; existing website project unchanged.

Staging project created by user: ebwtkcsmpvgyjvosbofx. Set STAGING_SUPABASE_URL to its HTTPS origin and STAGING_SUPABASE_PUBLISHABLE_KEY to its public publishable key, only in this preview Vercel project. Health checks public Auth settings with redirects forbidden; production origin and privileged keys are rejected before network access. supabase_connected means public Auth reachability; database_connected, research_ready and member_login_enabled remain false until separately implemented. No table/schema/identity changes are included. Live Data API root rejects publishable keys (401); do not add a secret key to work around this.

GET /api/prices?action=market_summary now provides official TWSE FMTQIK daily TAIEX and market activity, with source/date/units, bounded fetch and 5-minute memory cache. It requires no database or credentials. Search still returns 503 until its isolated data source is implemented; market readiness is separate from research/member readiness. Writes return 405 and unknown routes 404. Exactly one standard-library Python function.

The same function supports market_candles (six official monthly MI_5MINS_HIST requests, three in parallel, validated month/OHLC, 15-minute cache) and stock_catalog (listed stocks/ETF only, STOCK_DAY_ALL with dates and units, 10-minute cache). Partial results and stale cache are explicit; no fabricated prices, no private database access. All sources are server-constructed official HTTPS URLs. The published service can be used by the App without sharing website deployment cookies. These endpoints do not make site_search or member login ready.

Trusted-LAN development: `python services/mobile-preview/serve_local.py --host <computer-Wi-Fi-IP> --port 8788` from the repository root. The App uses this HTTP endpoint only in development mode and only on a private IPv4 LAN with port 8788. Release configurations require HTTPS. Do not expose this local server to the public internet. Remote availability requires deployment of this shared change to the existing isolated preview project; a local success does not mean the cloud endpoint was updated.

Do not copy production environment variables, service keys or Auth configuration. Do not change the App URL as though research/login were complete. Verify connectivity without a Vercel cookie. Public access is a separate explicit decision limited to this new project; keep existing UAT protected.

Next: authorize isolated Supabase testing, configure schema and test fixtures, implement search, then native OAuth with secure credential storage. Shared Supabase and two-device policy stay unchanged.
