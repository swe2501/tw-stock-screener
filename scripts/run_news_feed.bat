@echo off
rem news_feed every 4 hours (Task Scheduler: AI_stock_news_feed)
echo ==== %DATE% %TIME% news_feed ==== >> "C:\Users\User\Desktop\AI_stock\scripts\news_feed.log"
"C:\Users\User\AppData\Local\Python\pythoncore-3.14-64\python.exe" "C:\Users\User\Desktop\AI_stock\scripts\news_feed.py" >> "C:\Users\User\Desktop\AI_stock\scripts\news_feed.log" 2>&1
