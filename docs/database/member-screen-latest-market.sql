-- User approved and manually ran this migration on 2026-10-21; success screenshot supplied.
-- Independent post-deployment verification is pending. Do not rerun this migration.
-- Website + older clients: keep existing same-day RPC; new clients opt into v2.
begin;
alter table public.member_screen_records add column market_date date;
-- Previously the server required market_date=record_date, so this backfill is exact.
update public.member_screen_records set market_date=record_date;
create or replace function public.member_screen_calendar(p_month date default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); today date:=(clock_timestamp() at time zone 'Asia/Taipei')::date; m date; rows jsonb;
begin
 if u is null then raise exception 'MEMBER_VERIFY_REQUIRED'; end if;
 m:=date_trunc('month',coalesce(p_month,today))::date;
 select coalesce(jsonb_agg(to_jsonb(r)-'user_id'-'request_id' order by recorded_at desc),'[]'::jsonb) into rows
 from public.member_screen_records r where user_id=u and deleted_at is null and record_date>=m and record_date<(m+interval '1 month')::date;
 return jsonb_build_object('server_time',clock_timestamp(),'today',today,'month',m,'rows',rows,'save_policy','latest-market-v2','latest_market_date',(select max(trade_date) from public.price_window where trade_date<=today));
end $$;
create function public.save_member_screen_record_v2(p_request_id uuid,p_record_date date,p_market_date date,p_strategies jsonb,p_conditions jsonb,p_stocks jsonb,p_note text default '') returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); today date:=(clock_timestamp() at time zone 'Asia/Taipei')::date; r public.member_screen_records%rowtype; latest date;
begin
 if u is null then raise exception 'MEMBER_VERIFY_REQUIRED'; end if;
 if p_request_id is null then raise exception 'SCREEN_INPUT_INVALID'; end if;
 perform pg_advisory_xact_lock(hashtextextended('screen-record:'||u::text,0));
 select * into r from public.member_screen_records where user_id=u and request_id=p_request_id;
 if found then
  if r.deleted_at is not null then raise exception 'SCREEN_RECORD_DELETED'; end if;
  return jsonb_build_object('row',to_jsonb(r)-'user_id'-'request_id','duplicate',true);
 end if;
 today:=(clock_timestamp() at time zone 'Asia/Taipei')::date;
 if p_record_date is distinct from today then raise exception 'SCREEN_DAY_CHANGED'; end if;
 select max(trade_date) into latest from public.price_window where trade_date<=today;
 if latest is null then raise exception 'SCREEN_MARKET_UNAVAILABLE'; end if;
 if p_market_date is distinct from latest then raise exception 'SCREEN_LATEST_MARKET_ONLY'; end if;
 if jsonb_typeof(p_strategies) is distinct from 'array' or jsonb_array_length(p_strategies) not between 1 and 40
 or jsonb_typeof(p_conditions) is distinct from 'array' or jsonb_array_length(p_conditions)>200
 or jsonb_typeof(p_stocks) is distinct from 'array' or jsonb_array_length(p_stocks) not between 1 and 300
 or length(coalesce(p_note,''))>300 or octet_length(p_stocks::text)>200000 then raise exception 'SCREEN_INPUT_INVALID'; end if;
 if exists(select 1 from jsonb_array_elements(p_strategies) x where jsonb_typeof(x)<>'string' or length(x#>>'{}') not between 1 and 100)
 or exists(select 1 from jsonb_array_elements(p_conditions) x where jsonb_typeof(x)<>'string' or length(x#>>'{}') not between 1 and 300)
 or exists(select 1 from jsonb_array_elements(p_stocks) x where jsonb_typeof(x)<>'object' or coalesce(x->>'code','')!~'^[0-9A-Z]{4,10}$' or length(coalesce(x->>'name',''))>80
 or (x->'close' is not null and x->'close'<>'null'::jsonb and jsonb_typeof(x->'close')<>'number'))
 then raise exception 'SCREEN_INPUT_INVALID'; end if;
 if today is distinct from (clock_timestamp() at time zone 'Asia/Taipei')::date then raise exception 'SCREEN_DAY_CHANGED'; end if;
 insert into public.member_screen_records(user_id,request_id,record_date,market_date,strategies,conditions,stocks,note)
 values(u,p_request_id,today,p_market_date,p_strategies,p_conditions,p_stocks,coalesce(p_note,'')) returning * into r;
 return jsonb_build_object('row',to_jsonb(r)-'user_id'-'request_id','duplicate',false);
end $$;
revoke all on function public.save_member_screen_record_v2(uuid,date,date,jsonb,jsonb,jsonb,text) from public,anon,authenticated;
grant execute on function public.save_member_screen_record_v2(uuid,date,date,jsonb,jsonb,jsonb,text) to authenticated;
commit;
