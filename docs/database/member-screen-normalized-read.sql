-- PREPARED ONLY. Existing RPC reads normalized details; old write/export payloads retained until separate contract migration.
begin;
set local lock_timeout='3s';
create or replace function public.member_screen_calendar(p_month date default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); today date:=(clock_timestamp() at time zone 'Asia/Taipei')::date; m date; rows jsonb; latest date;
begin
 if u is null then raise exception 'MEMBER_VERIFY_REQUIRED'; end if;
 m:=date_trunc('month',coalesce(p_month,today))::date;
 select max(trade_date) into latest from public.price_window where trade_date<=today;
 select coalesce(jsonb_agg((to_jsonb(r)-'user_id'-'request_id'-'stocks')||jsonb_build_object('stocks',public.member_screen_normalized_stocks(r.id)) order by recorded_at desc),'[]'::jsonb) into rows
 from public.member_screen_records r where user_id=u and deleted_at is null and record_date>=m and record_date<(m+interval '1 month')::date;
 return jsonb_build_object('server_time',clock_timestamp(),'today',today,'month',m,'rows',rows,'save_policy','latest-market-v2','latest_market_date',latest,'accept_market_dates',to_jsonb(public.member_screen_recent_dates(today)));
end $$;

commit;
