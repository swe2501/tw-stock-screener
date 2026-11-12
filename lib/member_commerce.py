"""Shared membership catalog. Administration is dispatched only after admin JWT verification.

SQL is prepared separately; missing configuration fails closed for new purchases.
"""
import json
import re

KEY = 'member_commerce_v1'
TIERS = ('free', 'observation', 'research', 'advanced', 'vip')
ICONS = ('book', 'compass', 'chart', 'spark', 'shield', 'diamond', 'layers', 'star')
FEATURES = {
    'chart_tools': 'K 圖分析工具', 'breadth': '大盤多空廣度',
    'fhedge': '外資空單溫度計', 'themes': '題材與產業地圖',
    'etfsim': 'ETF 相似度與持股重疊', 'etfx': '主動 ETF 集中變化',
    'screen': '篩選工具', 'learning': '學習中心', 'favorites': '自選與研究筆記',
}
BASE = ['chart_tools', 'themes', 'etfsim', 'etfx', 'screen', 'learning', 'favorites']
NAMES = ['見習研究生', '市場觀察員', '趨勢研究員', '先見領航員']


class CatalogError(Exception):
    def __init__(self, status, message):
        self.status, self.message = status, message


def defaults():
    return {'revision': 0, 'payments_enabled': False, 'products': [
        {'id': tier, 'name': NAMES[i], 'tier': tier, 'icon': ICONS[i],
         'description': '從基本研究開始。' if not i else '完整市場觀察與個人研究工具。',
         'details': '各項工具的資料日期與使用方式，請見下方詳細解說。',
         'active': True, 'position': i, 'days': 30, 'price_twd': [0, 380, 680, 880][i],
         'sandbox_only': True, 'features': BASE + (['breadth', 'fhedge'] if i else []),
         'plan_code': None}
        for i, tier in enumerate(('free', 'observation', 'research', 'vip'))]}


def read(rest):
    st, rows = rest('/admin_settings?select=value&key=eq.' + KEY)
    if st != 200 or not isinstance(rows, list):
        raise CatalogError(503, '會員商品設定暫時無法讀取')
    if not rows:
        return defaults()
    try:
        config = json.loads(rows[0]['value'])
        if not isinstance(config, dict) or not isinstance(config.get('products'), list):
            raise ValueError()
        return config
    except (ValueError, KeyError, TypeError):
        raise CatalogError(503, '會員商品設定格式異常，付款保持關閉')


def validate(body):
    if not isinstance(body, dict) or type(body.get('payments_enabled')) is not bool:
        raise CatalogError(400, '請設定付款開關')
    products = body.get('products')
    if not isinstance(products, list) or len(products) < 1:
        raise CatalogError(400, '請至少保留一個商品設定（可全部下架）')
    ids, result = set(), []
    for item in products:
        if not isinstance(item, dict):
            raise CatalogError(400, '商品格式錯誤')
        p = {k: item.get(k) for k in ('id', 'name', 'description', 'details', 'tier', 'icon',
              'active', 'position', 'days', 'price_twd', 'sandbox_only', 'features')}
        if not isinstance(p['id'], str) or not re.fullmatch(r'[a-z][a-z0-9_-]{1,39}', p['id']) or p['id'] in ids:
            raise CatalogError(400, '商品代碼須唯一，限小寫英數、底線與連字號')
        ids.add(p['id'])
        for key, limit in (('name', 60), ('description', 180), ('details', 3000)):
            if not isinstance(p[key], str) or not p[key].strip() or len(p[key]) > limit:
                raise CatalogError(400, '請填寫商品名稱、簡介與詳細說明，並遵守字數限制')
            p[key] = p[key].strip()
        if p['tier'] not in TIERS or p['icon'] not in ICONS:
            raise CatalogError(400, '請選擇有效的授權等級與圖標')
        if any(type(p[k]) is not bool for k in ('active', 'sandbox_only')):
            raise CatalogError(400, '上下架與測試模式須為開關值')
        for key, low, high in (('position', 0, 999), ('days', 1, 400), ('price_twd', 0 if p['tier'] == 'free' else 1, 100000)):
            if type(p[key]) is not int or not low <= p[key] <= high:
                raise CatalogError(400, '排序、天數或價格不在允許範圍')
        if p['tier'] == 'free' and p['price_twd'] != 0:
            raise CatalogError(400, '免費身分價格必須為零')
        if (not isinstance(p['features'], list) or any(not isinstance(f, str) for f in p['features'])
                or len(p['features']) != len(set(p['features'])) or any(f not in FEATURES for f in p['features'])):
            raise CatalogError(400, '商品含不支援的會員權益；AI 與管理員工具不可上架')
        result.append(p)
    return {'payments_enabled': body['payments_enabled'], 'products': result}


def payment_open(rest):
    return read(rest).get('payments_enabled') is True


def public_catalog(rest, env=None):
    config = read(rest)
    opened = bool(env) and config.get('payments_enabled') is True
    products = []
    for original in sorted(config['products'], key=lambda p: p['position']):
        if not original.get('active'):
            continue
        p = {k: original[k] for k in ('id', 'name', 'description', 'details', 'tier', 'icon', 'position', 'features')}
        purchasable = opened and original['tier'] != 'free' and bool(original.get('sandbox_only')) == (env == 'sandbox') and bool(original.get('plan_code'))
        p['purchasable'] = purchasable
        if purchasable:
            p.update({k: original[k] for k in ('price_twd', 'days', 'plan_code')})
        products.append(p)
    return {'revision': config.get('revision', 0), 'payments_enabled': opened,
            'env': env if opened else None, 'products': products}


def plans(rest, env):
    config = read(rest)
    return [{'plan_code': p['plan_code'], 'tier': p['tier'], 'days': p['days'],
             'price_twd': p['price_twd'], 'label': p['name']}
            for p in sorted(config['products'], key=lambda p: p['position'])
            if p.get('active') and p['tier'] != 'free' and p.get('plan_code')
            and bool(p['sandbox_only']) == (env == 'sandbox')]


def access(user, rest):
    # SQL resolves actual paid periods and voucher scope, never a browser-selected product.
    st, value = rest('/rpc/member_commerce_access', 'POST', {'p_user': user['id']})
    if st != 200 or not isinstance(value, dict):
        raise CatalogError(503, '會員權益服務尚未就緒，請稍後再試')
    return value


def handle_admin(action, body, rest):
    try:
        if action == 'admin_commerce_get':
            return 200, {'config': read(rest), 'features': FEATURES, 'icons': ICONS}
        if action == 'admin_commerce_save':
            config = validate(body.get('config'))
            revision = body.get('revision')
            if type(revision) is not int or revision < 0:
                raise CatalogError(400, '缺少設定版本，請重新載入')
            st, out = rest('/rpc/admin_member_commerce_save', 'POST',
                           {'p_config': config, 'p_revision': revision})
            if st != 200:
                code = (out or {}).get('message', '') if isinstance(out, dict) else ''
                if 'COMMERCE_CONFLICT' in code:
                    raise CatalogError(409, '設定已由其他人更新，請重新載入後再編輯')
                raise CatalogError(503, '商品設定尚無法儲存，請確認配套資料庫更新已完成')
            return 200, {'config': out, 'saved': True}
        raise CatalogError(400, '未知商品管理操作')
    except CatalogError as e:
        return e.status, {'error': e.message}
