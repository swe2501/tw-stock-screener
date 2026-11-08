"""Bounded, authenticated caller's official announcement read service. No cloud writes."""
import datetime as dt
import re
import urllib.parse


def read(body,rest):
    today=dt.datetime.now(dt.timezone(dt.timedelta(hours=8))).date()
    try:
        start=dt.date.fromisoformat(body.get('from') or (today-dt.timedelta(days=7)).isoformat())
        end=dt.date.fromisoformat(body.get('to') or today.isoformat())
        if not 0 <= (end-start).days <= 31:raise ValueError()
        limit=body.get('limit',30)
        if type(limit) is not int or not 1<=limit<=50:raise ValueError()
        source=body.get('source','')
        if not isinstance(source,str) or source and not re.fullmatch(r'[a-z_]{2,32}',source):raise ValueError()
        context=body.get('context','')
        code=body.get('code','')
        if context not in ('','chart'):raise ValueError()
        if context=='chart' and (not isinstance(code,str) or not re.fullmatch(r'[0-9]{4,6}[A-Z]?',code)):raise ValueError()
    except (ValueError,TypeError):
        return 400,{'error':'日期範圍須在 31 天內，最多讀取 50 則公告'}
    fields='id,title,url,published_date,published_at,time_precision,summary,effective_date,source:official_sources(id,name,category),tags:official_announcement_tags(tag)'
    params=[('select',fields),('published_date','gte.'+start.isoformat()),('published_date','lte.'+end.isoformat()),('important','eq.true'),('order','published_date.desc,published_at.desc.nullslast,id'),('limit',str(limit))]
    if source:params.append(('source_id','eq.'+source))
    try:
        if context=='chart':
            direct=[(k,v) for k,v in params if k!='select']
            direct += [('select',fields+',securities:official_announcement_securities!inner(observed_code)'),('securities.observed_code','eq.'+code)]
            status,rows=rest('/official_announcements?'+urllib.parse.urlencode(direct))
            if status!=200 or not isinstance(rows,list):return 503,{'error':'官方公告暫時無法讀取，請稍後再試'}
            rows=[dict(row,scope='security') for row in rows]
            market=[(k,v) for k,v in params if k!='select']
            market += [('select',fields.replace('source:official_sources(', 'source:official_sources!inner(')),('source.category','in.(market_policy,financial_policy,monetary_policy,economic_release,fiscal_trade,global_monetary,financial_regulation,export_control)')]
            status,policies=rest('/official_announcements?'+urllib.parse.urlencode(market))
            if status!=200 or not isinstance(policies,list):return 503,{'error':'官方公告暫時無法讀取，請稍後再試'}
            ids={row['id'] for row in rows}
            rows += [dict(row,scope='market') for row in policies if row['id'] not in ids]
        else:
            status,rows=rest('/official_announcements?'+urllib.parse.urlencode(params))
        if status!=200 or not isinstance(rows,list):return 503,{'error':'官方公告暫時無法讀取，請稍後再試'}
        status,sources=rest('/official_sources?select=id,name,state,last_success&order=id')
        if status!=200 or not isinstance(sources,list):sources=[]
        items=[];seen={}
        for row in rows:
            source_info=row.get('source') or {}
            # Company disclosures may share generic titles across different companies: never merge them.
            policy=source_info.get('category') not in ('company_disclosure','trading_risk','trading_disposition')
            key=(row.get('published_date'),re.sub(r'\s+','',row.get('title','')))
            if policy and key in seen:
                seen[key].setdefault('other_sources',[]).append({'name':source_info.get('name'),'url':row.get('url')})
            else:
                item=dict(row);items.append(item)
                if policy:seen[key]=item
        return 200,{'items':items,'sources':sources,'from':start.isoformat(),'to':end.isoformat(),'limit':limit,'limited':len(rows)==limit}
    except Exception:
        return 503,{'error':'官方公告暫時無法讀取，請稍後再試'}
