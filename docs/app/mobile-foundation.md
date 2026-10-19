# Native App foundation

Source: apps/mobile. Expo SDK 58 / React Native 0.88, pinned via package-lock.json. Official blank TypeScript template 58.0.23 provides the baseline; App.tsx mounts the native research workspace. Template icons are placeholders, not approved store artwork.

Website releases use root vercel.json to build apps/web and existing Python APIs. Mobile releases are independent: EAS/local native builds, then App Store / Google Play. Installing dependencies, typechecking or exporting JavaScript does not submit a build or create paid services.

The first native flow is overview → research search → original public news source. Bottom navigation also shows explicit development states for watchlist and membership. Search uses the shared public API contract, HTTPS origin validation, no member credentials, timeout/cancel and empty/partial/error states. Tablet layout changes at 768px; system theme and text scaling are retained.

Before device distribution: configure owned iOS bundle identifier/Android package, EAS project, signing credentials, release icons, privacy documents and a separate testing backend. Do not put service keys in EXPO_PUBLIC variables. Native OAuth, SecureStore/token rotation, session revocation, watchlist sync and private data authorization require separate design and tests. Two-device policy remains disabled.

Live environment finding: current UAT is behind Vercel deployment protection. Unauthenticated HTTP probes are redirected to a Vercel login page; they are NOT valid API results. Native apps cannot reuse Chrome's deployment-access cookie. Configure an App-accessible staging API before claiming real-device data connectivity. Do not embed a protection-bypass secret or disable protection as a shortcut. The shared client explicitly rejects HTML responses and unavailable sources instead of treating them as empty research results.

Acceptance boundaries: TypeScript and iOS/Android bundle export check code compilation only. They do not establish iPhone/Android/iPad physical-device behavior, safe-area/keyboard/accessibility or store approval. Test portrait/landscape, split view and large text on devices before release.

## 2026-10-18 本機驗證

TypeScript tsc --noEmit 通過；Expo export --platform all 成功輸出 Android 612 modules 與 iOS 619 modules 的 Hermes bundles（各約 1.6 MB）。兩平台已存在 metadata 對應紀錄。未執行 EAS 雲端建置、未產生可安裝包、未操作商店或真實會員登入。

Final integrated verification: 82 Node web/member/trade/research tests, 18 routing/API Python tests, public-client/build-scope tests, and full-page group reader, member sign-in, theme, site-search browser regressions passed. Initial collaboration suite also passed (24 Python tests including routing/API). Final updated shared client re-exported both platforms successfully (Android 617 modules, iOS 619). UAT Vercel deployment e339d1d is Ready; production Git branch was not published. Physical-device/store/native-login acceptance remains outstanding.
