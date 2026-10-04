@echo off
"C:\Users\User\AppData\Local\Python\pythoncore-3.14-64\python.exe" "C:\Users\User\Desktop\AI_stock\scripts\wantgoo_daily_job.py" --mode daily >> "C:\Users\User\Desktop\AI_stock\scripts\daily_job_stdout.log" 2>&1
"C:\Users\User\AppData\Local\Python\pythoncore-3.14-64\python.exe" "C:\Users\User\Desktop\AI_stock\scripts\fetch_prices.py" >> "C:\Users\User\Desktop\AI_stock\scripts\daily_job_stdout.log" 2>&1
"C:\Users\User\AppData\Local\Python\pythoncore-3.14-64\python.exe" "C:\Users\User\Desktop\AI_stock\scripts\fetch_prices_otc.py" >> "C:\Users\User\Desktop\AI_stock\scripts\daily_job_stdout.log" 2>&1
"C:\Users\User\AppData\Local\Python\pythoncore-3.14-64\python.exe" "C:\Users\User\Desktop\AI_stock\scripts\fetch_hourly.py" >> "C:\Users\User\Desktop\AI_stock\scripts\daily_job_stdout.log" 2>&1
"C:\Users\User\AppData\Local\Python\pythoncore-3.14-64\python.exe" "C:\Users\User\Desktop\AI_stock\scripts\upload_price_window.py" >> "C:\Users\User\Desktop\AI_stock\scripts\daily_job_stdout.log" 2>&1
"C:\Users\User\AppData\Local\Python\pythoncore-3.14-64\python.exe" "C:\Users\User\Desktop\AI_stock\scripts\upload_exdiv_factor.py" >> "C:\Users\User\Desktop\AI_stock\scripts\daily_job_stdout.log" 2>&1
"C:\Users\User\AppData\Local\Python\pythoncore-3.14-64\python.exe" "C:\Users\User\Desktop\AI_stock\scripts\gen_listed_codes.py" >> "C:\Users\User\Desktop\AI_stock\scripts\daily_job_stdout.log" 2>&1
"C:\Users\User\AppData\Local\Python\pythoncore-3.14-64\python.exe" "C:\Users\User\Desktop\AI_stock\scripts\catalyst_lawshow.py" >> "C:\Users\User\Desktop\AI_stock\scripts\daily_job_stdout.log" 2>&1
"C:\Users\User\AppData\Local\Python\pythoncore-3.14-64\python.exe" "C:\Users\User\Desktop\AI_stock\scripts\compute_strength.py" >> "C:\Users\User\Desktop\AI_stock\scripts\daily_job_stdout.log" 2>&1
"C:\Users\User\AppData\Local\Python\pythoncore-3.14-64\python.exe" "C:\Users\User\Desktop\AI_stock\scripts\compute_box.py" >> "C:\Users\User\Desktop\AI_stock\scripts\daily_job_stdout.log" 2>&1
"C:\Users\User\AppData\Local\Python\pythoncore-3.14-64\python.exe" "C:\Users\User\Desktop\AI_stock\scripts\chip_etl_twse.py" --daily >> "C:\Users\User\Desktop\AI_stock\scripts\daily_job_stdout.log" 2>&1
"C:\Users\User\AppData\Local\Python\pythoncore-3.14-64\python.exe" "C:\Users\User\Desktop\AI_stock\scripts\chip_etl_tpex.py" --daily >> "C:\Users\User\Desktop\AI_stock\scripts\daily_job_stdout.log" 2>&1
"C:\Users\User\AppData\Local\Python\pythoncore-3.14-64\python.exe" "C:\Users\User\Desktop\AI_stock\scripts\inst_daily_push.py" >> "C:\Users\User\Desktop\AI_stock\scripts\daily_job_stdout.log" 2>&1
"C:\Users\User\AppData\Local\Python\pythoncore-3.14-64\python.exe" "C:\Users\User\Desktop\AI_stock\scripts\holder_flow_push.py" --top 500 >> "C:\Users\User\Desktop\AI_stock\scripts\daily_job_stdout.log" 2>&1
"C:\Users\User\AppData\Local\Python\pythoncore-3.14-64\python.exe" "C:\Users\User\Desktop\AI_stock\scripts\daytrade_etl.py" --daily >> "C:\Users\User\Desktop\AI_stock\scripts\daily_job_stdout.log" 2>&1
"C:\Users\User\AppData\Local\Python\pythoncore-3.14-64\python.exe" "C:\Users\User\Desktop\AI_stock\scripts\backfill_gaps.py" >> "C:\Users\User\Desktop\AI_stock\scripts\daily_job_stdout.log" 2>&1
"C:\Users\User\AppData\Local\Python\pythoncore-3.14-64\python.exe" "C:\Users\User\Desktop\AI_stock\scripts\broker_signals.py" >> "C:\Users\User\Desktop\AI_stock\scripts\daily_job_stdout.log" 2>&1
"C:\Users\User\AppData\Local\Python\pythoncore-3.14-64\python.exe" "C:\Users\User\Desktop\AI_stock\scripts\broker_highwin.py" >> "C:\Users\User\Desktop\AI_stock\scripts\daily_job_stdout.log" 2>&1
"C:\Users\User\AppData\Local\Python\pythoncore-3.14-64\python.exe" "C:\Users\User\Desktop\AI_stock\scripts\margin_ratio.py" >> "C:\Users\User\Desktop\AI_stock\scripts\daily_job_stdout.log" 2>&1
"C:\Users\User\AppData\Local\Python\pythoncore-3.14-64\python.exe" "C:\Users\User\Desktop\AI_stock\scripts\margin_maintenance_calc.py" >> "C:\Users\User\Desktop\AI_stock\scripts\daily_job_stdout.log" 2>&1
"C:\Users\User\AppData\Local\Python\pythoncore-3.14-64\python.exe" "C:\Users\User\Desktop\AI_stock\scripts\fetch_otc_index.py" --daily >> "C:\Users\User\Desktop\AI_stock\scripts\daily_job_stdout.log" 2>&1
"C:\Users\User\AppData\Local\Python\pythoncore-3.14-64\python.exe" "C:\Users\User\Desktop\AI_stock\scripts\otc_broker_daily.py" >> "C:\Users\User\Desktop\AI_stock\scripts\daily_job_stdout.log" 2>&1
"C:\Users\User\AppData\Local\Python\pythoncore-3.14-64\python.exe" "C:\Users\User\Desktop\AI_stock\scripts\compute_greed.py" >> "C:\Users\User\Desktop\AI_stock\scripts\daily_job_stdout.log" 2>&1
"C:\Users\User\AppData\Local\Python\pythoncore-3.14-64\python.exe" "C:\Users\User\Desktop\AI_stock\scripts\broker_rankings.py" --daily-refresh >> "C:\Users\User\Desktop\AI_stock\scripts\daily_job_stdout.log" 2>&1
"C:\Users\User\AppData\Local\Python\pythoncore-3.14-64\python.exe" "C:\Users\User\Desktop\AI_stock\scripts\sell_tracker.py" >> "C:\Users\User\Desktop\AI_stock\scripts\daily_job_stdout.log" 2>&1
"C:\Users\User\AppData\Local\Python\pythoncore-3.14-64\python.exe" "C:\Users\User\Desktop\AI_stock\scripts\upload_etf.py" >> "C:\Users\User\Desktop\AI_stock\scripts\daily_job_stdout.log" 2>&1
"C:\Users\User\AppData\Local\Python\pythoncore-3.14-64\python.exe" "C:\Users\User\Desktop\AI_stock\scripts\wantgoo_etf.py" >> "C:\Users\User\Desktop\AI_stock\scripts\daily_job_stdout.log" 2>&1
"C:\Users\User\AppData\Local\Python\pythoncore-3.14-64\python.exe" "C:\Users\User\Desktop\AI_stock\scripts\wantgoo_etf_flow.py" >> "C:\Users\User\Desktop\AI_stock\scripts\daily_job_stdout.log" 2>&1
"C:\Users\User\AppData\Local\Python\pythoncore-3.14-64\python.exe" "C:\Users\User\Desktop\AI_stock\scripts\upload_institutional.py" >> "C:\Users\User\Desktop\AI_stock\scripts\daily_job_stdout.log" 2>&1
"C:\Users\User\AppData\Local\Python\pythoncore-3.14-64\python.exe" "C:\Users\User\Desktop\AI_stock\scripts\upload_etf_div.py" >> "C:\Users\User\Desktop\AI_stock\scripts\daily_job_stdout.log" 2>&1
"C:\Users\User\AppData\Local\Python\pythoncore-3.14-64\python.exe" "C:\Users\User\Desktop\AI_stock\scripts\upload_etf_holders.py" >> "C:\Users\User\Desktop\AI_stock\scripts\daily_job_stdout.log" 2>&1
"C:\Users\User\AppData\Local\Python\pythoncore-3.14-64\python.exe" "C:\Users\User\Desktop\AI_stock\scripts\sector_turnover.py" >> "C:\Users\User\Desktop\AI_stock\scripts\daily_job_stdout.log" 2>&1
"C:\Users\User\AppData\Local\Python\pythoncore-3.14-64\python.exe" "C:\Users\User\Desktop\AI_stock\scripts\margin_market.py" >> "C:\Users\User\Desktop\AI_stock\scripts\daily_job_stdout.log" 2>&1
"C:\Users\User\AppData\Local\Python\pythoncore-3.14-64\python.exe" "C:\Users\User\Desktop\AI_stock\scripts\inst_market.py" >> "C:\Users\User\Desktop\AI_stock\scripts\daily_job_stdout.log" 2>&1
"C:\Users\User\AppData\Local\Python\pythoncore-3.14-64\python.exe" "C:\Users\User\Desktop\AI_stock\scripts\otc_market.py" >> "C:\Users\User\Desktop\AI_stock\scripts\daily_job_stdout.log" 2>&1
"C:\Users\User\AppData\Local\Python\pythoncore-3.14-64\python.exe" "C:\Users\User\Desktop\AI_stock\scripts\futures_market.py" >> "C:\Users\User\Desktop\AI_stock\scripts\daily_job_stdout.log" 2>&1
"C:\Users\User\AppData\Local\Python\pythoncore-3.14-64\python.exe" "C:\Users\User\Desktop\AI_stock\scripts\chip_brief.py" >> "C:\Users\User\Desktop\AI_stock\scripts\daily_job_stdout.log" 2>&1
"C:\Users\User\AppData\Local\Python\pythoncore-3.14-64\python.exe" "C:\Users\User\Desktop\AI_stock\scripts\options_market.py" >> "C:\Users\User\Desktop\AI_stock\scripts\daily_job_stdout.log" 2>&1
"C:\Users\User\AppData\Local\Python\pythoncore-3.14-64\python.exe" "C:\Users\User\Desktop\AI_stock\scripts\daily_slogan_rotate.py" >> "C:\Users\User\Desktop\AI_stock\scripts\daily_job_stdout.log" 2>&1
"C:\Users\User\AppData\Local\Python\pythoncore-3.14-64\python.exe" "C:\Users\User\Desktop\AI_stock\scripts\upload_hot_topics.py" >> "C:\Users\User\Desktop\AI_stock\scripts\daily_job_stdout.log" 2>&1
"C:\Users\User\AppData\Local\Python\pythoncore-3.14-64\python.exe" "C:\Users\User\Desktop\AI_stock\scripts\gov_broker.py" >> "C:\Users\User\Desktop\AI_stock\scripts\daily_job_stdout.log" 2>&1
"C:\Users\User\AppData\Local\Python\pythoncore-3.14-64\python.exe" "C:\Users\User\Desktop\AI_stock\scripts\market_indicators.py" >> "C:\Users\User\Desktop\AI_stock\scripts\daily_job_stdout.log" 2>&1
"C:\Users\User\AppData\Local\Python\pythoncore-3.14-64\python.exe" "C:\Users\User\Desktop\AI_stock\scripts\active_etf_flow.py" >> "C:\Users\User\Desktop\AI_stock\scripts\daily_job_stdout.log" 2>&1
"C:\Users\User\AppData\Local\Python\pythoncore-3.14-64\python.exe" "C:\Users\User\Desktop\AI_stock\scripts\upload_active_etf_holdings.py" >> "C:\Users\User\Desktop\AI_stock\scripts\daily_job_stdout.log" 2>&1
"C:\Users\User\AppData\Local\Python\pythoncore-3.14-64\python.exe" "C:\Users\User\Desktop\AI_stock\scripts\foreign_hedge.py" --daily >> "C:\Users\User\Desktop\AI_stock\scripts\daily_job_stdout.log" 2>&1
"C:\Users\User\AppData\Local\Python\pythoncore-3.14-64\python.exe" "C:\Users\User\Desktop\AI_stock\scripts\macro_events.py" >> "C:\Users\User\Desktop\AI_stock\scripts\daily_job_stdout.log" 2>&1
"C:\Users\User\AppData\Local\Python\pythoncore-3.14-64\python.exe" "C:\Users\User\Desktop\AI_stock\scripts\breadth_daily.py" >> "C:\Users\User\Desktop\AI_stock\scripts\daily_job_stdout.log" 2>&1
"C:\Users\User\AppData\Local\Python\pythoncore-3.14-64\python.exe" "C:\Users\User\Desktop\AI_stock\scripts\etf_daily.py" >> "C:\Users\User\Desktop\AI_stock\scripts\daily_job_stdout.log" 2>&1
"C:\Users\User\AppData\Local\Python\pythoncore-3.14-64\python.exe" "C:\Users\User\Desktop\AI_stock\scripts\breadth_ext.py" >> "C:\Users\User\Desktop\AI_stock\scripts\daily_job_stdout.log" 2>&1
"C:\Users\User\AppData\Local\Python\pythoncore-3.14-64\python.exe" "C:\Users\User\Desktop\AI_stock\scripts\fundamentals.py" >> "C:\Users\User\Desktop\AI_stock\scripts\daily_job_stdout.log" 2>&1
"C:\Users\User\AppData\Local\Python\pythoncore-3.14-64\python.exe" "C:\Users\User\Desktop\AI_stock\scripts\option_sr.py" >> "C:\Users\User\Desktop\AI_stock\scripts\daily_job_stdout.log" 2>&1
"C:\Users\User\AppData\Local\Python\pythoncore-3.14-64\python.exe" "C:\Users\User\Desktop\AI_stock\scripts\txo_history.py" >> "C:\Users\User\Desktop\AI_stock\scripts\daily_job_stdout.log" 2>&1
"C:\Users\User\AppData\Local\Python\pythoncore-3.14-64\python.exe" "C:\Users\User\Desktop\AI_stock\scripts\stock_sr.py" >> "C:\Users\User\Desktop\AI_stock\scripts\daily_job_stdout.log" 2>&1
"C:\Users\User\AppData\Local\Python\pythoncore-3.14-64\python.exe" "C:\Users\User\Desktop\AI_stock\scripts\stock_sr.py" --src hour >> "C:\Users\User\Desktop\AI_stock\scripts\daily_job_stdout.log" 2>&1
"C:\Users\User\AppData\Local\Python\pythoncore-3.14-64\python.exe" "C:\Users\User\Desktop\AI_stock\scripts\mops_announce.py" >> "C:\Users\User\Desktop\AI_stock\scripts\daily_job_stdout.log" 2>&1
"C:\Users\User\AppData\Local\Python\pythoncore-3.14-64\python.exe" "C:\Users\User\Desktop\AI_stock\scripts\liquidity_top.py" >> "C:\Users\User\Desktop\AI_stock\scripts\daily_job_stdout.log" 2>&1
"C:\Users\User\AppData\Local\Python\pythoncore-3.14-64\python.exe" "C:\Users\User\Desktop\AI_stock\scripts\mingdeng.py" >> "C:\Users\User\Desktop\AI_stock\scripts\daily_job_stdout.log" 2>&1
"C:\Users\User\AppData\Local\Python\pythoncore-3.14-64\python.exe" "C:\Users\User\Desktop\AI_stock\scripts\job_health.py" >> "C:\Users\User\Desktop\AI_stock\scripts\daily_job_stdout.log" 2>&1
