"""
supabase_backup.py — 以 service key 透過 PostgREST 把所有 public 表資料全量匯出成 JSON（資料備份）。
schema/DDL 以 repo 的 sql/*.sql 為準；本腳本備份「資料」，供誤改/誤刪時還原。
用法：python scripts/supabase_backup.py
"""
import sys, json, time, ssl, urllib.request, urllib.error
from pathlib import Path
from datetime import date

sys.path.insert(0, str(Path(__file__).resolve().parent))
import broker_signals as bs
if sys.stdout and hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(errors="replace")

_CTX = ssl.create_default_context(); _CTX.check_hostname = False; _CTX.verify_mode = ssl.CERT_NONE
OUT = Path(r"D:\stock_data\supabase_backup") / date.today().isoformat()
PAGE = 1000


def _req(url, key):
    return urllib.request.Request(url, headers={"apikey": key, "Authorization": f"Bearer {key}", "Accept": "application/json"})


def list_tables(base, key):
    """PostgREST 根路徑回 OpenAPI，paths 的 key 即各表。"""
    try:
        d = json.loads(urllib.request.urlopen(_req(base + "/rest/v1/", key), timeout=30, context=_CTX).read())
        paths = d.get("paths") or {}
        # 只留「表」：排除 /rpc/* 函式與帶參數路徑；表名不含「/」
        return sorted(p.strip("/") for p in paths if p.startswith("/") and p != "/" and "{" not in p
                      and "/" not in p.strip("/") and not p.startswith("/rpc"))
    except Exception as e:
        print(f"[error] 列舉表失敗：{e}"); return []


def dump_table(base, key, tbl):
    rows, off = [], 0
    while True:
        url = f"{base}/rest/v1/{tbl}?select=*&limit={PAGE}&offset={off}"
        try:
            batch = json.loads(urllib.request.urlopen(_req(url, key), timeout=60, context=_CTX).read())
        except urllib.error.HTTPError as e:
            print(f"  [warn] {tbl} offset {off} 讀取失敗 {e.code}（可能為 view/無權限），略過"); break
        if not isinstance(batch, list) or not batch:
            break
        rows.extend(batch)
        off += len(batch)
        if len(batch) < PAGE:
            break
    return rows


def main():
    env = bs._load_env()
    base = env["SUPABASE_URL"].rstrip("/")
    key = env.get("SUPABASE_SERVICE_KEY")
    if not key:
        print("[error] 缺 SUPABASE_SERVICE_KEY"); sys.exit(1)
    OUT.mkdir(parents=True, exist_ok=True)
    tables = list_tables(base, key)
    print(f"共 {len(tables)} 張表 → 備份到 {OUT}")
    manifest = {"date": date.today().isoformat(), "generated_at": time.strftime("%Y-%m-%d %H:%M:%S"), "tables": {}}
    total = 0
    for t in tables:
        fp = OUT / f"{t}.json"
        if fp.exists() and fp.stat().st_size > 0:        # 續跑：已備份的跳過，仍計入 manifest
            try:
                nrows = len(json.loads(fp.read_text(encoding="utf-8")))
            except Exception:
                nrows = -1
            size = fp.stat().st_size
            manifest["tables"][t] = {"rows": nrows, "bytes": size}
            total += size
            print(f"  {t}: 已備份（{nrows:,} 列）跳過")
            continue
        rows = dump_table(base, key, t)
        fp.write_text(json.dumps(rows, ensure_ascii=False), encoding="utf-8")
        size = fp.stat().st_size
        manifest["tables"][t] = {"rows": len(rows), "bytes": size}
        total += size
        print(f"  {t}: {len(rows):,} 列　{size//1024:,} KB")
    (OUT / "_manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"完成：{len(tables)} 張表、總 {total//1024//1024} MB → {OUT}")


if __name__ == "__main__":
    main()
