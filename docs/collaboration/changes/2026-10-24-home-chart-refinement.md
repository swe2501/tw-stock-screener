# Homepage and chart interaction refinements

The five homepage pulse cards share aligned quote, divider and same-day intraday regions. Taiwan VIX uses the official dated TAIFEX five-minute data added on the shared lane; FX uses timestamped TWD=X intraday observations. Other quote miniatures retain their dated/session filters and never replace unavailable futures data with proxy or daily curves. Intraday red/green is relative to the prior reference quote; FX appreciation/depreciation text is interpreted from the Taiwan-dollar perspective.

KPI history dialogs gain SMA 5/10/20/60/120/240 toggles. VIX new-high points use refined flag overlays with hover, focus and tap details, following zoom and candle-mode changes. The homepage annual-high warning remains dependent on sufficient history. FX impact explanations move from the homepage to a centered nested dialog. Homepage broker periods include a complete ten-observation sum, evenly sized bottom controls, and the settlement calendar supports keyboard and pointer interaction with reduced-motion behavior.

K chart changes include compact hover/pinned tools with saved preferences, raw/adjusted period toggles, precise manual wave/Fibonacci drawing, persistent erasing, collated support/resistance labels, and consecutive interval statistics with wheel zoom. Interval results are positioned beside the ending boundary while avoiding visible candles. Notification pages retain five entries and return scroll position to the notification section; normal member sync status is hidden while actionable states remain visible. Footer/search/margin commentary and market spacing follow the site's light/dark styles.

Validation: chart research tools/math/period switching, KPI MA/flags/nested dialogs, intraday source/date/color/geometry, notification pagination, member cloud conflicts, footer, site search, and compact market browser checks; API budget remains 12/12. Native VIX parser/query and existing TX session regressions also pass. No Auth, database, scheduler, App or production-branch changes.

Publication follows JUSTY's 2 → 3 → 4 sequence with non-force merge/push and post-push remote verification.
