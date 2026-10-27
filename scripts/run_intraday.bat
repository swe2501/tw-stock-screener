@echo off
REM Intraday push: during market hours (09:00-13:35) scan TWSE mis every 90s -> write page_cache *_rt (themes/sectors/focus intraday).
REM Triggered by Task Scheduler Mon-Fri 08:55; the script loops itself and exits after 14:00. Keep this file ASCII-only.
set PYTHONIOENCODING=utf-8
cd /d C:\Users\User\Desktop\AI_stock
"C:\Users\User\AppData\Local\Python\pythoncore-3.14-64\python.exe" scripts\office_step.py tech scripts\intraday_push.py --loop >> D:\stock_data\intraday_push.log 2>&1
