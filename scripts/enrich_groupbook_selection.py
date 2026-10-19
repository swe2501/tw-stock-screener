"""Build reproducible selection reviews from captured official disclosures, never infer orders."""
import argparse
import datetime as dt
import hashlib
import json
import math
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
AS_OF = "2026-10-17"
PERIODS = [(2026, 2), (2026, 1), (2025, 4), (2025, 3), (2025, 2)]


def number(value):
    try:
        result = float(str(value).replace(",", ""))
        return result if math.isfinite(result) else None
    except (TypeError, ValueError):
        return None


def metrics(row):
    def get(*keys):
        return next((number(row[k]) for k in keys if k in row and number(row[k]) is not None), None)
    return dict(revenue=get("營業收入"), operating_profit=get("營業利益（損失）", "營業利益"),
                gross_profit=get("營業毛利（毛損）淨額", "營業毛利（毛損）"),
                parent_profit=get("淨利（淨損）歸屬於母公司業主", "淨利（損）歸屬於母公司業主"),
                pretax_profit=get("稅前淨利（淨損）", "繼續營業單位稅前損益", "繼續營業單位稅前淨利（淨損）"),
                eps=get("基本每股盈餘（元）"))


def period_matches(title, year, quarter):
    if not re.search(r"財務報告|財報", title) or re.search(r"預計|召開日期|更正|重編|代.*子公司|子公司.*董事會", title):
        return False
    if not re.search(str(year - 1911) + r"年|" + str(year) + r"年", title):
        return False
    q = re.search(r"第?([一二三四1234])季", title)
    if quarter == 4:
        return not q or q[1] in "四4"
    return bool(q and q[1] in {1: "一1", 2: "二2", 3: "三3"}[quarter])


def quarter_bounds(quarter):
    year, q = int(quarter[:4]), int(quarter[-1])
    first = f"{year}-{(q-1)*3+1:02d}-01"
    end = dt.date(year + 1, 1, 1) if q == 4 else dt.date(year, q*3 + 1, 1)
    return first, min((end - dt.timedelta(days=1)).isoformat(), AS_OF)


def financial_review(code, quarter, captures, announcements):
    first, cutoff = quarter_bounds(quarter)
    for year, q in PERIODS:
        end = dt.date(year + 1, 1, 1) if q == 4 else dt.date(year, q*3 + 1, 1)
        if end.isoformat() > cutoff:
            continue
        disclosed = [a for a in announcements.get(code, []) if
                     end.isoformat() <= a["published_on"] <= cutoff and period_matches(a["title"], year, q)]
        capture = next((c for c in captures if c["period"] == f"{year}Q{q}" and code in c["rows"]), None)
        if not disclosed or not capture:
            continue
        announcement = min(disclosed, key=lambda a: a["published_on"])
        previous = next((c for c in captures if c["period"] == f"{year-1}Q{q}" and code in c["rows"]), None)
        current = metrics(capture["rows"][code])
        prior = metrics(previous["rows"][code]) if previous else {}
        label = f"{year}全年" if q == 4 else f"{year}年前{q}季累計"
        facts = []
        if current["revenue"] is not None:
            facts.append(f"{label}營收{current['revenue']/100000:.2f}億元")
            base = prior.get("revenue")
            if base is not None and base > 0:
                facts[-1] += f"，較去年同期{(current['revenue']/base-1)*100:+.1f}%"
        if current["eps"] is not None:
            facts.append(f"累計EPS {current['eps']:.2f}元" +
                         (f"，去年同期{prior['eps']:.2f}元" if prior.get("eps") is not None else ""))
        risks, observations = [], []
        if current["operating_profit"] is not None and current["revenue"] is not None and current["revenue"] > 0:
            margin = current["operating_profit"] / current["revenue"] * 100
            facts.append(f"累計營業利益率{margin:.2f}%")
            if prior.get("revenue") is not None and prior["revenue"] > 0 and prior.get("operating_profit") is not None:
                change = margin - prior["operating_profit"] / prior["revenue"] * 100
                facts[-1] += f"，較去年同期{change:+.2f}個百分點"
                observations.append("營業利益率改善，可追蹤收入是否轉為本業獲利" if change > 0 else
                                    "營業利益率未較去年同期提高，不能只用營收成長推論獲利改善")
            if current["operating_profit"] < 0:
                risks.append("本業仍為營業虧損；題材或資本事件尚不能替代本業轉盈證據")
            if current["pretax_profit"] and current["pretax_profit"] > 0 and current["operating_profit"] < current["pretax_profit"] * .5:
                risks.append("營業利益不足稅前利益一半，須拆查業外及一次性損益，不能把全部獲利當成產品競爭力")
        if current["eps"] is not None and current["eps"] < 0:
            risks.append("累計EPS為負，仍需驗證虧損收斂、資金負擔與商業化時程")
        if current["eps"] is not None and prior.get("eps") is not None:
            observations.append("EPS較去年同期提高，但每股數字仍受股本與業外影響" if current["eps"] > prior["eps"] else
                                "EPS未高於去年同期，尚不能以這份報表支持獲利加速成長")
        financial_sector = current["revenue"] is None
        if financial_sector:
            risks.append("此業別不套用一般製造業營收／毛利率；應另核對利息、投資、承保或交易損益及資本適足性")
        sources = [dict(url=capture["source_url"], title=f"公開資訊觀測站 {label}損益表", sha256=capture["sha256"]),
                   dict(url=announcement["source_url"], title=announcement["title"], published_on=announcement["published_on"])]
        if previous:
            sources.append(dict(url=previous["source_url"], title="去年同期損益表", sha256=previous["sha256"]))
        return dict(period=f"{year}Q{q}", basis="year_to_date", published_on=announcement["published_on"],
                    is_background=announcement["published_on"] < first, metrics=current, previous_metrics=prior,
                    text="；".join(facts) + "。", observations=observations, risks=risks, sources=sources,
                    version_note="歷史報表為本次回看取得的版本，可能含事後重編；不是當時保存的報表版本，不作回測訊號。")
    return None


def operating_review(record, quarter):
    first, cutoff = quarter_bounds(quarter)
    if not record.get("verified") or not first <= record["event"]["published_on"] <= cutoff:
        raise ValueError("Operating source identity/date not verified")
    event = record["event"]
    if re.search(r"研發主管|研發長|研發中心|研發大樓|說明會|延期|任命|監事|異動|運算中心", event["title"]):
        return None
    if event["code"] not in " ".join(" ".join(row) for row in record["fields"][:4]):
        raise ValueError("Operating source issuer mismatch")
    facts = record["facts"].strip()
    if len(facts) < 50:
        raise ValueError("Operating disclosure lacks substantive body")
    # Select substantive numbered disclosure fields, not meeting logistics or contact details.
    points = re.split(r"(?<!\d)(?:\d{1,2})[.．](?!\d)", facts)
    selected=[]
    for point in points:
        split=re.split(r"[:：]",point.strip(),maxsplit=1)
        if len(split)!=2: continue
        label, value=split
        if re.search(r"發生緣由|因應措施|目前研發階段|研發新藥|市場規模|預期|影響|其他應敘明|主要內容|投資計畫|具體目的|事實發生",label) and value.strip() not in ("無","無。","不適用","不適用。"):
            selected.append(label.strip()+"："+value.strip())
    excerpt="；".join(selected) if selected else facts
    excerpt=excerpt[:650]+("…（完整內容見原始公告）" if len(excerpt)>650 else "")
    return dict(title=event["title"], published_on=event["published_on"], text=excerpt,
                source_url=event["source_url"], sha256=record["source_sha256"], facts_only=True)


def monthly_review(code, quarter, captures):
    first, cutoff=quarter_bounds(quarter)
    start=dt.date.fromisoformat(first)-dt.timedelta(days=1)
    last=dt.date.fromisoformat(cutoff).replace(day=1)-dt.timedelta(days=1)
    rows=[]
    for capture in sorted(captures,key=lambda c:c["period"],reverse=True):
        if not f"{start.year}-{start.month:02d}" <= capture["period"] <= f"{last.year}-{last.month:02d}":continue
        row=capture["rows"].get(code)
        if not row:continue
        rev=number(row["revenue_thousands"])
        if rev is None:continue
        note=row["note"].strip()
        substantive=bool(re.search(r"客戶|訂單|出貨|需求|產品|銷售|產能|營建|工程|交屋|承攬|業務|市場",note))
        rows.append(dict(period=capture["period"],revenue_thousands=rev,yoy=number(row["yoy"]),
                         note=note if substantive else "",source_url=capture["source_url"],sha256=capture["sha256"],
                         publication_date_verified=False,
                         version_note="本次查得的歷史月報版本；此表未逐筆證明原始公告日，僅作營運回看背景，不作當時可交易訊號。"))
    return rows


def build_review(code, quarter, record, financial, operating, monthly=None):
    # No invented product, customer, order, market-share or shareholding claims.
    category = record.get("event_kind", "")
    first, cutoff = quarter_bounds(quarter)
    contemporaneous = first <= record.get("published_on", "") <= cutoff
    separately_reviewed = record.get("review_type") == "sourced_research" or (
        not category and bool(record.get("text")) and bool(record.get("source_urls")))
    commercial = operating is not None or (separately_reviewed and contemporaneous)
    observations = list(financial["observations"]) if financial else []
    risks = list(financial["risks"]) if financial else []
    monthly=monthly or []
    specific_notes=[m for m in monthly if m["note"]]
    if operating:
        observations.insert(0, f"本季有公司原始營運／產品進展揭露：{operating['title']}。公告內容見下方，進展階段須與實際出貨／營收分開。")
        title = operating["title"]
        if re.search("臨床|新藥|研發|藥證", title):
            risks.insert(0, "臨床、送件、核准與銷售分階段核對；目前進展不能直接換算授權金、藥品銷售或獲利")
        elif re.search("合作|合約|訂單|接單|授權", title):
            risks.insert(0, "先核對契約主體、承諾數量、金額與履約條件；簽約或合作不等於已出貨及已認列收入")
    elif commercial:
        observations.insert(0, "本季已有另行核對的公司營運資料；以下原始研究保留實際產品／業務進展及期間，仍須區分展望與實現。")
    elif category in ("capex", "investment", "merger", "contract", "development") and contemporaneous:
        observations.insert(0, "本季資本／業務事件提供具體檢核方向；先核對原文標的、資金用途及執行階段，再判斷能否成為營運催化。")
        risks.insert(0, "交易、投資或採購本身不足以證實這家公司取得新客戶訂單，須再有出貨、驗收或收入證據")
    else:
        observations.insert(0, "現有事件尚不足以支持當季產品需求或接單題材；股利、庫藏股、融資及保證等事件不能代替營運成長證據。")
    if specific_notes:
        observations.append("另有公司月營收附註可核對實際出貨／需求變動，見下方所屬月份；它是營運回看，不能推論為未來訂單或整季同向成長。")
    if monthly and monthly[0]["yoy"] is not None and monthly[0]["yoy"] < 0:
        risks.append(f"最近可參照的{monthly[0]['period']}月營收年減{abs(monthly[0]['yoy']):.2f}%，須先核對需求、出貨時點與比較基期，不能只採用正面題材")
    if code == "3454" and quarter != "2025Q4":
        risks.insert(0,"晶睿已公告2026-03-27終止上市；該日之後不再視為可獨立交易的上市標的，保留集團及歷史研究用途")
    if not financial:
        risks.append("未取得能與季度截止前財報公告對上的損益表；保留缺資料，不用其他公司或較晚季度補值")
    if record.get("is_background"):
        risks.append("原研究事件為歷史背景；本季是否仍有效，不能由舊公告推定")
    if not commercial:
        risks.append("當季產業需求、客戶／接單及集團間實際傳導仍待直接證據；不列為已證實的當季受惠")
    risks.append("已揭露營運不等於Word描述的季底資金行為成立；仍須獨立核對持股、資金與價格資料")
    status="operating_evidence_available" if commercial else "historical_operating_context" if specific_notes else "commercial_catalyst_unconfirmed"
    return dict(schema_version=1, code=code, quarter=quarter, reviewed_on=AS_OF,
                status=status,
                conclusion="有本季營運披露，可進一步研究" if commercial else "有月報營運說明，當季催化仍待確認" if specific_notes else "當季營運催化尚未證實",
                observations=observations, counter_evidence=risks,
                financial=financial, operating_disclosure=operating,monthly=monthly,
                method="公司披露與財務比較的研究檢核；不以模板或財務成長推定訂單、股權關係或股價走勢")


def run(evidence_dir, write=False):
    evidence_dir = Path(evidence_dir)
    data_path = ROOT/"data/groupbook-quarterly-research.json"
    data = json.loads(data_path.read_text(encoding="utf-8"))
    catalog = json.loads((ROOT/"group-catalog.json").read_text(encoding="utf-8"))["groups"]
    # Preserve reviewed catalog text; enrich all copies with the same independent evidence.
    preferred = {}
    for group in catalog:
        for q, records in group.get("quarterlyReasons", {}).items():
            for code, record in records.items(): preferred[(q, code)] = record
    captures = [json.loads(p.read_text(encoding="utf-8")) for p in (evidence_dir/"financial-depth").glob("*.json")]
    if len(captures) != 18: raise ValueError("Historical financial source collection is incomplete")
    for capture in captures:
        p = evidence_dir/"financial-depth"/(capture["period"]+"-"+("otc" if "TYPEK=otc" in capture["source_url"] else "sii")+".html")
        if hashlib.sha256(p.read_bytes()).hexdigest() != capture["sha256"]: raise ValueError("Financial evidence hash mismatch")
    monthly=[json.loads(p.read_text(encoding="utf-8")) for p in (evidence_dir/"monthly-depth").glob("*.json")]
    if len(monthly)!=26:raise ValueError("Historical monthly evidence collection is incomplete")
    for capture in monthly:
        market="otc" if "/otc/" in capture["source_url"] else "sii"
        p=evidence_dir/"monthly-depth"/(capture["period"]+"-"+market+".html")
        if hashlib.sha256(p.read_bytes()).hexdigest()!=capture["sha256"]:raise ValueError("Monthly evidence hash mismatch")
    announcements = {}
    for event in json.loads((evidence_dir/"announcements-index.json").read_text(encoding="utf-8")):
        announcements.setdefault(event["code"], []).append(event)
    operating={}
    for item in json.loads((evidence_dir/"depth-operating-evidence.json").read_text(encoding="utf-8")):
        review=operating_review(item,item["quarter"])
        if review: operating[(item["quarter"],item["event"]["code"])]=review
    counts = dict(reviewed=0, financial=0, operating_disclosure=0, commercial_catalyst_unconfirmed=0,
                  operating_evidence_available=0,historical_operating_context=0,monthly=0)
    for quarter, records in data["quarters"].items():
        for code, record in records.items():
            if record.get("status") == "not_applicable": continue
            base = preferred.get((quarter, code), record)
            financial = financial_review(code, quarter, captures, announcements)
            op = operating.get((quarter,code))
            months=monthly_review(code,quarter,monthly)
            review = build_review(code, quarter, base, financial, op,months)
            record["selection_review"] = review
            counts["reviewed"] += 1
            counts["financial"] += bool(financial)
            counts["operating_disclosure"] += bool(op)
            counts["monthly"] += bool(months)
            counts[review["status"]] += 1
    data["selectionReviewSummary"] = counts
    if counts["reviewed"] != 2812: raise ValueError("Unexpected selection coverage")
    if write:
        data_path.write_text(json.dumps(data,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
        source_path=ROOT/"data/groupbook-research-sources.json"
        source_data=json.loads(source_path.read_text(encoding="utf-8"))
        sources={s["source_url"]:s for s in source_data["sources"]}
        for capture in captures+monthly:
            sources[capture["source_url"]]=dict(source_url=capture["source_url"],source_sha256=capture["sha256"],reviewed_on=AS_OF,
                verification="captured_official_historical_table",period=capture["period"],point_in_time_version=False)
        for quarter,records in data["quarters"].items():
            for code,record in records.items():
                review=record.get("selection_review",{})
                financial=review.get("financial")
                for source in financial["sources"] if financial else []:
                    sources.setdefault(source["url"],dict(source_url=source["url"],source_sha256=source.get("sha256"),reviewed_on=AS_OF,
                        published_on=source.get("published_on"),verification="official_financial_approval_index_reference"))
                op=review.get("operating_disclosure")
                if op:sources[op["source_url"]]=dict(source_url=op["source_url"],source_sha256=op["sha256"],reviewed_on=AS_OF,
                    published_on=op["published_on"],verification="captured_original_operating_disclosure",code=code)
        source_data["sources"]=list(sources.values())
        source_path.write_text(json.dumps(source_data,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print(json.dumps(counts, ensure_ascii=False))
    return data


if __name__ == "__main__":
    parser=argparse.ArgumentParser();parser.add_argument("--evidence-dir",required=True);parser.add_argument("--write",action="store_true")
    args=parser.parse_args();run(args.evidence_dir,args.write)
