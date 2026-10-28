# Distinguish historical uncertainty from current admin review queue

User screenshot showed51daily uncertain records in ordinary AI pattern listing. These belong to the original100-stock historical dataset (51daily+38weekly), while the new400-stock admin queue contains2forming+2pending. Both used the same label and caused misleading counts.

Remove historical uncertain option from ordinary listing and guard accepted selector states. Historical source data remains preserved. Admin review now displays its queue scope and counts each decision status dynamically; prior saved decisions remain untouched. Version asset URLs to invalidate old cached controls.

Validated ordinary screener no longer offers historical uncertainty, plus admin-only toggle, four cases, shared save/reload, status filters, failed-save handling, mobile layout and return to ordinary listing. No API, database or Auth changes.
