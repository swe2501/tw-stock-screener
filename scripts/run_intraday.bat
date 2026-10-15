@echo off
REM 盤中即時推送：盤中(09:00–13:35)每 90 秒掃 mis 全市場 → 題材/產業/今日焦點盤中版寫 page_cache(*_rt)
REM 由工作排程器週一~五 08:55 觸發；腳本內自迴圈，過 14:00 自動結束。
set PYTHONIOENCODING=utf-8
cd /d C:\Users\User\Desktop\AI_stock
"C:\Users\User\AppData\Local\Python\pythoncore-3.14-64\python.exe" scripts\intraday_push.py --loop >> D:\stock_data\intraday_push.log 2>&1
