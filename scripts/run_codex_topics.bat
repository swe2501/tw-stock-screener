@echo off
setlocal
"C:\Users\User\AppData\Local\Python\pythoncore-3.14-64\python.exe" "%~dp0office_step.py" news "%~dp0run_codex_topics.py" >> "%~dp0codex_topics.log" 2>&1
exit /b %errorlevel%
