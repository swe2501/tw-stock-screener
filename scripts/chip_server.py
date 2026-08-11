"""
chip_server.py — 本機籌碼即時 API（給 K 圖籌碼 tab 用）。

資料全留本機(免費版 Supabase 不存)。開機時這支跑著,經 Cloudflare Tunnel 對外;
Vercel 帶密鑰來打,即時從本機 SQLite 算出單一股票的六列籌碼柱狀圖資料回傳。
PC 關機/隧道斷 → Vercel 收不到 → 前端顯示「本機未開機」。

六列(縱軸=張數;主力/外資/投信/自營=每日買賣超,大戶/散戶=每週持股淨變化):
  主力   : wantgoo_daily 分點,前15大買超 − 前15大賣超
  外資   : institutional_trades foreign        (股→張)
  投信   : institutional_trades investment_trust
  自營商 : institutional_trades dealer_total
  大戶   : holding_distribution ≥400張級距 持股週變化
  散戶   : holding_distribution ≤10張級距 持股週變化

授權：需帶 header  X-Chip-Secret == 環境變數 CHIP_SECRET。未設 CHIP_SECRET → 開發模式(不驗證)。
用法：python scripts/chip_server.py [--port 8899]
"""
import argparse
import json
import sqlite3
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse, parse_qs

sys.path.insert(0, str(Path(__file__).resolve().parent))
import broker_signals as bs           # noqa: E402  # _load_env（取 CHIP_SECRET）

if sys.stdout and hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(errors="replace")

DB = r"D:\stock_data\wantgoo_full.db"
TOP_N = 15            # 主力：前 15 大買/賣超分點
BIG_MIN_SHARES = 400001    # 大戶：持股 ≥400 張（400,001 股起）
RETAIL_MAX_SHARES = 10000  # 散戶：持股 ≤10 張（10,000 股）
try:
    _ENV = bs._load_env()
except Exception:
    _ENV = {}
CHIP_SECRET = _ENV.get("CHIP_SECRET", "")


def _conn():
    c = sqlite3.connect(DB, check_same_thread=False)
    c.execute("pragma busy_timeout=20000")
    return c


def _main_force(conn, code, since):
    """主力：每日『前15大買超淨額 − 前15大賣超淨額』(張)。"""
    rows = conn.execute(
        "select trade_date, (buy_vol - sell_vol) as net from wantgoo_daily "
        "where code=? and trade_date>=? order by trade_date", (code, since)).fetchall()
    by_day = {}
    for d, net in rows:
        by_day.setdefault(d, []).append(net or 0)
    out = []
    for d in sorted(by_day):
        nets = by_day[d]
        pos = sorted((n for n in nets if n > 0), reverse=True)[:TOP_N]
        neg = sorted((n for n in nets if n < 0))[:TOP_N]
        out.append({"date": d, "lots": int(sum(pos) + sum(neg))})   # neg 為負 → 相加即淨額
    return out


def _inst(conn, code, since, itype):
    """三大法人某類別每日買賣超(股→張)。"""
    rows = conn.execute(
        "select trade_date, net_shares from institutional_trades "
        "where stock_id=? and investor_type=? and trade_date>=? order by trade_date",
        (code, itype, since)).fetchall()
    return [{"date": d, "lots": round((n or 0) / 1000, 1)} for d, n in rows]


def _holder_change(conn, code, since, which):
    """大戶/散戶：每週持股張數的『本週 − 上週』變化(張)。which = 'big' | 'retail'。"""
    if which == "big":
        cond = "minimum_shares >= ?"; arg = BIG_MIN_SHARES
    else:
        cond = "maximum_shares <= ? and maximum_shares is not null"; arg = RETAIL_MAX_SHARES
    rows = conn.execute(
        f"select data_date, sum(shares) from holding_distribution "
        f"where stock_id=? and data_date>=? and {cond} group by data_date order by data_date",
        (code, since, arg)).fetchall()
    out, prev = [], None
    for d, sh in rows:
        lots = round((sh or 0) / 1000, 1)
        if prev is not None:
            out.append({"date": d, "lots": round(lots - prev, 1)})
        prev = lots
    return out


def build_chip(code, days):
    conn = _conn()
    try:
        latest = conn.execute("select max(trade_date) from wantgoo_daily").fetchone()[0]
        if not latest:
            return {"code": code, "error": "no data"}
        from datetime import date, timedelta
        since = (date.fromisoformat(latest) - timedelta(days=int(days))).isoformat()
        data = {
            "主力":   _main_force(conn, code, since),
            "外資":   _inst(conn, code, since, "foreign"),
            "投信":   _inst(conn, code, since, "investment_trust"),
            "自營商": _inst(conn, code, since, "dealer_total"),
            "大戶":   _holder_change(conn, code, since, "big"),
            "散戶":   _holder_change(conn, code, since, "retail"),
        }
        # 各列資料最新日（供前端顯示「資料到哪天」）
        latest_of = {k: (v[-1]["date"] if v else None) for k, v in data.items()}
        return {"code": code, "since": since, "latest": latest_of, "series": data}
    finally:
        conn.close()


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *a): pass

    def _json(self, code, obj):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "X-Chip-Secret")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        u = urlparse(self.path)
        if u.path == "/health":
            return self._json(200, {"ok": True})
        if u.path != "/chip":
            return self._json(404, {"error": "not found"})
        if CHIP_SECRET and self.headers.get("X-Chip-Secret", "") != CHIP_SECRET:
            return self._json(403, {"error": "forbidden"})
        q = parse_qs(u.query)
        code = (q.get("code") or [""])[0].strip()
        days = (q.get("days") or ["120"])[0]
        if not code:
            return self._json(400, {"error": "code required"})
        try:
            self._json(200, build_chip(code, days))
        except Exception as e:
            self._json(500, {"error": str(e)})


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8899)
    args = ap.parse_args()
    mode = "需密鑰" if CHIP_SECRET else "開發模式(未設 CHIP_SECRET,不驗證)"
    print(f"chip_server 啟動於 :{args.port}（{mode}）  /chip?code=2330&days=120  /health")
    ThreadingHTTPServer(("0.0.0.0", args.port), Handler).serve_forever()


if __name__ == "__main__":
    main()
