-- PREPARED ONLY. Shared Supabase migration requires concrete human approval and backup.
-- New normalized namespace; no updates/deletes to existing tables, Auth, or RLS policies.
begin;
create table public.official_sources (
 id text primary key,
 name text not null,
 url text not null check (url like 'https://%'),
 kind text not null,
 category text not null,
 poll_minutes integer not null check (poll_minutes between 5 and 1440),
 last_check timestamptz,
 last_success timestamptz,
 state text,
 error text
);
create table public.official_announcements (
 id text primary key check (length(id)=64),
 source_id text not null references public.official_sources(id),
 title text not null check (length(title) between 1 and 400),
 url text not null check (url like 'https://%'),
 published_date date,
 published_at timestamptz,
 time_precision text not null check (time_precision in ('date','second','unknown')),
 summary text not null default '' check(length(summary)<=500),
 effective_date date,
 important boolean not null default false,
 first_seen timestamptz not null,
 updated_at timestamptz not null,
 content_hash text not null,
 check(time_precision<>'second' or published_at is not null),
 check(time_precision<>'unknown' or published_at is null)
);
create index official_announcements_date on public.official_announcements(published_date desc,id);
create index official_announcements_source on public.official_announcements(source_id,published_date desc);
create table public.official_announcement_tags (
 announcement_id text not null references public.official_announcements(id),
 tag text not null,
 primary key(announcement_id,tag)
);
create index official_tags_lookup on public.official_announcement_tags(tag,announcement_id);
create table public.official_announcement_securities (
 announcement_id text not null references public.official_announcements(id),
 observed_code text not null,
 security_code text references public.security_master(code),
 relation text not null check(relation in ('direct_disclosure','trading_notice')),
 primary key(announcement_id,observed_code)
);
-- Original code may refer to a warrant/delisted instrument absent from master.
-- Keep observed_code; resolve existing master with JOIN, never duplicate names.
create index official_security_lookup on public.official_announcement_securities(security_code,announcement_id);
alter table public.official_sources enable row level security;
alter table public.official_announcements enable row level security;
alter table public.official_announcement_tags enable row level security;
alter table public.official_announcement_securities enable row level security;
revoke all on public.official_sources,public.official_announcements,public.official_announcement_tags,public.official_announcement_securities from public,anon,authenticated;
grant select,insert,update on public.official_sources,public.official_announcements,public.official_announcement_tags,public.official_announcement_securities to service_role;
-- Initial backend-only stage. Do not expose admin/source-health fields to browsers.
-- Public/member read integration must use the existing API authorization boundary.
create function public.ingest_official_announcements(p_sources jsonb,p_documents jsonb)
returns integer language plpgsql security definer set search_path='' as $$
declare s jsonb; d jsonb; total integer:=0;
begin
 if jsonb_typeof(p_sources)<>'array' or jsonb_typeof(p_documents)<>'array'
 or jsonb_array_length(p_sources)>100 or jsonb_array_length(p_documents)>100 then
  raise exception 'Invalid batch';
 end if;
 for s in select value from jsonb_array_elements(p_sources) loop
  insert into public.official_sources(id,name,url,kind,category,poll_minutes,last_check,last_success,state,error)
  values(s->>'id',s->>'name',s->>'url',s->>'kind',s->>'category',(s->>'poll_minutes')::integer,(s->>'last_check')::timestamptz,(s->>'last_success')::timestamptz,s->>'state',s->>'error')
  on conflict(id) do update set name=excluded.name,url=excluded.url,kind=excluded.kind,category=excluded.category,poll_minutes=excluded.poll_minutes,last_check=excluded.last_check,last_success=excluded.last_success,state=excluded.state,error=excluded.error;
 end loop;
 for d in select value from jsonb_array_elements(p_documents) loop
  insert into public.official_announcements(id,source_id,title,url,published_date,published_at,time_precision,summary,effective_date,important,first_seen,updated_at,content_hash)
  values(d->>'id',d->>'source_id',d->>'title',d->>'url',(d->>'published_date')::date,(d->>'published_at')::timestamptz,d->>'time_precision',d->>'summary',(d->>'effective_date')::date,(d->>'important')::boolean,(d->>'first_seen')::timestamptz,(d->>'updated_at')::timestamptz,d->>'content_hash')
  on conflict(id) do update set title=excluded.title,url=excluded.url,published_date=excluded.published_date,published_at=excluded.published_at,time_precision=excluded.time_precision,summary=excluded.summary,effective_date=excluded.effective_date,important=excluded.important,updated_at=excluded.updated_at,content_hash=excluded.content_hash
  where public.official_announcements.content_hash is distinct from excluded.content_hash;
  delete from public.official_announcement_tags where announcement_id=d->>'id';
  insert into public.official_announcement_tags(announcement_id,tag)
  select d->>'id',value from jsonb_array_elements_text(d->'tags') on conflict do nothing;
  if nullif(d->>'security_code','') is not null then
   insert into public.official_announcement_securities(announcement_id,observed_code,security_code,relation)
   select d->>'id',d->>'security_code',m.code,
    case when d->>'source_id' like 'mops_%' then 'direct_disclosure' else 'trading_notice' end
   from (select 1) x left join public.security_master m on m.code=d->>'security_code'
   on conflict(announcement_id,observed_code) do update set security_code=excluded.security_code;
  end if;
  total:=total+1;
 end loop;
 return total;
end $$;
revoke all on function public.ingest_official_announcements(jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.ingest_official_announcements(jsonb,jsonb) to service_role;
commit;
