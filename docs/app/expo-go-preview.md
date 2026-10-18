# Temporary Expo Go interface preview

Branch app/andrew/expo-go-preview is an isolated SDK 57 compatibility preview for the current iPhone App Store Expo Go. The SDK 58 native branch, APK and UAT baseline remain unchanged. Do not merge this dependency downgrade into UAT or replace the production/native project with it.

Official SDK 58 release notes currently say store Expo Go support is coming later: https://expo.dev/changelog/sdk-58. SDK 57 dependency versions follow expo-template-blank-typescript@57. Preview is for layout/navigation only; Google callback requires a dedicated native build. No Google secret or session is configured in this preview.

Start from apps/mobile with EXPO_PUBLIC_API_BASE_URL=https://tw-stock-mobile-preview.vercel.app and npx expo start --go --lan. Keep development server on trusted LAN; do not expose Metro publicly. iPhone and PC must share reachable Wi-Fi/LAN, and Expo Go must be signed in as andrewstock to match CLI. A QR code link is valid only while this PC and server are running. Research remains not-ready until isolated test data is implemented.
