"""
catalyst_exhibitions.py — 種「產業展覽」行事曆到 Supabase catalyst_events（event_type='展覽'）。

展覽是題材/族群層級(無單一 code),用 sector 標族群。貪婪指標的「展覽鄰近」會用
stock 所屬 hot_topics.sector 去對這裡的 sector(模糊比對),算開幕倒數天數。

原則：只放「確認過的真實展期」，不臆測日期。要新增展覽 → 加進 EXHIBITIONS 再跑一次。
每次整批換掉 event_type='展覽' 的列。用法：python scripts/catalyst_exhibitions.py
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import broker_signals as bs           # noqa: E402

if sys.stdout and hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(errors="replace")

# 只列確認過的真實展期（YYYY-MM-DD）。sector 用族群/題材名，供貪婪指標對照。
EXHIBITIONS = [
    {"sector": "機器人", "start": "2026-08-19", "end": "2026-08-22",
     "title": "台北國際自動化工業大展（自動化展）", "note": "工業機器人/機械手臂/機器視覺/工業電腦"},
    {"sector": "半導體設備", "start": "2026-09-02", "end": "2026-09-04",
     "title": "SEMICON Taiwan 國際半導體展", "note": "半導體設備/材料/先進封裝/智慧製造"},
]
SRC = "curated"


def main():
    env = bs._load_env()
    if not env.get("SUPABASE_SERVICE_KEY"):
        print("[error] 缺 SUPABASE_SERVICE_KEY，中止"); sys.exit(1)
    recs = [{"event_type": "展覽", "code": None, "name": None, "sector": e["sector"],
             "start_date": e["start"], "end_date": e["end"], "title": e["title"],
             "source_url": SRC, "note": e.get("note")} for e in EXHIBITIONS]

    bs._sb(env, "/catalyst_events", method="DELETE", params=[("event_type", "eq.展覽")])
    st, resp = bs._sb(env, "/catalyst_events", method="POST", body=recs)
    if st in (200, 201):
        print(f"已種 {len(recs)} 檔展覽到 catalyst_events：")
        for e in EXHIBITIONS:
            print(f"  {e['start']}~{e['end']} [{e['sector']}] {e['title']}")
    else:
        print(f"[error] 上傳失敗 ({st}): {resp}")


if __name__ == "__main__":
    main()
