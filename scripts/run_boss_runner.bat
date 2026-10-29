@echo off
rem BossRunner every 5 min: heartbeat + whitelisted reruns for the AI office supervisor (2026-10-30)
"C:\Users\User\AppData\Local\Python\pythoncore-3.14-64\python.exe" "%~dp0trim_log.py" "%~dp0boss_runner.log" 7 >nul 2>&1
"C:\Users\User\AppData\Local\Python\pythoncore-3.14-64\python.exe" "%~dp0boss_runner.py" >> "%~dp0boss_runner.log" 2>&1
exit /b 0
