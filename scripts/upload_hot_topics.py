"""
upload_hot_topics.py — 把 codex 產出的 hot_topics.json 驗證後上傳 Supabase hot_topics。

codex 只負責產 JSON；驗證、接地、去重、滾動窗都在這裡（codex 端越單純越不出錯）：
  1. 每筆必須有 topic 與非空 source_urls（沒來源 → 丟，防幻覺）。
  2. codes 逐一對 tw_listed_codes.json；不在清單的代號剔除、名稱以官方為準；沒有任何合法代號的話題丟掉。
  3. 滾動 48 小時：先刪 captured_at 超過 48h 的舊列，再上傳本批（captured_at 由 DB 預設 now()）。

用法：python scripts/upload_hot_topics.py [hot_topics.json]
"""
import json
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import broker_signals as bs           # noqa: E402  # _load_env / _sb

if sys.stdout and hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(errors="replace")

HERE = Path(__file__).resolve().parent
CODES = json.loads((HERE / "tw_listed_codes.json").read_text(encoding="utf-8")) \
    if (HERE / "tw_listed_codes.json").exists() else {}
ROLL_HOURS = 48


def _clean_record(r):
    topic = str(r.get("topic") or "").strip()
    srcs = [u for u in (r.get("source_urls") or []) if isinstance(u, str) and u.startswith("http")]
    if not topic or not srcs:
        return None, "缺 topic 或 source_urls"
    codes = []
    seen = set()
    for c in (r.get("codes") or []):
        code = str((c or {}).get("code") or "").strip()
        if code in CODES and code not in seen:
            seen.add(code)
            codes.append({"code": code, "name": CODES[code]["name"]})
    if CODES and not codes:
        return None, "無合法上市代號"
    heat = r.get("heat")
    try:
        heat = max(0, min(100, int(heat)))
    except (TypeError, ValueError):
        heat = None
    return {
        "topic": topic[:200],
        "sector": (str(r.get("sector") or "").strip() or None),
        "summary": (str(r.get("summary") or "").strip()[:500] or None),
        "codes": codes,
        "source_urls": srcs[:8],
        "heat": heat,
        "published_at": (str(r.get("published_at") or "").strip() or None),
    }, None


def main():
    path = Path(sys.argv[1]) if len(sys.argv) > 1 else HERE / "hot_topics.json"
    if not path.exists():
        print(f"[error] 找不到 {path}"); sys.exit(1)
    env = bs._load_env()
    if not env.get("SUPABASE_SERVICE_KEY"):
        print("[error] 缺 SUPABASE_SERVICE_KEY，中止"); sys.exit(1)

    raw = json.loads(path.read_text(encoding="utf-8"))
    if isinstance(raw, dict):
        raw = raw.get("topics") or [raw]
    good, dropped = [], []
    for r in raw:
        rec, why = _clean_record(r)
        (good.append(rec) if rec else dropped.append((r.get("topic", "?"), why)))
    for t, why in dropped:
        print(f"  丟棄「{t}」：{why}")
    if not good:
        print("本批無有效話題，未更動資料庫"); return

    cutoff = (datetime.now(timezone.utc) - timedelta(hours=ROLL_HOURS)).isoformat()
    bs._sb(env, "/hot_topics", method="DELETE", params=[("captured_at", f"lt.{cutoff}")])
    st, resp = bs._sb(env, "/hot_topics", method="POST", body=good)
    if st in (200, 201):
        print(f"已上傳 {len(good)} 則話題（丟棄 {len(dropped)}）到 hot_topics")
    else:
        print(f"[error] 上傳失敗 ({st}): {resp}")


if __name__ == "__main__":
    main()
