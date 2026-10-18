# App connectivity preview

Independent Vercel root: `services/mobile-preview`. Project: `tw-stock-mobile-preview`. Framework Other. No install/build override, outside-root files or cron. Shared repository, uat deployment branch; existing website project unchanged.

Staging project created by user: ebwtkcsmpvgyjvosbofx. Set STAGING_SUPABASE_URL to its HTTPS origin and STAGING_SUPABASE_PUBLISHABLE_KEY to its public publishable key, only in this preview Vercel project. Health checks public Auth settings with redirects forbidden; production origin and privileged keys are rejected before network access. supabase_connected means public Auth reachability; database_connected, research_ready and member_login_enabled remain false until separately implemented. No table/schema/identity changes are included. Live Data API root rejects publishable keys (401); do not add a secret key to work around this.

Only /health is ready. Search returns 503 until an isolated data source is implemented; no invented research results. Writes return 405 and unknown routes 404. Exactly one standard-library Python function.

Do not copy production environment variables, service keys or Auth configuration. Do not change the App URL as though research/login were complete. Verify connectivity without a Vercel cookie. Public access is a separate explicit decision limited to this new project; keep existing UAT protected.

Next: authorize isolated Supabase testing, configure schema and test fixtures, implement search, then native OAuth with secure credential storage. Shared Supabase and two-device policy stay unchanged.
