"""Readonly local OHLC scan -> versioned complete snapshot. No scheduler changes.

CLI writes only --output JSON, never Supabase. `publish_snapshot` is a separate
integration entry for an approved daily job; it is not called by this CLI.
"""
import argparse
import datetime
import json
import math
from pathlib import Path
import re
import sqlite3

import box_pattern
import chart_pattern_rules as rules


def scan(db_path):
    connection=sqlite3.connect(Path(db_path).resolve().as_uri()+'?mode=ro',uri=True)
    try:
        latest=connection.execute('select max(trade_date) from stock_daily').fetchone()[0]
        datetime.date.fromisoformat(latest)
        codes=[r[0] for r in connection.execute('select distinct code from stock_daily') if re.fullmatch(r'\d{4,6}',str(r[0]))]
        if not codes:
            raise ValueError('No eligible stock history; previous snapshot must be retained')
        signals=[];stale=0;short=0
        for code in codes:
            records=connection.execute('select trade_date,open,high,low,close,volume from stock_daily where code=? order by trade_date desc limit 150',(code,)).fetchall()[::-1]
            if not records or records[-1][0]!=latest:
                stale+=1;continue
            if len(records)<40:
                short+=1;continue
            bars=[]
            for date,o,h,l,c,v in records:
                values=[float(x) for x in (o,h,l,c,v)]
                if not all(math.isfinite(x) for x in values) or min(values[:4])<=0 or values[4]<0 or h<max(o,l,c) or l>min(o,c):
                    raise ValueError(f'Invalid OHLC history for {code}; refuse partial snapshot')
                bars.append(dict(date=str(date),open=values[0],high=values[1],low=values[2],close=values[3],volume=values[4]))
            signals.extend(dict(code=str(code),**s) for s in rules.evaluate(bars))
            original=box_pattern.evaluate([box_pattern.Bar(b['date'],b['open'],b['high'],b['low'],b['close'],b['volume']) for b in bars],len(bars)-1)
            if original and str(original.get('breakout_timestamp'))==latest:
                status=original['status']
                mapping={'CONFIRMED_UP':('box','up'),'CONFIRMED_DOWN':('box','down'),
                         'FALSE_UP_THEN_DOWN':('false-up','down'),'FALSE_DOWN_THEN_UP':('false-down','up')}
                if status in mapping:
                    kind,direction=mapping[status]
                    signals.append(dict(code=str(code),type=kind,direction=direction,date=latest,
                        start_date=str(original['window_start']),boundary=original['upper_center' if direction=='up' else 'lower_center'],
                        close=bars[-1]['close'],rule_version='box-v1',evidence=original['breakout_reason']))
        return dict(version=rules.VERSION,date=latest,complete=True,types=list(rules.TYPES),signals=sorted(signals,key=lambda s:(s['code'],s['type'])),
                    coverage=dict(total=len(codes),stale=stale,insufficient=short,evaluated=len(codes)-stale-short))
    finally:
        connection.close()


def publish_snapshot(env,snapshot):
    """Separate reviewed job integration; no delete and no replacement on partial scans."""
    if snapshot.get('version')!=rules.VERSION or snapshot.get('complete') is not True or snapshot.get('coverage',{}).get('evaluated',0)<=0:
        raise ValueError('Incomplete pattern snapshot')
    from groupbook_precompute import publish
    publish(env,[dict(kind='chart_patterns',trade_date=snapshot['date'],payload=snapshot,
                      updated_at=datetime.datetime.now(datetime.timezone.utc).isoformat())])


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--db',type=Path,required=True)
    parser.add_argument('--output',type=Path,required=True)
    args=parser.parse_args()
    snapshot=scan(args.db)
    if snapshot['coverage']['evaluated']<=0:
        raise ValueError('No evaluated history; previous artifact retained')
    args.output.parent.mkdir(parents=True,exist_ok=True)
    temporary=args.output.with_suffix(args.output.suffix+'.tmp')
    temporary.write_text(json.dumps(snapshot,ensure_ascii=False,allow_nan=False),encoding='utf-8')
    temporary.replace(args.output)
    print(json.dumps(dict(date=snapshot['date'],coverage=snapshot['coverage'],signals=len(snapshot['signals']),output=str(args.output)),ensure_ascii=False))
