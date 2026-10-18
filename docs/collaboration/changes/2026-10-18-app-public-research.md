# App public research search

Connects services/mobile-preview's existing GET /api/prices?action=site_search&q=... to the website's public news_feed/hot_topics archive. Only fixed tables/columns, HTTPS GET, public publishable key in apikey header, no member Authorization forwarding or service-role key. No redirect following, bounded responses, escaped PostgREST queries, 2–80 character validation, 8 results, date/source attribution and safe HTTPS source links. Partial failure is explicit; total failure returns 503 rather than empty success.

PUBLIC_RESEARCH_PUBLISHABLE_KEY is configured only on tw-stock-mobile-preview. The public archive origin is fixed to the existing website Supabase; STAGING_SUPABASE_* remains separately scoped to test Auth. This intentionally shares already-public research reads while keeping test identities separate. No table, RLS, data, schema, production deployment, schedule or Auth changes. Uses existing website pipeline updates; no duplicate ingestion job or history overwrite.

Existing web/API contracts unchanged, website functions 12/12, preview 1/12. Android/iOS shared news client accepts this existing response shape. research_configured in health means configuration exists; only successful search proves source availability. database_connected remains false because staging research tables are not created. Validate local query/error/security tests and live preview query through actual App client. Rollback: remove preview public key or revert this reader; website is unaffected.

## 本輪驗證與發布狀態
- 13 項單元測試通過；真實公開來源搜尋台積電、AI、光通訊均回八筆、available=true、partial=false，本機讀取約 0.28～0.83 秒（非手機端效能保證）。
- 程式 39349cb 已正常整合並推送 UAT；後續合夥人 UAT 更新仍保留此 commit。僅 App 專用 Vercel 專案增加公開讀取設定。
- 2026-10-18 Vercel 手動發布最新 UAT 被 api-deployments-free-per-day（more than 100，24 小時後再試）拒絕；未啟用付費方案，未繞過額度。線上搜尋仍是舊版 503，不能宣稱 iPhone 已接通。額度恢復後部署最新 UAT，再以 App 共用 searchNews 客戶端驗證三組查詢，才算線上完成。
