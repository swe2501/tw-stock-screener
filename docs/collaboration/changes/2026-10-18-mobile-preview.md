# App connectivity bootstrap

Adds separate deployable root services/mobile-preview with one Python function, health response and explicit search-not-ready response. Existing website/API contracts unchanged. No database, Auth changes, credentials, cron or notifications. App URL remains unchanged until real connectivity and data acceptance pass.

New Vercel project must use this root only, with no production environment import or outside-root files. Public access needs a separate setting decision; existing UAT protection stays on. Independent Supabase testing and native sign-in remain pending authorization/provisioning.

Validate local HTTP boundaries and both API budgets (website 12, preview 1). Rollback: remove new project; existing website unchanged.

User created isolated staging project ebwtkcsmpvgyjvosbofx. Bootstrap health probes only its public Auth settings with a publishable key, never production, never redirects, never table rows. Data API metadata requires a secret key (live 401); this is not bypassed. supabase_connected reports Auth reachability; database_connected stays false. Environment configuration is scoped to tw-stock-mobile-preview. No database/schema/Auth writes. Search/login remain unavailable until separately implemented. Tests cover production/privileged-key rejection, correct staging request and failed connection without detail leakage.
