-- PREPARED ONLY: shared UAT/production activation requires reviewed approval.
-- Keep source tables for their non-master fields; do not delete history or rename client fields.
begin;
set local lock_timeout='3s';
set local statement_timeout='60s';
create function public.refresh_security_master() returns void
language plpgsql security definer set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtextextended('security-master-refresh-v1',0));
 insert into public.security_master(code,current_name,market,instrument_type,source)
 select code,name,market,instrument_type,source from (
  select distinct on(code) code,name,market,instrument_type,source from (
   select e.code,e.name,'tse'::text as market,'etf'::text as instrument_type,'etf_products'::text as source,0 as priority from public.etf_products e
   union all select code,name,market,'stock','stock_fundamentals',1 from public.stock_fundamentals
   union all select code,name,'otc','stock','otc_names',2 from public.otc_names
  ) sources where code ~ '^[0-9A-Z]{4,10}$' and coalesce(name,'')<>'' order by code,priority
 ) chosen order by code
 on conflict(code) do update set current_name=excluded.current_name,market=excluded.market,instrument_type=excluded.instrument_type,source=excluded.source,updated_at=clock_timestamp()
 where (security_master.current_name,security_master.market,security_master.instrument_type,security_master.source)
 is distinct from (excluded.current_name,excluded.market,excluded.instrument_type,excluded.source);
end $$;
revoke all on function public.refresh_security_master() from public,anon,authenticated;
grant execute on function public.refresh_security_master() to service_role;
create function public.refresh_security_master_trigger() returns trigger
language plpgsql security definer set search_path='' as $$
begin perform public.refresh_security_master(); return null; end $$;
revoke all on function public.refresh_security_master_trigger() from public,anon,authenticated;
create trigger security_master_fundamentals_sync after insert or update or delete on public.stock_fundamentals for each statement execute function public.refresh_security_master_trigger();
create trigger security_master_otc_sync after insert or update or delete on public.otc_names for each statement execute function public.refresh_security_master_trigger();
create trigger security_master_etf_sync after insert or update or delete on public.etf_products for each statement execute function public.refresh_security_master_trigger();
select public.refresh_security_master();
-- Public projection only. Never expose member tables/fields through this owner view.
create view public.security_catalog with (security_barrier=true) as
 select s.code,s.current_name as name,s.market,s.instrument_type,
 coalesce(case when s.instrument_type='etf' then e.category end,f.industry,'') as industry
 from public.security_master s left join public.stock_fundamentals f on f.code=s.code
 left join public.etf_products e on e.code=s.code;
revoke all on public.security_catalog from public,anon,authenticated;
grant select on public.security_catalog to anon,authenticated,service_role;
commit;
