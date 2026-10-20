-- PREPARED ONLY. Catalog/RLS preflight and separate shared-database approval required.
-- Apply after member-voucher-levels.sql. Does not enable campaigns or definitions.
-- Deliberately fails if a table is missing, is a view, or its RLS is not enabled;
-- do not bypass this guard by broadly granting or disabling existing policies.
begin;
create function public._member_can_feature(p_feature text) returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(
  select 1 from public.member_entitlements e join public.member_rewards r on r.id=e.reward_id
  join public.member_feature_catalog c on c.feature=p_feature and c.member_research and c.voucher_enabled
  where e.user_id=auth.uid() and r.user_id=auth.uid() and r.status='claimed' and e.starts_at<=now() and e.expires_at>now() and
  ((e.feature='voucher_bundle' and p_feature=any(r.selected_features)) or
   (e.feature='research_tools' and p_feature in ('fhedge','breadth')))
 );
$$;
revoke all on function public._member_can_feature(text) from public,anon,authenticated;
grant execute on function public._member_can_feature(text) to authenticated;
do $$
declare table_name text; relation_kind "char"; rls boolean;
begin
 foreach table_name in array array['broker_sell_alerts'] loop
  select c.relkind,c.relrowsecurity into relation_kind,rls from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname=table_name;
  if not found or relation_kind not in ('r','p') or not rls then raise exception 'MEMBER_VIP_RLS_REVIEW_REQUIRED: %',table_name; end if;
  if exists(select 1 from pg_catalog.pg_policies where schemaname='public' and tablename=table_name and permissive='RESTRICTIVE') then raise exception 'MEMBER_VIP_RESTRICTIVE_POLICY_REVIEW: %',table_name; end if;
  execute format('create policy member_voucher_read on public.%I for select to authenticated using ((select public._member_can_feature(''selltrack'')))',table_name);
  execute format('grant select on public.%I to authenticated',table_name);
 end loop;
end $$;
-- These entries are marked ready only after all read-policy checks have succeeded.
-- Explicit user rule: sig/brank/mingdeng are admin-only. No policy is added to their tables.
-- Tracking writes keep their existing own-user policies.
update public.member_feature_catalog set voucher_enabled=true where feature in ('hottopics','selltrack');
commit;
