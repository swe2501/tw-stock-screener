@echo off
setlocal
rem 2026-10-29 keep only the last 7 days of log
"C:\Users\User\AppData\Local\Python\pythoncore-3.14-64\python.exe" "%~dp0trim_log.py" "%~dp0codex_topics.log" 7 >nul 2>&1
"C:\Users\User\AppData\Local\Python\pythoncore-3.14-64\python.exe" "%~dp0office_step.py" news "%~dp0run_codex_topics.py" >> "%~dp0codex_topics.log" 2>&1
exit /b %errorlevel%
