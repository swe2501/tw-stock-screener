from http.server import BaseHTTPRequestHandler
import json, urllib.request, urllib.parse
from concurrent.futures import ThreadPoolExecutor, as_completed

YF_HEADERS = {"User-Agent": "Mozilla/5.0", "Accept": "application/json"}


# BEGIN MERGED_PUBLIC_SITE_SEARCH — deployment budget: at most 12 functions.
# Logical /api/site_search shares this public GET entrypoint with prices.
# Upgrade extraction checklist: docs/api-budget.md (keep routes/clients in sync).
"""Read-only search of existing public news/archive tables. Never uses service-role credentials."""
from concurrent.futures import ThreadPoolExecutor
from html import unescape
from http.server import BaseHTTPRequestHandler
import json
import os
import re
import urllib.parse
import urllib.request

_SITE_SEARCH_SOURCES = {
    "news_feed": ("title,link,published_at,description,source,news_date", ("title", "description")),
    "hot_topics": ("topic,summary,source_urls,published_at,sector", ("topic", "summary")),
}


def _site_search_plain(value, limit=160):
    return re.sub(r"\s+", " ", unescape(re.sub(r"<[^>]*>", " ", str(value or "")))).strip()[:limit]


def _site_search_safe_url(value):
    value = str(value or "").strip()
    try:
        url = urllib.parse.urlsplit(value)
        return value if url.scheme in ("https", "http") and url.hostname and not url.username and not url.password else ""
    except ValueError:
        return ""


def _site_search_query_params(source, query, limit):
    # Quoted PostgREST values keep punctuation inside the search term, not the query grammar.
    pattern = "%" + query.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_").replace("*", "\\*") + "%"
    quoted = json.dumps(pattern, ensure_ascii=False)
    columns, fields = _SITE_SEARCH_SOURCES[source]
    return {"select": columns, "or": "(" + ",".join(f"{field}.ilike.{quoted}" for field in fields) + ")",
            "order": "published_at.desc", "limit": str(limit)}


def _site_search_fetch_source(source, query, limit):
    base, key = os.environ.get("SUPABASE_URL", ""), os.environ.get("SUPABASE_ANON_KEY", "")
    if not base or not key:
        raise RuntimeError("not_configured")
    url = base.rstrip("/") + "/rest/v1/" + source + "?" + urllib.parse.urlencode(_site_search_query_params(source, query, limit))
    req = urllib.request.Request(url, headers={"apikey": key, "Authorization": "Bearer " + key, "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=5) as response:
        data = json.loads(response.read(1_000_001))
    if not isinstance(data, list):
        raise ValueError("invalid_response")
    return data


def _site_search_normalize(source, row):
    if not isinstance(row, dict):
        return None
    if source == "news_feed":
        title, description, link = row.get("title"), row.get("description"), _site_search_safe_url(row.get("link"))
        label = _site_search_plain(row.get("source"), 50) or "每日新聞"
    else:
        title, description = row.get("topic"), row.get("summary")
        links = row.get("source_urls", [])
        if isinstance(links, str):
            try:
                links = json.loads(links)
            except (ValueError, TypeError):
                links = re.findall(r"https?://[^\s\]\\\"',]+", links)
        link = next((_site_search_safe_url(value) for value in links if _site_search_safe_url(value)), "") if isinstance(links, list) else ""
        label = "焦點題材" + (" · " + _site_search_plain(row.get("sector"), 40) if row.get("sector") else "")
    title = _site_search_plain(title, 250)
    date = str(row.get("news_date") or row.get("published_at") or "")[:10]
    if not title or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", date):
        return None
    return {"title": title, "snippet": _site_search_plain(description), "url": link, "date": date,
            "source": label, "kind": "news" if source == "news_feed" else "topic"}


def _site_search_search(query, limit=8, fetcher=_site_search_fetch_source):
    if not isinstance(query, str) or not 2 <= len(query.strip()) <= 80 or not any(c.isalnum() for c in query):
        raise ValueError("請輸入 2～80 個字的關鍵字")
    query, limit = query.strip(), max(1, min(10, limit))
    rows, unavailable = [], []
    with ThreadPoolExecutor(max_workers=2) as pool:
        futures = {source: pool.submit(fetcher, source, query, limit) for source in _SITE_SEARCH_SOURCES}
        for source, future in futures.items():
            try:
                for raw in future.result():
                    row = _site_search_normalize(source, raw)
                    if row:
                        rows.append(row)
            except Exception:
                unavailable.append(source)
    seen, result = set(), []
    for row in sorted(rows, key=lambda r: (r["date"], r["title"]), reverse=True):
        identity = row["url"] or (row["title"], row["date"])
        if identity not in seen:
            result.append(row)
            seen.add(identity)
    return {"items": result[:limit], "partial": bool(unavailable), "available": len(unavailable) < len(_SITE_SEARCH_SOURCES),
            "limit": limit, "scope": "saved_public_news"}


class _SiteSearchMixin:
    def log_message(self, *_):
        pass

    def _site_search_json(self, status, payload):
        body = json.dumps(payload, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "public, max-age=60, s-maxage=120" if status == 200 and not payload.get("partial") else "no-store")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(body)

    def _site_search_get(self):
        params = urllib.parse.parse_qs(urllib.parse.urlsplit(self.path).query)
        try:
            payload = _site_search_search(params.get("q", [""])[0])
        except ValueError as error:
            return self._site_search_json(400, {"error": str(error)})
        self._site_search_json(200 if payload["available"] else 503, payload)

# END MERGED_PUBLIC_SITE_SEARCH

def _fetch_price(code):
    url = f"https://query1.finance.yahoo.com/v8/finance/chart/{code}.TW?interval=1d&range=5d"
    try:
        req = urllib.request.Request(url, headers=YF_HEADERS)
        with urllib.request.urlopen(req, timeout=8) as r:
            d = json.loads(r.read())
        r0 = (d.get("chart", {}).get("result") or [None])[0]
        if not r0:
            return code, None
        closes = (r0.get("indicators", {}).get("quote") or [{}])[0].get("close") or []
        for v in reversed(closes):
            if v:
                return code, round(float(v), 2)
        return code, None
    except Exception:
        return code, None



# Public snapshots share this existing function; never proxy arbitrary tables or JWTs.
import time
import threading
import gzip
import io
from collections import OrderedDict
_SNAPSHOT_KINDS = frozenset(('themes','sectors','themeall','sectorall','overview'))
_SNAPSHOT_CACHE = OrderedDict()
_SNAPSHOT_LOCK = threading.Lock()
_SNAPSHOT_KEY_LOCKS = {}

def _public_snapshot(kind, scope, opener=None, clock=None):
    opener = opener or urllib.request.urlopen
    clock = clock or time.monotonic
    base_kind = kind[:-3] if kind.endswith('_rt') else kind
    if base_kind not in _SNAPSHOT_KINDS or scope not in ('prod','uat'):
        raise ValueError('invalid_snapshot')
    base, key = os.environ.get('SUPABASE_URL',''), os.environ.get('SUPABASE_ANON_KEY','')
    if not base or not key:
        raise RuntimeError('not_configured')
    identity=(base,kind,scope)
    # Single flight per warm instance. Only public anon reads enter this cache.
    with _SNAPSHOT_LOCK:
        key_lock=_SNAPSHOT_KEY_LOCKS.setdefault(identity,threading.Lock())
    with key_lock:
        with _SNAPSHOT_LOCK:
            cached=_SNAPSHOT_CACHE.get(identity)
            if cached and cached[0]>clock():
                _SNAPSHOT_CACHE.move_to_end(identity)
                return cached[1]
        params={'select':'kind,payload,updated_at','kind':('in.('+kind+'@uat,'+kind+')') if scope=='uat' else 'eq.'+kind,'limit':'2'}
        request=urllib.request.Request(base.rstrip('/')+'/rest/v1/page_cache?'+urllib.parse.urlencode(params),headers={'apikey':key,'Authorization':'Bearer '+key,'Accept-Encoding':'gzip'})
        with opener(request,timeout=10) as response:
            raw=response.read(8_000_001)
            if len(raw)>8_000_000:raise RuntimeError('snapshot_too_large')
            if response.headers.get('Content-Encoding','').lower()=='gzip':
                with gzip.GzipFile(fileobj=io.BytesIO(raw)) as stream:raw=stream.read(16_000_001)
            if len(raw)>16_000_000:raise RuntimeError('snapshot_too_large')
        rows=json.loads(raw)
        if not isinstance(rows,list):raise RuntimeError('invalid_snapshot_response')
        allowed={kind,kind+'@uat'} if scope=='uat' else {kind}
        if any(not isinstance(r,dict) or r.get('kind') not in allowed for r in rows):raise RuntimeError('invalid_snapshot_response')
        preferred=next((r for r in rows if r['kind']==kind+'@uat'),None) if scope=='uat' else None
        selected=preferred or next((r for r in rows if r['kind']==kind),None)
        if selected and not isinstance(selected.get('payload'),dict):raise RuntimeError('invalid_snapshot_response')
        result=[selected] if selected else []
        # Missing rows/errors are retried instead of being cached as empty data.
        if selected and not selected['payload'].get('error') and len(raw)<=2_000_000:
            with _SNAPSHOT_LOCK:
                _SNAPSHOT_CACHE[identity]=(clock()+(15 if kind.endswith('_rt') else 120),result)
                while len(_SNAPSHOT_CACHE)>8:_SNAPSHOT_CACHE.popitem(last=False)
        return result

_SECURITY_CATALOG_CACHE = None
_SECURITY_CATALOG_LOCK = threading.Lock()
def _security_catalog(opener=None,clock=None):
    global _SECURITY_CATALOG_CACHE
    opener=opener or urllib.request.urlopen;clock=clock or time.monotonic
    base,key=os.environ.get('SUPABASE_URL',''),os.environ.get('SUPABASE_ANON_KEY','')
    if not base or not key:raise RuntimeError('not_configured')
    with _SECURITY_CATALOG_LOCK:
        if _SECURITY_CATALOG_CACHE and _SECURITY_CATALOG_CACHE[0]==base and _SECURITY_CATALOG_CACHE[1]>clock():return _SECURITY_CATALOG_CACHE[2]
        items=[]
        for offset in range(0,6000,500):
            params={'select':'code,name,market,instrument_type,industry','order':'code.asc','limit':'500','offset':str(offset)}
            request=urllib.request.Request(base.rstrip('/')+'/rest/v1/security_catalog?'+urllib.parse.urlencode(params),headers={'apikey':key,'Authorization':'Bearer '+key})
            with opener(request,timeout=8) as response:raw=response.read(1_000_001)
            if len(raw)>1_000_000:raise RuntimeError('catalog_too_large')
            page=json.loads(raw)
            if not isinstance(page,list) or any(not isinstance(r,dict) or not re.fullmatch(r'[0-9A-Z]{4,10}',str(r.get('code',''))) or not isinstance(r.get('name'),str) for r in page):raise RuntimeError('invalid_catalog')
            items.extend(page)
            if len(page)<500:break
        else:raise RuntimeError('catalog_truncated')
        if not items or len({r['code'] for r in items})!=len(items):raise RuntimeError('invalid_catalog')
        result={'version':1,'source':'security_catalog','items':items}
        _SECURITY_CATALOG_CACHE=(base,clock()+300,result);return result


class handler(_SiteSearchMixin, BaseHTTPRequestHandler):
    def log_message(self, *a): pass

    def _json(self, code, data):
        body = json.dumps(data, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        qs = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
        # Search is dispatched before price validation; original price GET stays unchanged.
        if (qs.get("action") or [""])[0] == "site_search" or urllib.parse.urlsplit(self.path).path in ("/api/site_search", "/api/site_search.py"):
            return self._site_search_get()
        if (qs.get('action') or [''])[0]=='security_catalog':
            try: catalog=_security_catalog()
            except Exception:return self._site_search_json(503,{'error':'catalog_unavailable'})
            return self._site_search_json(200,catalog)
        if (qs.get('action') or [''])[0]=='public_snapshot':
            kind=(qs.get('kind') or [''])[0]; scope=(qs.get('scope') or ['prod'])[0]
            try: rows=_public_snapshot(kind,scope)
            except ValueError: return self._site_search_json(400,{'error':'invalid_snapshot'})
            except Exception: return self._site_search_json(503,{'error':'snapshot_unavailable'})
            body=json.dumps(rows,ensure_ascii=False,separators=(',',':')).encode()
            self.send_response(200);self.send_header('Content-Type','application/json; charset=utf-8')
            self.send_header('Cache-Control',('public, max-age=0, s-maxage=15' if kind.endswith('_rt') else 'public, max-age=30, s-maxage=120') if rows and not rows[0].get('payload',{}).get('error') else 'no-store')
            self.send_header('Access-Control-Allow-Origin','*');self.send_header('X-Content-Type-Options','nosniff');self.end_headers();self.wfile.write(body);return
        codes_str = (qs.get("codes") or [""])[0]
        codes = [c.strip() for c in codes_str.split(",") if c.strip()][:50]
        if not codes:
            return self._json(400, {"error": "codes required"})
        result = {}
        with ThreadPoolExecutor(max_workers=min(len(codes), 20)) as ex:
            for code, price in (f.result() for f in as_completed(
                    ex.submit(_fetch_price, c) for c in codes)):
                if price is not None:
                    result[code] = price
        self._json(200, result)
