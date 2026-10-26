"""Append a validated, explicitly UAT-only saved visual review snapshot. No model calls."""
import argparse
import json
from pathlib import Path
from groupbook_precompute import publish

ROOT=Path(__file__).resolve().parents[1]

def validate(data):
    if data.get('version')!='codex-visual-v1' or data.get('scope')!='uat':raise ValueError('Only UAT visual snapshots are accepted')
    records=data.get('records',[])
    keys={(r['code'],r['timeframe']) for r in records}
    if len(records)!=200 or len(keys)!=200 or len({k[0] for k in keys})!=100:raise ValueError('Expected 100 stocks and 200 unique reviews')
    if any(tf not in ('daily','weekly') for _,tf in keys):raise ValueError('Invalid timeframe')
    for r in records:
        if r.get('execution_status')!='reviewed' or r.get('classification') not in ('w','no_w','uncertain'):raise ValueError('Unreviewed result')
        bars=r.get('source_bars',[]); by_time={b['time']:b for b in bars}
        if len(by_time)!=len(bars) or not bars:raise ValueError('Missing or duplicate bars')
        if r['timeframe']=='daily' and len(bars)!=120:raise ValueError('Expected 120 daily bars')
        patterns=r.get('patterns',[])
        if (r['classification']=='w')!=bool(patterns):raise ValueError('Classification mismatch')
        for p in patterns:
            if p.get('type')!='w_bottom' or not p.get('precise_points_verified'):raise ValueError('Only verified W patterns in this scan')
            points=p.get('points',[])
            if len(points)!=5 or [q['time'] for q in points]!=sorted({q['time'] for q in points}):raise ValueError('Invalid anchor order')
            for q in points:
                b=by_time.get(q['time']); i=q['bar_index']
                if not b or i<0 or i>=len(bars) or bars[i]!=b or b[q['field']]!=q['value']:raise ValueError('Anchor mismatch')
            n=p['neckline']
            if n!={'start':points[2]['time'],'end':points[4]['time'],'value':points[2]['value']}:raise ValueError('Neckline mismatch')
            right=[b for b in bars if points[3]['time']<b['time']<=points[4]['time']]
            if not right or max(b['high'] for b in right)<n['value']:raise ValueError('Right recovery must touch neckline')
    return data

def main():
    a=argparse.ArgumentParser(description=__doc__)
    a.add_argument('--snapshot',type=Path,default=ROOT/'apps/web/assets/codex-visual-patterns.json')
    a.add_argument('--env-file',type=Path)
    a.add_argument('--publish-uat',action='store_true')
    args=a.parse_args();data=validate(json.loads(args.snapshot.read_text(encoding='utf-8')))
    if not args.publish_uat:print('Validated 200 reviewed tasks; dry run, no network.');return
    if not args.env_file:raise ValueError('Explicit existing environment file required')
    env={}
    for line in args.env_file.read_text(encoding='utf-8-sig').splitlines():
        if line.strip() and not line.lstrip().startswith('#') and '=' in line:
            k,v=line.split('=',1)
            if k.strip() in ('SUPABASE_URL','SUPABASE_SERVICE_KEY'):env[k.strip()]=v.strip().strip('"').strip("'")
    if env.get('SUPABASE_URL','').rstrip('/')!='https://bruqrbvbjxntgoljxsne.supabase.co':raise ValueError('Unexpected database project')
    publish(env,[{'kind':'codex_visual_patterns@uat','trade_date':'2026-10-23','payload':data}])
    print('Appended UAT-only visual snapshot: 100 stocks, 200 reviews; existing rows retained.')

if __name__=='__main__':main()
