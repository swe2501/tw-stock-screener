-- PREPARED ONLY. Not applied to the shared production database.
-- Requires member-services.sql. Deploy and enable only after explicit approval.
-- No Auth triggers, provider changes, existing RLS changes, or new HTTP Function.
begin;

create table public.member_share_campaign (
  id text primary key check(id='share-v1'),
  active boolean not null default false,
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  require_phone boolean not null default true,
  check(ends_at is null or ends_at>starts_at)
);
insert into public.member_share_campaign(id) values('share-v1');
alter table public.member_share_campaign enable row level security;
revoke all on public.member_share_campaign from public,anon,authenticated;
grant all on public.member_share_campaign to service_role;

-- Internal only. Caller holds the same per-user/feature lock as claim_member_reward.
create function public._member_share_grant(p_user uuid,p_event text,p_days integer,p_title text)
returns void language plpgsql security definer set search_path='' as $$
declare reward uuid; start_time timestamptz;
begin
  insert into public.member_rewards(user_id,title,description,feature,duration_days,status,
    expires_at,claimed_at,source_event_key)
  values(p_user,p_title,'分享解鎖使用權；自原有效期限接續計算。','research_tools',p_days,
    'claimed',now()+interval '1 day',now(),p_event)
  on conflict(source_event_key) do nothing returning id into reward;
  if reward is null then return; end if;
  select greatest(now(),coalesce(max(expires_at),now())) into start_time
    from public.member_entitlements where user_id=p_user and feature='research_tools';
  insert into public.member_entitlements(user_id,feature,starts_at,expires_at,reward_id)
    values(p_user,'research_tools',start_time,start_time+make_interval(days=>p_days),reward);
  update public.member_rewards set expires_at=start_time+make_interval(days=>p_days) where id=reward;
end $$;

-- The client supplies no member ID, count, feature, date or duration.
-- GET-style calls reconcile newly verified referrals and issue each earned round once.
create function public.member_share_unlock(p_claim_trial boolean default false,p_confirm_shared boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  u uuid:=auth.uid(); c public.member_share_campaign%rowtype; code_value text;
  verified boolean; running boolean; qualified integer:=0; rounds integer:=0;
  trial boolean; access_until timestamptz; access_now boolean;
begin
  if u is null then raise exception 'MEMBER_VERIFY_REQUIRED'; end if;
  if p_claim_trial is null or p_confirm_shared is null or (p_claim_trial and not p_confirm_shared)
    then raise exception 'MEMBER_INPUT_INVALID'; end if;
  select * into strict c from public.member_share_campaign where id='share-v1';
  running:=c.active and now()>=c.starts_at and (c.ends_at is null or now()<c.ends_at);
  select case when c.require_phone then phone_confirmed_at is not null and coalesce(phone,'')<>''
    else email_confirmed_at is not null or phone_confirmed_at is not null end
    into verified from auth.users where id=u;
  if verified is null then raise exception 'MEMBER_VERIFY_REQUIRED'; end if;
  -- Serialize concurrent tabs, retries, trial claims and referral reconciliation.
  perform pg_advisory_xact_lock(hashtextextended(u::text||':research_tools',0));
  code_value:=public._member_ensure_code(u);
  select count(distinct case when c.require_phone then a.phone
      else coalesce(nullif(a.phone,''),lower(a.email)) end)::integer into qualified
    from public.member_referrals r join auth.users a on a.id=r.invitee_user_id
    where r.inviter_user_id=u and r.invitee_user_id<>u
      and a.created_at>=c.starts_at and r.created_at>=c.starts_at
      and (c.ends_at is null or (a.created_at<c.ends_at and r.created_at<c.ends_at))
      and r.created_at<=a.created_at+interval '7 days'
      and case when c.require_phone then a.phone_confirmed_at<=a.created_at+interval '7 days'
        else least(a.email_confirmed_at,a.phone_confirmed_at)<=a.created_at+interval '7 days' end
      and case when c.require_phone then a.phone_confirmed_at is not null and coalesce(a.phone,'')<>''
        else a.email_confirmed_at is not null or a.phone_confirmed_at is not null end;
  if p_claim_trial then
    if not running then raise exception 'MEMBER_SHARE_PAUSED'; end if;
    if not verified then raise exception 'MEMBER_VERIFY_REQUIRED'; end if;
    perform public._member_share_grant(u,'share-unlock:share-v1:'||u||':trial',3,'分享體驗 · 3 天');
  end if;
  if running and verified then
    if qualified>=3 then
      for n in 1..(qualified/3) loop
        perform public._member_share_grant(u,'share-unlock:share-v1:'||u||':round:'||n,7,'邀請 3 位好友 · 7 天');
      end loop;
    end if;
  end if;
  select exists(select 1 from public.member_rewards where user_id=u
    and source_event_key='share-unlock:share-v1:'||u||':trial') into trial;
  select count(*)::integer into rounds from public.member_rewards where user_id=u
    and source_event_key like 'share-unlock:share-v1:'||u||':round:%';
  select max(expires_at),coalesce(bool_or(starts_at<=now() and expires_at>now()),false)
    into access_until,access_now from public.member_entitlements where user_id=u and feature='research_tools';
  return jsonb_build_object('campaign','share-v1','campaign_active',running,'requires_phone',c.require_phone,
    'verified',verified,'code',code_value,'confirmed_count',qualified,'rewarded_groups',rounds,
    'trial_claimed',trial,'has_access',access_now,'expires_at',access_until,'server_time',now(),
    'feature','research_tools','trial_days',3,'referral_days',7,'threshold',3);
end $$;

revoke all on function public._member_share_grant(uuid,text,integer,text) from public,anon,authenticated;
revoke all on function public.member_share_unlock(boolean,boolean) from public,anon,authenticated;
grant execute on function public.member_share_unlock(boolean,boolean) to authenticated;
commit;

-- Activation is a SEPARATE approved operational step, never performed by the browser:
-- update public.member_share_campaign set active=true, starts_at=now() where id='share-v1';
-- require_phone stays true until verified phone signup can actually be completed.
