"""Join stock-quarter research to catalog memberships without bloating the browser catalog."""
import copy
import json
from pathlib import Path
ROOT=Path(__file__).resolve().parent.parent
RESEARCH_PATH=ROOT/"data"/"groupbook-quarterly-research.json"

def load_groups(root=ROOT):
    root=Path(root)
    groups=json.loads((root/"group-catalog.json").read_text(encoding="utf-8"))["groups"]
    path=root/"data"/"groupbook-quarterly-research.json"
    if not path.exists():raise ValueError("Reviewed quarterly research dataset is missing; existing snapshots must be retained")
    data=json.loads(path.read_text(encoding="utf-8"))
    if data.get("schemaVersion")!=1 or not data.get("complete") or not isinstance(data.get("quarters"),dict):
        raise ValueError("Invalid research catalog schema")
    codes={m["code"] for g in groups for m in g["members"]}
    for quarter,stocks in data["quarters"].items():
        if quarter not in ("2025Q4","2026Q1","2026Q2","2026Q3","2026Q4") or not isinstance(stocks,dict):
            raise ValueError("Invalid research quarter")
        if not set(stocks)<=codes:raise ValueError("Research contains an unknown stock code")
        for code,record in stocks.items():
            if record.get("code")!=code or record.get("quarter")!=quarter:
                raise ValueError("Research stock/quarter identity mismatch")
        for group in groups:
            members={m["code"] for m in group["members"]}
            added={code:copy.deepcopy(record) for code,record in stocks.items() if code in members}
            # Keep separately reviewed company reports when a rule-organized event note also exists.
            added.update(group.get("quarterlyReasons",{}).get(quarter,{}))
            if added:group.setdefault("quarterlyReasons",{})[quarter]=added
    return groups
