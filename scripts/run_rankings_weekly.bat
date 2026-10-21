@echo off
"C:\Users\User\AppData\Local\Python\pythoncore-3.14-64\python.exe" "C:\Users\User\Desktop\AI_stock\scripts\broker_rankings.py" >> "C:\Users\User\Desktop\AI_stock\scripts\rankings_weekly.log" 2>&1
"C:\Users\User\AppData\Local\Python\pythoncore-3.14-64\python.exe" "C:\Users\User\Desktop\AI_stock\scripts\free_float.py" >> "C:\Users\User\Desktop\AI_stock\scripts\rankings_weekly.log" 2>&1
rem Value investing (357) screener data: market-wide cash dividend history -> stock_dividends (wantgoo blocks cloud IPs, so run locally; about 1-1.5 hours).
"C:\Users\User\AppData\Local\Python\pythoncore-3.14-64\python.exe" "C:\Users\User\Desktop\AI_stock\scripts\dividends_push.py" >> "C:\Users\User\Desktop\AI_stock\scripts\dividends_weekly.log" 2>&1
