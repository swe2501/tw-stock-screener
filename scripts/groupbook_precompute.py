"""Nightly group rankings. Read prices once, publish all windows atomically.
Called by page_cache_push.py after the daily price upload. Never called by page visitors.
"""
import argparse
import datetime
import importlib.util
import json
import os
from pathlib import Path
import urllib.request
import uuid

ROOT = Path(__file__).resolve().parent.parent
WINDOWS = (5, 10, 20)


def build_snapshots(env, env_name="prod"):
    # 2026-10-21 依環境：prod 用 origin/prod 的程式寫 groupbook_N；uat 用 origin/uat 的程式寫 groupbook_N@uat
    import env_screen as es
    screen = es.load_screen(env_name, env)
    codes = sorted({c for members in screen._GROUP_BOOK_MEMBERS.values() for c in members})
    prices = screen._load_groupbook_prices(codes)
    if not prices:
        raise ValueError("No complete price dataset; previous snapshots retained")
    stamp = datetime.datetime.now(datetime.timezone.utc).isoformat()
    rows = []
    for window in WINDOWS:
        data = screen._fetch_groupbook(window, price_rows=prices)
        if data.get("error") or len(data.get("groups", [])) != len(screen._GROUP_BOOK_MEMBERS) or not any(g.get("samples", 0) for g in data["groups"]):
            raise ValueError(f"Invalid {window}-day snapshot; previous snapshots retained")
        rows.append(dict(kind=es.kind_for(f"groupbook_{window}", env_name), trade_date=data["date"], payload=data, updated_at=stamp))
    return rows


def publish(env, rows):
    key = env.get("SUPABASE_SERVICE_KEY")
    if not key:
        raise ValueError("SUPABASE_SERVICE_KEY is required for snapshot publication")
    stamp = datetime.datetime.now(datetime.timezone.utc)
    version = stamp.strftime("%Y%m%dT%H%M%S%fZ") + "_" + uuid.uuid4().hex
    history = []
    for row in rows:
        snapshot_id = row["kind"] + "__" + version
        history.append(dict(row, kind=snapshot_id, updated_at=stamp.isoformat(),
                            payload=dict(row["payload"], snapshotId=snapshot_id, generatedAt=stamp.isoformat())))
    request = urllib.request.Request(
        env["SUPABASE_URL"] + "/rest/v1/page_cache",
        data=json.dumps(history, ensure_ascii=False).encode("utf-8"), method="POST",
        headers={"Content-Type": "application/json", "apikey": key, "Authorization": "Bearer " + key,
                 "Prefer": "return=minimal"})
    with urllib.request.urlopen(request, timeout=60) as response:
        if response.status not in (200, 201, 204):
            raise RuntimeError("Snapshot publication failed")
    for row in rows:
        if row["kind"].startswith(PRUNE_PREFIX):
            prune_versions(env, row["kind"], keep=PRUNE_KEEP)


# 2026-11-01 Supabase 流量／空間：集團研究每季快照約 3.5MB，原本每次發布都另存新版、舊版永不刪
# （2026Q4 累積 21 版 53MB）。發布成功後只留最新 PRUNE_KEEP 版（讀取端一律只用最新 1 版）。
PRUNE_PREFIX = "groupbook_research_"
PRUNE_KEEP = 2


def prune_versions(env, base_kind, keep=2):
    """刪除 base_kind 的舊版本（kind = base_kind + '__' + 版號），保留最新 keep 版；回傳刪除筆數。
    PostgREST 的 like 會把 '_' 當萬用字元，故抓回後在 Python 端再精確比對前綴（避免誤刪 @uat 版）。"""
    import urllib.parse
    key = env["SUPABASE_SERVICE_KEY"]
    h = {"apikey": key, "Authorization": "Bearer " + key}
    q = urllib.parse.urlencode([("select", "kind,updated_at"), ("kind", "like." + base_kind + "__*"),
                                ("order", "updated_at.desc")])
    with urllib.request.urlopen(urllib.request.Request(env["SUPABASE_URL"] + "/rest/v1/page_cache?" + q, headers=h),
                                timeout=60) as r:
        rows = json.loads(r.read() or b"[]")
    mine = [x["kind"] for x in rows if x["kind"].startswith(base_kind + "__")]
    old = mine[keep:]
    for k in old:
        req = urllib.request.Request(env["SUPABASE_URL"] + "/rest/v1/page_cache?" + urllib.parse.urlencode([("kind", "eq." + k)]),
                                     method="DELETE", headers=dict(h, Prefer="return=minimal"))
        with urllib.request.urlopen(req, timeout=60) as r:
            if r.status not in (200, 204):
                raise RuntimeError("prune failed: " + k)
    return len(old)


def run(env, dry_run=False, env_name="prod"):
    if not dry_run and not env.get("SUPABASE_SERVICE_KEY"):
        raise ValueError("SUPABASE_SERVICE_KEY is required")
    rows = build_snapshots(env, env_name)
    if not dry_run:
        publish(env, rows)
    for row in rows:
        print(f"[groupbook] {row['kind']} date={row['trade_date']} groups={len(row['payload']['groups'])} dry_run={dry_run}")
    return rows


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--env-file", type=Path, default=ROOT / ".env.local")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    env = dict(os.environ)
    if args.env_file.exists():
        for line in args.env_file.read_text(encoding="utf-8-sig").splitlines():
            if line.strip() and not line.lstrip().startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                env[k.strip()] = v.strip().strip(chr(34)).strip(chr(39))
    run(env, args.dry_run)
