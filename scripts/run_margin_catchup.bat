@echo off
REM ============================================================
REM  Margin / institutional catch-up (added 2026-10-06)
REM  Why: chip_etl_twse/tpex read TWSE/TPEx margin-short data; the
REM       midnight main job sometimes runs before the source posts,
REM       so local margin_short lags a day and margin_ratio's
REM       margin_maintenance (incl. short balance) stays on prev day.
REM  What: re-run next morning. chip_etl has gap backfill,
REM        margin_ratio is idempotent, inst_daily_push has a
REM        freshness guard, so repeat runs are safe.
REM  Schedule: Windows Task AI_stock_margin_catchup, Tue-Sat 09:00.
REM ============================================================
set PY=C:\Users\User\AppData\Local\Python\pythoncore-3.14-64\python.exe
set DIR=C:\Users\User\Desktop\AI_stock\scripts
set LOG=%DIR%\margin_catchup.log

echo ==== catchup start %date% %time% ==== >> "%LOG%" 2>&1
"%PY%" "%DIR%\chip_etl_twse.py" --daily >> "%LOG%" 2>&1
"%PY%" "%DIR%\chip_etl_tpex.py" --daily >> "%LOG%" 2>&1
"%PY%" "%DIR%\margin_ratio.py"           >> "%LOG%" 2>&1
"%PY%" "%DIR%\inst_daily_push.py"        >> "%LOG%" 2>&1
echo ==== catchup end   %date% %time% ==== >> "%LOG%" 2>&1
