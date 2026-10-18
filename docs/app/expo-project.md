# Expo project binding

Verified dashboard: https://expo.dev/accounts/market-academy-tw/projects/academy-mobile
Owner: market-academy-tw. Project ID: ad786c12-a9c9-4415-aa2a-bb4038878e3f.

app.json explicitly binds the existing App to this project; do not create another starter App. EAS preview uses only the isolated mobile-preview API and staging public publishable key. This public key is intended to ship to clients; never replace it with a secret/service-role key or Google Client Secret. Website links remain distinct from API origin.

No build/upload, signing credential, GitHub connection, paid plan or store release is performed by these configuration edits. Before an Android APK build: verify Free plan quota, authenticate EAS CLI, choose an Android package identifier, resolve/assess recorded dependency vulnerabilities, then explicitly approve signing credential generation if needed. iPhone EAS internal distribution requires an Apple paid developer membership; no purchase is authorized. Without that, postpone the iPhone installable build or use local Xcode testing on a Mac.
