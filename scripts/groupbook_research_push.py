"""Daily official revenue evidence for the complete group catalog; no inferred news."""
import datetime
import json
import math
from pathlib import Path
import urllib.request
from groupbook_precompute import publish
ROOT = Path(__file__).resolve().parent.parent
SOURCES = (
    ("上市", "https://openapi.twse.com.tw/v1/opendata/t187ap05_L"),
    ("上櫃", "https://www.tpex.org.tw/openapi/v1/mopsfin_t187ap05_O"),
)

def number(value):
    try:
        value = float(str(value).replace(",", ""))
        return value if math.isfinite(value) else None
    except (ValueError, TypeError):
        return None

def roc_date(value):
    value = str(value)
    if len(value) != 7 or not value.isdigit():
        raise ValueError("Invalid source report date")
    return datetime.date(int(value[:3])+1911, int(value[3:5]), int(value[5:7]))

def entry(row, source, today):
    ym = str(row.get("資料年月", ""))
    if len(ym) != 5 or not ym.isdigit():
        return None
    year, month = int(ym[:3])+1911, int(ym[3:])
    period = datetime.date(year, month, 1)
    report_date = roc_date(row.get("出表日期", ""))
    if period > today.replace(day=1) or report_date > today:
        return None
    # Never label a very old monthly release as current-quarter research.
    if (today.year-year)*12+today.month-month > 3:
        return None
    rev = number(row.get("營業收入-當月營收"))
    if rev is None:
        return None
    yoy = number(row.get("營業收入-去年同月增減(%)"))
    mom = number(row.get("營業收入-上月比較增減(%)"))
    parts = [f"官方資料：{year} 年 {month} 月營收 {rev/100000:.2f} 億元（來源單位為仟元）。"]
    if yoy is not None: parts.append(f"年增減 {yoy:+.2f}%。")
    if mom is not None: parts.append(f"月增減 {mom:+.2f}%。")
    return dict(text="".join(parts), source_urls=[source], reviewed_on=today.isoformat(),
                fact_period=f"{year} 年 {month} 月營收；來源出表日 {report_date.isoformat()}",
                kind="official_revenue", revenue_month=f"{year}-{month:02d}",
                revenue_thousands=rev, yoy=yoy, mom=mom)

def build(groups, datasets, today):
    codes = {m["code"] for g in groups for m in g["members"]}
    stocks = {}
    for source, rows in datasets:
        if not isinstance(rows, list) or not rows:
            raise ValueError("Incomplete official source; previous snapshot retained")
        for row in rows:
            code = str(row.get("公司代號", "")).strip()
            if code not in codes: continue
            value = entry(row, source, today)
            if value and (code not in stocks or value["revenue_month"] > stocks[code]["revenue_month"]):
                stocks[code] = value
    if not stocks: raise ValueError("No usable official evidence")
    quarter=f"{today.year}Q{(today.month-1)//3+1}"
    editorial={g["name"]:g.get("quarterlyReasons",{}).get(quarter,{}) for g in groups if g.get("quarterlyReasons",{}).get(quarter)}
    return dict(date=today.isoformat(), quarter=quarter, editorial=editorial,
                stocks=stocks, missingCodes=sorted(codes-stocks.keys()), totalStocks=len(codes),
                sourceType="official_revenue", groupsCovered=sum(any(m["code"] in stocks for m in g["members"]) for g in groups))

def run(env):
    if not env.get("SUPABASE_SERVICE_KEY"): raise ValueError("Service key required")
    datasets=[]
    for _, source in SOURCES:
        req=urllib.request.Request(source, headers={"User-Agent":"groupbook-research/1.0"})
        with urllib.request.urlopen(req, timeout=60) as response: rows=json.load(response)
        datasets.append((source,rows))
    groups=json.loads((ROOT/"group-catalog.json").read_text(encoding="utf-8"))["groups"]
    today=datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=8))).date()
    data=build(groups,datasets,today)
    row=dict(kind="groupbook_research_"+data["quarter"], trade_date=data["date"], payload=data,
             updated_at=datetime.datetime.now(datetime.timezone.utc).isoformat())
    publish(env,[row])
    print(f"[group research] {data['quarter']} stocks={len(data['stocks'])}/{data['totalStocks']} groups={data['groupsCovered']}/{len(groups)} missing={','.join(data['missingCodes'])}")
    return data
