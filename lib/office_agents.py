"""Fixed mapping of the six real research-office agents.

Tokens are read from environment variables named OFFICE_AGENT_TOKEN_<KEY>.
This module never generates, writes, or logs token values.
"""
import os
import time

AGENTS = {
    'ceo': {
        'key': 'ceo',
        'display': 'AI_stock CEO',
        'agent_id': '58a39bf0-e90e-47fc-a0dc-4d1b55df5b0a',
        'department': 0,
        'can_claim': True,
    },
    'cto': {
        'key': 'cto',
        'display': 'AI_stock CTO',
        'agent_id': '5a6a7d15-c5b7-4753-962b-e4b28f602d62',
        'department': 6,
        'can_claim': True,
    },
    'eng': {
        'key': 'eng',
        'display': 'AI_stock 工程師',
        'agent_id': '1bf86f42-9102-4930-81c4-8fab104f68fb',
        'department': 6,
        'can_claim': True,
    },
    'qa': {
        'key': 'qa',
        'display': 'AI_stock 測試工程師',
        'agent_id': '9e04d9cd-af72-4e42-aa34-67a5bc6cc2ae',
        'department': 8,
        'can_claim': True,
    },
    'sec': {
        'key': 'sec',
        'display': 'AI_stock 資安工程師',
        'agent_id': '0c985f8d-65df-46d6-b450-78f98db2f236',
        'department': 9,
        'can_claim': True,
    },
    'mochi': {
        'key': 'mochi',
        'display': 'Mochi',
        'agent_id': '5af05576-e3a0-4685-8909-bc3d5e9975e2',
        'department': 20,
        'can_claim': False,
        'role': 'PMO／協調',
    },
}

ENGINEERING_DEPARTMENT = 6
ENGINEERING_KEYS = frozenset({'cto', 'eng'})

# In-memory nonce cache is enough for offline tests and a single process.
# Durable, cross-instance replay protection on serverless needs a separate
# approval; this round does not write a shared database.
NONCE_TTL_SECONDS = 300
_nonces = {}


def token_env_name(key):
    return 'OFFICE_AGENT_TOKEN_' + str(key or '').upper()


def token_for(key):
    value = os.environ.get(token_env_name(key), '')
    return value if isinstance(value, str) else ''


def lookup(key):
    return AGENTS.get(key)


def public_catalog():
    rows = []
    for item in AGENTS.values():
        row = {field: item[field] for field in ('key', 'display', 'agent_id', 'department', 'can_claim')}
        if item.get('role'):
            row['role'] = item['role']
        rows.append(row)
    return rows


def actor_for(key):
    return 'agent-' + key


def key_from_actor(actor):
    if isinstance(actor, str) and actor.startswith('agent-'):
        key = actor[6:]
        if key in AGENTS:
            return key
    return None


def is_agent_actor(actor):
    return key_from_actor(actor) is not None


def consume_nonce(nonce, now_ts=None):
    """Record a nonce. Return False if it is a replay inside the TTL window."""
    now_ts = int(time.time() if now_ts is None else now_ts)
    expired = [item for item, expiry in list(_nonces.items()) if expiry <= now_ts]
    for item in expired:
        _nonces.pop(item, None)
    if nonce in _nonces:
        return False
    _nonces[nonce] = now_ts + NONCE_TTL_SECONDS
    return True
