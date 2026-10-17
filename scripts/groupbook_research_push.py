"""Daily official revenue evidence for the complete group catalog; no inferred news."""
import datetime
import json
import math
import ssl
from pathlib import Path
import urllib.request
from groupbook_precompute import publish
from groupbook_research_catalog import load_groups
from audit_groupbook_research import QUARTERS
ROOT = Path(__file__).resolve().parent.parent
SOURCES = (
    ("上市", "https://openapi.twse.com.tw/v1/opendata/t187ap05_L"),
    ("上櫃", "https://www.tpex.org.tw/openapi/v1/mopsfin_t187ap05_O"),
)

def official_response(url):
    context=ssl.create_default_context()
    # Python 3.13+ strict RFC extensions reject a legacy official-site chain.
    # Keep CA, hostname, validity and signature verification enabled.
    context.verify_flags &= ~ssl.VERIFY_X509_STRICT
    request=urllib.request.Request(url,headers={"User-Agent":"groupbook-research/1.0"})
    return urllib.request.urlopen(request,timeout=60,context=context)


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
                sourceType="official_revenue",availableQuarters=list(QUARTERS), groupsCovered=sum(any(m["code"] in stocks for m in g["members"]) for g in groups))

def financial_entries(groups, datasets, today):
    codes={m["code"] for g in groups for m in g["members"]}
    result={}
    for source, rows in datasets:
        if not isinstance(rows,list): raise ValueError("Invalid financial source")
        for row in rows:
            code=str(row.get("公司代號") or row.get("SecuritiesCompanyCode") or "").strip()
            if code not in codes: continue
            year=number(row.get("年度") or row.get("Year"));season=number(row.get("季別") or row.get("Season"))
            if year is None or season is None or int(season) not in (1,2,3,4): continue
            year=int(year)+(1911 if year<1911 else 0);season=int(season)
            report=roc_date(row.get("出表日期") or row.get("Date"))
            if (year,season)>=(today.year,(today.month-1)//3+1) or report>today: continue
            eps=number(row.get("基本每股盈餘（元）"))
            if eps is None: continue
            period=f"{year} 年第 {season} 季止累計"
            value=dict(text=f"官方財報：{period}基本每股盈餘 {eps:.2f} 元。此為年初至該季累計數，不是單季 EPS。",
                       fact_period=period+"；來源出表日 "+report.isoformat(),reviewed_on=today.isoformat(),
                       source_urls=[source],year=year,season=season,eps_cumulative=eps)
            if code not in result or (year,season)>(result[code]["year"],result[code]["season"]):result[code]=value
    return result


def run(env):
    if not env.get("SUPABASE_SERVICE_KEY"): raise ValueError("Service key required")
    datasets=[]
    for _, source in SOURCES:
        with official_response(source) as response: rows=json.load(response)
        datasets.append((source,rows))
    groups=load_groups()
    today=datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=8))).date()
    data=build(groups,datasets,today)
    from concurrent.futures import ThreadPoolExecutor
    urls=["https://openapi.twse.com.tw/v1/opendata/t187ap06_L_"+kind for kind in ("ci","ins","basi","bd","mim","fh")]
    urls += ["https://www.tpex.org.tw/openapi/v1/mopsfin_t187ap06_O_"+kind for kind in ("ci","ins","basi","bd","mim")]
    def fetch_financial(url):
        with official_response(url) as response:
            return url,json.load(response)
    with ThreadPoolExecutor(max_workers=4) as pool:
        financial_data=list(pool.map(fetch_financial,urls))
    data["financials"]=financial_entries(groups,financial_data,today)
    print(f"[group research] financial coverage={len(data['financials'])}/{data['totalStocks']}")
    row=dict(kind="groupbook_research_"+data["quarter"], trade_date=data["date"], payload=data,
             updated_at=datetime.datetime.now(datetime.timezone.utc).isoformat())
    publish(env,[row])
    print(f"[group research] {data['quarter']} stocks={len(data['stocks'])}/{data['totalStocks']} groups={data['groupsCovered']}/{len(groups)} missing={','.join(data['missingCodes'])}")
    return data
