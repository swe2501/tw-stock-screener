"""Quarterly editorial coverage audit. Financial summaries never count as research reasons."""
import argparse
import datetime
import json
from pathlib import Path
from urllib.parse import urlparse
ROOT=Path(__file__).resolve().parent.parent
QUARTERS=("2025Q4","2026Q1","2026Q2","2026Q3","2026Q4")

def valid_reason(reason,quarter):
    if not isinstance(reason,dict) or reason.get("status")=="not_applicable" or reason.get("kind") in ("official_revenue","official_financial") or not reason.get("text") or "研究觀察" not in reason["text"]:
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
        if not (available<end and available<=reviewed):return False
        if reason.get("review_type")=="announcement_event_research":
            import re
            if not reason.get("source_verified") or not re.fullmatch(r"[0-9a-f]{64}",str(reason.get("source_sha256",""))):return False
            if reason.get("quarter")!=quarter or not reason.get("event_title"):return False
            as_of=datetime.date.fromisoformat(reason.get("available_as_of",""))
            if not (available<=as_of<end and as_of<=reviewed):return False
            first=datetime.date(year,(q-1)*3+1,1)
            if bool(reason.get("is_background"))!=(available<first):return False
            if available<first and "歷史公告" not in reason["text"]:return False
        return True
    except (ValueError,TypeError):return False


def valid_exclusion(reason,quarter):
    """An entity not yet incorporated is resolved, never counted as a research reason."""
    if not isinstance(reason,dict) or reason.get("status")!="not_applicable" or reason.get("exclusion_basis")!="not_yet_incorporated":return False
    if not reason.get("text") or not reason.get("source_urls"):return False
    if not all(urlparse(u).scheme in ("http","https") and urlparse(u).netloc for u in reason["source_urls"]):return False
    try:
        established=datetime.date.fromisoformat(reason["applicable_from"])
        published=datetime.date.fromisoformat(reason["published_on"])
        reviewed=datetime.date.fromisoformat(reason["reviewed_on"])
        year,q=int(quarter[:4]),int(quarter[-1])
        end=datetime.date(year+1,1,1) if q==4 else datetime.date(year,q*3+1,1)
        return established>=end and established<=published<=reviewed
    except (KeyError,ValueError,TypeError):return False

def audit(groups,quarters=QUARTERS):
    rows=[];unique=set();excluded=set();expected=set();background=set();types={}
    for group in groups:
        for quarter in quarters:
            reasons=group.get("quarterlyReasons",{}).get(quarter,{})
            missing=[];done=[];not_applicable=[]
            for member in group["members"]:
                code=member["code"];expected.add((code,quarter))
                if valid_reason(reasons.get(code),quarter):
                    done.append(code);unique.add((code,quarter))
                    if reasons[code].get("is_background"):background.add((code,quarter))
                    types[(code,quarter)]=reasons[code].get("review_type","sourced_research")
                elif valid_exclusion(reasons.get(code),quarter):not_applicable.append(code);excluded.add((code,quarter))
                else:missing.append(dict(code=code,name=member["name"]))
            rows.append(dict(group=group["name"],quarter=quarter,covered=len(done),total=len(group["members"]),missing=missing,notApplicable=not_applicable,complete=not missing))
    return dict(quarters=list(quarters),uniqueExpected=len(expected),uniqueCovered=len(unique),uniqueNotApplicable=len(excluded),uniqueResolved=len(unique|excluded),uniqueHistoricalBackground=len(background),
                researchTypes={kind:sum(v==kind for v in types.values()) for kind in sorted(set(types.values()))},
                membershipExpected=sum(r["total"] for r in rows),membershipCovered=sum(r["covered"] for r in rows),membershipNotApplicable=sum(len(r["notApplicable"]) for r in rows),
                complete=all(r["complete"] for r in rows),rows=rows)

if __name__=="__main__":
    parser=argparse.ArgumentParser();parser.add_argument("--output",type=Path);parser.add_argument("--require-complete",action="store_true");args=parser.parse_args()
    from groupbook_research_catalog import load_groups
    report=audit(load_groups())
    if args.output:args.output.write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding="utf-8")
    print(f"research entries={report['uniqueCovered']}/{report['uniqueExpected']} not applicable={report['uniqueNotApplicable']} complete={report['complete']}")
    if args.require_complete and not report["complete"]:raise SystemExit(1)
