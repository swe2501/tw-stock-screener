"""Admin-authorized UAT pattern decisions; existing admin_settings storage only."""
import datetime
import json
import os
from urllib.parse import quote
from lib.pattern_review_cases import CASES

STATES = {'pending', 'forming', 'breakout', 'rejected'}


def handle(action, body, admin_email, rest):
    # Caller is verified by auth.py before entering this handler.
    if not admin_email:
        return 403, {'error': '僅限管理者'}
    if os.environ.get('VERCEL_ENV') != 'preview' or os.environ.get('VERCEL_GIT_COMMIT_REF') != 'uat':
        return 403, {'error': '此複核工作台僅開放UAT'}
    cases = {c['id']: c for c in CASES}
    def key(case_id):
        return 'pattern_review_uat_v1_' + case_id
    keys = ','.join(key(c) for c in cases)
    st, rows = rest('/admin_settings?select=key,value&key=' + quote('in.(' + keys + ')', safe='().,'))
    if st != 200 or not isinstance(rows, list):
        return 503, {'error': '複核紀錄暫時無法讀取，請稍後重試'}
    raw = {r['key']: r['value'] for r in rows}
    decisions = {}
    try:
        for case_id, case in cases.items():
            value = raw.get(key(case_id))
            d = json.loads(value) if value is not None else None
            if d and d.get('source_sha256') != case['source_sha256']:
                d = None
            decisions[case_id] = d
    except (ValueError, TypeError):
        return 503, {'error': '複核紀錄格式異常，未覆寫原紀錄'}
    if action == 'admin_pattern_reviews':
        return 200, {'admin': True, 'scope': 'uat', 'cases': CASES, 'decisions': decisions}
    case_id = body.get('case_id')
    state = body.get('status')
    if not isinstance(case_id, str) or case_id not in cases or not isinstance(state, str) or state not in STATES:
        return 400, {'error': '無效的案例或狀態'}
    case = cases[case_id]
    if body.get('source_sha256') != case['source_sha256']:
        return 409, {'error': '判讀行情版本已變更，請重新載入'}
    old = decisions[case_id]
    if body.get('expected_revision') != (old or {}).get('revision'):
        return 409, {'error': '其他管理者已更新，請重新載入後確認'}
    timestamp = datetime.datetime.now(datetime.timezone.utc).isoformat()
    decision = dict(status=state, source_sha256=case['source_sha256'], revision=timestamp,
                    reviewed_by=admin_email, reviewed_at=timestamp, case_id=case_id)
    value = json.dumps(decision, ensure_ascii=False, separators=(',', ':'))
    k = key(case_id)
    if k in raw:
        # Compare-and-swap prevents silently overwriting a partner's newer review.
        path = '/admin_settings?key=eq.' + quote(k, safe='') + '&value=eq.' + quote(raw[k], safe='')
        st, result = rest(path, method='PATCH', body={'value': value}, prefer='return=representation')
    else:
        st, result = rest('/admin_settings', method='POST', body=[{'key': k, 'value': value}], prefer='return=representation')
    if st == 409 or st in (200, 201) and result == []:
        return 409, {'error': '其他管理者剛更新此案例，請重新載入'}
    if st not in (200, 201) or not isinstance(result, list) or len(result) != 1:
        return 503, {'error': '儲存失敗，原判定未變更，請重試'}
    return 200, {'ok': True, 'decision': decision, 'public_patterns_changed': False}
