-- Read-only post-deployment verification. Run in Taiwan stock2 SQL Editor.
-- No real member records are created, deleted, or returned.
select
  exists(select 1 from information_schema.columns
         where table_schema='public' and table_name='member_screen_records'
         and column_name='market_date' and data_type='date') as market_date_column,
  to_regprocedure('public.save_member_screen_record_v2(uuid,date,date,jsonb,jsonb,jsonb,text)') is not null as v2_exists,
  (select position('latest-market-v2' in pg_get_functiondef(oid))>0
   from pg_proc where oid=to_regprocedure('public.member_screen_calendar(date)')) as calendar_policy_v2,
  coalesce(has_function_privilege('authenticated',to_regprocedure('public.save_member_screen_record_v2(uuid,date,date,jsonb,jsonb,jsonb,text)'),'EXECUTE'),false) as member_execute,
  coalesce(has_function_privilege('anon',to_regprocedure('public.save_member_screen_record_v2(uuid,date,date,jsonb,jsonb,jsonb,text)'),'EXECUTE'),false) as anonymous_execute,
  has_table_privilege('authenticated','public.member_screen_records','UPDATE') as member_direct_update,
  (select relrowsecurity from pg_class where oid='public.member_screen_records'::regclass) as rls_enabled,
  (clock_timestamp() at time zone 'Asia/Taipei')::date as server_today,
  (select max(trade_date) from public.price_window
   where trade_date <= (clock_timestamp() at time zone 'Asia/Taipei')::date) as latest_market_date;
-- Expected: first four flags true; anonymous_execute/member_direct_update false;
-- rls_enabled true. Latest market date can be earlier than server_today.
