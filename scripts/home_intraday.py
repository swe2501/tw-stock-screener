"""
home_intraday.py - 首頁「今日走勢」小圖資料（2026-10-24）

首頁櫃買指數、台指期（日盤）、台指VIX 三張卡原本向後端 /api/chart 要 5 分鐘線，但：
  - 櫃買指數 ^TWOII、台指VIX TAIWANVIX：Yahoo 沒有分時（404）
  - 台指期 TX=F：後端只有「大盤近似」替代資料，前端刻意不顯示
改由官方來源自建，存 Supabase page_cache（kind = mini_TXF / mini_VIX / mini_OTC，每種一列，覆寫）：
  - mini_VIX：期交所 VIX 每日檔（getVixData，每 15 秒）→ 5 分鐘最後一筆
  - mini_TXF：期交所每日期貨逐筆成交（DailydownloadCSV/Daily_YYYY_MM_DD.zip，約 2MB）
             → 當日日盤 08:45–13:45、成交量最大的單一月份（近月），5 分鐘最後成交價
  - mini_OTC：官方無歷史分鐘資料，由盤中排程 intraday_push 每輪記一筆 MIS 櫃買指數（otc_o00），
             本檔只負責把當日記錄寫成 mini_OTC（盤中排程也會即時寫）
payload：{"date": "YYYY-MM-DD", "source": "...", "data": [{"time": unix秒, "close": 數值}, ...]}
（data 格式與 /api/chart 相同，前端 home-market-intraday.js 可直接沿用）

用法：python scripts/home_intraday.py [--date YYYY-MM-DD]   預設＝本機股價最新交易日
"""
import argparse
import datetime as dt
import io
import json
import sqlite3
import ssl
import sys
import urllib.request
import zipfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import broker_signals as bs  # noqa: E402

TZ = dt.timezone(dt.timedelta(hours=8))
UA = {"User-Agent": "Mozilla/5.0"}
CTX = ssl.create_default_context()
if hasattr(ssl, "VERIFY_X509_STRICT"):
    CTX.verify_flags &= ~ssl.VERIFY_X509_STRICT
OTC_LOG_DIR = Path(r"D:\stock_data\home_intraday")


def _get(url, timeout=60):
    return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=timeout, context=CTX).read()


def _epoch(d, hhmmss):
    h, m, s = int(hhmmss[:2]), int(hhmmss[2:4]), int(hhmmss[4:6])
    return int(dt.datetime(d.year, d.month, d.day, h, m, s, tzinfo=TZ).timestamp())


def _bucket5(points):
    """[(epoch, price)] → 每 5 分鐘最後一筆；time 取該 5 分鐘區間的結束點（與 Yahoo 5m 線一致的感覺）。"""
    last = {}
    for t, p in sorted(points):
        b = (t // 300) * 300
        last[b] = p
    return [{"time": b, "close": round(p, 2)} for b, p in sorted(last.items())]


def vix_series(d):
    raw = _get(f"https://www.taifex.com.tw/cht/7/getVixData?filesname={d:%Y%m%d}")
    pts = []
    for line in raw.decode("big5", "replace").splitlines():
        f = line.split()
        if len(f) < 3 or f[0] != f"{d:%Y%m%d}" or not f[1].isdigit():
            continue
        tm = f[1].rjust(8, "0")[:6]                  # 時分秒＋百分秒：9000000 → 09000000 → 090000；13444500 → 134445
        try:
            pts.append((_epoch(d, tm), float(f[-1])))
        except ValueError:
            continue
    return _bucket5(pts)


def txf_series(d):
    raw = _get(f"https://www.taifex.com.tw/file/taifex/Dailydownload/DailydownloadCSV/Daily_{d:%Y_%m_%d}.zip", timeout=120)
    z = zipfile.ZipFile(io.BytesIO(raw))
    rows = []
    for line in z.read(z.namelist()[0]).decode("big5", "replace").splitlines()[1:]:
        f = [x.strip() for x in line.split(",")]
        if len(f) < 6 or f[1] != "TX" or f[0] != f"{d:%Y%m%d}" or "/" in f[2]:
            continue
        tm = f[3].rjust(6, "0")
        if not ("084500" <= tm <= "134500"):
            continue
        try:
            rows.append((f[2], _epoch(d, tm), float(f[4]), int(f[5] or 0)))
        except ValueError:
            continue
    if not rows:
        return []
    vol = {}
    for m, _, _, q in rows:
        vol[m] = vol.get(m, 0) + q
    near = max(vol, key=vol.get)                     # 成交量最大的單一月份＝近月
    return _bucket5([(t, p) for m, t, p, _ in rows if m == near])


def otc_series(d):
    f = OTC_LOG_DIR / f"otc_{d:%Y%m%d}.json"
    if not f.exists():
        return []
    pts = [(int(t), float(p)) for t, p in json.loads(f.read_text(encoding="utf-8"))]
    return _bucket5(pts)


def fx_series(d):
    """台幣匯率：盤中排程 intraday_push 每輪記一筆 Yahoo TWD=X 即時報價到 fx_YYYYMMDD.json。"""
    f = OTC_LOG_DIR / f"fx_{d:%Y%m%d}.json"
    if not f.exists():
        return []
    pts = [(int(t), float(p)) for t, p in json.loads(f.read_text(encoding="utf-8"))]
    return _bucket5(pts)


def push(env, kind, d, data, source):
    row = {"kind": kind, "trade_date": d.isoformat(),
           "payload": {"date": d.isoformat(), "source": source, "data": data},
           "updated_at": dt.datetime.now(dt.timezone.utc).isoformat()}
    bs._sb(env, "/page_cache", method="DELETE", params=[("kind", f"eq.{kind}")])
    st, _ = bs._sb(env, "/page_cache", method="POST", body=[row])
    return st


def latest_trade_date():
    import wantgoo_scraper as ws
    conn = sqlite3.connect(f"file:{ws.LOCAL_DB_PATH}?mode=ro", uri=True, timeout=120)
    v = conn.execute("select max(trade_date) from stock_daily where market='twse'").fetchone()[0]
    return dt.date.fromisoformat(v)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--date")
    a = ap.parse_args()
    d = dt.date.fromisoformat(a.date) if a.date else latest_trade_date()
    env = bs._load_env()
    for kind, fn, src in (("mini_VIX", vix_series, "期交所 VIX 每日檔（每 15 秒）"),
                          ("mini_TXF", txf_series, "期交所期貨每日逐筆成交（日盤近月）"),
                          ("mini_OTC", otc_series, "盤中排程記錄 MIS 櫃買指數"),
                          ("mini_FX", fx_series, "盤中排程記錄 Yahoo TWD=X 即時匯率")):
        try:
            data = fn(d)
        except Exception as e:                         # noqa: BLE001
            print(f"[home_intraday] {kind} {d} 抓取失敗：{type(e).__name__} {e}")
            continue
        if len(data) < 2:
            print(f"[home_intraday] {kind} {d} 資料不足（{len(data)} 筆），保留原資料")
            continue
        st = push(env, kind, d, data, src)
        print(f"[home_intraday] {kind} {d} {len(data)} 點 {data[0]['close']}→{data[-1]['close']} 寫入 status={st}")


if __name__ == "__main__":
    main()
