"""Prepared backend sync. Explicit --apply and approved migration required; never alters schema."""
import argparse
import json
from pathlib import Path
import sqlite3
import urllib.request


def payloads(state_dir):
    db = sqlite3.connect(state_dir / 'announcements.sqlite3')
    db.row_factory = sqlite3.Row
    try:
        sources = [dict(r) for r in db.execute('SELECT id,name,url,kind,category,minutes AS poll_minutes,last_check,last_success,state,error FROM sources')]
        docs = []
        for row in db.execute('SELECT * FROM announcements ORDER BY updated_at,id'):
            doc = dict(row)
            doc['important'] = bool(doc['important'])
            doc['tags'] = [r[0] for r in db.execute('SELECT tag FROM announcement_tags WHERE announcement_id=?', (doc['id'],))]
            docs.append(doc)
        return sources, docs
    finally:
        db.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--state-dir', required=True, type=Path)
    parser.add_argument('--env-file', type=Path)
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    sources, docs = payloads(args.state_dir)
    # Publication cursor is updated only after every batch succeeds; partial retries are idempotent.
    cursor_file = args.state_dir / 'cloud-cursor.json'
    cursor = json.loads(cursor_file.read_text()) if cursor_file.exists() else {}
    changed = [d for d in docs if cursor.get(d['id']) != d['content_hash']]
    print(json.dumps(dict(sources=len(sources),total_documents=len(docs),changed_documents=len(changed),mode='apply' if args.apply else 'dry'),ensure_ascii=False))
    if not args.apply:
        return
    if not args.env_file:
        raise ValueError('Explicit backend env file required; no implicit credential discovery')
    env = {}
    for line in args.env_file.read_text(encoding='utf-8-sig').splitlines():
        if '=' in line and not line.lstrip().startswith('#'):
            k,v=line.split('=',1);env[k.strip()]=v.strip().strip('"').strip("'")
    base,key=env.get('SUPABASE_URL',''),env.get('SUPABASE_SERVICE_KEY','')
    import re
    if not re.fullmatch(r'https://[a-z0-9]+\.supabase\.co',base) or not key:
        raise ValueError('Backend configuration missing')
    batches=[changed[i:i+100] for i in range(0,len(changed),100)] or [[]]
    for index,batch in enumerate(batches):
        body=json.dumps({'p_sources':sources if index==0 else [],'p_documents':batch},ensure_ascii=False).encode()
        request=urllib.request.Request(base+'/rest/v1/rpc/ingest_official_announcements',data=body,method='POST',headers={'Content-Type':'application/json','apikey':key,'Authorization':'Bearer '+key})
        with urllib.request.urlopen(request,timeout=45) as response:
            response.read(1024)
    cursor.update({d['id']:d['content_hash'] for d in changed})
    tmp=cursor_file.with_suffix('.tmp');tmp.write_text(json.dumps(cursor),encoding='utf-8');tmp.replace(cursor_file)
    import datetime as dt
    synced = dt.datetime.now(dt.timezone.utc).isoformat()
    health_path = args.state_dir/'health.json'
    if health_path.exists():
        health=json.loads(health_path.read_text(encoding='utf-8'))
        health.update(storage='local_and_cloud',cloud_sync=True,last_cloud_sync_at=synced)
        config_file=args.state_dir/'cloud-sync-approved.json'
        config=json.loads(config_file.read_text(encoding='utf-8')) if config_file.exists() else {}
        health['website_sync']=bool(config.get('website_read_url'))
        temporary=health_path.with_suffix('.tmp');temporary.write_text(json.dumps(health,ensure_ascii=False,indent=2),encoding='utf-8');temporary.replace(health_path)
    print('Cloud sync confirmed')


if __name__=='__main__':
    try:
        main()
    except Exception as exc:
        # Do not log credential-bearing requests, headers, or server response bodies.
        print('Cloud sync failed: '+type(exc).__name__)
        raise SystemExit(1)
