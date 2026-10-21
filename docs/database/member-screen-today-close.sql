-- PREPARED（2026-10-21）：修正「盤後已有今日行情，但 price_window 尚未上傳，記錄今日選股被擋」。
-- 原因：latest_market_date 只看 price_window 最大日期；price_window 由每日排程較晚上傳，收盤後到上傳前這段時間，
--       篩選器已顯示今天行情，伺服器卻只認昨天，於是出現「此份行情日期為今天；最新可用行情為昨天」。
-- 修正：可保存的行情日期＝price_window 最新日期，或（台灣時間週一～週五 13:30 收盤後的）今天。不接受未來日期、不接受更舊的日期。
-- 只改兩個 RPC 與新增一個純計算函式；不改資料表、不改 RLS、不動既有紀錄。需 JUSTY 明確批准後，在 Supabase SQL Editor 執行一次。
begin;
create or replace function public.member_screen_accept_dates(p_latest date,p_today date,p_local timestamp) returns date[]
language sql immutable set search_path='' as $$
 select array_remove(array[p_latest,case when extract(isodow from p_today) between 1 and 5 and p_local::date=p_today and p_local::time>=time '13:30' and (p_latest is null or p_today>p_latest) then p_today end],null)
$$;
revoke all on function public.member_screen_accept_dates(date,date,timestamp) from public,anon,authenticated;
create or replace function public.member_screen_calendar(p_month date default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); today date:=(clock_timestamp() at time zone 'Asia/Taipei')::date; m date; rows jsonb; latest date;
begin
 if u is null then raise exception 'MEMBER_VERIFY_REQUIRED'; end if;
 m:=date_trunc('month',coalesce(p_month,today))::date;
 select max(trade_date) into latest from public.price_window where trade_date<=today;
 select coalesce(jsonb_agg(to_jsonb(r)-'user_id'-'request_id' order by recorded_at desc),'[]'::jsonb) into rows
 from public.member_screen_records r where user_id=u and deleted_at is null and record_date>=m and record_date<(m+interval '1 month')::date;
 return jsonb_build_object('server_time',clock_timestamp(),'today',today,'month',m,'rows',rows,'save_policy','latest-market-v2','latest_market_date',latest,'accept_market_dates',to_jsonb(public.member_screen_accept_dates(latest,today,(clock_timestamp() at time zone 'Asia/Taipei')::timestamp)));
end $$;
create or replace function public.save_member_screen_record_v2(p_request_id uuid,p_record_date date,p_market_date date,p_strategies jsonb,p_conditions jsonb,p_stocks jsonb,p_note text default '') returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); today date:=(clock_timestamp() at time zone 'Asia/Taipei')::date; r public.member_screen_records%rowtype; latest date; accepted date[];
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
 accepted:=public.member_screen_accept_dates(latest,today,(clock_timestamp() at time zone 'Asia/Taipei')::timestamp);
 if cardinality(accepted)=0 then raise exception 'SCREEN_MARKET_UNAVAILABLE'; end if;
 if p_market_date is null or not (p_market_date=any(accepted)) then raise exception 'SCREEN_LATEST_MARKET_ONLY'; end if;
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
