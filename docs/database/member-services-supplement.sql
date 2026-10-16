-- REVIEW / STAGING FIRST. Source preparation only: NOT applied by Codex.
-- Run after member-services.sql in an isolated staging database. PostgreSQL 13+.
begin;

create table public.member_point_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  description text not null check(length(trim(description)) between 1 and 300),
  points bigint not null check(points <> 0),
  source_event_key text not null unique check(length(source_event_key) between 1 and 200),
  created_at timestamptz not null default now()
);
create index member_point_ledger_owner_date on public.member_point_ledger(user_id,created_at desc);
alter table public.member_point_ledger enable row level security;
revoke all on public.member_point_ledger from public,anon,authenticated;
grant select on public.member_point_ledger to authenticated;
grant all on public.member_point_ledger to service_role;
create policy member_read_own on public.member_point_ledger for select to authenticated
  using (user_id=(select auth.uid()));
-- No client insert/update/delete policy. Point issuance and redemptions require a
-- separate reviewed server transaction; this table alone does not enable awards.

create table public.academy_events (
  id uuid primary key default gen_random_uuid(),
  title text not null check(length(trim(title)) between 1 and 150),
  description text not null default '' check(length(description)<=5000),
  starts_at timestamptz not null,
  ends_at timestamptz,
  status text not null default 'draft' check(status in ('draft','published','cancelled','archived')),
  registration_url text check(registration_url is null or registration_url ~ '^https://[^[:space:]]+$'),
  created_at timestamptz not null default now(),
  check(ends_at is null or ends_at>starts_at)
);
create index academy_events_status_date on public.academy_events(status,starts_at);
alter table public.academy_events enable row level security;
revoke all on public.academy_events from public,anon,authenticated;
grant select on public.academy_events to authenticated;
grant all on public.academy_events to service_role;
create policy member_read_published_events on public.academy_events for select to authenticated
  using (status='published');

-- Compatibility with PostgreSQL 13: security_barrier plus an explicit auth.uid()
-- predicate. No caller-supplied user ID, no invitee identity exposed by this view.
create view public.member_referral_summary with (security_barrier=true) as
select c.user_id,c.code,
  (select count(*) from public.member_referrals r
    where r.inviter_user_id=c.user_id and r.verified_at is not null) as confirmed_count,
  (select count(distinct r.invitee_user_id) from public.member_referrals r
    where r.inviter_user_id=c.user_id and r.verified_at is not null
      and exists(select 1 from public.member_rewards w where w.user_id=c.user_id
        and w.status in ('ready','claimed')
        and w.source_event_key like 'referral:%:'||r.invitee_user_id::text||':'||c.user_id::text)) as rewarded_count,
  case when c.active then 'active' else 'paused' end as status
from public.member_referral_codes c where c.user_id=(select auth.uid());
revoke all on public.member_referral_summary from public,anon,authenticated;
grant select on public.member_referral_summary to authenticated;
grant select on public.member_referral_summary to service_role;

commit;
-- Intentionally no seeds, real point awards, activities, live schema changes,
-- auth-provider changes, avatar bucket, or outbox worker are executed by this file.
