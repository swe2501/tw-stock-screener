# AI 型態判斷「箱型」改為規則版（2026-11-01，Andrew）

- 規則來源：用戶朋友《股票型態.md》箱型章節（只取箱型，其他型態未採用）。
- 計算：`scripts/compute_box_rules.py` 夜間接在 `compute_box.py` 後，結果寫 `page_cache` kind=`ai_box_rules`（單列覆寫、約 6KB）。
- 前端：AI 型態判斷「箱型」分頁改讀這份（`window._boxRuleShow`），點卡片開日 K 並在 AI 判定圖層畫箱頂／箱底／上方 25% 線。
- 不動：原 ATR 版 `box_patterns`（篩選器、首頁、焦點仍用它）、W／三角分頁資料。
- 無資料表、RLS、API 變更。
