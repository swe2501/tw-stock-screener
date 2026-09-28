"""
upload_hot_topics.py — 把 codex 產出的 hot_topics.json 驗證後上傳 Supabase hot_topics。

codex 只負責產 JSON；驗證、接地、去重、滾動窗都在這裡（codex 端越單純越不出錯）：
  1. 每筆必須有 topic 與非空 source_urls（沒來源 → 丟，防幻覺）。
  2. codes 逐一對 tw_listed_codes.json（上市＋上櫃）；不在清單的代號剔除、名稱以官方為準；沒有任何合法代號的話題丟掉。
  3. 累積(不覆蓋)：以 src_key(新聞連結)upsert 去重，保留近 7 天新聞(published_at 更舊的裁掉)。
     每小時跑會把同題材的新聞越存越多、由新到舊，趨勢看得到一週。

用法：python scripts/upload_hot_topics.py [hot_topics.json]
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import broker_signals as bs           # noqa: E402  # _load_env / _sb

if sys.stdout and hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(errors="replace")

HERE = Path(__file__).resolve().parent
CODES = json.loads((HERE / "tw_listed_codes.json").read_text(encoding="utf-8")) \
    if (HERE / "tw_listed_codes.json").exists() else {}


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
        return None, "無合法上市櫃代號"
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
        "src_key": srcs[0],   # 累積去重鍵(以新聞連結為準)
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

    # 同批先以 src_key 去重(PostgREST upsert 同批出現相同 on_conflict 鍵會 500)
    _seen, _dedup = set(), []
    for r in good:
        k = r.get("src_key")
        if k in _seen:
            continue
        _seen.add(k)
        _dedup.append(r)
    good = _dedup

    # 累積去重上傳(不整表覆蓋):以 src_key(新聞連結)為鍵 upsert,同新聞不重複、跨小時累積成一週
    import urllib.request
    from datetime import datetime, timedelta, timezone
    key = env["SUPABASE_SERVICE_KEY"]
    url = f"{env['SUPABASE_URL']}/rest/v1/hot_topics?on_conflict=src_key"
    req = urllib.request.Request(url, data=json.dumps(good).encode(), method="POST", headers={
        "Content-Type": "application/json", "apikey": key, "Authorization": f"Bearer {key}",
        "Prefer": "resolution=merge-duplicates,return=minimal"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            ok = r.status in (200, 201, 204)
    except Exception as e:
        print(f"[error] upsert 失敗: {e}"); return
    if not ok:
        print("[error] upsert 未成功"); return

    # 保留近 7 天新聞:依 published_at 刪掉更舊的(ISO 日期字串可直接比較);另清掉沒日期又過舊的殘列
    cutoff = (datetime.now(timezone(timedelta(hours=8))) - timedelta(days=7)).strftime("%Y-%m-%d")
    d1, _ = bs._sb(env, "/hot_topics", method="DELETE", params=[("published_at", f"lt.{cutoff}")])
    ts_cut = (datetime.now(timezone.utc) - timedelta(days=8)).strftime("%Y-%m-%dT%H:%M:%S")
    bs._sb(env, "/hot_topics", method="DELETE",
           params=[("published_at", "is.null"), ("captured_at", f"lt.{ts_cut}")])
    print(f"已 upsert {len(good)} 則話題(丟棄 {len(dropped)});已裁剪 published_at < {cutoff} 的舊聞")


if __name__ == "__main__":
    main()
