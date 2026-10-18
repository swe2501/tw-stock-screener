# App connectivity bootstrap

Adds separate deployable root services/mobile-preview with one Python function, health response and explicit search-not-ready response. Existing website/API contracts unchanged. No database, Auth changes, credentials, cron or notifications. App URL remains unchanged until real connectivity and data acceptance pass.

New Vercel project must use this root only, with no production environment import or outside-root files. Public access needs a separate setting decision; existing UAT protection stays on. Independent Supabase testing and native sign-in remain pending authorization/provisioning.

Validate local HTTP boundaries and both API budgets (website 12, preview 1). Rollback: remove new project; existing website unchanged.
