# Website

Website HTML, browser JavaScript/CSS, images and generated browser research bundles live here. Public URLs remain `/`, `/assets/...`, `/group-catalog.js`, `/logo.png` and `/api/...`.

Vercel Root Directory MUST remain the repository root (empty/default). Root vercel.json builds apps/web static files and the existing 12 root api Python functions together. Setting Root Directory to apps/web would exclude api, lib and requirements.txt. No API keys, private data, or mobile sources are added to static builds.

The canonical group-catalog.json remains at repository root because both backend research jobs and the website use it. Browser generators write to apps/web. No scheduler configuration is changed.

Website and mobile releases are independent. Native iOS/Android builds do not use Vercel; apps/mobile owns their configuration. Shared backend changes must remain compatible with older installed apps.
