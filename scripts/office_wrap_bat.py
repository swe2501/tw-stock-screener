r"""
office_wrap_bat.py - 產生「每一步經 office_step.py 打卡」的批次檔（AI 研究室，2026-10-27）

python office_wrap_bat.py <批次檔> [輸出檔]   → 不改原檔，寫到輸出檔（預設 <批次檔>.next）
只改寫「"python.exe" "...\scripts\xxx.py" 參數 >> log 2>&1」這種行，其餘原樣保留；
已經包過 office_step.py 的行不重複包。輸出純 ASCII、CRLF。
"""
import re
import sys
from pathlib import Path

AGENT = {
    # 籌碼分析師
    "wantgoo_daily_job": "chip", "otc_broker_daily": "chip", "chip_etl_twse": "chip", "chip_etl_tpex": "chip",
    "inst_daily_push": "chip", "holder_flow_push": "chip", "daytrade_etl": "chip", "broker_signals": "chip",
    "broker_highwin": "chip", "broker_rankings": "chip", "sell_tracker": "chip", "gov_broker": "chip",
    "gov_broker_moneylink": "chip", "upload_institutional": "chip", "inst_market": "chip",
    # 技術分析師
    "fetch_prices": "tech", "fetch_prices_otc": "tech", "fetch_hourly": "tech", "upload_price_window": "tech",
    "compute_strength": "tech", "compute_box": "tech", "stock_sr": "tech", "liquidity_top": "tech", "mingdeng": "tech",
    "intraday_push": "tech",
    # 總經研究員
    "ust_yields_push": "macro", "macro_env_push": "macro", "market_indicators": "macro", "index_history": "macro",
    "home_intraday": "macro", "fetch_otc_index": "macro", "futures_market": "macro", "options_market": "macro",
    "txo_history": "macro", "option_sr": "macro", "foreign_hedge": "macro",
    # 風控
    "margin_ratio": "risk", "margin_maintenance_calc": "risk", "margin_market": "risk", "compute_greed": "risk",
    "breadth_daily": "risk", "breadth_ext": "risk", "sector_turnover": "risk", "otc_market": "risk",
    # ETF 研究員
    "upload_etf": "etf", "wantgoo_etf": "etf", "wantgoo_etf_flow": "etf", "upload_etf_div": "etf",
    "upload_etf_holders": "etf", "etf_daily": "etf", "active_etf_flow": "etf", "upload_active_etf_holdings": "etf",
    # 新聞研究員
    "upload_hot_topics": "news", "macro_events": "news", "mops_announce": "news", "catalyst_lawshow": "news",
    "run_codex_topics": "news", "news_feed": "news",
    # 資料管理員
    "upload_otc_names": "data", "sj_daily": "data", "upload_exdiv_factor": "data", "gen_listed_codes": "data", "backfill_gaps": "data",
    "fundamentals": "data", "themes_push": "data", "page_cache_push": "data", "job_health": "data",
    "chip_brief": "data", "daily_slogan_rotate": "data", "free_float": "data", "dividends_push": "data",
    "goodinfo_concepts": "data",
}
LINE = re.compile(r'^(?P<py>"[^"]*python\.exe")\s+"(?P<script>[^"]*\\scripts\\(?P<name>[A-Za-z0-9_]+)\.py)"(?P<rest>.*)$')


def wrap(text):
    out, n, unknown = [], 0, []
    for line in text.replace("\r\n", "\n").split("\n"):
        m = LINE.match(line)
        if not m or "office_step.py" in line:
            out.append(line)
            continue
        name = m.group("name")
        agent = AGENT.get(name)
        if not agent:
            unknown.append(name)
            out.append(line)
            continue
        step = m.group("script").rsplit("\\", 1)[0] + "\\office_step.py"
        out.append(f'{m.group("py")} "{step}" {agent} "{m.group("script")}"{m.group("rest")}')
        n += 1
    return "\r\n".join(out), n, unknown


if __name__ == "__main__":
    src = Path(sys.argv[1])
    dst = Path(sys.argv[2]) if len(sys.argv) > 2 else src.with_suffix(src.suffix + ".next")
    text, n, unknown = wrap(src.read_text(encoding="ascii"))
    text.encode("ascii")                                    # 批次檔只能有英文，有非 ASCII 會丟例外
    dst.write_bytes(text.encode("ascii"))
    print(f"wrapped {n} steps -> {dst}; unmapped: {unknown or 'none'}")
