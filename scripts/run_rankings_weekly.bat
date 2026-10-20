@echo off
"C:\Users\User\AppData\Local\Python\pythoncore-3.14-64\python.exe" "C:\Users\User\Desktop\AI_stock\scripts\broker_rankings.py" >> "C:\Users\User\Desktop\AI_stock\scripts\rankings_weekly.log" 2>&1
"C:\Users\User\AppData\Local\Python\pythoncore-3.14-64\python.exe" "C:\Users\User\Desktop\AI_stock\scripts\free_float.py" >> "C:\Users\User\Desktop\AI_stock\scripts\rankings_weekly.log" 2>&1
rem 企業價值投資法(357)：全市場歷年現金股利 → stock_dividends（玩股網擋雲端 IP，須本機跑；約 1~1.5 小時、開一個 Chrome 視窗）。股利一年才變，每週一次即可。
"C:\Users\User\AppData\Local\Python\pythoncore-3.14-64\python.exe" "C:\Users\User\Desktop\AI_stock\scripts\dividends_push.py" >> "C:\Users\User\Desktop\AI_stock\scripts\dividends_weekly.log" 2>&1
