@echo off
REM Intraday push: 09:00-13:35 scan TWSE mis every ~35s -> write page_cache *_rt; after close record USD/TWD every 5 min until 16:00.
REM Triggered by Task Scheduler Mon-Fri 08:55; the script loops itself and exits after 16:00. Keep this file ASCII-only.
REM Watchdog (2026-10-28): if the main loop stalls for 5 min, intraday_push exits with code 75 and this file restarts it (max 10 times).
set PYTHONIOENCODING=utf-8
cd /d C:\Users\User\Desktop\AI_stock
set RESTARTS=0
:run
"C:\Users\User\AppData\Local\Python\pythoncore-3.14-64\python.exe" scripts\office_step.py tech scripts\intraday_push.py --loop >> D:\stock_data\intraday_push.log 2>&1
if errorlevel 76 goto end
if not errorlevel 75 goto end
set /a RESTARTS+=1
echo [watchdog] %time% intraday_push stalled, restart %RESTARTS% >> D:\stock_data\intraday_push.log
if %RESTARTS% GEQ 10 goto end
ping -n 11 127.0.0.1 >nul
goto run
:end
REM 2026-10-30 after close (16:00+): write today's homepage KPI cards (chip_brief_daily) instead of waiting for the nightly job.
REM --wait polls up to 90 min until TWSE/TAIFEX publish today's data; holidays are skipped.
"C:\Users\User\AppData\Local\Python\pythoncore-3.14-64\python.exe" scripts\office_step.py data scripts\chip_brief.py --wait >> D:\stock_data\intraday_push.log 2>&1
