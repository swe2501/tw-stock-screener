"""線下論壇簽到／補發代碼／站內廣告。

只用既有表：admin_settings（鍵值，僅 service_role）與 member_point_ledger
（source_event_key unique）。不新增資料表、不改 Auth、不新增排程。

鍵：
  forum:events                    場次清單 JSON
  forumcheckin:<event>:<user>     到場紀錄（現場掃碼或補發代碼）
  forumcode:<CODE>                補發代碼已使用標記（insert 衝突＝已用過）
  site_ads                        站內廣告清單 JSON
  adclick:<ad>:<YYYYMMDD>         廣告點擊計數（約略值）
點數：member_point_ledger.source_event_key = 'forum-attend:<user>'
      → 每位會員一生只會有一筆論壇點數（重複插入會 409）。
"""
import base64
import datetime
import hashlib
import hmac
import json
import os
import re
import secrets
from urllib.parse import quote

TW = datetime.timezone(datetime.timedelta(hours=8))
CITIES = {'TPE': '台北', 'TXG': '台中', 'KHH': '高雄'}
FORUM_POINTS = 1000
QR_STEP = 60            # 現場 QR 每 60 秒換一次
QR_GRACE = 2            # 接受目前與前 2 個時間窗（約 2–3 分鐘內掃到的網址）
PASS_MINUTES = 40       # 掃到有效 QR 後，40 分鐘內完成登入／註冊即可簽到
CODE_MAX_BATCH = 2000
AD_SLOTS = {
    'top_bar': '頁首公告條（全站）',
    'home_card': '首頁卡片',
    'results_top': '選股結果上方',
    'member_center': '會員中心',
    'corner': '右下角浮動卡',
}
AUDIENCES = {'all': '所有人', 'guest': '未登入訪客', 'member': '已登入會員',
             'not_attended': '尚未參加過論壇的會員'}
_EVENT_ID = re.compile(r'^(TPE|TXG|KHH)\d{4}[A-Z]?$')
_CODE = re.compile(r'^((?:TPE|TXG|KHH)\d{4}[A-Z]?)-([A-Z2-9]{5})-([A-Z2-9]{4})$')
_ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'   # 去掉易混淆的 0/O/1/I


def now():
    return datetime.datetime.now(TW)


def _secret():
    s = os.environ.get('FORUM_CODE_SECRET') or ''
    if s:
        return s.encode()
    base = os.environ.get('SUPABASE_SERVICE_KEY', '')
    return hmac.new(base.encode(), b'forum-checkin-v1', hashlib.sha256).digest() if base else b''


def _sig(msg, n=8):
    key = _secret()
    if not key:
        raise RuntimeError('NO_SECRET')
    d = hmac.new(key, msg.encode(), hashlib.sha256).digest()
    return base64.b32encode(d).decode().rstrip('=')[:n]


# ── 現場 QR（每 60 秒換一次） ──
def qr_token(event_id, at=None):
    w = int((at or now()).timestamp()) // QR_STEP
    return _sig('qr:%s:%d' % (event_id, w), 6)


def qr_valid(event_id, token, at=None):
    t = int((at or now()).timestamp()) // QR_STEP
    token = (token or '').upper()
    return any(hmac.compare_digest(_sig('qr:%s:%d' % (event_id, t - k), 6), token) for k in range(QR_GRACE + 1))


def make_pass(event_id, at=None):
    exp = int((at or now()).timestamp()) + PASS_MINUTES * 60
    return '%s.%d.%s' % (event_id, exp, _sig('pass:%s:%d' % (event_id, exp), 12))


def pass_event(p, at=None):
    try:
        eid, exp, sig = str(p).split('.')
        exp = int(exp)
    except (ValueError, TypeError):
        return None
    if exp < int((at or now()).timestamp()):
        return None
    return eid if hmac.compare_digest(_sig('pass:%s:%d' % (eid, exp), 12), sig) else None


# ── 補發代碼（一次性；隨機產生，用簽章驗真，不需事先存檔） ──
def make_code(event_id):
    body = ''.join(secrets.choice(_ALPHA) for _ in range(5))
    return '%s-%s-%s' % (event_id, body, _code_tail(event_id, body))


def _code_tail(event_id, body):
    return ''.join(c if c in _ALPHA else 'X' for c in _sig('code:%s:%s' % (event_id, body), 4))


def code_event(code):
    m = _CODE.match((code or '').strip().upper())
    if not m:
        return None
    eid = m.group(1)
    return eid if hmac.compare_digest(_code_tail(eid, m.group(2)), m.group(3)) else None


def is_forum_code(code):
    return bool(_CODE.match((code or '').strip().upper()))


# ── 場次 ──
def _parse_dt(date, hm):
    y, mo, d = (int(x) for x in date.split('-'))
    h, mi = (int(x) for x in hm.split(':'))
    return datetime.datetime(y, mo, d, h, mi, tzinfo=TW)


def checkin_window(ev):
    """現場簽到：開始前 60 分鐘～結束。"""
    s = _parse_dt(ev['date'], ev.get('start') or '13:30')
    e = _parse_dt(ev['date'], ev.get('end') or '17:30')
    return s - datetime.timedelta(minutes=60), e


def code_window(ev):
    """補發代碼：活動開始～活動後 code_days 天（預設 14 天）的 23:59。"""
    s = _parse_dt(ev['date'], ev.get('start') or '13:30')
    days = int(ev.get('code_days') or 14)
    e = _parse_dt(ev['date'], '23:59') + datetime.timedelta(days=days)
    return s, e


def clean_event(raw, existing_ids=()):
    city = str(raw.get('city') or '').upper()
    if city not in CITIES:
        raise ValueError('城市需為台北／台中／高雄')
    date = str(raw.get('date') or '')
    try:
        dd = datetime.date.fromisoformat(date)
    except ValueError:
        raise ValueError('日期格式錯誤')
    start, end = str(raw.get('start') or '13:30'), str(raw.get('end') or '17:30')
    for t in (start, end):
        if not re.match(r'^\d{2}:\d{2}$', t):
            raise ValueError('時間格式需為 HH:MM')
    if end <= start:
        raise ValueError('結束時間需晚於開始時間')
    eid = str(raw.get('id') or '')
    if not eid:
        eid = '%s%02d%02d' % (city, dd.month, dd.day)
        n = 0
        while eid in existing_ids:
            eid = '%s%02d%02d%s' % (city, dd.month, dd.day, chr(65 + n))
            n += 1
    if not _EVENT_ID.match(eid):
        raise ValueError('場次代號錯誤')
    status = raw.get('status') or 'draft'
    if status not in ('draft', 'published', 'closed'):
        status = 'draft'
    code_days = int(raw.get('code_days') or 14)
    return {
        'id': eid, 'city': city, 'date': date, 'start': start, 'end': end,
        'venue': str(raw.get('venue') or '')[:120], 'title': str(raw.get('title') or '')[:80],
        'capacity': max(0, min(5000, int(raw.get('capacity') or 0))),
        'status': status, 'test': bool(raw.get('test')),
        'code_days': max(1, min(60, code_days)),
        'signup_url': str(raw.get('signup_url') or '')[:300] if str(raw.get('signup_url') or '').startswith('https://') else '',
    }


def event_label(ev):
    d = ev['date'][5:].replace('-', '/')
    return '%s場 %s' % (CITIES.get(ev['city'], ''), d)


# ── 廣告 ──
def clean_ad(raw):
    slot = raw.get('slot')
    if slot not in AD_SLOTS:
        raise ValueError('請選擇廣告版位')
    aud = raw.get('audience') if raw.get('audience') in AUDIENCES else 'all'
    title = str(raw.get('title') or '').strip()[:60]
    if not title:
        raise ValueError('請輸入標題')
    url = str(raw.get('url') or '').strip()[:400]
    if url and not (url.startswith('https://') or url.startswith('/') or url.startswith('#') or url.startswith('?')):
        raise ValueError('連結需為 https:// 開頭或站內連結')
    for k in ('starts', 'ends'):
        v = raw.get(k) or ''
        if v and not re.match(r'^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$', v):
            raise ValueError('時間格式錯誤')
    aid = str(raw.get('id') or '') or 'ad' + secrets.token_hex(4)
    if not re.match(r'^[a-z0-9]{3,20}$', aid):
        raise ValueError('廣告代號錯誤')
    return {
        'id': aid, 'name': str(raw.get('name') or title)[:60], 'slot': slot, 'audience': aud,
        'title': title, 'text': str(raw.get('text') or '')[:200], 'cta': str(raw.get('cta') or '了解更多')[:20],
        'url': url, 'forum_event': str(raw.get('forum_event') or '')[:12],
        'starts': raw.get('starts') or '', 'ends': raw.get('ends') or '',
        'enabled': bool(raw.get('enabled')), 'priority': max(0, min(99, int(raw.get('priority') or 50))),
    }


def _ad_live(ad, at):
    if not ad.get('enabled'):
        return False
    stamp = at.strftime('%Y-%m-%dT%H:%M')
    if ad.get('starts') and stamp < ad['starts'] + ('' if 'T' in ad['starts'] else 'T00:00'):
        return False
    if ad.get('ends') and stamp > ad['ends'] + ('' if 'T' in ad['ends'] else 'T23:59'):
        return False
    return True


def ads_for(ads, audience_flags, at=None):
    """audience_flags: {'guest':bool,'member':bool,'attended':bool}。每個版位取優先度最高的一則。"""
    at = at or now()
    best = {}
    for ad in ads:
        if not _ad_live(ad, at):
            continue
        a = ad.get('audience', 'all')
        ok = (a == 'all' or (a == 'guest' and audience_flags.get('guest'))
              or (a == 'member' and audience_flags.get('member'))
              or (a == 'not_attended' and audience_flags.get('member') and not audience_flags.get('attended')))
        if not ok:
            continue
        cur = best.get(ad['slot'])
        if cur is None or ad.get('priority', 50) > cur.get('priority', 50):
            best[ad['slot']] = ad
    pub = ('id', 'slot', 'title', 'text', 'cta', 'url', 'forum_event')
    return [{k: v.get(k, '') for k in pub} for v in best.values()]


# ── 存取 ──
def _get_json(rest, key, default):
    st, rows = rest('/admin_settings?select=value&key=eq.' + quote(key, safe=''))
    if st != 200 or not isinstance(rows, list):
        raise RuntimeError('READ_FAILED')
    if not rows:
        return default
    try:
        return json.loads(rows[0].get('value') or 'null') or default
    except ValueError:
        return default


def _put_json(rest, key, value):
    st, _ = rest('/admin_settings?on_conflict=key', 'POST',
                 {'key': key, 'value': json.dumps(value, ensure_ascii=False), 'updated_at': now().isoformat()},
                 'resolution=merge-duplicates,return=minimal')
    if st not in (200, 201, 204):
        raise RuntimeError('WRITE_FAILED')


def _insert_once(rest, key, value):
    """新增一列；已存在回 False（PostgREST 409）。"""
    st, _ = rest('/admin_settings', 'POST',
                 {'key': key, 'value': json.dumps(value, ensure_ascii=False), 'updated_at': now().isoformat()},
                 'return=minimal')
    if st in (200, 201, 204):
        return True
    if st == 409:
        return False
    raise RuntimeError('WRITE_FAILED')


def _list_prefix(rest, prefix, select='key,value,updated_at'):
    st, rows = rest('/admin_settings?select=%s&key=like.%s&order=updated_at.desc&limit=5000' % (select, quote(prefix + '*', safe='*')))
    if st != 200 or not isinstance(rows, list):
        raise RuntimeError('READ_FAILED')
    return rows


def has_attended(rest, uid):
    st, rows = rest('/member_point_ledger?select=id&limit=1&source_event_key=eq.' + quote('forum-attend:' + uid, safe=''))
    return st == 200 and isinstance(rows, list) and len(rows) > 0


def _grant(rest, user, ev, via, code=''):
    """發點＋寫到場紀錄。回 (status, payload)。"""
    uid = user['id']
    label = event_label(ev)
    if ev.get('test'):
        ok = _insert_once(rest, 'forumcheckin:%s:%s' % (ev['id'], uid),
                          {'at': now().isoformat(), 'via': via, 'email': user.get('email') or '', 'phone': user.get('phone') or '', 'code': code, 'test': True})
        return 200, {'ok': True, 'test': True, 'duplicate': not ok, 'event': label,
                     'message': '測試場次：簽到流程正常（不發點數）'}
    st, _ = rest('/member_point_ledger', 'POST',
                 {'user_id': uid, 'description': '線下論壇到場活動點數（%s）' % label, 'points': FORUM_POINTS,
                  'source_event_key': 'forum-attend:' + uid}, 'return=minimal')
    if st == 409:
        return 409, {'error': '你已領過論壇到場點數，每位會員限領一次。', 'code': 'FORUM_ALREADY'}
    if st not in (200, 201, 204):
        return 503, {'error': '點數暫時無法發放，請稍後再試或洽工作人員。'}
    _insert_once(rest, 'forumcheckin:%s:%s' % (ev['id'], uid),
                 {'at': now().isoformat(), 'via': via, 'email': user.get('email') or '', 'phone': user.get('phone') or '', 'code': code})
    return 200, {'ok': True, 'points': FORUM_POINTS, 'event': label,
                 'message': '簽到完成，%s 點已存入你的會員帳號。' % format(FORUM_POINTS, ',')}


def _verified(user):
    return bool(user and user.get('id') and (user.get('email_confirmed_at') or user.get('phone_confirmed_at')))


def _find_event(rest, eid):
    for ev in _get_json(rest, 'forum:events', []):
        if ev.get('id') == eid:
            return ev
    return None


# ── 會員／公開端 ──
def handle_public(action, body, user, rest):
    try:
        if action == 'forum_events':
            evs = [e for e in _get_json(rest, 'forum:events', []) if e.get('status') == 'published' and not e.get('test')]
            today = now().date().isoformat()
            evs = [dict((k, e.get(k)) for k in ('id', 'city', 'date', 'start', 'end', 'venue', 'title', 'signup_url'))
                   for e in sorted(evs, key=lambda e: e['date']) if e['date'] >= today]
            for e in evs:
                e['city_name'] = CITIES[e['city']]
            out = {'events': evs}
            if user and user.get('id'):
                out['attended'] = has_attended(rest, user['id'])
            return 200, out

        if action == 'forum_pass':
            eid, tok = str(body.get('e') or '').upper(), str(body.get('t') or '').upper()
            ev = _find_event(rest, eid)
            if not ev or ev.get('status') == 'draft' and not ev.get('test'):
                return 404, {'error': '找不到這個場次。'}
            s, e = checkin_window(ev)
            if not (s <= now() <= e):
                return 403, {'error': '現在不在簽到時間（%s %s–%s）。' % (ev['date'], ev['start'], ev['end']), 'code': 'FORUM_CLOSED'}
            if not qr_valid(eid, tok):
                return 403, {'error': 'QR 已更新，請重新掃描報到桌螢幕上的 QR。', 'code': 'FORUM_QR_EXPIRED'}
            return 200, {'pass': make_pass(eid), 'event': event_label(ev), 'venue': ev.get('venue', ''),
                         'minutes': PASS_MINUTES}

        if action == 'forum_checkin':
            if not user or not user.get('id'):
                return 401, {'error': '請先登入會員。', 'code': 'LOGIN_REQUIRED'}
            if not _verified(user):
                return 403, {'error': '請先完成 Email 或手機驗證。', 'code': 'MEMBER_VERIFY_REQUIRED'}
            eid = pass_event(body.get('pass'))
            if not eid:
                return 403, {'error': '簽到憑證已過期，請重新掃描報到桌螢幕上的 QR。', 'code': 'FORUM_PASS_EXPIRED'}
            ev = _find_event(rest, eid)
            if not ev:
                return 404, {'error': '找不到這個場次。'}
            s, e = checkin_window(ev)
            if not (s - datetime.timedelta(minutes=5) <= now() <= e + datetime.timedelta(minutes=PASS_MINUTES)):
                return 403, {'error': '已超過簽到時間。', 'code': 'FORUM_CLOSED'}
            return _grant(rest, user, ev, 'qr')

        if action == 'forum_redeem':
            if not user or not user.get('id'):
                return 401, {'error': '請先登入會員。', 'code': 'LOGIN_REQUIRED'}
            if not _verified(user):
                return 403, {'error': '請先完成 Email 或手機驗證。', 'code': 'MEMBER_VERIFY_REQUIRED'}
            code = str(body.get('code') or '').strip().upper()
            eid = code_event(code)
            if not eid:
                return 400, {'error': '代碼不正確，請確認後再輸入。', 'code': 'FORUM_CODE_INVALID'}
            ev = _find_event(rest, eid)
            if not ev:
                return 400, {'error': '代碼不正確，請確認後再輸入。', 'code': 'FORUM_CODE_INVALID'}
            s, e = code_window(ev)
            if now() < s:
                return 403, {'error': '這組代碼要在活動開始後才能兌換。', 'code': 'FORUM_CODE_EARLY'}
            if now() > e:
                return 403, {'error': '這組代碼已過兌換期限。', 'code': 'FORUM_CODE_EXPIRED'}
            if not ev.get('test') and has_attended(rest, user['id']):
                return 409, {'error': '你已領過論壇到場點數，每位會員限領一次。', 'code': 'FORUM_ALREADY'}
            if not _insert_once(rest, 'forumcode:' + code, {'uid': user['id'], 'at': now().isoformat()}):
                return 409, {'error': '這組代碼已被使用。', 'code': 'FORUM_CODE_USED'}
            st, out = _grant(rest, user, ev, 'code', code)
            if st != 200:
                rest('/admin_settings?key=eq.' + quote('forumcode:' + code, safe=''), 'DELETE', None, 'return=minimal')
            return st, out

        if action == 'site_ads':
            ads = _get_json(rest, 'site_ads', [])
            uid = user.get('id') if user else None
            flags = {'guest': not uid, 'member': bool(uid), 'attended': bool(uid) and has_attended(rest, uid)}
            return 200, {'ads': ads_for(ads, flags)}

        if action == 'ad_click':
            aid = str(body.get('id') or '')
            if not re.match(r'^[a-z0-9]{3,20}$', aid):
                return 400, {'error': 'bad id'}
            key = 'adclick:%s:%s' % (aid, now().strftime('%Y%m%d'))
            cur = _get_json(rest, key, 0)
            _put_json(rest, key, int(cur or 0) + 1)
            return 200, {'ok': True}
    except RuntimeError:
        return 503, {'error': '系統忙碌，請稍後再試。'}
    return 400, {'error': 'unknown action'}


# ── 點數調整／兌換商品 ──
_TRADE_WORDS = re.compile(r'買賣|進場|出場|停損|目標價|保證|穩賺|必漲')


def balance(rest, uid):
    st, rows = rest('/member_point_ledger?select=points&limit=100000&user_id=eq.' + quote(uid, safe=''))
    if st != 200 or not isinstance(rows, list):
        raise RuntimeError('READ_FAILED')
    return sum(int(r.get('points') or 0) for r in rows)


def _points_admin(action, body, rest, users):
    if action == 'admin_points_find':
        q = str(body.get('q') or '').strip().lower()
        if len(q) < 3:
            return 400, {'error': '請輸入至少 3 個字（Email 或手機）'}
        hits = [u for u in (users() or []) if q in (u.get('email') or '').lower() or q in (u.get('phone') or '')][:10]
        return 200, {'members': [{'id': u['id'], 'email': u.get('email') or '', 'phone': u.get('phone') or '',
                                  'balance': balance(rest, u['id']), 'forum': has_attended(rest, u['id'])} for u in hits]}
    if action == 'admin_points_adjust':
        uid = str(body.get('user_id') or '')
        rid = str(body.get('request_id') or '')
        reason = str(body.get('reason') or '').strip()
        try:
            pts = int(body.get('points'))
        except (TypeError, ValueError):
            return 400, {'error': '點數需為整數'}
        if not re.match(r'^[0-9a-f-]{36}$', uid) or not re.match(r'^[0-9a-f-]{16,36}$', rid):
            return 400, {'error': '資料不完整，請重新查詢會員'}
        if pts == 0 or abs(pts) > 100000:
            return 400, {'error': '單次調整需介於 ±1～100,000 點'}
        if len(reason) < 2:
            return 400, {'error': '請填寫調整原因（會顯示在會員的點數紀錄）'}
        bal = balance(rest, uid)
        if bal + pts < 0:
            return 400, {'error': '扣點後會變成負數（目前 %s 點）' % format(bal, ',')}
        st, _ = rest('/member_point_ledger', 'POST',
                     {'user_id': uid, 'description': ('後台調整：' if pts > 0 else '後台扣點：') + reason[:120],
                      'points': pts, 'source_event_key': 'admin-adjust:' + rid}, 'return=minimal')
        if st == 409:
            return 200, {'duplicate': True, 'balance': bal}
        if st not in (200, 201, 204):
            return 503, {'error': '寫入失敗，請稍後再試'}
        return 200, {'ok': True, 'balance': bal + pts}
    if action == 'admin_points_recent':
        st, rows = rest('/member_point_ledger?select=user_id,description,points,created_at&source_event_key=like.admin-adjust:*&order=created_at.desc&limit=50')
        if st != 200 or not isinstance(rows, list):
            raise RuntimeError('READ_FAILED')
        emails = {u['id']: u.get('email') or u.get('phone') or '' for u in (users() or [])} if rows else {}
        for r in rows:
            r['member'] = emails.get(r['user_id'], r['user_id'])
        return 200, {'rows': rows}
    if action == 'admin_products_list':
        st, rows = rest('/member_exchange_definitions?select=id,title,points,duration_days,active,voucher_definition&order=active.desc,points.asc')
        if st == 404 or (isinstance(rows, dict) and rows.get('code') in ('PGRST205', '42P01')):
            return 200, {'products': [], 'missing': True}
        if st != 200 or not isinstance(rows, list):
            raise RuntimeError('READ_FAILED')
        return 200, {'products': rows}
    if action == 'admin_products_save':
        pid = str(body.get('id') or '')
        title = str(body.get('title') or '').strip()
        if not re.match(r'^[a-z0-9-]{3,40}$', pid):
            return 400, {'error': '商品代號錯誤'}
        if not 2 <= len(title) <= 40:
            return 400, {'error': '名稱需 2～40 字'}
        if _TRADE_WORDS.search(title):
            return 400, {'error': '名稱不可含買賣、進出場、停損、保證獲利等用語'}
        try:
            pts = int(body.get('points'))
        except (TypeError, ValueError):
            return 400, {'error': '點數需為整數'}
        if not 1 <= pts <= 1000000:
            return 400, {'error': '點數需介於 1～1,000,000'}
        st, rows = rest('/member_exchange_definitions?id=eq.' + quote(pid, safe=''), 'PATCH',
                        {'title': title, 'points': pts, 'active': bool(body.get('active'))}, 'return=representation')
        if st != 200 or not rows:
            return 503, {'error': '儲存失敗，請稍後再試'}
        return 200, {'product': rows[0]}
    return None


# ── 後台 ──
def handle_admin(action, body, admin_email, rest, users=None):
    if not admin_email:
        return 403, {'error': '僅限管理者'}
    try:
        if action.startswith('admin_points_') or action.startswith('admin_products_'):
            out = _points_admin(action, body, rest, users or (lambda: []))
            if out:
                return out
        if action == 'admin_forum_list':
            evs = _get_json(rest, 'forum:events', [])
            rows = _list_prefix(rest, 'forumcheckin:', 'key')
            cnt = {}
            for r in rows:
                eid = r['key'].split(':')[1]
                cnt[eid] = cnt.get(eid, 0) + 1
            for e in evs:
                e['checked_in'] = cnt.get(e['id'], 0)
                e['label'] = event_label(e)
            return 200, {'events': sorted(evs, key=lambda e: e['date'], reverse=True), 'cities': CITIES}

        if action == 'admin_forum_save':
            evs = _get_json(rest, 'forum:events', [])
            raw = body.get('event') or {}
            ids = [e['id'] for e in evs if e['id'] != raw.get('id')]
            ev = clean_event(raw, ids)
            evs = [e for e in evs if e['id'] != ev['id']] + [ev]
            _put_json(rest, 'forum:events', evs)
            return 200, {'event': ev}

        if action == 'admin_forum_delete':
            eid = str(body.get('id') or '')
            if _list_prefix(rest, 'forumcheckin:%s:' % eid, 'key'):
                return 409, {'error': '已有人簽到的場次不能刪除，可改為「已結束」。'}
            evs = [e for e in _get_json(rest, 'forum:events', []) if e['id'] != eid]
            _put_json(rest, 'forum:events', evs)
            return 200, {'ok': True}

        if action == 'admin_forum_qr':
            eid = str(body.get('id') or '')
            ev = _find_event(rest, eid)
            if not ev:
                return 404, {'error': '找不到場次'}
            s, e = checkin_window(ev)
            n = now()
            rows = _list_prefix(rest, 'forumcheckin:%s:' % eid, 'key')
            left = QR_STEP - int(n.timestamp()) % QR_STEP
            return 200, {'id': eid, 'label': event_label(ev), 'venue': ev.get('venue', ''), 'test': ev.get('test', False),
                         'token': qr_token(eid, n), 'refresh_in': left, 'open': s <= n <= e,
                         'opens_at': s.strftime('%m/%d %H:%M'), 'closes_at': e.strftime('%H:%M'),
                         'checked_in': len(rows)}

        if action == 'admin_forum_attendees':
            eid = str(body.get('id') or '')
            rows = _list_prefix(rest, 'forumcheckin:%s:' % eid)
            out = []
            for r in rows:
                try:
                    v = json.loads(r.get('value') or '{}')
                except ValueError:
                    v = {}
                out.append({'user': r['key'].split(':')[2], 'at': v.get('at'), 'via': v.get('via'),
                            'email': v.get('email'), 'phone': v.get('phone'), 'code': v.get('code', ''), 'test': v.get('test', False)})
            return 200, {'attendees': out}

        if action == 'admin_forum_codes':
            eid = str(body.get('id') or '')
            ev = _find_event(rest, eid)
            if not ev:
                return 404, {'error': '找不到場次'}
            n = int(body.get('count') or 0)
            if not 1 <= n <= CODE_MAX_BATCH:
                return 400, {'error': '一次可產生 1～%d 組' % CODE_MAX_BATCH}
            codes = set()
            while len(codes) < n:
                codes.add(make_code(eid))
            s, e = code_window(ev)
            return 200, {'codes': sorted(codes), 'label': event_label(ev), 'valid_from': s.strftime('%Y-%m-%d %H:%M'),
                         'valid_to': e.strftime('%Y-%m-%d %H:%M')}

        if action == 'admin_forum_code_check':
            code = str(body.get('code') or '').strip().upper()
            eid = code_event(code)
            if not eid:
                return 200, {'valid': False}
            used = _get_json(rest, 'forumcode:' + code, None)
            return 200, {'valid': True, 'event': eid, 'used': bool(used), 'used_at': (used or {}).get('at')}

        if action == 'admin_ads_list':
            ads = _get_json(rest, 'site_ads', [])
            rows = _list_prefix(rest, 'adclick:')
            clicks = {}
            for r in rows:
                aid = r['key'].split(':')[1]
                try:
                    clicks[aid] = clicks.get(aid, 0) + int(json.loads(r.get('value') or '0'))
                except ValueError:
                    pass
            for a in ads:
                a['clicks'] = clicks.get(a['id'], 0)
                a['live'] = _ad_live(a, now())
            return 200, {'ads': sorted(ads, key=lambda a: (a['slot'], -a.get('priority', 50))),
                         'slots': AD_SLOTS, 'audiences': AUDIENCES}

        if action == 'admin_ads_save':
            ads = _get_json(rest, 'site_ads', [])
            ad = clean_ad(body.get('ad') or {})
            ads = [a for a in ads if a['id'] != ad['id']] + [ad]
            for a in ads:
                a.pop('clicks', None)
                a.pop('live', None)
            _put_json(rest, 'site_ads', ads)
            return 200, {'ad': ad}

        if action == 'admin_ads_delete':
            aid = str(body.get('id') or '')
            ads = [a for a in _get_json(rest, 'site_ads', []) if a['id'] != aid]
            _put_json(rest, 'site_ads', ads)
            return 200, {'ok': True}
    except ValueError as e:
        return 400, {'error': str(e)}
    except RuntimeError:
        return 503, {'error': '資料暫時無法讀寫，請稍後再試。'}
    return 400, {'error': 'unknown action'}
