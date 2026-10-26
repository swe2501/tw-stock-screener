# Current pattern setups

User requires setups forming at the latest candles, approaching breakout or breakdown, rather than historical pattern recognition.

The W screener now defaults to current opportunities. Historical shape-positive records are available only through the explicit historical filter. Existing 35 historical shapes have no current-opportunity review and therefore do not populate this default. This change does not claim that the 100 stocks have been reviewed for current setups.

Eligibility is additive and requires a manual opportunity review bound to the exact OHLC SHA and latest source bar: status ready, reviewed_through equal data_as_of, latest_bar_in_structure, boundary_approach_verified, no breakout_occurred, no invalidated, direction up/down/both, and an unexpired valid_until timestamp. Missing/expired review means withheld, never a negative shape label. Dates alone, a fixed price percentage, and old shape confidence cannot grant eligibility.

Review must check that the same structure remains active through the latest bar, that its boundary is approached, and that subsequent candles have not already broken away or invalidated it. W additionally retains both-end neckline contact and overall clear contour. A still-incomplete right side is a forming candidate, not a confirmed W. No profit prediction follows from eligibility.

Scope limitation: legacy box tab still displays its existing algorithmic range records, not reviewed current opportunities; triangle tabs remain unreviewed. Chart historical overlays remain available for inspection. Fresh data collection and current visual opportunity review remain outstanding.

Validation: actual-site browser regression checks default historical exclusion, explicit historical browsing, chart/period overlays, existing box, triangle empty states, responsive layout, and no model inference.
