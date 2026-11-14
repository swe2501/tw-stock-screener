"""Authenticated device leases. JWT validation and owner scope live in PostgreSQL."""
import json
import os
import urllib.request
import urllib.error


def enabled():
    return os.environ.get('MEMBER_DEVICE_POLICY_ENABLED', '').lower() in ('1', 'true')


def rollout_ready():
    """The DB is shared: UAT must not activate limits against an older live website."""
    if not enabled():
        return False
    request = urllib.request.Request(
        'https://tw-stock-screener-neon.vercel.app/api/auth', method='POST',
        data=b'{"action":"member_device_protocol"}', headers={'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(request, timeout=5) as response:
            value = json.loads(response.read(2048))
        return value.get('device_protocol') == 1 and value.get('guard_ready') is True
    except Exception:
        return False


def rpc(token, name, body):
    base, key = os.environ.get('SUPABASE_URL', ''), os.environ.get('SUPABASE_ANON_KEY', '')
    if not token or len(token) > 8192:
        return 401, {'error': '請先登入', 'code': 'MEMBER_LOGIN_REQUIRED'}
    if not base or not key:
        return 503, {'error': '裝置管理服務尚未就緒', 'code': 'MEMBER_DEVICE_UNAVAILABLE'}
    request = urllib.request.Request(base.rstrip('/') + '/rest/v1/rpc/' + name,
        data=json.dumps(body).encode(), method='POST', headers={
            'apikey': key, 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(request, timeout=8) as response:
            raw = response.read(65536)
            return 200, json.loads(raw) if raw else None
    except urllib.error.HTTPError as error:
        status = error.code if error.code in (401, 409) else 503
        return status, {'error': '請管理登入裝置，或選擇在這台繼續使用。' if status == 409 else '登入已到期，請重新登入後繼續。' if status == 401 else '裝置驗證暫時無法完成，請稍後再試。',
                        'code': 'MEMBER_DEVICE_LIMIT' if status == 409 else 'MEMBER_DEVICE_UNAVAILABLE'}
    except Exception:
        return 503, {'error': '裝置驗證暫時無法完成，請稍後再試。', 'code': 'MEMBER_DEVICE_UNAVAILABLE'}


def check(token):
    if not enabled() or not token:
        return None
    status, result = rpc(token, 'member_device_require', {})
    return (status, result) if status != 200 else None


def manage(token, body):
    if not enabled():
        return 200, {'enabled': False, 'ready': False, 'devices': []}
    action = body.get('operation', 'status')
    if action not in ('status', 'claim', 'takeover', 'list', 'revoke', 'release'):
        return 400, {'error': '不支援的裝置操作'}
    target = body.get('target')
    if action == 'revoke':
        from uuid import UUID
        try:
            target = str(UUID(target))
        except (TypeError, ValueError, AttributeError):
            return 400, {'error': '請選擇有效裝置'}
    label = body.get('label', '瀏覽器')
    if not isinstance(label, str) or len(label) > 80:
        return 400, {'error': '裝置名稱過長'}
    return rpc(token, 'member_device_manage', {'p_action': action, 'p_target': target, 'p_label': label})
