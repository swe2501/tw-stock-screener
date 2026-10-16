-- DEPLOYED 2026-10-16 to bruqrbvbjxntgoljxsne after explicit shared-PRODUCTION approval.
-- Initial migration: do not rerun against existing objects. See docs/member-db-status.md for verification.
-- REVIEW / STAGING FIRST. Prepared for the project administrator; Applied after explicit approval; see header.
-- Requires Supabase PostgreSQL 13+. Review existing objects before running.
begin;

create table public.member_referral_codes (
  user_id uuid primary key references auth.users(id) on delete cascade,
  code text not null unique check (code ~ '^[A-Z0-9]{6,20}$'),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create table public.member_referrals (
  invitee_user_id uuid primary key references auth.users(id) on delete cascade,
  inviter_user_id uuid references auth.users(id) on delete set null,
  referrer_code text not null,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  check (inviter_user_id is null or inviter_user_id <> invitee_user_id)
);
create index on public.member_referrals(inviter_user_id);
create table public.member_rewards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null, description text not null default '',
  kind text not null default 'entitlement' check(kind='entitlement'),
  feature text not null, duration_days integer not null check(duration_days>0),
  status text not null default 'ready' check(status in ('ready','claimed','cancelled','expired')),
  expires_at timestamptz not null, claimed_at timestamptz,
  source_event_key text not null unique,
  created_at timestamptz not null default now()
);
create index on public.member_rewards(user_id,created_at desc);
create table public.member_entitlements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  feature text not null, starts_at timestamptz not null, expires_at timestamptz not null,
  reward_id uuid not null unique references public.member_rewards(id),
  created_at timestamptz not null default now(), check(expires_at>starts_at)
);
create index on public.member_entitlements(user_id,feature,expires_at);
create table public.member_coupons (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null, description text not null default '',
  status text not null default 'available' check(status in ('available','used','cancelled','expired')),
  expires_at timestamptz not null, rule jsonb not null default '{}'::jsonb,
  source_event_key text not null unique,
  created_at timestamptz not null default now()
);
create index on public.member_coupons(user_id,created_at desc);
create table public.member_promo_codes (
  code text primary key check(code ~ '^[A-Z0-9-]{4,32}$'),
  active boolean not null default false,
  title text not null, description text not null default '',
  kind text not null check(kind in ('coupon','entitlement')),
  feature text, duration_days integer check(duration_days>0),
  rule jsonb not null default '{}'::jsonb,
  starts_at timestamptz not null, expires_at timestamptz not null,
  benefit_expires_at timestamptz not null,
  max_uses integer not null check(max_uses>0), uses integer not null default 0 check(uses>=0),
  check(expires_at>starts_at), check(benefit_expires_at>=expires_at),
  check(kind='coupon' or (feature is not null and duration_days is not null))
);
create table public.member_code_redemptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  code text not null references public.member_promo_codes(code),
  kind text not null, item_id uuid not null, title text not null,
  created_at timestamptz not null default now(), unique(user_id,code)
);
create table public.member_referral_campaigns (
  id uuid primary key default gen_random_uuid(), active boolean not null default false,
  title text not null, description text not null default '',
  feature text not null, duration_days integer not null check(duration_days>0),
  starts_at timestamptz not null, expires_at timestamptz not null,
  claim_expires_at timestamptz not null,
  check(expires_at>starts_at), check(claim_expires_at>=expires_at)
);
create table public.member_feedback_tickets (
  id uuid primary key default gen_random_uuid(),
  ticket_seq bigint generated always as identity unique,
  ticket_number text generated always as ('GS-'||lpad(ticket_seq::text,8,'0')) stored unique,
  user_id uuid not null references auth.users(id) on delete cascade,
  request_id uuid not null,
  category text not null, subject text not null check(length(subject) between 1 and 100),
  body text not null check(length(body) between 1 and 5000), source_path text not null default '',
  status text not null default 'received' check(status in ('received','in_progress','waiting','completed')),
  created_at timestamptz not null default now(), unique(user_id,request_id)
);
create index on public.member_feedback_tickets(user_id,created_at desc);
create table public.member_notification_outbox (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  event_key text not null unique, template text not null,
  recipient_email text not null, payload jsonb not null,
  status text not null default 'pending' check(status in ('pending','sending','sent','failed')),
  attempts integer not null default 0, next_attempt_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- No ordinary member can write awards, coupons, campaigns, codes, or mail events.
do $$ declare t text; begin
  foreach t in array array['member_referral_codes','member_referrals','member_rewards','member_entitlements','member_coupons','member_promo_codes','member_code_redemptions','member_referral_campaigns','member_feedback_tickets','member_notification_outbox'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from anon, authenticated',t);
    execute format('grant all on public.%I to service_role',t);
  end loop;
  foreach t in array array['member_referral_codes','member_rewards','member_entitlements','member_coupons','member_code_redemptions','member_feedback_tickets'] loop
    execute format('grant select on public.%I to authenticated',t);
    execute format('create policy member_read_own on public.%I for select to authenticated using (user_id = (select auth.uid()))',t);
  end loop;
end $$;

create function public._member_ensure_code(p_user uuid) returns text
language plpgsql security definer set search_path='' as $$
declare v_code text;
begin
  select code into v_code from public.member_referral_codes where user_id=p_user;
  if found then return v_code; end if;
  for i in 1..10 loop
    begin
      v_code := 'GS'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,12));
      insert into public.member_referral_codes(user_id,code) values(p_user,v_code)
      on conflict(user_id) do update set user_id=excluded.user_id returning code into v_code;
      return v_code;
    exception when unique_violation then null;
    end;
  end loop;
  raise exception 'MEMBER_CODE_LIMIT';
end $$;
create function public.ensure_member_referral_code() returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); c text;
begin
  if u is null then raise exception 'MEMBER_VERIFY_REQUIRED'; end if;
  c:=public._member_ensure_code(u);
  return jsonb_build_object('code',c,'confirmed_count',(select count(*) from public.member_referrals where inviter_user_id=u and verified_at is not null),'rewarded_count',(select count(*) from public.member_rewards where user_id=u and source_event_key like 'referral:%'));
end $$;

-- Qualification and award creation are server-only. No campaign is seeded or enabled.
create function public._member_issue_referral(p_invitee uuid) returns boolean
language plpgsql security definer set search_path='' as $$
declare r public.member_referrals%rowtype; c public.member_referral_campaigns%rowtype;
  joined timestamptz; verified boolean; beneficiary uuid; issued boolean:=false;
begin
  select * into r from public.member_referrals where invitee_user_id=p_invitee for update;
  if not found or r.inviter_user_id is null then return false; end if;
  select created_at,(email_confirmed_at is not null or phone_confirmed_at is not null) into joined,verified from auth.users where id=p_invitee;
  if not coalesce(verified,false) then return false; end if;
  update public.member_referrals set verified_at=coalesce(verified_at,now()) where invitee_user_id=p_invitee;
  for c in select * from public.member_referral_campaigns where active and starts_at<=joined and expires_at>now() and claim_expires_at>now() loop
    foreach beneficiary in array array[p_invitee,r.inviter_user_id] loop
      insert into public.member_rewards(user_id,title,description,feature,duration_days,expires_at,source_event_key)
      values(beneficiary,c.title,c.description,c.feature,c.duration_days,c.claim_expires_at,'referral:'||c.id||':'||p_invitee||':'||beneficiary)
      on conflict(source_event_key) do nothing;
    end loop;
    issued:=true;
  end loop;
  return issued;
end $$;
create function public.bind_member_referral(p_code text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); owner_id uuid; actual_id uuid; c text:=upper(trim(p_code)); issued boolean;
begin
  if u is null then raise exception 'MEMBER_VERIFY_REQUIRED'; end if;
  select user_id into owner_id from public.member_referral_codes where code=c and active;
  if not found then raise exception 'MEMBER_CODE_INVALID'; end if;
  if owner_id=u then raise exception 'MEMBER_SELF_REFERRAL'; end if;
  insert into public.member_referrals(invitee_user_id,inviter_user_id,referrer_code) values(u,owner_id,c) on conflict(invitee_user_id) do nothing;
  select inviter_user_id into actual_id from public.member_referrals where invitee_user_id=u for update;
  if actual_id is distinct from owner_id then raise exception 'MEMBER_REFERRAL_BOUND'; end if;
  issued:=public._member_issue_referral(u);
  return jsonb_build_object('bound',true,'referrer_code',c,'reward_issued',issued);
end $$;

create function public.redeem_member_promo_code(p_code text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); c public.member_promo_codes%rowtype;
  old public.member_code_redemptions%rowtype; item uuid; code_value text:=upper(trim(p_code));
begin
  if u is null or not exists(select 1 from auth.users where id=u and (email_confirmed_at is not null or phone_confirmed_at is not null)) then raise exception 'MEMBER_VERIFY_REQUIRED'; end if;
  select * into c from public.member_promo_codes where code=code_value for update;
  if not found then raise exception 'MEMBER_CODE_INVALID'; end if;
  select * into old from public.member_code_redemptions where user_id=u and code=code_value;
  if found then return jsonb_build_object('item_id',old.item_id,'kind',old.kind,'title',old.title,'duplicate',true); end if;
  if not c.active or now()<c.starts_at then raise exception 'MEMBER_CODE_INVALID'; end if;
  if now()>=c.expires_at or now()>=c.benefit_expires_at then raise exception 'MEMBER_CODE_EXPIRED'; end if;
  if c.uses>=c.max_uses then raise exception 'MEMBER_CODE_LIMIT'; end if;
  if c.kind='coupon' then
    insert into public.member_coupons(user_id,title,description,expires_at,rule,source_event_key)
    values(u,c.title,c.description,c.benefit_expires_at,c.rule,'promo:'||c.code||':'||u) returning id into item;
  else
    insert into public.member_rewards(user_id,title,description,feature,duration_days,expires_at,source_event_key)
    values(u,c.title,c.description,c.feature,c.duration_days,c.benefit_expires_at,'promo:'||c.code||':'||u) returning id into item;
  end if;
  insert into public.member_code_redemptions(user_id,code,kind,item_id,title) values(u,c.code,c.kind,item,c.title);
  update public.member_promo_codes set uses=uses+1 where code=c.code;
  return jsonb_build_object('item_id',item,'kind',c.kind,'title',c.title,'duplicate',false);
end $$;

create function public.claim_member_reward(p_reward_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); r public.member_rewards%rowtype; entitlement public.member_entitlements%rowtype; start_time timestamptz;
begin
  if u is null then raise exception 'MEMBER_VERIFY_REQUIRED'; end if;
  select * into r from public.member_rewards where id=p_reward_id and user_id=u for update;
  if not found then raise exception 'MEMBER_REWARD_NOT_FOUND'; end if;
  if r.status='claimed' then
    select * into entitlement from public.member_entitlements where reward_id=r.id;
    return jsonb_build_object('id',entitlement.id,'status','claimed','starts_at',entitlement.starts_at,'expires_at',entitlement.expires_at,'duplicate',true);
  end if;
  if r.status<>'ready' or now()>=r.expires_at then raise exception 'MEMBER_REWARD_EXPIRED'; end if;
  perform pg_advisory_xact_lock(hashtextextended(u::text||':'||r.feature,0));
  select greatest(now(),coalesce(max(expires_at),now())) into start_time from public.member_entitlements where user_id=u and feature=r.feature;
  insert into public.member_entitlements(user_id,feature,starts_at,expires_at,reward_id)
  values(u,r.feature,start_time,start_time+make_interval(days=>r.duration_days),r.id) returning * into entitlement;
  update public.member_rewards set status='claimed',claimed_at=now() where id=r.id;
  return jsonb_build_object('id',entitlement.id,'status','claimed','starts_at',entitlement.starts_at,'expires_at',entitlement.expires_at,'duplicate',false);
end $$;

create function public.submit_member_feedback(p_category text,p_subject text,p_body text,p_source_path text,p_request_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); t public.member_feedback_tickets%rowtype; email_value text;
begin
  if u is null then raise exception 'MEMBER_VERIFY_REQUIRED'; end if;
  if p_request_id is null or p_category not in ('操作問題','資料疑問','功能許願','閱讀與排版','其他') or length(trim(p_subject)) not between 1 and 100 or length(trim(p_body)) not between 1 and 5000 or length(p_source_path)>512 then raise exception 'MEMBER_INPUT_INVALID'; end if;
  -- Per-member lock makes both rate checks and repeated requests deterministic.
  perform pg_advisory_xact_lock(hashtextextended('feedback:'||u::text,0));
  select * into t from public.member_feedback_tickets where user_id=u and request_id=p_request_id;
  if not found then
    if (select count(*) from public.member_feedback_tickets where user_id=u and created_at>now()-interval '1 minute')>=10 then raise exception 'MEMBER_RATE_LIMIT'; end if;
    insert into public.member_feedback_tickets(user_id,request_id,category,subject,body,source_path)
    values(u,p_request_id,p_category,trim(p_subject),trim(p_body),coalesce(p_source_path,'')) returning * into t;
  elsif t.subject<>trim(p_subject) or t.body<>trim(p_body) or t.category<>p_category then
    raise exception 'MEMBER_INPUT_INVALID';
  end if;
  select email into email_value from auth.users where id=u and email_confirmed_at is not null;
  if coalesce(email_value,'')<>'' then
    insert into public.member_notification_outbox(user_id,event_key,template,recipient_email,payload)
    values(u,'feedback.received:'||t.id,'feedback_received',email_value,jsonb_build_object('ticket_id',t.id,'ticket_number',t.ticket_number,'subject',t.subject)) on conflict(event_key) do nothing;
  end if;
  return jsonb_build_object('ticket_id',t.id,'ticket_number',t.ticket_number,'email_queued',coalesce(email_value,'')<>'');
end $$;

create function public._member_auth_provision() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if TG_OP='INSERT' then perform public._member_ensure_code(new.id); end if;
  if new.email_confirmed_at is not null or new.phone_confirmed_at is not null then perform public._member_issue_referral(new.id); end if;
  return new;
end $$;
-- Manager must verify signup and confirmation in staging before enabling these triggers.
create trigger member_auth_insert after insert on auth.users for each row execute function public._member_auth_provision();
create trigger member_auth_verified after update of email_confirmed_at,phone_confirmed_at on auth.users for each row execute function public._member_auth_provision();
do $$ declare u record; begin for u in select id from auth.users loop perform public._member_ensure_code(u.id); end loop; end $$;

revoke all on function public._member_ensure_code(uuid),public._member_issue_referral(uuid),public._member_auth_provision() from public,anon,authenticated;
revoke all on function public.ensure_member_referral_code(),public.bind_member_referral(text),public.redeem_member_promo_code(text),public.claim_member_reward(uuid),public.submit_member_feedback(text,text,text,text,uuid) from public,anon,authenticated;
grant execute on function public.ensure_member_referral_code(),public.bind_member_referral(text),public.redeem_member_promo_code(text),public.claim_member_reward(uuid),public.submit_member_feedback(text,text,text,text,uuid) to authenticated;
commit;

-- Not included: outbound mail worker, staff replies/admin UI, payment checkout,
-- existing-feature entitlement enforcement, fraud review and global campaign caps.
-- No campaign, promo code, free days, or real award has been created by this file.
