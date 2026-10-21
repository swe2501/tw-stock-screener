@echo off
REM ============================================================
REM  TAIFEX openapi catch-up run (added 2026-09-30)
REM  Why: these scripts read TAIFEX openapi DailyMarketReportOpt/Fut,
REM       and the 19:00 main job often runs before the source updates -> data one day behind.
REM  How: run again the next morning; the scripts skip when the source is not newer,
REM       so re-running is safe and idempotent.
REM  Schedule: Task Scheduler AI_stock_taifex_catchup, Tue-Sat 08:30. Keep this file ASCII-only.
REM ============================================================
set PY=C:\Users\User\AppData\Local\Python\pythoncore-3.14-64\python.exe
set DIR=C:\Users\User\Desktop\AI_stock\scripts
set LOG=%DIR%\taifex_catchup.log

echo ==== catchup start %date% %time% ==== >> "%LOG%" 2>&1
"%PY%" "%DIR%\option_sr.py"      >> "%LOG%" 2>&1
"%PY%" "%DIR%\futures_market.py" >> "%LOG%" 2>&1
"%PY%" "%DIR%\liquidity_top.py"  >> "%LOG%" 2>&1
echo ==== catchup end   %date% %time% ==== >> "%LOG%" 2>&1
