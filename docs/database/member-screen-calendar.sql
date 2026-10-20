-- DEPLOYED 2026-10-20 to Taiwan stock2 (bruqrbvbjxntgoljxsne), explicitly approved by user.
-- Initial migration: do not rerun against existing objects. No existing research data was changed.
begin;
create table public.member_screen_records (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 request_id uuid not null, record_date date not null, recorded_at timestamptz not null default clock_timestamp(),
 strategies jsonb not null, conditions jsonb not null, stocks jsonb not null, note text not null default '', deleted_at timestamptz,
 unique(user_id,request_id)
);
alter table public.member_screen_records enable row level security;
revoke all on public.member_screen_records from public,anon,authenticated;
grant select on public.member_screen_records to authenticated;
create policy member_screen_records_own_read on public.member_screen_records for select to authenticated using(user_id=(select auth.uid()) and deleted_at is null);
create function public.member_screen_calendar(p_month date default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); today date:=(clock_timestamp() at time zone 'Asia/Taipei')::date; m date; rows jsonb;
begin
 if u is null then raise exception 'MEMBER_VERIFY_REQUIRED'; end if;
 m:=date_trunc('month',coalesce(p_month,today))::date;
 select coalesce(jsonb_agg(to_jsonb(r)-'user_id'-'request_id' order by recorded_at desc),'[]'::jsonb) into rows
 from public.member_screen_records r where user_id=u and deleted_at is null and record_date>=m and record_date<(m+interval '1 month')::date;
 return jsonb_build_object('server_time',clock_timestamp(),'today',today,'month',m,'rows',rows);
end $$;
create function public.save_member_screen_record(p_request_id uuid,p_market_date date,p_strategies jsonb,p_conditions jsonb,p_stocks jsonb,p_note text default '') returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); today date:=(clock_timestamp() at time zone 'Asia/Taipei')::date; r public.member_screen_records%rowtype;
begin
 if u is null then raise exception 'MEMBER_VERIFY_REQUIRED'; end if;
 if p_request_id is null then raise exception 'SCREEN_INPUT_INVALID'; end if;
 perform pg_advisory_xact_lock(hashtextextended('screen-record:'||u::text,0));
 select * into r from public.member_screen_records where user_id=u and request_id=p_request_id;
 if found then
  if r.deleted_at is not null then raise exception 'SCREEN_RECORD_DELETED'; end if;
  return jsonb_build_object('row',to_jsonb(r)-'user_id'-'request_id','duplicate',true);
 end if;
 if p_market_date is distinct from today then raise exception 'SCREEN_TODAY_ONLY'; end if;
 if jsonb_typeof(p_strategies) is distinct from 'array' or jsonb_array_length(p_strategies) not between 1 and 40
 or jsonb_typeof(p_conditions) is distinct from 'array' or jsonb_array_length(p_conditions)>200
 or jsonb_typeof(p_stocks) is distinct from 'array' or jsonb_array_length(p_stocks) not between 1 and 300
 or length(coalesce(p_note,''))>300 or octet_length(p_stocks::text)>200000 then raise exception 'SCREEN_INPUT_INVALID'; end if;
 if exists(select 1 from jsonb_array_elements(p_strategies) x where jsonb_typeof(x)<>'string' or length(x#>>'{}') not between 1 and 100)
 or exists(select 1 from jsonb_array_elements(p_conditions) x where jsonb_typeof(x)<>'string' or length(x#>>'{}') not between 1 and 300)
 or exists(select 1 from jsonb_array_elements(p_stocks) x where jsonb_typeof(x)<>'object' or coalesce(x->>'code','')!~'^[0-9A-Z]{4,10}$' or length(coalesce(x->>'name',''))>80
 or (x->'close' is not null and x->'close'<>'null'::jsonb and jsonb_typeof(x->'close')<>'number'))
 then raise exception 'SCREEN_INPUT_INVALID'; end if;
 insert into public.member_screen_records(user_id,request_id,record_date,strategies,conditions,stocks,note)
 values(u,p_request_id,today,p_strategies,p_conditions,p_stocks,coalesce(p_note,'')) returning * into r;
 return jsonb_build_object('row',to_jsonb(r)-'user_id'-'request_id','duplicate',false);
end $$;
-- Keep only a request tombstone after deletion to prevent a delayed save retry resurrecting it.
create function public.delete_member_screen_record(p_record_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid();
begin
 if u is null then raise exception 'MEMBER_VERIFY_REQUIRED'; end if;
 if p_record_id is null then raise exception 'SCREEN_INPUT_INVALID'; end if;
 perform pg_advisory_xact_lock(hashtextextended('screen-record:'||u::text,0));
 update public.member_screen_records set deleted_at=clock_timestamp(),strategies='[]',conditions='[]',stocks='[]',note=''
 where id=p_record_id and user_id=u and deleted_at is null;
 -- Idempotent and non-enumerating: unknown, other-user and already-deleted ids return the same receipt.
 return jsonb_build_object('deleted',true);
end $$;
revoke all on function public.member_screen_calendar(date),public.save_member_screen_record(uuid,date,jsonb,jsonb,jsonb,text),public.delete_member_screen_record(uuid) from public,anon,authenticated;
grant execute on function public.member_screen_calendar(date),public.save_member_screen_record(uuid,date,jsonb,jsonb,jsonb,text),public.delete_member_screen_record(uuid) to authenticated;
commit;
