"""Official announcements collector. Local normalized SQLite; no cloud writes or AI calls.

Publication date/time comes only from the source; date-only releases have NULL published_at.
Run --force outside the scheduled weekday 07:00–14:30 Taipei window for a manual check.
"""
import argparse
import concurrent.futures
import contextlib
import datetime as dt
import hashlib
import html
import json
import os
from pathlib import Path
import re
import sqlite3
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from email.utils import parsedate_to_datetime

TW = dt.timezone(dt.timedelta(hours=8))
HERE = Path(__file__).resolve().parent
DEFAULT_STATE = Path(os.environ.get('LOCALAPPDATA', str(Path.home()))) / 'Foresight/official-announcements'
UA = 'Mozilla/5.0 (compatible; ForesightOfficialMonitor/1.0)'
MAX_BYTES = 4_000_000


def now():
    return dt.datetime.now(TW)


def active(t):
    return t.weekday() < 5 and dt.time(7) <= t.time().replace(tzinfo=None) <= dt.time(14, 30)


def clean(value):
    return re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', ' ', value or ''))).strip()


def safe_url(value, base):
    u = urllib.parse.urljoin(base, html.unescape(value.strip()))
    p = urllib.parse.urlsplit(u)
    allowed = ('gov.tw', 'gov', 'twse.com.tw', 'tpex.org.tw')
    if p.scheme != 'https' or p.username or p.password or p.port not in (None, 443):
        raise ValueError('non-HTTPS or credential-bearing source URL')
    if not any(p.hostname == h or p.hostname.endswith('.' + h) for h in allowed):
        raise ValueError('source host outside official allowlist')
    query = [(k, v) for k, v in urllib.parse.parse_qsl(p.query, keep_blank_values=True)
             if not k.lower().startswith('utm_') and k.lower() not in ('fbclid', 'gclid')]
    return urllib.parse.urlunsplit((p.scheme, p.netloc.lower(), p.path, urllib.parse.urlencode(query), ''))


class OfficialRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        safe_url(newurl, req.full_url)
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def download(url, etag=None, modified=None):
    url = safe_url(url, url)
    headers = {'User-Agent': UA, 'Accept': 'application/rss+xml, application/xml, application/json, text/html;q=0.8'}
    if etag:
        headers['If-None-Match'] = etag
    if modified:
        headers['If-Modified-Since'] = modified
    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.build_opener(OfficialRedirect()).open(req, timeout=20) as r:
            body = r.read(MAX_BYTES + 1)
            if len(body) > MAX_BYTES:
                raise ValueError('response exceeds 4 MB; source adapter needs review')
            return body.decode(r.headers.get_content_charset() or 'utf-8-sig', errors='replace'), r.headers.get('ETag'), r.headers.get('Last-Modified')
    except urllib.error.HTTPError as exc:
        if exc.code == 304:
            return None, etag, modified
        raise


def dates(raw):
    raw = raw.strip()
    if not raw:
        return None, None, 'unknown'
    # Source date only: never fabricate an intraday time.
    m = re.fullmatch(r'(\d{3,4})[-/](\d{1,2})[-/](\d{1,2})', raw)
    if m:
        y, mo, d = map(int, m.groups())
        return dt.date(y + 1911 if y < 1911 else y, mo, d).isoformat(), None, 'date'
    if re.fullmatch(r'\d{7}', raw):
        return dates(f'{int(raw[:3]) + 1911}-{raw[3:5]}-{raw[5:]}')
    try:
        t = parsedate_to_datetime(raw)
    except (ValueError, TypeError):
        try:
            t = dt.datetime.fromisoformat(raw.replace('Z', '+00:00'))
        except ValueError:
            return None, None, 'unknown'
    if t.tzinfo is None:
        return t.date().isoformat(), None, 'date'
    t = t.astimezone(TW)
    return t.date().isoformat(), t.isoformat(), 'second'


def document(source, title, url, date='', summary='', code=None):
    title = clean(title)[:400]
    if not title:
        raise ValueError('missing source title')
    url = safe_url(url, source['url'])
    day, stamp, precision = dates(date)
    key = source['id'] + '|' + url
    if code:
        key += '|' + str(code) + '|' + date + '|' + title
    return dict(id=hashlib.sha256(key.encode()).hexdigest(), source_id=source['id'], title=title,
                url=url, published_date=day, published_at=stamp, time_precision=precision,
                summary=clean(summary)[:500], security_code=code, effective_date=None)


def rss(source, text):
    if '<!DOCTYPE' in text.upper() or '<!ENTITY' in text.upper():
        raise ValueError('DTD not allowed')
    root = ET.fromstring(text)
    if root.tag.split('}')[-1] not in ('rss', 'RDF', 'feed'):
        raise ValueError('not an RSS/Atom document')
    out = []
    items = [e for e in root.iter() if e.tag.split('}')[-1] in ('item', 'entry')]
    for item in items[:250]:
        fields = {e.tag.split('}')[-1]: e for e in item}
        def value(*keys):
            for key in keys:
                e = fields.get(key)
                if e is not None:
                    return ''.join(e.itertext()).strip()
            return ''
        link = value('link')
        if not link and fields.get('link') is not None:
            link = fields['link'].get('href', '')
        if not link:
            continue
        doc=document(source, value('title'), link, value('pubDate', 'published', 'date'), value('description', 'summary'))
        if source.get('date_only') and doc['published_date']:
            doc.update(published_at=None,time_precision='date')
        out.append(doc)
    if not out:
        raise ValueError('feed contains no valid items')
    return out


def parse(source, text):
    kind = source['kind']
    if kind in ('rss', 'discover_rss'):
        return rss(source, text)
    if kind == 'cbc':
        out = []
        for block in re.findall(r'<li\b[^>]*>(.*?)</li>', text, re.S | re.I):
            date = re.search(r'<time[^>]*>([^<]+)</time>', block)
            link = re.search(r'<a[^>]*href=["\']([^"\']*cp-357-[^"\']*)["\'][^>]*>(.*?)</a>', block, re.S)
            if date and link:
                out.append(document(source, link[2], link[1], date[1]))
        if not out:
            raise ValueError('CBC list structure changed')
        return out
    if kind == 'bis':
        # Date not on listing: retain unknown rather than copying fetch date into K-line.
        found = re.findall(r'<a[^>]+href=["\']([^"\']*/press-release/[^"\']*)["\'][^>]*>(.*?)</a>', text, re.S | re.I)
        out = [document(source, title, link) for link, title in found[:60] if len(clean(title)) > 15]
        if not out:
            raise ValueError('BIS list structure changed')
        return out
    data = json.loads(text)
    if not isinstance(data, list):
        raise ValueError('expected source array')
    out = []
    for row in data:
        r = {k.strip(): str(v or '').strip() for k, v in row.items()}
        if kind == 'twse_news':
            if r.get('Title') and r.get('Url'):
                out.append(document(source, r['Title'], r['Url'], r.get('Date', '')))
        elif kind == 'trading_notice':
            code = r.get('Code')
            if not code or not r.get('Date'):
                continue  # TWSE returns a zero placeholder on no-announcement days.
            disposition = source['id'] == 'twse_disposition'
            title = ('處置公告' if disposition else '注意公告') + '｜' + code
            d = document(source, title, source['url'], r['Date'], r.get('Detail') or r.get('TradingInfoForAttention',''), code)
            period = re.search(r'(\d{3}/\d{2}/\d{2})', r.get('DispositionPeriod',''))
            if period:
                d['effective_date'] = dates(period[1])[0]
            out.append(d)
        elif kind == 'mops':
            code = r.get('公司代號') or r.get('SecuritiesCompanyCode')
            if not code or not r.get('主旨'):
                continue
            d, _, _ = dates(r.get('發言日期', ''))
            t = r.get('發言時間', '').replace(':', '').zfill(6)
            stamp = f'{d}T{t[:2]}:{t[2:4]}:{t[4:6]}+08:00' if d and len(t) == 6 and t.isdigit() else d or ''
            url = 'https://mops.twse.com.tw/mops/web/t05st01?' + urllib.parse.urlencode({'co_id': code, 'date': d or '', 't': t})
            out.append(document(source, r['主旨'], url, stamp, r.get('說明', ''), code))
    # Empty MOPS day is legitimate; not a broken parser.
    return out


RULES = {
    'market_stability': ('國安基金', '安定市場', '穩定市場', '借券賣出', '融券保證金'),
    'rates_credit': ('利率', '貨幣政策', '信用管制', 'FOMC', 'monetary'),
    'macro': ('景氣', '物價指數', '經濟成長', '國內生產', '外銷訂單', '進出口', 'PMI', 'NMI'),
    'technology': ('半導體', '人工智慧', 'AI', '無人機', '出口管制', 'semiconductor', 'export control'),
    'energy_environment': ('電價', '碳費', '碳排', '綠能', '再生能源', '能源政策'),
    'market_rules': ('ETF', '證券市場', '交易制度', '證券投資', '金融控股', '資本適足'),
}


def labels(doc):
    def matches(text):
        text=text.casefold()
        return [tag for tag, words in RULES.items() if any(
            bool(re.search(r'(?<![a-z])'+re.escape(w.casefold())+r'(?![a-z])',text))
            if w.isascii() else w.casefold() in text for w in words)]
    tags=matches(doc['title']+' '+doc['summary'])
    # Background boilerplate must not promote unrelated ceremonies/sports into market events.
    important=bool(matches(doc['title'])) or doc.get('source_id','').startswith('mops_') or doc.get('source_id') in ('twse_attention','twse_disposition')
    # Recruitment and ceremonial items are retained as raw sources but not promoted to K-line candidates.
    if any(w in doc['title'] for w in ('徵才', '職缺', '徵人', '頒獎', '小劇場', '聯誼', '講習會', '工作坊', '世界棒球', '每日新聞（')):
        important = False
    return tags, important


DOC_FIELDS=('id','source_id','title','url','published_date','published_at','time_precision','summary','security_code','effective_date')


def fingerprint(doc,tags,important):
    value={'document':{k:doc.get(k) for k in DOC_FIELDS},'tags':tags,'important':bool(important)}
    return hashlib.sha256(json.dumps(value,sort_keys=True).encode()).hexdigest()


def reclassify(state_dir):
    date_only={s['id'] for s in json.loads((HERE/'official_sources.json').read_text(encoding='utf-8')) if s.get('date_only')}
    with single_instance(state_dir),contextlib.closing(connect(state_dir/'announcements.sqlite3')) as db:
        db.row_factory=sqlite3.Row
        rows=db.execute('SELECT * FROM announcements').fetchall()
        count=0
        for row in rows:
            doc=dict(row)
            if doc['source_id'] in date_only and doc['published_date']:
                doc.update(published_at=None,time_precision='date')
            tags,important=labels(doc);digest=fingerprint(doc,tags,important)
            if digest==doc['content_hash']:continue
            db.execute('UPDATE announcements SET important=?,content_hash=?,updated_at=?,published_at=?,time_precision=? WHERE id=?',(int(important),digest,now().isoformat(),doc['published_at'],doc['time_precision'],doc['id']))
            db.execute('DELETE FROM announcement_tags WHERE announcement_id=?',(doc['id'],))
            db.executemany('INSERT INTO announcement_tags VALUES(?,?)',[(doc['id'],t) for t in tags]);count+=1
        db.commit()
        print('Reclassified local announcements:',count)


def connect(path):
    path.parent.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(path)
    db.execute('PRAGMA foreign_keys=ON')
    db.executescript('''
    CREATE TABLE IF NOT EXISTS sources(id TEXT PRIMARY KEY,name TEXT NOT NULL,url TEXT NOT NULL,kind TEXT NOT NULL,category TEXT NOT NULL,minutes INTEGER NOT NULL,last_check TEXT,last_success TEXT,etag TEXT,modified TEXT,error TEXT,state TEXT);
    CREATE TABLE IF NOT EXISTS announcements(id TEXT PRIMARY KEY,source_id TEXT NOT NULL REFERENCES sources(id),title TEXT NOT NULL,url TEXT NOT NULL,published_date TEXT,published_at TEXT,time_precision TEXT NOT NULL,summary TEXT NOT NULL,security_code TEXT,effective_date TEXT,important INTEGER NOT NULL,first_seen TEXT NOT NULL,updated_at TEXT NOT NULL,content_hash TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS announcement_tags(announcement_id TEXT REFERENCES announcements(id),tag TEXT NOT NULL,PRIMARY KEY(announcement_id,tag));
    CREATE INDEX IF NOT EXISTS announcement_date ON announcements(published_date,important);
    CREATE TABLE IF NOT EXISTS source_checks(source_id TEXT REFERENCES sources(id),checked_at TEXT,status TEXT,count INTEGER,error TEXT,PRIMARY KEY(source_id,checked_at));
    ''')
    return db


def transient(exc):
    """偶發錯誤（逾時、連線中斷、406/429/5xx）：聯準會 feed 每天約 15% 次數這樣，下一刻通常就好。"""
    if isinstance(exc, urllib.error.HTTPError):
        return exc.code in (406, 429) or exc.code >= 500
    return isinstance(exc, (TimeoutError, ConnectionError, urllib.error.URLError)) and \
        'CERTIFICATE_VERIFY_FAILED' not in str(exc)


def download_retry(url, etag=None, modified=None, wait=3):
    try:
        return download(url, etag, modified)
    except Exception as exc:
        if not transient(exc):
            raise
        time.sleep(wait)
        return download(url, etag, modified)


def fetch_source(source, state):
    if source['kind'] == 'pending':
        return source, [], None, None, source['reason'], 'pending'
    try:
        text, etag, modified = download_retry(source['url'], state.get('etag'), state.get('modified'))
        if text is None:
            return source, [], etag, modified, None, 'unchanged'
        if source['kind'] == 'discover_rss' and '<rss' not in text[:500].lower():
            candidates = re.findall(r'<a[^>]+href=["\']([^"\']*(?:RSSdetail|Rss/|rss\.xml|rss-)[^"\']*)', text, re.I)
            if not candidates:
                raise ValueError('no verified RSS endpoint discovered')
            text, _, _ = download(safe_url(candidates[0], source['url']))
            etag = modified = None  # Landing page validators must not suppress feed checks.
        return source, parse(source, text), etag, modified, None, 'ok'
    except Exception as exc:
        # Never serialize URLs, headers or response bodies from errors.
        reason = f'HTTP {exc.code}' if isinstance(exc, urllib.error.HTTPError) else type(exc).__name__
        if isinstance(exc, ValueError):
            reason += ': ' + str(exc)[:160]
        return source, [], None, None, reason, 'error'


@contextlib.contextmanager
def single_instance(directory):
    directory.mkdir(parents=True, exist_ok=True)
    with (directory / 'collector.lock').open('a+b') as f:
        f.seek(0); f.write(b'0'); f.flush(); f.seek(0)
        if os.name == 'nt':
            import msvcrt
            msvcrt.locking(f.fileno(), msvcrt.LK_NBLCK, 1)
        else:
            import fcntl
            fcntl.flock(f, fcntl.LOCK_EX | fcntl.LOCK_NB)
        try:
            yield
        finally:
            if os.name == 'nt':
                f.seek(0); msvcrt.locking(f.fileno(), msvcrt.LK_UNLCK, 1)


def run(state_dir, force=False, sources=None):
    stamp = now()
    if not force and not active(stamp):
        print('Outside weekday 07:00–14:30 Asia/Taipei; no requests')
        return 0
    sources = sources or json.loads((HERE / 'official_sources.json').read_text(encoding='utf-8'))
    with single_instance(state_dir), contextlib.closing(connect(state_dir / 'announcements.sqlite3')) as db:
        states = {r[0]: dict(zip(('etag', 'modified', 'last_check'), r[1:])) for r in db.execute('SELECT id,etag,modified,last_check FROM sources')}
        due = []
        for s in sources:
            db.execute('INSERT INTO sources(id,name,url,kind,category,minutes) VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,url=excluded.url,kind=excluded.kind,category=excluded.category,minutes=excluded.minutes', tuple(s[k] for k in ('id','name','url','kind','category','minutes')))
            old = states.get(s['id'], {})
            if not force and old.get('last_check') and (stamp - dt.datetime.fromisoformat(old['last_check'])).total_seconds() < s['minutes'] * 60 - 10:
                continue
            due.append((s, old))
        db.commit()
        with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
            futures = [pool.submit(fetch_source, s, old) for s, old in due]
            for f in concurrent.futures.as_completed(futures):
                s, docs, etag, modified, error, status = f.result()
                checked = now().isoformat()
                for d in docs:
                    tags, important = labels(d)
                    content_hash = fingerprint(d,tags,important)
                    previous = db.execute('SELECT content_hash FROM announcements WHERE id=?', (d['id'],)).fetchone()
                    if previous and previous[0] == content_hash:
                        continue
                    keys = ('id','source_id','title','url','published_date','published_at','time_precision','summary','security_code','effective_date')
                    cols = ','.join(keys) + ',important,first_seen,updated_at,content_hash'
                    values = tuple(d[k] for k in keys) + (int(important),checked,checked,content_hash)
                    updates = ','.join(k+'=excluded.'+k for k in keys[1:]) + ',important=excluded.important,updated_at=excluded.updated_at,content_hash=excluded.content_hash'
                    db.execute('INSERT INTO announcements('+cols+') VALUES('+','.join('?' for _ in values)+') ON CONFLICT(id) DO UPDATE SET '+updates, values)
                    db.execute('DELETE FROM announcement_tags WHERE announcement_id=?', (d['id'],))
                    db.executemany('INSERT INTO announcement_tags VALUES(?,?)', [(d['id'], t) for t in tags])
                db.execute('UPDATE sources SET last_check=?,last_success=CASE WHEN ? IN (\'ok\',\'unchanged\') THEN ? ELSE last_success END,etag=?,modified=?,error=?,state=? WHERE id=?', (checked,status,checked,etag,modified,error,status,s['id']))
                db.execute('INSERT INTO source_checks VALUES(?,?,?,?,?)', (s['id'],checked,status,len(docs),error))
                db.commit()
                print(f'{s["id"]}: {status}; items={len(docs)}'+('; '+error if error else ''), flush=True)
        db.execute('DELETE FROM source_checks WHERE checked_at<?', ((stamp-dt.timedelta(days=30)).isoformat(),))
        db.commit()
        health = [dict(zip(('id','name','state','last_check','last_success','error'), r)) for r in db.execute('SELECT id,name,state,last_check,last_success,error FROM sources ORDER BY id')]
        payload = dict(checked_at=now().isoformat(), storage='local_only', website_sync=False, sources=health,
                       announcement_count=db.execute('SELECT count(*) FROM announcements').fetchone()[0],
                       candidate_count=db.execute('SELECT count(*) FROM announcements WHERE important=1').fetchone()[0])
        tmp = state_dir/'health.tmp'
        tmp.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding='utf-8')
        tmp.replace(state_dir/'health.json')
        return 1 if any(s['state'] == 'error' for s in health) else 0


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--state-dir', type=Path, default=DEFAULT_STATE)
    parser.add_argument('--force', action='store_true')
    parser.add_argument('--reclassify', action='store_true',help='Recompute local candidate classification without network calls')
    args = parser.parse_args()
    try:
        if args.reclassify:
            reclassify(args.state_dir)
        else:
            sys.exit(run(args.state_dir, args.force))
    except Exception as exc:
        print('Collector failed: '+type(exc).__name__, file=sys.stderr)
        sys.exit(2)
