"""Read-only Vercel credential check. Never log credentials or response bodies."""
import os
import sys
from datetime import datetime, timezone
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

PROJECTS=('prj_9bQ73nM0zKScwa7A5vCr2pOaCZsO','prj_zZffSpUxoyGafkpLqvDZE1IfbOBL')
TEAM='team_yDZwcT1bwCcFuEAGG0o6Fi7z'


def expiry_state(value, now=None):
    try:
        expiry=datetime.fromisoformat(value.replace('Z','+00:00'))
        if expiry.tzinfo is None:raise ValueError()
    except (ValueError,AttributeError):
        raise ValueError('VERCEL_DEPLOY_TOKEN_EXPIRES_AT must be a UTC/offset timestamp') from None
    seconds=(expiry-(now or datetime.now(timezone.utc))).total_seconds()
    return 'expired' if seconds<=0 else 'due' if seconds<=7*86400 else 'valid'


def verify(env=os.environ, opener=urlopen):
    token=env.get('VERCEL_TOKEN','')
    if not token:raise ValueError('VERCEL_DEPLOY_TOKEN is missing; update GitHub Actions Secret')
    state=expiry_state(env.get('VERCEL_DEPLOY_TOKEN_EXPIRES_AT',''))
    if state=='expired':raise ValueError('Vercel deployment token expiry reached; replace Secret and expiry variable. Existing services remain online.')
    if state=='due':print('::warning::Vercel deployment token expires within 7 days; update Secret and expiry variable.')
    for project in PROJECTS:
        req=Request('https://api.vercel.com/v9/projects/'+project+'?teamId='+TEAM,headers={'Authorization':'Bearer '+token})
        try:
            with opener(req,timeout=20) as response:
                if response.status!=200:raise ValueError('Vercel project verification failed')
        except HTTPError as e:
            if e.code in (401,403):raise ValueError('Vercel token expired, revoked or lacks project permission; update VERCEL_DEPLOY_TOKEN.') from None
            raise ValueError('Vercel credential check failed with HTTP '+str(e.code)+'; retry after service recovery.') from None
        except (URLError,TimeoutError):raise ValueError('Vercel credential check unavailable; retry later.') from None
    print('Vercel credential verified for both fixed projects (no deployment created).')


if __name__=='__main__':
    try:verify()
    except ValueError as e:
        print('::error::'+str(e));sys.exit(1)
