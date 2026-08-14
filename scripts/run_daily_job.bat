@echo off
"C:\Users\User\AppData\Local\Python\pythoncore-3.14-64\python.exe" "C:\Users\User\Desktop\AI_stock\scripts\wantgoo_daily_job.py" --mode daily >> "C:\Users\User\Desktop\AI_stock\scripts\daily_job_stdout.log" 2>&1
"C:\Users\User\AppData\Local\Python\pythoncore-3.14-64\python.exe" "C:\Users\User\Desktop\AI_stock\scripts\fetch_prices.py" >> "C:\Users\User\Desktop\AI_stock\scripts\daily_job_stdout.log" 2>&1
"C:\Users\User\AppData\Local\Python\pythoncore-3.14-64\python.exe" "C:\Users\User\Desktop\AI_stock\scripts\upload_price_window.py" >> "C:\Users\User\Desktop\AI_stock\scripts\daily_job_stdout.log" 2>&1
"C:\Users\User\AppData\Local\Python\pythoncore-3.14-64\python.exe" "C:\Users\User\Desktop\AI_stock\scripts\upload_exdiv_factor.py" >> "C:\Users\User\Desktop\AI_stock\scripts\daily_job_stdout.log" 2>&1
"C:\Users\User\AppData\Local\Python\pythoncore-3.14-64\python.exe" "C:\Users\User\Desktop\AI_stock\scripts\catalyst_lawshow.py" >> "C:\Users\User\Desktop\AI_stock\scripts\daily_job_stdout.log" 2>&1
"C:\Users\User\AppData\Local\Python\pythoncore-3.14-64\python.exe" "C:\Users\User\Desktop\AI_stock\scripts\chip_etl_twse.py" --daily >> "C:\Users\User\Desktop\AI_stock\scripts\daily_job_stdout.log" 2>&1
"C:\Users\User\AppData\Local\Python\pythoncore-3.14-64\python.exe" "C:\Users\User\Desktop\AI_stock\scripts\chip_etl_tpex.py" --daily >> "C:\Users\User\Desktop\AI_stock\scripts\daily_job_stdout.log" 2>&1
"C:\Users\User\AppData\Local\Python\pythoncore-3.14-64\python.exe" "C:\Users\User\Desktop\AI_stock\scripts\backfill_gaps.py" >> "C:\Users\User\Desktop\AI_stock\scripts\daily_job_stdout.log" 2>&1
"C:\Users\User\AppData\Local\Python\pythoncore-3.14-64\python.exe" "C:\Users\User\Desktop\AI_stock\scripts\broker_signals.py" >> "C:\Users\User\Desktop\AI_stock\scripts\daily_job_stdout.log" 2>&1
"C:\Users\User\AppData\Local\Python\pythoncore-3.14-64\python.exe" "C:\Users\User\Desktop\AI_stock\scripts\broker_highwin.py" >> "C:\Users\User\Desktop\AI_stock\scripts\daily_job_stdout.log" 2>&1
"C:\Users\User\AppData\Local\Python\pythoncore-3.14-64\python.exe" "C:\Users\User\Desktop\AI_stock\scripts\margin_ratio.py" >> "C:\Users\User\Desktop\AI_stock\scripts\daily_job_stdout.log" 2>&1
"C:\Users\User\AppData\Local\Python\pythoncore-3.14-64\python.exe" "C:\Users\User\Desktop\AI_stock\scripts\broker_rankings.py" --daily-refresh >> "C:\Users\User\Desktop\AI_stock\scripts\daily_job_stdout.log" 2>&1
"C:\Users\User\AppData\Local\Python\pythoncore-3.14-64\python.exe" "C:\Users\User\Desktop\AI_stock\scripts\sell_tracker.py" >> "C:\Users\User\Desktop\AI_stock\scripts\daily_job_stdout.log" 2>&1
"C:\Users\User\AppData\Local\Python\pythoncore-3.14-64\python.exe" "C:\Users\User\Desktop\AI_stock\scripts\job_health.py" >> "C:\Users\User\Desktop\AI_stock\scripts\daily_job_stdout.log" 2>&1
