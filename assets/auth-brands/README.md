# Provider artwork provenance

Retrieved 2026-10-17 for sign-in buttons and identity linking rows. These are provider trademarks, not original Market Academy artwork. Round containers/pill buttons do not distort the artwork. Do not recolor, animate, or decorate the third-party marks.

- Google: unmodified Light / No text / Pill / Android + Web SVG from https://developers.google.com/static/identity/images/signin-assets.zip . Guidelines: https://developers.google.com/identity/branding-guidelines . The supplied circle and standard-color G remain intact.
- LINE: unmodified `images/DeskTop/2x/44dp/line_88.png` from https://vos.line-scdn.net/line-developers/docs/media/line-login/login-button/LINE_Login_Button_Image.zip . Guidelines: https://developers.line.biz/en/docs/line-login/login-button/ . Use white artwork on #06C755; keep the mark stationary.
- Apple: logo-only vector path from Apple's official button renderer https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js . Original logo-only viewBox `6 6 44 44`, black/white fill as the renderer supports. This stores only the logo, not the remote JavaScript runtime. Guidelines: https://developer.apple.com/design/human-interface-guidelines/sign-in-with-apple/ . Apple official resources: https://developer.apple.com/design/resources/ .
- Facebook: unmodified official favicon https://www.facebook.com/favicon.ico (ICO container). Only shown as the Facebook provider identifier. Facebook is disabled unless server public settings enable it.
- Email and phone are original code-native outline utility icons, not third-party brands.

Provider configuration and manual identity linking are controlled by Supabase Auth; artwork does not imply a provider is enabled. No provider secrets or user tokens are stored in this directory.
