"""
themes_push.py — 建置「股票 → 所屬題材」完整對照 → Supabase stock_themes（今日排行題材顯示用）。

需求（JUSTY 2026-10-20 交接 HANDOFF_FOCUS_THEMES_2026-10-20.md）：今日排行每檔都要顯示所屬題材，
不能大多「未分類」。資料來源（皆真實、可追溯，不由 AI 自編），三層由細到粗：
  1) 合夥人精選題材 = api/screen.py 的 THEME_MEMBERS（39 題材／406 檔，AI 伺服器/CoWoS/HBM…，最細）。
  2) Goodinfo 概念股 = scripts/goodinfo_concepts.json（約 95 題材：蘋果概念/電動車/低軌衛星/第三方支付…，
     由 scripts/goodinfo_concepts.py 本機每週爬 Goodinfo）。
  3) 官方產業別補齊 = TWSE t187ap03_L（上市）+ TPEx mopsfin_t187ap03_O（上櫃），涵蓋上市櫃約 1,800 檔。
每檔：①精選題材 →②Goodinfo 概念 →③官方產業別保底，順序由細到粗、去重，故不再有「未分類」。

格式（相容前端 row.themes = [{id, name}]，另帶 src 供日後分層顯示）：
  stock_themes(code text primary key, themes jsonb, updated_at timestamptz default now());
  alter table stock_themes enable row level security;
  create policy anon_read_stock_themes on stock_themes for select using (true);

用法：python scripts/themes_push.py          # 全市場
      python scripts/themes_push.py --dry    # 只印統計不寫入
玩股網概念股無公開 API（2026-10-20 實測 /stock/{code}/concept* 皆 404），故題材層用合夥人精選，
產業別層用官方 openapi；兩者皆非爬玩股網，可在雲端或本機跑。
"""
import os, sys, json, argparse, urllib.request, ssl
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "api"))
sys.path.insert(0, str(ROOT / "scripts"))
import screen  # THEME_MEMBERS, _get_industry_map, _STOCK_NAMES
import broker_signals as bs

if sys.stdout and hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(errors="replace")


def _theme_memberships():
    """code → [題材名]（合夥人精選，順序：成分股少的題材排前，較精準）。"""
    tm = screen.THEME_MEMBERS
    order = sorted(tm.keys(), key=lambda n: len(tm[n]))   # 小題材優先
    out = {}
    for name in order:
        for code in tm[name]:
            out.setdefault(str(code), [])
            if name not in out[str(code)]:
                out[str(code)].append(name)
    return out


def _goodinfo_concepts():
    """code → [概念題材名]（Goodinfo 概念股，scripts/goodinfo_concepts.py 本機每週爬）。檔案不在就回空。"""
    p = ROOT / "scripts" / "goodinfo_concepts.json"
    if not p.exists():
        return {}
    try:
        d = json.loads(p.read_text(encoding="utf-8"))
        return {str(k): [str(x) for x in v] for k, v in d.items() if isinstance(v, list)}
    except Exception as e:
        print(f"[warn] goodinfo_concepts.json 讀取失敗：{e}")
        return {}


def _industry_map():
    """code → 產業別中文（上市 TWSE + 上櫃 TPEx，官方 openapi）。"""
    try:
        return screen._get_industry_map()
    except Exception as e:
        print(f"[warn] 產業別讀取失敗：{e}")
        return {}


def _all_codes(themes, industry, concepts=None):
    codes = set(themes) | set(industry) | set(concepts or {})
    # tw_listed_codes.json 補齊（4 碼普通股）
    p = ROOT / "scripts" / "tw_listed_codes.json"
    if p.exists():
        try:
            d = json.loads(p.read_text(encoding="utf-8"))
            for c in (d.keys() if isinstance(d, dict) else d):
                codes.add(str(c))
        except Exception:
            pass
    return {c for c in codes if str(c).isdigit() and 4 <= len(str(c)) <= 6}


def _build_rows():
    themes = _theme_memberships()          # 合夥人精選（細、熱門半導體題材）
    concepts = _goodinfo_concepts()        # Goodinfo 概念股（廣）
    industry = _industry_map()             # 官方產業別（保底）
    rows = []
    stat = {"with_theme": 0, "industry_only": 0, "empty": 0}
    for code in sorted(_all_codes(themes, industry, concepts)):
        lst, names = [], set()
        def add(name, src):
            if name and name not in names:
                names.add(name)
                lst.append({"id": name if src != "產業" else "產業:" + name, "name": name, "src": src})
        for name in themes.get(code, []):          # ① 合夥人精選題材排前（資訊量高）
            add(name, "題材")
        for name in concepts.get(code, []):         # ② Goodinfo 概念題材
            add(name, "概念")
        ind = industry.get(code)
        if ind == "其他":
            ind = "其他業"           # 2026-10-21 官方產業別「其他」照實標示（例：裕慶-KY），不再落成「未分類」
        if ind:
            add(ind, "產業")                        # ③ 官方產業別保底
        if not lst:
            stat["empty"] += 1
            continue
        if themes.get(code) or concepts.get(code):
            stat["with_theme"] += 1
        else:
            stat["industry_only"] += 1
        rows.append({"code": code, "themes": lst})
    return rows, stat


def _upsert(env, rows):
    key = env["SUPABASE_SERVICE_KEY"]
    url = f"{env['SUPABASE_URL']}/rest/v1/stock_themes?on_conflict=code"
    req = urllib.request.Request(url, data=json.dumps(rows).encode(), method="POST", headers={
        "Content-Type": "application/json", "apikey": key, "Authorization": f"Bearer {key}",
        "Prefer": "resolution=merge-duplicates,return=minimal"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.status


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry", action="store_true", help="只印統計不寫入")
    args = ap.parse_args()
    rows, stat = _build_rows()
    print(f"共 {len(rows)} 檔｜有精選題材 {stat['with_theme']}、僅產業別 {stat['industry_only']}、無任何分類 {stat['empty']}")
    # 抽查
    for c in ["2330", "2454", "2317", "1101", "2882", "1216", "9910", "6116"]:
        r = next((x for x in rows if x["code"] == c), None)
        print("  ", c, screen._STOCK_NAMES.get(c, ""), [t["name"] for t in (r["themes"] if r else [])][:6])
    if args.dry:
        return 0
    env = bs._load_env()
    if not env.get("SUPABASE_SERVICE_KEY"):
        print("[error] 缺 SUPABASE_SERVICE_KEY"); return 1
    total = 0
    for i in range(0, len(rows), 500):
        batch = rows[i:i + 500]
        st = _upsert(env, batch); total += len(batch)
        print(f"  upsert {total}/{len(rows)} status={st}")
    print("完成")
    return 0


if __name__ == "__main__":
    sys.exit(main())
