# 2026-11-04 K棒組合 16 類（篩選器＋K 圖黃框）

- 負責：Andrew（網站車道）
- 規則來源：用戶提供的《K棒組合.md》16 類原文。用戶補充：長紅／長黑一律實體 3%；內困三日翻紅＝多頭母子＋第 3 根紅K收盤 > 第 1 根開盤（翻黑對稱）；紅三兵＝連 3 根長紅、收盤逐日墊高、不設量比（黑三兵對稱）。
- 計算：`scripts/candle_combos.py`（本機夜間排程，`mingdeng.py` 之後），寫 Supabase `candle_combo_hits`（新表，`sql/candle_combo_hits.sql`，公開唯讀、service_role 寫）。
- API：`/api/screen` 新增可選參數 `candle_combos`（代碼陣列）。沒帶時行為完全不變；帶了就只留最近 3 個交易日完成、通過最低量的股票，結果多一個 `candle_combos` 欄位、回應多 `candle_combo_window`。
- 前端：篩選器新增「K棒組合」分類（舊「K棒」6 項不動）；K 圖「K棒訊息」旁新增「K棒組合」開關（localStorage `kv_show_combo`，預設開），只畫日K；規則說明視窗在 `apps/web/assets/candle-combos.js`。
- 相容性：不改既有表與既有參數；App 車道未使用這些欄位，不受影響。
