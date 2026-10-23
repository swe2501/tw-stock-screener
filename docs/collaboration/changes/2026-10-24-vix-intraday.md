# TAIFEX VIX intraday data

Adds an optional `code=TAIWANVIX&date=YYYY-MM-DD&interval=5m` request to the existing chart function. Existing chart URLs and session quotes remain compatible; no deployment entry, database, auth or scheduler changes.

Source: the official daily intraday download linked from https://www.taifex.com.tw/cht/7/vixMinNew . Big5 tab-separated observations include the trading date, HHMMSScc time and VIX value. The parser validates date/time/session and aggregates actual observations into five-minute OHLC bars with UTC timestamps. Empty or unavailable sources never become daily/proxy/synthetic curves.

Prepared on `shared/justy/vix-intraday`; local integration only. Publication follows JUSTY's numbered workflow.
