"""
news_feed.py — 每日新聞原始來源彙整（比照合夥人 genshuei-market /news），上傳 Supabase news_feed。

來源（皆公開 RSS / OpenAPI，只存標題、時間、摘要、分類與原文連結，不存全文）：
  中央社財經 RSS、Yahoo 股市台股 RSS、證交所最新消息 newsList、
  MOPS 上市重大訊息 t187ap04_L、MOPS 上櫃重大訊息 mopsfin_t187ap04_O
標籤：
  codes＝標題/摘要提到的上市櫃個股（代號比對；名稱 ≥3 字直接比對，2 字名稱須緊鄰代號或括號才算，避免「統一」「中華」誤判）
  tags ＝提到個股的產業別（tw_listed_codes.json）＋關鍵字（AI、半導體、PCB…）
保留 30 天（約 150 則/日 × 1KB × 30 ≈ 4.5MB）。建表：sql/news_feed.sql
排程：每 4 小時（工作排程器 AI_stock_news_feed）。
用法：python scripts/news_feed.py
"""
import html
import json
import re
import ssl
import sys
import urllib.request
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import broker_signals as bs           # noqa: E402  # _load_env / _sb

if sys.stdout and hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(errors="replace")

TW = timezone(timedelta(hours=8))
KEEP_DAYS = 30
_CTX = ssl.create_default_context(); _CTX.check_hostname = False; _CTX.verify_mode = ssl.CERT_NONE
HERE = Path(__file__).resolve().parent
CODES = json.loads((HERE / "tw_listed_codes.json").read_text(encoding="utf-8")) \
    if (HERE / "tw_listed_codes.json").exists() else {}
KEYWORDS = ["AI", "半導體", "台積電", "PCB", "伺服器", "記憶體", "IC設計", "散熱", "被動元件", "面板", "封測", "CoWoS",
            "光通訊", "矽光子", "重電", "綠能", "電動車", "車用", "機器人", "低軌衛星", "航運", "鋼鐵", "塑化", "營建",
            "金融", "ETF", "美股", "法人", "外資", "匯率", "利率", "關稅", "通膨", "Fed", "央行", "能源", "生技"]
# 兩字股名易與一般詞撞名（例：輝達新→達新、海力士→力士）→ 只比對下列常上新聞的兩字股；其餘兩字股須寫出代號才算
TWO_OK = set("""鴻海 宏碁 華碩 微星 聯電 廣達 緯創 仁寶 和碩 國巨 華邦 南亞 台塑 中鋼 長榮 陽明 萬海 友達 群創 奇鋐 健策 雙鴻
欣興 南電 景碩 臻鼎 華通 京元 力積 旺宏 南科 群聯 世芯 智原 聯詠 瑞昱 信驊 祥碩 譜瑞 大立 光寶 研華 技嘉 緯穎 神達 勤誠
川湖 嘉澤 貿聯 鴻準 建準 士電 華城 東元 玉山 元大 兆豐 台新 台泥 亞泥 卜蜂 漢唐 帆宣 聖暉 亞翔 京鼎 弘塑 萬潤 均華 印能
致茂 穎崴 旺矽 精測 遠傳 智邦 啟碁 明泰 上詮 聯亞 光聖 聯鈞 創意 力成 頎邦 南茂 矽格 欣銓 汎銓 閎康 宜特 鈊象 晶豪 威剛
十銓 宇瞻 華新 大亞 華航 榮運 裕民 慧洋 台驊 中鋼 豐興 東鋼 聚陽 儒鴻 寶成 豐泰 統一超 全家 裕隆 和泰 台達 聯發科 日月光""".split())
ALIAS = {"世界先進": "5347", "台積公司": "2330", "鴻海精密": "2317", "聯華電子": "2303", "中華電信": "2412", "統一企業": "1216",
         "大同公司": "2371", "新光金控": "2888", "永豐金控": "2890", "中信金控": "2891", "華南金控": "2880", "第一金控": "2892",
         "合庫金控": "5880", "國泰金控": "2882", "中華航空": "2610", "長榮航空": "2618", "長榮海運": "2603", "陽明海運": "2609"}
# 長名稱優先比對，避免「台積電」被「台積」吃掉
_NAMES = sorted(((v["name"], k) for k, v in CODES.items() if v.get("name")), key=lambda x: -len(x[0]))


def _get(url, timeout=30):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    return urllib.request.urlopen(req, timeout=timeout, context=_CTX).read().decode("utf-8-sig", errors="replace")


def _clean(t):
    t = re.sub(r"<!\[CDATA\[([\s\S]*?)\]\]>", r"\1", t or "")
    t = re.sub(r"<[^>]+>", " ", t)
    return re.sub(r"\s+", " ", html.unescape(t)).strip()


def _field(block, name):
    m = re.search(rf"<{name}[^>]*>([\s\S]*?)</{name}>", block, re.I)
    return _clean(m.group(1)) if m else ""


def _roc(d):          # 1150927 → 2026-09-27
    d = re.sub(r"\D", "", str(d or ""))
    return f"{int(d[:-4]) + 1911}-{d[-4:-2]}-{d[-2:]}" if len(d) >= 7 else None


def tag(text, known=None):
    """回 (codes, tags)。known＝來源已知的代號（MOPS）。"""
    codes, seen = [], set()

    def add(c):
        if c in CODES and c not in seen:
            seen.add(c); codes.append({"code": c, "name": CODES[c]["name"]})
    if known:
        add(known)
    for c in re.findall(r"(?<![\d.])(\d{4,6})(?![\d.%])", text):
        if c in CODES and (re.search(rf"[(（]\s*{c}|{c}\s*[)）]|{re.escape(CODES[c]['name'])}\s*{c}|{c}\s*{re.escape(CODES[c]['name'])}", text)):
            add(c)
    for alias, c in ALIAS.items():
        if alias in text:
            add(c); text = text.replace(alias, "　")
    for w in ("輝達", "海力士", "三星電子", "美光", "英特爾", "超微", "高通", "博通", "蘋果", "特斯拉", "微軟", "谷歌", "亞馬遜"):
        text = text.replace(w, "　")      # 外國公司名遮掉，避免吃到台股短名
    for name, c in _NAMES:
        if len(codes) >= 8:
            break
        if (len(name) >= 3 or name in TWO_OK) and name in text:
            add(c)
            text = text.replace(name, "　")      # 已比對的名稱遮掉，避免再被較短名稱重複命中
    tags = []
    for c in codes:
        ind = CODES.get(c["code"], {}).get("industry")
        if ind and ind not in tags:
            tags.append(ind)
    low = text.lower()
    for k in KEYWORDS:
        if k.lower() in low and k not in tags:
            tags.append(k)
    return codes, tags[:6]


def rss(url, source, limit=60):
    out = []
    xml = _get(url)
    for m in list(re.finditer(r"<item>([\s\S]*?)</item>", xml, re.I))[:limit]:
        b = m.group(1)
        title, link, pub = _field(b, "title"), _field(b, "link"), _field(b, "pubDate")
        if not (title and link and pub):
            continue
        try:
            dt = parsedate_to_datetime(pub).astimezone(TW)
        except Exception:
            continue
        desc = _field(b, "description")[:240]
        out.append(dict(title=title, link=link, dt=dt, description=desc, source=source, known=None))
    return out


def twse_news():
    out = []
    for r in json.loads(_get("https://openapi.twse.com.tw/v1/news/newsList"))[:40]:
        d = _roc(r.get("Date"))
        if not d or not r.get("Url"):
            continue
        out.append(dict(title=r.get("Title", "").strip(), link=r["Url"], dt=datetime.fromisoformat(d + "T16:30:00+08:00"),
                        description="臺灣證券交易所公開發布的市場、上市與交易相關資訊。", source="證交所", known=None))
    return out


def mops(url, kc, kn, ksub, source):
    out = []
    for r in json.loads(_get(url))[:120]:
        d = _roc(r.get("發言日期")); t = str(r.get("發言時間", "")).zfill(6)
        code, name = str(r.get(kc, "")).strip(), str(r.get(kn, "")).strip()
        if not d or not code:
            continue
        sub = _clean(r.get(ksub) or r.get(ksub.strip()) or "")
        desc = _clean(r.get("說明") or "")[:240]
        out.append(dict(title=f"{code} {name}｜{sub}"[:180],
                        link=f"https://mops.twse.com.tw/mops/web/t05st01?co_id={code}&date={d}&t={t}",
                        dt=datetime.fromisoformat(f"{d}T{t[:2]}:{t[2:4]}:{t[4:6]}+08:00"),
                        description=desc, source=source, known=code))
    return out


def main():
    env = bs._load_env()
    if not env.get("SUPABASE_SERVICE_KEY"):
        print("[error] 缺 SUPABASE_SERVICE_KEY"); sys.exit(1)
    items, errs = [], []
    jobs = [("中央社", lambda: rss("https://feeds.feedburner.com/rsscna/finance", "中央社")),
            ("Yahoo", lambda: rss("https://tw.stock.yahoo.com/rss?category=tw-market", "Yahoo股市")),
            ("證交所", twse_news),
            ("MOPS上市", lambda: mops("https://openapi.twse.com.tw/v1/opendata/t187ap04_L", "公司代號", "公司名稱", "主旨 ", "MOPS重大訊息")),
            ("MOPS上櫃", lambda: mops("https://www.tpex.org.tw/openapi/v1/mopsfin_t187ap04_O", "SecuritiesCompanyCode", "CompanyName", "主旨", "MOPS重大訊息"))]
    for nm, fn in jobs:
        try:
            got = fn(); items += got; print(f"{nm}：{len(got)} 則")
        except Exception as e:
            errs.append(nm); print(f"[warn] {nm} 失敗：{str(e)[:80]}")
    now = datetime.now(timezone.utc).isoformat()
    rows, seen = [], set()
    for it in items:
        if it["link"] in seen or not it["title"]:
            continue
        seen.add(it["link"])
        codes, tags = tag(it["title"] + " " + it["description"], it["known"])
        rows.append({"id": it["link"][:500], "title": it["title"], "link": it["link"], "published_at": it["dt"].isoformat(),
                     "news_date": it["dt"].astimezone(TW).strftime("%Y-%m-%d"), "description": it["description"],
                     "source": it["source"], "tags": tags, "codes": codes, "fetched_at": now})
    key = env["SUPABASE_SERVICE_KEY"]
    for i in range(0, len(rows), 200):
        req = urllib.request.Request(env["SUPABASE_URL"] + "/rest/v1/news_feed?on_conflict=id", method="POST",
                                     data=json.dumps(rows[i:i + 200], ensure_ascii=False).encode(),
                                     headers={"Content-Type": "application/json", "apikey": key, "Authorization": f"Bearer {key}",
                                              "Prefer": "resolution=merge-duplicates,return=minimal"})
        urllib.request.urlopen(req, timeout=60)
    cut = (datetime.now(TW) - timedelta(days=KEEP_DAYS)).strftime("%Y-%m-%d")
    bs._sb(env, "/news_feed", method="DELETE", params=[("news_date", f"lt.{cut}")])
    print(f"已 upsert {len(rows)} 則到 news_feed（刪除 {cut} 以前）" + (f"；失敗來源：{'、'.join(errs)}" if errs else ""))


if __name__ == "__main__":
    main()
