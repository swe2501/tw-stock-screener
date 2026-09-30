@echo off
REM ============================================================
REM  TAIFEX openapi 補跑（2026-09-30 新增）
REM  原因：這幾支讀 TAIFEX openapi DailyMarketReportOpt/Fut，
REM        主排程 19:00 常在來源更新前跑到 → 資料日落後一天。
REM  作法：隔天早上再跑一次；三支腳本內建新鮮度防呆（來源沒比
REM        既有最新日新就自動 [skip]），故重複跑安全、冪等。
REM  排程：Windows 工作排程器 AI_stock_taifex_catchup，週二~六 08:30。
REM ============================================================
set PY=C:\Users\User\AppData\Local\Python\pythoncore-3.14-64\python.exe
set DIR=C:\Users\User\Desktop\AI_stock\scripts
set LOG=%DIR%\taifex_catchup.log

echo ==== catchup start %date% %time% ==== >> "%LOG%" 2>&1
"%PY%" "%DIR%\option_sr.py"      >> "%LOG%" 2>&1
"%PY%" "%DIR%\futures_market.py" >> "%LOG%" 2>&1
"%PY%" "%DIR%\liquidity_top.py"  >> "%LOG%" 2>&1
echo ==== catchup end   %date% %time% ==== >> "%LOG%" 2>&1
