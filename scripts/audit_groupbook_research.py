"""Quarterly editorial coverage audit. Financial summaries never count as research reasons."""
import argparse
import datetime
import json
from pathlib import Path
from urllib.parse import urlparse
ROOT=Path(__file__).resolve().parent.parent
QUARTERS=("2025Q4","2026Q1","2026Q2","2026Q3","2026Q4")

def valid_reason(reason,quarter):
    if not isinstance(reason,dict) or not reason.get("text") or "研究觀察" not in reason["text"]:
        return False
    if not reason.get("fact_period") or not reason.get("reviewed_on"):
        return False
    urls=reason.get("source_urls",[])
    if not urls or not all(urlparse(u).scheme in ("http","https") and urlparse(u).netloc for u in urls):return False
    try:
        available=datetime.date.fromisoformat(reason.get("published_on") or reason["reviewed_on"])
        reviewed=datetime.date.fromisoformat(reason["reviewed_on"])
        year,q=int(quarter[:4]),int(quarter[-1])
        end=datetime.date(year+1,1,1) if q==4 else datetime.date(year,q*3+1,1)
        return available<end and available<=reviewed
    except (ValueError,TypeError):return False

def audit(groups,quarters=QUARTERS):
    rows=[];unique=set();expected=set()
    for group in groups:
        for quarter in quarters:
            reasons=group.get("quarterlyReasons",{}).get(quarter,{})
            missing=[];done=[]
            for member in group["members"]:
                code=member["code"];expected.add((code,quarter))
                if valid_reason(reasons.get(code),quarter):done.append(code);unique.add((code,quarter))
                else:missing.append(dict(code=code,name=member["name"]))
            rows.append(dict(group=group["name"],quarter=quarter,covered=len(done),total=len(group["members"]),missing=missing,complete=not missing))
    return dict(quarters=list(quarters),uniqueExpected=len(expected),uniqueCovered=len(unique),
                membershipExpected=sum(r["total"] for r in rows),membershipCovered=sum(r["covered"] for r in rows),
                complete=all(r["complete"] for r in rows),rows=rows)

if __name__=="__main__":
    parser=argparse.ArgumentParser();parser.add_argument("--output",type=Path);parser.add_argument("--require-complete",action="store_true");args=parser.parse_args()
    report=audit(json.loads((ROOT/"group-catalog.json").read_text(encoding="utf-8"))["groups"])
    if args.output:args.output.write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding="utf-8")
    print(f"research entries={report['uniqueCovered']}/{report['uniqueExpected']} complete={report['complete']}")
    if args.require_complete and not report["complete"]:raise SystemExit(1)
