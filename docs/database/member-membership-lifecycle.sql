-- PREPARED ONLY: apply after member-voucher-levels.sql and admin-member-tiers.sql.
-- No campaigns, payments, exchanges or quotas are activated by this migration.
begin;

-- NULL preserves an existing explicit permanent administrator grant.
alter table public.member_tiers add column if not exists expires_at timestamptz;

-- A trusted payment adapter may insert a confirmed paid service period here.
-- Cancellation of auto-renewal does not revoke a period that has already been paid.
-- No browser write policy; no client-controlled amount, tier or expiry is trusted.
create table public.member_subscription_periods(
 id bigint generated always as identity primary key,
 user_id uuid not null references auth.users(id) on delete cascade,
 tier text not null check(tier in ('observation','research','advanced','vip')),
 provider text not null check(length(provider) between 1 and 64),
 external_period_id text not null check(length(external_period_id) between 1 and 200),
 starts_at timestamptz not null,
 expires_at timestamptz not null,
 revoked_at timestamptz,
 created_at timestamptz not null default now(),
 unique(provider,external_period_id),
 check(expires_at>starts_at)
);
create index member_subscription_periods_user_expiry on public.member_subscription_periods(user_id,expires_at);
alter table public.member_subscription_periods enable row level security;
revoke all on public.member_subscription_periods from public,anon,authenticated;
grant select,insert,update on public.member_subscription_periods to service_role;
grant usage,select on sequence public.member_subscription_periods_id_seq to service_role;

-- Read-time evaluation: no scheduled downgrade job, no deletes of member content.
-- End is exclusive: at expires_at exactly the grant is no longer valid.
create function public.member_membership_status() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare u uuid:=auth.uid(); access jsonb; result jsonb;
begin
 if u is null then raise exception 'MEMBER_VERIFY_REQUIRED'; end if;
 access:=public.member_feature_access();
 with grants as (
  select m.tier,'administrator'::text source,m.expires_at
   from public.member_tiers m where m.user_id=u and m.tier<>'free'
   and (m.expires_at is null or m.expires_at>now())
  union all
  select p.tier,'subscription',p.expires_at from public.member_subscription_periods p
   where p.user_id=u and p.starts_at<=now() and p.expires_at>now() and p.revoked_at is null
  union all
  -- Only claimed vouchers with an actual still-enabled feature qualify.
  select case r.voucher_tier when 'choice' then 'observation' else r.voucher_tier end,
   'voucher',e.expires_at
   from public.member_rewards r join public.member_entitlements e on e.reward_id=r.id
   where r.user_id=u and e.user_id=u and r.status='claimed' and e.starts_at<=now() and e.expires_at>now()
   and exists(select 1 from unnest(r.selected_features) f where (access->'features') ? f)
 ), ranked as (
  select *,case tier when 'vip' then 4 when 'advanced' then 3 when 'research' then 2 when 'observation' then 1 else 0 end rank
  from grants where tier in ('observation','research','advanced','vip')
 ), selected as (
  select * from ranked order by rank desc,expires_at desc nulls first,source limit 1
 )
 select jsonb_build_object('server_time',now(),'tier',coalesce((select tier from selected),'free'),
  'source',coalesce((select source from selected),'free'),
  'expires_at',(select expires_at from selected),
  'next_change_at',(select min(expires_at) from ranked),
  'features',coalesce(access->'features','{}'::jsonb)) into result;
 return result;
end $$;
revoke all on function public.member_membership_status() from public,anon,authenticated;
grant execute on function public.member_membership_status() to authenticated;
commit;
