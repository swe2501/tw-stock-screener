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

ROOT = Path(__file__).resolve().parent.parent
WINDOWS = (5, 10, 20)


def build_snapshots(env):
    spec = importlib.util.spec_from_file_location("groupbook_screen", ROOT / "api" / "screen.py")
    screen = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(screen)
    screen.SUPABASE_URL = env.get("SUPABASE_URL", "")
    screen.SUPABASE_KEY = env.get("SUPABASE_ANON_KEY") or env.get("SUPABASE_SERVICE_KEY", "")
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
        rows.append(dict(kind=f"groupbook_{window}", trade_date=data["date"], payload=data, updated_at=stamp))
    return rows


def publish(env, rows):
    key = env.get("SUPABASE_SERVICE_KEY")
    if not key:
        raise ValueError("SUPABASE_SERVICE_KEY is required for snapshot publication")
    request = urllib.request.Request(
        env["SUPABASE_URL"] + "/rest/v1/page_cache?on_conflict=kind",
        data=json.dumps(rows, ensure_ascii=False).encode("utf-8"), method="POST",
        headers={"Content-Type": "application/json", "apikey": key, "Authorization": "Bearer " + key,
                 "Prefer": "resolution=merge-duplicates,return=minimal"})
    with urllib.request.urlopen(request, timeout=60) as response:
        if response.status not in (200, 201, 204):
            raise RuntimeError("Snapshot publication failed")


def run(env, dry_run=False):
    if not dry_run and not env.get("SUPABASE_SERVICE_KEY"):
        raise ValueError("SUPABASE_SERVICE_KEY is required")
    rows = build_snapshots(env)
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
