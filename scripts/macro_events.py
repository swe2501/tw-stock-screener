"""
macro_events.py — 宏觀事件（經濟日曆）＋宏觀新聞，供「外資空單溫度計 → 第 3 層 宏觀佐證與事件窗」。

資料源：investing.com 香港站（有防爬機制，urllib 會 403 → 用 Playwright 開真的 Chrome，先進頁面過驗證，再在頁內呼叫其 API）
  經濟日曆：endpoints.investing.com/pd-instruments/v1/calendars/economic/events/occurrences
    （回 events[事件定義：名稱/國家/重要度] ＋ occurrences[每次公布：時間/實際/預測/前值/實際相對預測]）
  宏觀新聞：hk.investing.com/news/economy 頁內 __NEXT_DATA__ 的 newsStore._news。
範圍（2026-09-28 用戶定）：國家依序 美國、日本、韓國、中國、歐元區；重要度 高＋中
  （高＝直接顯示；中＝只給籌碼會員看，會員按「列上去」才公開 → pinned 欄位由前端寫，本腳本不覆蓋）。
  日曆抓 過去 7 天～未來 14 天；新聞保留 14 天、事件保留 90 天。
→ Supabase macro_events(occurrence_id PK)、macro_news(id PK)。
用法：python scripts/macro_events.py [--dry]
注意：會開一個 Chrome 視窗（移到螢幕外），約 30 秒。
"""
import json, sys, time, urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import broker_signals as bs

if sys.stdout and hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(errors="replace")

TW = timezone(timedelta(hours=8))
# investing.com country_id → (代碼, 中文, 排序)
COUNTRIES = {5: ("US", "美國", 1), 35: ("JP", "日本", 2), 11: ("KR", "韓國", 3), 37: ("CN", "中國", 4), 72: ("EU", "歐元區", 5)}
IMP = {"high": 3, "medium": 2}
API = "https://endpoints.investing.com/pd-instruments/v1/calendars/economic/events/occurrences"
BASE = "https://hk.investing.com"


def fetch():
    from playwright.sync_api import sync_playwright
    now = datetime.now(TW)
    s = (now - timedelta(days=7)).strftime("%Y-%m-%dT00:00:00.000+08:00")
    e = (now + timedelta(days=14)).strftime("%Y-%m-%dT23:59:59.999+08:00")
    q = (f"{API}?domain_id=55&limit=500&start_date={urllib.parse.quote(s)}&end_date={urllib.parse.quote(e)}"
         f"&country_ids={','.join(str(c) for c in COUNTRIES)}")
    def next_data(pg, want):
        """等「請稍候」驗證頁過去、__NEXT_DATA__ 出現（最多約 30 秒）。"""
        for _ in range(15):
            nd = pg.query_selector("script#__NEXT_DATA__")
            if nd:
                try:
                    st = json.loads(nd.inner_text())["props"]["pageProps"]["state"]
                    if want(st):
                        return st
                except Exception:
                    pass
            time.sleep(2)
        return {}

    def open_page(p, url, want):
        """每個頁面用全新瀏覽器開（第一個進站頁面最不容易被「請稍候」驗證擋），回 (browser, page, state)。"""
        b = p.chromium.launch(channel="chrome", headless=False, args=["--window-position=-2000,0"])
        pg = b.new_page(locale="zh-HK")
        pg.goto(url, timeout=90000, wait_until="domcontentloaded")
        return b, pg, next_data(pg, want)

    news, cal = [], {"events": [], "occurrences": []}
    with sync_playwright() as p:
        # 1) 宏觀新聞
        try:
            b, pg, st = open_page(p, f"{BASE}/news/economy", lambda st: (st.get("newsStore") or {}).get("_news"))
            news = (st.get("newsStore") or {}).get("_news") or []
            b.close()
        except Exception as e:
            print(f"[warn] 新聞抓取失敗：{str(e)[:120]}")
        # 2) 經濟日曆（頁內呼叫 API，失敗重試）
        b, pg, _ = open_page(p, f"{BASE}/economic-calendar", lambda st: "economicCalendarStore" in st)
        js = "async (u) => { const r = await fetch(u); return await r.text(); }"
        for t in range(3):
            try:
                cal = json.loads(pg.evaluate(js, q))
                break
            except Exception as e:
                print(f"[retry {t + 1}] 日曆 API：{str(e)[:80]}")
                time.sleep(5)
        guard = 0
        while cal.get("next_page_cursor") and guard < 5:
            more = json.loads(pg.evaluate(js, q + "&cursor=" + urllib.parse.quote(cal["next_page_cursor"])))
            cal["events"] += more.get("events", []); cal["occurrences"] += more.get("occurrences", [])
            cal["next_page_cursor"] = more.get("next_page_cursor"); guard += 1
        b.close()
    return cal, news


def build(cal, news):
    ev = {e["event_id"]: e for e in cal.get("events", [])}
    rows = []
    for o in cal.get("occurrences", []):
        e = ev.get(o["event_id"])
        if not e or e.get("country_id") not in COUNTRIES or e.get("importance") not in IMP:
            continue
        cc, cn, _ = COUNTRIES[e["country_id"]]
        rows.append({
            "occurrence_id": o["occurrence_id"], "event_id": o["event_id"], "country": cc, "country_name": cn,
            "currency": e.get("currency"), "title": e.get("event_meta_title") or e.get("long_name"),
            "category": e.get("category"), "importance": e.get("importance"), "occ_time": o["occurrence_time"],
            "reference_period": o.get("reference_period"), "unit": o.get("unit"),
            "actual": o.get("actual"), "forecast": o.get("forecast"), "previous": o.get("previous"),
            "actual_to_forecast": o.get("actual_to_forecast"), "page_link": e.get("page_link"),
        })
    nrows = []
    for n in news:
        if not n.get("id") or not n.get("title"):
            continue
        link = n.get("link") or ""
        nrows.append({"id": int(n["id"]), "title": n["title"][:300], "link": (BASE + link) if link.startswith("/") else link,
                      "category": link.split("/")[2] if link.count("/") >= 3 else None,
                      "source": n.get("source_name"), "published_at": n.get("published_at")})
    return rows, nrows


def _post(env, path, rows):
    key = env["SUPABASE_SERVICE_KEY"]
    req = urllib.request.Request(env["SUPABASE_URL"] + "/rest/v1/" + path, data=json.dumps(rows).encode(), method="POST",
                                 headers={"Content-Type": "application/json", "apikey": key, "Authorization": f"Bearer {key}",
                                          "Prefer": "resolution=merge-duplicates,return=minimal"})
    urllib.request.urlopen(req, timeout=60).read()


def _delete(env, path):
    key = env["SUPABASE_SERVICE_KEY"]
    req = urllib.request.Request(env["SUPABASE_URL"] + "/rest/v1/" + path, method="DELETE",
                                 headers={"apikey": key, "Authorization": f"Bearer {key}"})
    urllib.request.urlopen(req, timeout=60).read()


def main():
    import urllib.parse  # noqa: F401  (fetch 內使用)
    dry = "--dry" in sys.argv
    cal, news = fetch()
    rows, nrows = build(cal, news)
    print(f"經濟日曆：高 {sum(r['importance'] == 'high' for r in rows)} 筆、中 {sum(r['importance'] == 'medium' for r in rows)} 筆；新聞 {len(nrows)} 則")
    for r in sorted(rows, key=lambda r: r["occ_time"])[:60]:
        t = (datetime.fromisoformat(r["occ_time"].replace("Z", "+00:00")).astimezone(TW)).strftime("%m-%d %H:%M")
        print(f"  {t} [{r['importance'][0]}] {r['country_name']} {r['title']} | 實際 {r['actual']} 預測 {r['forecast']} 前值 {r['previous']} {r['actual_to_forecast'] or ''}")
    for n in nrows[:8]:
        print("  新聞", n["published_at"], n["category"], n["title"][:50])
    if dry:
        return
    env = bs._load_env()
    if rows:
        _post(env, "macro_events?on_conflict=occurrence_id", rows)
    if nrows:
        _post(env, "macro_news?on_conflict=id", nrows)
    cut_e = (datetime.now(TW) - timedelta(days=90)).strftime("%Y-%m-%d")
    cut_n = (datetime.now(TW) - timedelta(days=14)).strftime("%Y-%m-%d")
    _delete(env, f"macro_events?occ_time=lt.{cut_e}&pinned=is.false")
    _delete(env, f"macro_news?published_at=lt.{cut_n}")
    print(f"已寫入 macro_events {len(rows)} 筆、macro_news {len(nrows)} 則")


if __name__ == "__main__":
    import urllib.parse
    main()
