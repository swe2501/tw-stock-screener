-- PREPARED ONLY: provider-independent subscription storage. Never enables payment.
begin;
create table public.member_billing_contracts (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 status text not null default 'pending_provider' check(status in ('pending_provider','active','past_due','expired','canceled')),
 plan_snapshot jsonb not null,
 pending_plan_snapshot jsonb,
 current_period_start timestamptz,
 current_period_end timestamptz,
 next_charge_at timestamptz,
 anchor_day integer check(anchor_day between 1 and 31),
 cancel_at_period_end boolean not null default false,
 provider text,
 provider_subscription_id text,
 is_test boolean not null default true,
 version bigint not null default 1,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 check((current_period_start is null and current_period_end is null) or
       (current_period_start is not null and current_period_end is not null and current_period_end>current_period_start)),
 check(status not in ('active','past_due') or current_period_end is not null),
 check(is_test or status='pending_provider' or (provider is not null and provider_subscription_id is not null))
);
create unique index member_billing_one_live_contract on public.member_billing_contracts(user_id)
 where not is_test and status in ('active','past_due');
create unique index member_billing_provider_contract on public.member_billing_contracts(provider,provider_subscription_id)
 where provider_subscription_id is not null;
create index member_billing_contract_owner on public.member_billing_contracts(user_id,created_at desc);
create table public.member_billing_events (
 id bigint generated always as identity primary key,
 contract_id uuid not null references public.member_billing_contracts(id),
 provider_event_id text not null unique,
 event_type text not null,
 amount_twd integer check(amount_twd>=0),
 received_at timestamptz not null default now()
);
alter table public.member_billing_contracts enable row level security;
alter table public.member_billing_events enable row level security;
revoke all on public.member_billing_contracts,public.member_billing_events from public,anon,authenticated;
grant select,insert,update on public.member_billing_contracts to service_role;
grant select,insert on public.member_billing_events to service_role;
grant usage,select on sequence public.member_billing_events_id_seq to service_role;
commit;
-- A future verified provider adapter must record a unique payment event and the paid
-- membership period in ONE transaction. Browser returns/demo events never grant access.
