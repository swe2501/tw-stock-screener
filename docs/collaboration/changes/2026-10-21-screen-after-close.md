# 選股日曆：盤後今日行情被擋（2026-10-21）

**現象**：收盤後（例 19:07）用最新行情篩選，按「記錄今日選股」出現「此份行情日期為 2026-10-21；最新可用行情為 2026-10-20」，無法保存。

**原因**：`member_screen_calendar`／`save_member_screen_record_v2` 只把 `price_window` 的最大日期當成「最新行情」。篩選器收盤後已讀到證交所今日資料，但 `price_window` 由每日排程較晚上傳，上傳前伺服器只認昨天。上午的修正處理的是相反情況（週末／延遲，行情比今天舊），沒有涵蓋這段時間差。

**修正**：
- SQL（待 JUSTY 批准後於 Supabase SQL Editor 執行一次）：`docs/database/member-screen-today-close.sql`。可保存的行情日期＝`price_window` 最新日期，或台灣時間週一～五 13:30 收盤後的今天；不接受未來或更舊日期。只改兩個 RPC、新增純計算函式，不改資料表與 RLS。讀取 RPC 新增 `accept_market_dates`。
- 網站：`screen-log.js` 改用 `accept_market_dates` 判斷；伺服器尚未更新時沿用 `latest_market_date`，行為與原本相同。
- 測試：`tests/member-screen-today-close.test.cjs`（PGlite）。注意：`tests/member-screen-latest-market.test.cjs` 只套舊 migration，維持原樣；三份一起套用的情境由新測試涵蓋。

**部署紀錄**：2026-10-21 19:29 JUSTY 批准並自行在 SQL Editor 執行，回傳 `Success. No rows returned`（截圖）。尚待一次真實收盤後保存驗收。
