"""
data_gaps.py — 每日表「漏日」檢查（2026-11-03）。

背景：10/20、10/21 夜間排程中途中斷（批次檔中文註解），外資空單、官股個股榜、選擇權支撐壓力
永久少了那幾天，原本的健康檢查只看「爬蟲有沒有跑完、快照是不是最新」，看不出中間漏一天。
做法：交易日＝taiex_daily ∪ price_window(2330) 的日期；逐表逐日問「這天有沒有至少一列」，
  - DAILY：每個交易日都該有的表 → 列出缺的日子
  - LATEST：只留最新一天的快照表 → 最新日期落後最新交易日就列出
  - KPI：market_indicators 不逐日查列（以日曆日記錄），改查交易日的 vix／usdtwd 有沒有空白（2026-11-03 起）
不列入：active_etf_flow（第三方只給最新一天、無共識日本來就不寫）、
  box_patterns（2026-11-01 停算，改 page_cache ai_box_rules）、週資料（holder_flow、broker_rankings_history）。
job_health.py 每晚最後呼叫 problems()，有缺就寄警示信；也可手動盤點：
    python scripts/data_gaps.py            # 近 10 個交易日
    python scripts/data_gaps.py --days 45  # 近 45 個交易日
"""
import argparse
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import broker_signals as bs           # noqa: E402

if sys.stdout and hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(errors="replace")

# (表, 日期欄, 中文名, 補救方式)
DAILY = [
    ("taiex_daily", "trade_date", "加權指數", "index/taiex 排程"),
    ("otc_index_daily", "trade_date", "櫃買指數", "fetch_otc_index.py"),
    ("price_window", "trade_date", "股價視窗", "upload_price_window.py"),
    ("index_history", "trade_date", "指標卡走勢", "index_history.py（每晚自動重抓近期）"),
    ("broker_signals", "signal_date", "主力訊號", "backfill_gaps.py"),
    ("broker_trades", "trade_date", "分點明細", "broker_rankings.py"),
    ("inst_daily", "trade_date", "個股法人", "inst_daily_push.py"),
    ("inst_market_daily", "trade_date", "大盤法人", "inst_market.py"),
    ("futures_daily", "trade_date", "期貨籌碼", "futures_market.py"),
    ("options_daily", "trade_date", "選擇權籌碼", "options_market.py"),
    ("option_sr", "trade_date", "選擇權支撐壓力", "option_sr.py（自動補洞）"),
    ("foreign_hedge_daily", "trade_date", "外資空單溫度計", "foreign_hedge.py（自動補洞）"),
    ("gov_broker_daily", "date", "官股券商總額", "gov_broker_moneylink.py"),
    ("gov_broker_stock", "date", "官股個股榜", "gov_broker.py（自動補洞）"),
    ("margin_market", "date", "大盤融資", "margin_market.py"),
    ("margin_maintenance", "trade_date", "融資維持率", "margin_ratio.py"),
    ("margin_maint_split", "trade_date", "融資維持率三組", "margin_maintenance_calc.py"),
    ("otc_market_daily", "trade_date", "上櫃大盤", "otc_market.py"),
    ("breadth_daily", "trade_date", "市場廣度", "breadth_daily.py"),
    ("breadth_ext", "trade_date", "廣度延伸", "breadth_ext.py"),
    ("chip_brief_daily", "trade_date", "籌碼摘要", "chip_brief.py"),
    ("etf_fund_flow", "date", "ETF 資金流", "wantgoo_etf_flow.py"),
    ("liquidity_top", "trade_date", "流動性前30", "liquidity_top.py"),
    ("sector_turnover", "date", "類股成交比重", "sector_turnover.py --days N"),
]
LATEST = [
    ("greed_base", "data_date", "貪婪指標", "compute_greed.py"),
    ("stock_sr", "trade_date", "個股分價量表", "stock_sr.py"),
    ("institutional_flow", "trade_date", "法人流向", "upload_institutional.py"),
    ("etf_products", "data_date", "ETF 商品", "upload_etf.py"),
]


# 2026-11-03 首頁 KPI 欄位檢查：market_indicators 以日曆日記錄、不適合逐日查列，改查「交易日的關鍵欄位有沒有值」。
# 教訓：16:00 寫匯率先建了當日列、vix 空白 → 首頁台指VIX 顯示「—」沒人發現。
# 10/30 之前資料日標錯（過午夜標成隔天），只從修正後開始查，避免舊資料一直誤報。
KPI = ("market_indicators", "date", "首頁台指VIX／匯率", ("vix", "usdtwd"),
       "chip_brief.py 盤後（vix_close_today）／market_indicators.py")
KPI_SINCE = "2026-11-02"


def kpi_blank(env, tds):
    """回 [(日期, [空白欄位])]；當天 16:30 前不查（盤後才寫）。"""
    from datetime import datetime, timedelta, timezone
    now = datetime.now(timezone(timedelta(hours=8)))
    today = now.strftime("%Y-%m-%d")
    t, c, _, cols, _ = KPI
    days = [d for d in tds if d >= KPI_SINCE and (d < today or now.strftime("%H%M") >= "1630")]
    if not days:
        return []
    st, rows = bs._sb(env, "/" + t, params=[("select", ",".join((c,) + cols)), (c, f"gte.{days[0]}")])
    if st != 200:
        return [("查詢失敗", list(cols))]
    by = {str(r[c])[:10]: r for r in rows or []}
    out = []
    for d in days:
        r = by.get(d) or {}
        miss = [x for x in cols if r.get(x) is None]
        if miss:
            out.append((d, miss))
    return out


def trading_days(env, n):
    _, a = bs._sb(env, "/taiex_daily", params=[("select", "trade_date"), ("order", "trade_date.desc"), ("limit", str(n + 5))])
    _, b = bs._sb(env, "/price_window", params=[("select", "trade_date"), ("code", "eq.2330"),
                                                ("order", "trade_date.desc"), ("limit", str(n + 5))])
    s = {str(x["trade_date"])[:10] for x in (a or []) + (b or []) if isinstance(x, dict)}
    return sorted(s)[-n:]


def _has(env, t, c, d):
    try:
        st, r = bs._sb(env, "/" + t, params=[("select", c), (c, f"eq.{d}"), ("limit", "1")])
        return bool(r) if st == 200 else None
    except Exception:                                           # noqa: BLE001
        return None


def _latest(env, t, c):
    try:
        st, r = bs._sb(env, "/" + t, params=[("select", c), ("order", c + ".desc"), ("limit", "1")])
        return str(r[0][c])[:10] if st == 200 and r else None
    except Exception:                                           # noqa: BLE001
        return None


def scan(env, days=10):
    """回 (交易日list, [(表,中文名,缺日list,補救)], [(表,中文名,最新日,補救)])。"""
    tds = trading_days(env, days)
    if not tds:
        return [], [], []

    def one(spec):
        t, c, name, fix = spec
        res = {d: _has(env, t, c, d) for d in tds}
        if all(v is None for v in res.values()):
            return (t, name, ["查詢失敗"], fix)
        first = next((d for d in tds if res[d]), None)
        if first is None:
            return (t, name, ["整段無資料"], fix)
        miss = [d for d in tds if d >= first and res[d] is False]
        return (t, name, miss, fix)

    with ThreadPoolExecutor(8) as ex:
        gaps = [g for g in ex.map(one, DAILY) if g[2]]
        lat = list(ex.map(lambda s: (s[0], s[2], _latest(env, s[0], s[1]), s[3]), LATEST))
    stale = [x for x in lat if not x[2] or x[2] < tds[-1]]
    return tds, gaps, stale


def problems(env, days=10):
    """給 job_health 用：回中文問題清單（空＝正常）。"""
    tds, gaps, stale = scan(env, days)
    return _describe(tds, gaps, stale) + _describe_kpi(kpi_blank(env, tds) if tds else [])


def _describe(tds, gaps, stale):
    if not tds:
        return ["讀不到交易日曆（taiex_daily / price_window）"]
    out = [f"{name}（{t}）缺 {len(m)} 天：{'、'.join(x[5:] if len(x) == 10 else x for x in m)} → 補救：{fix}"
           for t, name, m, fix in gaps]
    out += [f"{name}（{t}）停在 {d or '無'}，最新交易日 {tds[-1]} → 補救：{fix}" for t, name, d, fix in stale]
    return out


def _describe_kpi(blank):
    t, _, name, _, fix = KPI
    return [f"{name}（{t}）{d} 空白欄位：{'、'.join(m)} → 補救：{fix}" for d, m in blank]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--days", type=int, default=10, help="檢查最近幾個交易日（預設 10）")
    args = ap.parse_args()
    env = bs._load_env()
    tds, gaps, stale = scan(env, args.days)
    if not tds:
        print("讀不到交易日曆"); return 1
    print(f"交易日 {tds[0]} ~ {tds[-1]}（{len(tds)} 天），每日表 {len(DAILY)} 張、快照表 {len(LATEST)} 張")
    blank = kpi_blank(env, tds)
    for p in _describe(tds, gaps, stale) + _describe_kpi(blank):
        print("  ✗ " + p)
    if not gaps and not stale and not blank:
        print("  ✓ 全部齊全")
    return 0


if __name__ == "__main__":
    sys.exit(main())
