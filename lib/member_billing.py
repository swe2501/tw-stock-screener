"""Provider-independent billing rules. No charges or membership grants are made here."""
import calendar
import datetime as dt
from decimal import Decimal, ROUND_HALF_UP
from uuid import UUID

TAIPEI = dt.timezone(dt.timedelta(hours=8))
RANK = {'free': 0, 'observation': 1, 'research': 2, 'advanced': 2, 'vip': 3}
SOURCE = {'free': '免費會員', 'monthly': '每月訂閱', 'one_time': '單次購買',
          'administrator': '管理員授權', 'voucher': '使用券', 'unknown': '待確認'}


def instant(value):
    if isinstance(value, dt.datetime):
        result = value
    else:
        result = dt.datetime.fromisoformat(str(value).replace('Z', '+00:00'))
    if result.tzinfo is None:
        raise ValueError('timezone required')
    return result


def next_month(value, anchor_day=None):
    local = instant(value).astimezone(TAIPEI)
    year, month = local.year + (local.month == 12), local.month % 12 + 1
    return local.replace(year=year, month=month,
                         day=min(anchor_day or local.day, calendar.monthrange(year, month)[1]))


def change_quote(current, target, now=None):
    """Integer TWD, end-exclusive periods; the backend owns all price snapshots."""
    now = instant(now or dt.datetime.now(dt.timezone.utc))
    price = target['price_twd']
    if type(price) is not int or price < 0 or target['tier'] not in RANK:
        raise ValueError('invalid plan')
    if not current or instant(current['period_end']) <= now:
        return {'operation': 'new', 'amount_due': price, 'effective_at': now.isoformat()}
    start, end = instant(current['period_start']), instant(current['period_end'])
    if end <= start:
        raise ValueError('invalid service period')
    if current['plan']['id'] == target['id']:
        return {'operation': 'unchanged', 'amount_due': 0, 'effective_at': now.isoformat()}
    old = current['plan']
    if (RANK[target['tier']], price) < (RANK[old['tier']], old['price_twd']):
        return {'operation': 'downgrade', 'amount_due': 0, 'effective_at': end.isoformat()}
    fraction = max(Decimal(0), min(Decimal(1), Decimal(str((end-now).total_seconds())) /
                                  Decimal(str((end-start).total_seconds()))))
    amount = (Decimal(max(0, price-old['price_twd'])) * fraction).quantize(Decimal('1'), rounding=ROUND_HALF_UP)
    return {'operation': 'upgrade', 'amount_due': int(amount), 'effective_at': now.isoformat(),
            'period_end': end.isoformat()}


def legacy_summaries(users, rest, admin_ids=(), now=None):
    """Bounded bulk reads; old paid periods are single purchases, never assumed recurring."""
    now = instant(now or dt.datetime.now(dt.timezone.utc))
    datasets, available = {}, True
    owners = ','.join(str(UUID(u['id'])) for u in users)
    if not owners:
        return {}
    paths = {
        'tiers': '/member_tiers?select=user_id,tier,expires_at',
        'periods': '/member_subscription_periods?select=id,user_id,starts_at,expires_at,revoked_at',
        'orders': '/member_payment_orders?select=user_id,period_id,status&kind=eq.membership&status=eq.paid',
        'vouchers': '/member_entitlements?select=user_id,starts_at,expires_at',
        'contracts': '/member_billing_contracts?select=user_id,status,current_period_end,cancel_at_period_end,next_charge_at,is_test',
    }
    for name, path in paths.items():
        collected = []
        for offset in range(0, 10000, 1000):
            status, rows = rest(path + '&user_id=in.(' + owners + ')&order=user_id&limit=1000&offset=' + str(offset))
            if status != 200 or not isinstance(rows, list):
                if not (name == 'contracts' and status == 404):
                    available = False
                break
            collected.extend(rows)
            if len(rows) < 1000:
                break
        else:
            available = False
        datasets[name] = collected
    def future(value):
        try:
            return not value or instant(value) > now
        except (ValueError, TypeError):
            return False
    out = {}
    for user in users:
        uid = user['id']
        tiers = [x for x in datasets['tiers'] if x.get('user_id') == uid and x.get('tier') != 'free' and future(x.get('expires_at'))]
        periods = [x for x in datasets['periods'] if x.get('user_id') == uid and not x.get('revoked_at')
                   and x.get('starts_at') and instant(x['starts_at']) <= now and future(x.get('expires_at'))]
        paid_ids = {x.get('period_id') for x in datasets['orders'] if x.get('user_id') == uid}
        contracts = [x for x in datasets['contracts'] if x.get('user_id') == uid and x.get('is_test') is False
                     and (x.get('status') == 'past_due' or
                          x.get('status') in ('active', 'canceled') and x.get('current_period_end') and future(x['current_period_end']))]
        vouchers = [x for x in datasets['vouchers'] if x.get('user_id') == uid and x.get('starts_at')
                    and instant(x['starts_at']) <= now and future(x.get('expires_at'))]
        result = {'source': 'free' if available else 'unknown', 'status': '使用中' if available else '待確認',
                  'next_charge_at': None, 'expires_at': None, 'auto_renew': False}
        if uid in admin_ids or tiers:
            result.update(source='administrator', status='永久授權' if uid in admin_ids or any(not x.get('expires_at') for x in tiers) else '期限授權',
                          expires_at=None if uid in admin_ids else max((x['expires_at'] for x in tiers if x.get('expires_at')), default=None))
        elif not available:
            pass
        elif contracts:
            c = max(contracts, key=lambda x: x.get('current_period_end') or '')
            canceled = c.get('cancel_at_period_end') or c['status'] == 'canceled'
            result.update(source='monthly', status='已取消續訂' if canceled else '扣款失敗' if c['status']=='past_due' else '訂閱中',
                          next_charge_at=None if canceled else c.get('next_charge_at'),
                          expires_at=c.get('current_period_end'), auto_renew=not canceled)
        elif periods:
            p = max(periods, key=lambda x: x['expires_at'])
            result.update(source='one_time' if p['id'] in paid_ids else 'administrator',
                          status='使用中' if p['id'] in paid_ids else '期限授權', expires_at=p['expires_at'])
        elif vouchers:
            result.update(source='voucher', status='使用中', expires_at=max(x['expires_at'] for x in vouchers))
        result['source_label'] = SOURCE[result['source']]
        out[uid] = result
    return out


def handle(action, body, user, rest, admin_ids=()):
    if not user:
        return 401, {'error': '請先登入'}
    try:
        uid = str(UUID(user['id']))
    except (ValueError, TypeError, KeyError):
        return 401, {'error': '登入身分無效'}
    if action == 'billing_status':
        return 200, {'billing': legacy_summaries([{'id': uid}], rest, admin_ids)[uid],
                     'recurring_provider_ready': False}
    if action in ('billing_quote', 'billing_prepare'):
        from lib import member_commerce as commerce
        try:
            product = next((p for p in commerce.read(rest)['products'] if p['id'] == body.get('product_id') and p.get('active')), None)
        except commerce.CatalogError:
            product = None
        if not product or product['tier'] == 'free' or body.get('billing_mode') not in ('monthly', 'one_time'):
            return 400, {'error': '請選擇有效方案與購買方式'}
        if any(k in body for k in ('user_id', 'price_twd', 'amount', 'tier', 'paid')):
            return 400, {'error': '價格與會員身分由伺服器確認'}
        # No provider means no real charge, active contract, or membership grant.
        return 200, {'provider_ready': False, 'can_submit': False,
                     'product_id': product['id'], 'billing_mode': body['billing_mode'],
                     'message': '方案已選擇；付款服務尚未開放，不會扣款或建立正式訂閱。'}
    return 400, {'error': '不支援的帳務操作'}
