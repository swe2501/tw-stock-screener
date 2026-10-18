# Website directory migration

Website sources move to apps/web; root api, lib, requirements, canonical group-catalog.json and scheduled jobs remain in place. Root Vercel config maps the old public paths to the new physical files. Existing API URLs, search alias, query parameters, auth boundary and 12-function budget are preserved. No database/Auth/cron changes.

Vercel Root Directory remains repository root, not apps/web: a single website deployment includes both frontend static files and the existing backend. App releases build apps/mobile separately, outside Vercel. Do not deploy apps/mobile as a second Vercel website.

Tests and browser research generators use the new source paths. Validate test_web_layout, check_api_budget, existing Node tests and full-page browser regressions before UAT. Verify deployed UAT assets/API responses separately; contract tests cannot prove Vercel runtime deployment.

Rollback by reverting this migration commit as a whole (files plus vercel.json). Never revert only routing or only files. Existing deployed websites remain unchanged until a successful deployment.

packages/shared/news-api.js defines a public read-only search contract for mobile. It validates HTTPS origins, encodes queries and permits only safe HTTPS article URLs, without member tokens. Existing website/API code does not depend on this new module. No backend response fields were changed.

Vercel ignoreCommand skips App/docs-only changes compared with VERCEL_GIT_PREVIOUS_SHA (previous deployed commit), never merely HEAD parent. Missing history, git failure or VERCEL_FORCE_WEB_BUILD=1 builds conservatively. Shared/backend/unknown file changes build. This prevents App-only releases from needlessly rebuilding the website, without skipping web changes whose prior deployment failed.
