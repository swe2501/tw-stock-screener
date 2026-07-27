@echo off
"C:\Users\User\AppData\Local\Python\pythoncore-3.14-64\python.exe" "C:\Users\User\Desktop\AI_stock\scripts\wantgoo_daily_job.py" --mode daily >> "C:\Users\User\Desktop\AI_stock\scripts\daily_job_stdout.log" 2>&1
"C:\Users\User\AppData\Local\Python\pythoncore-3.14-64\python.exe" "C:\Users\User\Desktop\AI_stock\scripts\fetch_prices.py" >> "C:\Users\User\Desktop\AI_stock\scripts\daily_job_stdout.log" 2>&1
"C:\Users\User\AppData\Local\Python\pythoncore-3.14-64\python.exe" "C:\Users\User\Desktop\AI_stock\scripts\broker_signals.py" >> "C:\Users\User\Desktop\AI_stock\scripts\daily_job_stdout.log" 2>&1
"C:\Users\User\AppData\Local\Python\pythoncore-3.14-64\python.exe" "C:\Users\User\Desktop\AI_stock\scripts\broker_highwin.py" >> "C:\Users\User\Desktop\AI_stock\scripts\daily_job_stdout.log" 2>&1
