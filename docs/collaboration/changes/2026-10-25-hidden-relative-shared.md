# 真名隱藏式與近三交易日保存

API 與 SQL 準備於 shared/justy/hidden-relative。2026-10-25 使用者另行明確批准資料庫更新後，已在 Taiwan stock2 的 SQL Editor 套用近三交易日規則並核對 RPC 與匿名限制。

隱藏式參數 zhenming_hidden：enabled、side（strong/weak）、mode（days/dates）、days（1～760）、start/end、metrics（ma/return；複選且 AND）。對照加權指數，六條 SMA 按 5/10/20/60/120/240 位階；區間全程收盤守住的最短均線為該方位階，全部不守視為線下，同階不入選。漲跌幅採首個觀察交易日前一交易日收盤到訖日收盤，相對差為百分點。兩者不設額外數字門檻，缺資料不通過，不前填停牌缺日，不計未來資料。

日期模式使用篩選訖日快照；非交易日／指數尚未更新時回明確錯誤，不悄悄套用另一交易日。均線比較需要每個觀察日皆有 240 日暖機歷史。現有 price_window 上限 1000，近 N 日最高 760。非交易日自訂區間端點的實際日期以回傳為準。

member-screen-three-trading-days.sql 保留原 RPC 交易、會員、日期與重送去重檢查，只將允許行情日期改成實際資料中近三交易日。記錄日期仍為伺服器今天，並保留行情日期，沒有回填歷史日期。已先核對線上既有函式，再依使用者批准套用；網站 push 不會自動執行此 SQL。

本機新增 scripts/serve_hidden_screen_preview.py，僅監聽127.0.0.1:49675，使用網站既有公開資料權限執行相同 screen 函式；背景任務回條僅存在程序記憶體，不寫正式 page_cache。只接受本機或 file origin，拒絕遠端網站呼叫。不新增 Vercel Function，不解除 UAT 保護。
