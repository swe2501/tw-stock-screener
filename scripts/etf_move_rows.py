"""PCF comparison rows; preserve removals and distinguish missing history from zero change."""


def build_holdings_rows(code, data, date):
    current = {str(h.get("stockCode", "")).strip(): h for h in (data.get("stockHoldings") or [])
               if str(h.get("stockCode", "")).strip()}
    previous = {str(h.get("stockCode", "")).strip(): h for h in (data.get("previousStockHoldings") or [])
                if str(h.get("stockCode", "")).strip()}
    comparable = bool(previous)
    rows = []
    for sc, holding in current.items():
        shares = holding.get("shares")
        old = previous.get(sc)
        old_shares = old.get("shares") if old else 0
        delta = shares - old_shares if comparable and shares is not None and old_shares is not None else None
        rows.append({"code": code, "stock_code": sc, "stock_name": holding.get("stockName"),
                     "shares": shares, "weight": holding.get("weight"), "delta_shares": delta,
                     "seq": holding.get("seq"), "data_date": date})
    if current and comparable:
        for sc, holding in previous.items():
            if sc in current or holding.get("shares") is None or holding["shares"] <= 0:
                continue
            rows.append({"code": code, "stock_code": sc, "stock_name": holding.get("stockName"),
                         "shares": 0, "weight": 0, "delta_shares": -holding["shares"],
                         "seq": len(rows) + 1, "data_date": date})
    return rows
