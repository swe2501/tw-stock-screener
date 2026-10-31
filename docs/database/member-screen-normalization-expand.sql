-- APPLIED 2026-11-01 to bruqrbvbjxntgoljxsne after explicit user approval.
-- Verified 15 records (11 active), 297 items, 157 observed names, 2259 master codes.
-- Exact roundtrip and live owner/anonymous/CAS/trigger/mirror/deletion tests passed; tests rolled back.
-- Initial expand migration: DO NOT rerun. Original JSON and RPCs retained.
-- Expand phase: keep original JSON/RPC and mirror normalized details atomically.
-- No table removal, no existing research document cleanup, no retention changes.
begin;
set local lock_timeout='3s';
set local statement_timeout='60s';
create table public.security_master (
 code text primary key check(code ~ '^[0-9A-Z]{4,10}$'),
 current_name text not null, market text, instrument_type text not null,
 source text not null, updated_at timestamptz not null default now()
);
-- Source priority is explicit. Never populate master names from member submissions.
insert into public.security_master(code,current_name,market,instrument_type,source)
select code,name,market,'stock','stock_fundamentals' from public.stock_fundamentals
where code ~ '^[0-9A-Z]{4,10}$' and coalesce(name,'')<>'';
insert into public.security_master(code,current_name,market,instrument_type,source)
select code,name,'OTC','stock','otc_names' from public.otc_names
where code ~ '^[0-9A-Z]{4,10}$' and coalesce(name,'')<>''
on conflict(code) do nothing;
insert into public.security_master(code,current_name,market,instrument_type,source)
select code,name,null,'etf','etf_products' from public.etf_products
where code ~ '^[0-9A-Z]{4,10}$' and coalesce(name,'')<>''
on conflict(code) do update set current_name=excluded.current_name,instrument_type='etf',source=excluded.source;

-- Immutable observed names, not a claim about legal name effective dates.
-- source_code preserves unresolved/retired identifiers without inventing a master entry.
create table public.security_observed_names (
 id bigint generated always as identity primary key,
 source_code text not null, security_code text references public.security_master(code), name text not null,
 unique(source_code,name)
);
create table public.member_screen_record_items (
 record_id uuid not null references public.member_screen_records(id) on delete cascade,
 position integer not null check(position>0),
 name_id bigint not null references public.security_observed_names(id),
 close_snapshot numeric, change_pct_snapshot numeric,
 -- Preserve unknown legacy fields and exact missing/null semantics during expansion.
 extra jsonb not null default '{}',
 primary key(record_id,position)
);
create index screen_items_name_record_idx on public.member_screen_record_items(name_id,record_id);
create index screen_records_owner_date_live_idx on public.member_screen_records(user_id,record_date,recorded_at desc) where deleted_at is null;
alter table public.security_master enable row level security;
alter table public.security_observed_names enable row level security;
alter table public.member_screen_record_items enable row level security;
revoke all on public.security_master,public.security_observed_names,public.member_screen_record_items from public,anon,authenticated;
grant select on public.security_master to anon,authenticated;
grant select on public.security_observed_names,public.member_screen_record_items to authenticated;
grant all on public.security_master,public.security_observed_names,public.member_screen_record_items to service_role;
grant usage,select on sequence public.security_observed_names_id_seq to service_role;
create policy security_master_read on public.security_master for select to anon,authenticated using(true);
create policy screen_items_owner_read on public.member_screen_record_items for select to authenticated
using(exists(select 1 from public.member_screen_records r where r.id=record_id and r.user_id=(select auth.uid()) and r.deleted_at is null));
create policy observed_names_owner_read on public.security_observed_names for select to authenticated
using(exists(select 1 from public.member_screen_record_items i where i.name_id=id));

create function public.sync_member_screen_record_items() returns trigger
language plpgsql security definer set search_path='' as $$
declare x jsonb; pos integer:=0; nid bigint;
begin
 delete from public.member_screen_record_items where record_id=new.id;
 if new.deleted_at is not null then return new; end if;
 for x in select value from jsonb_array_elements(new.stocks) loop
  pos:=pos+1;
  if jsonb_typeof(x)<>'object' or coalesce(x->>'code','')='' then raise exception 'SCREEN_NORMALIZATION_INVALID'; end if;
  insert into public.security_observed_names(source_code,security_code,name) values(x->>'code',(select code from public.security_master where code=x->>'code'),coalesce(x->>'name',''))
  on conflict(source_code,name) do update set name=excluded.name returning id into nid;
  insert into public.member_screen_record_items(record_id,position,name_id,close_snapshot,change_pct_snapshot,extra)
  values(new.id,pos,nid,case when jsonb_typeof(x->'close')='number' then (x->>'close')::numeric end,case when jsonb_typeof(x->'chg')='number' then (x->>'chg')::numeric end,
    jsonb_build_object('code_legacy',case when jsonb_typeof(x->'code')<>'string' then x->'code' end,'name_legacy',case when jsonb_typeof(x->'name')<>'string' then x->'name' end,'fields',x-'code'-'name'-'close'-'chg','present',jsonb_build_object('name',x?'name','close',x?'close','chg',x?'chg'),'name_null',jsonb_typeof(x->'name')='null','close_legacy',case when jsonb_typeof(x->'close')<>'number' then x->'close' end,'chg_legacy',case when jsonb_typeof(x->'chg')<>'number' then x->'chg' end));
 end loop;
 return new;
end $$;
revoke all on function public.sync_member_screen_record_items() from public,anon,authenticated;
create trigger member_screen_items_sync after insert or update of stocks,deleted_at on public.member_screen_records
for each row execute function public.sync_member_screen_record_items();

-- Bounded existing dataset only. Re-check size before activation; not an unbounded production backfill.
do $$ begin
 if (select count(*) from public.member_screen_records)>1000 then raise exception 'SCREEN_BACKFILL_REQUIRES_BATCHES'; end if;
end $$;
update public.member_screen_records set stocks=stocks where deleted_at is null;

-- Shadow read: auth is enforced by invoker RLS. Old RPCs keep their exact response.
create function public.member_screen_normalized_stocks(p_record_id uuid) returns jsonb
language sql stable security invoker set search_path='' as $$
 select coalesce(jsonb_agg(
   (i.extra->'fields') || jsonb_build_object('code',coalesce(nullif(i.extra->'code_legacy','null'::jsonb),to_jsonb(n.source_code)))
   || case when (i.extra->'present'->>'name')::boolean then jsonb_build_object('name',case when (i.extra->>'name_null')::boolean then 'null'::jsonb else coalesce(nullif(i.extra->'name_legacy','null'::jsonb),to_jsonb(n.name)) end) else '{}'::jsonb end
   || case when (i.extra->'present'->>'close')::boolean then jsonb_build_object('close',coalesce(to_jsonb(i.close_snapshot),i.extra->'close_legacy')) else '{}'::jsonb end
   || case when (i.extra->'present'->>'chg')::boolean then jsonb_build_object('chg',coalesce(to_jsonb(i.change_pct_snapshot),i.extra->'chg_legacy')) else '{}'::jsonb end
   order by i.position),'[]'::jsonb)
 from public.member_screen_record_items i join public.security_observed_names n on n.id=i.name_id
 where i.record_id=p_record_id
$$;
revoke all on function public.member_screen_normalized_stocks(uuid) from public,anon,authenticated;
grant execute on function public.member_screen_normalized_stocks(uuid) to authenticated;
commit;
