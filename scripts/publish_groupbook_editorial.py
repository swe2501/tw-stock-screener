"""Publish reviewed quarterly reasons as new historical versions; retain existing numeric evidence."""
import datetime
import importlib.util
import json
from pathlib import Path
from audit_groupbook_research import audit,valid_reason
from groupbook_precompute import publish
ROOT=Path(__file__).resolve().parent.parent

def run(env):
    if not env.get("SUPABASE_SERVICE_KEY"):raise ValueError("Service key required")
    spec=importlib.util.spec_from_file_location("editorial_screen",ROOT/"api/screen.py")
    screen=importlib.util.module_from_spec(spec);spec.loader.exec_module(screen)
    screen.SUPABASE_URL=env["SUPABASE_URL"];screen.SUPABASE_KEY=env.get("SUPABASE_ANON_KEY") or env["SUPABASE_SERVICE_KEY"]
    groups=json.loads((ROOT/"group-catalog.json").read_text(encoding="utf-8"))["groups"]
    report=audit(groups);rows=[]
    for quarter in report["quarters"]:
        editorial={g["name"]:{c:r for c,r in g.get("quarterlyReasons",{}).get(quarter,{}).items() if valid_reason(r,quarter)} for g in groups}
        editorial={name:reasons for name,reasons in editorial.items() if reasons}
        if not editorial:continue
        status,prior=screen._cache_sb("/page_cache",params=screen._snapshot_params("groupbook_research_"+quarter))
        if status!=200 or not isinstance(prior,list):raise RuntimeError("Cannot verify previous snapshot; nothing published")
        data=dict(prior[0]["payload"]) if prior else dict(quarter=quarter,stocks={},financials={},date=None)
        data.pop("snapshotId",None);data.pop("generatedAt",None)
        # Merge reviewed entries; omission from today's source must not erase previous research.
        existing={name:dict(reasons) for name,reasons in data.get("editorial",{}).items()}
        for name,reasons in editorial.items():existing.setdefault(name,{}).update(reasons)
        data["editorial"]=existing;data["editorialCoverage"]=[r for r in report["rows"] if r["quarter"]==quarter]
        data["editorialReviewedOn"]=datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=8))).date().isoformat()
        rows.append(dict(kind="groupbook_research_"+quarter,trade_date=data.get("date"),payload=data))
    publish(env,rows)
    print(f"editorial snapshots={len(rows)}; coverage={report['uniqueCovered']}/{report['uniqueExpected']}; complete={report['complete']}")
    return report
