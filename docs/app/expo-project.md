# Expo project binding

Verified dashboard: https://expo.dev/accounts/market-academy-tw/projects/academy-mobile
Owner: market-academy-tw. Project ID: ad786c12-a9c9-4415-aa2a-bb4038878e3f.

app.json explicitly binds the existing App to this project; do not create another starter App. EAS preview uses only the isolated mobile-preview API and staging public publishable key. This public key is intended to ship to clients; never replace it with a secret/service-role key or Google Client Secret. Website links remain distinct from API origin.

No build/upload, signing credential, GitHub connection, paid plan or store release is performed by these configuration edits. Before an Android APK build: verify Free plan quota, authenticate EAS CLI, choose an Android package identifier, resolve/assess recorded dependency vulnerabilities, then explicitly approve signing credential generation if needed. iPhone EAS internal distribution requires an Apple paid developer membership; no purchase is authorized. Without that, postpone the iPhone installable build or use local Xcode testing on a Mac.

CLI authentication verified for andrewstock and organization Owner access. Preview APP_VARIANT=staging uses display name 跟誰學 測試版 and internal Android identifier com.marketacademytw.academymobile.staging, so later production can coexist. This does not register a store app. Production package/signing remains unconfigured.

## First internal Android build — 2026-10-18

User explicitly authorized a staging Android keystore stored by Expo under this organization/project. Keystore created remotely; no private signing material was read, downloaded or committed. Verified Free $0/month with unused build quota before submission. Local EAS archive contained 26 files, all in apps/mobile or packages/shared, with no backend/data/env/credential files.

Build 9c0a17c7-c062-4dea-95d5-5b7338a289c6 succeeded: Android APK, version 0.1.0 (1), profile preview, commit 877de9bcf68176f04d2601fc4fd01fea2133c141, about 7m26s. Install page: https://expo.dev/accounts/market-academy-tw/projects/academy-mobile/builds/9c0a17c7-c062-4dea-95d5-5b7338a289c6. Availability is limited by Expo artifact retention (dashboard shows about 13 days at verification), not permanent hosting. No store upload, paid-plan upgrade or iPhone build.

Pending physical-device acceptance: install on Android, cancel Google login, complete Google login and return to App, background/restore, close/reopen session restore, local logout and login again. Auth redirect allowlist verified exact academy-mobile://auth/callback. Test-only account/environment; search intentionally returns unavailable until research schema/data is implemented. Watchlist remains pending. Do not treat cloud build success as runtime/auth acceptance.
