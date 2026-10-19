-- PREPARED ONLY: explicit approval is required before applying to shared Supabase.
-- Apply after member-services.sql and member-share-unlock.sql. Does NOT enable the campaign.
begin;
alter table public.member_rewards add column activation_deadline timestamptz;

create or replace function public._member_share_grant(p_user uuid,p_event text,p_days integer,p_title text)
returns void language plpgsql security definer set search_path='' as $$
declare deadline timestamptz:=((now() at time zone 'Asia/Taipei')+interval '1 month') at time zone 'Asia/Taipei';
begin
 insert into public.member_rewards(user_id,title,description,feature,duration_days,status,expires_at,activation_deadline,source_event_key)
 values(p_user,p_title||'使用券','核發後一個月內啟用；啟用時起算完整使用天數。','research_tools',p_days,'ready',deadline,deadline,p_event)
 on conflict(source_event_key) do nothing;
end $$;

-- Keep the existing qualification, unique referral owner and per-event idempotency.
alter function public.member_share_unlock(boolean,boolean) rename to _member_share_reconcile;
revoke all on function public._member_share_reconcile(boolean,boolean) from public,anon,authenticated;
create function public.member_share_unlock(p_claim_trial boolean default false,p_confirm_shared boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; pending integer;
begin
 result:=public._member_share_reconcile(p_claim_trial,p_confirm_shared);
 select count(*)::integer into pending from public.member_rewards where user_id=auth.uid()
  and activation_deadline is not null and status='ready' and activation_deadline>now();
 return result||jsonb_build_object('reward_delivery','voucher','pending_vouchers',pending,'activation_months',1);
end $$;
revoke all on function public.member_share_unlock(boolean,boolean) from public,anon,authenticated;
grant execute on function public.member_share_unlock(boolean,boolean) to authenticated;

create or replace function public.claim_member_reward(p_reward_id uuid) returns jsonb
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
 if r.status<>'ready' or now()>=coalesce(r.activation_deadline,r.expires_at) then raise exception 'MEMBER_REWARD_EXPIRED'; end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text||':'||r.feature,0));
 if r.activation_deadline is not null then
  -- Each voucher starts on explicit activation; storing multiple vouchers does not consume time.
  start_time:=now();
 else
  -- Preserve pre-existing non-voucher reward behavior.
  select greatest(now(),coalesce(max(expires_at),now())) into start_time from public.member_entitlements where user_id=u and feature=r.feature;
 end if;
 insert into public.member_entitlements(user_id,feature,starts_at,expires_at,reward_id)
 values(u,r.feature,start_time,start_time+make_interval(days=>r.duration_days),r.id) returning * into entitlement;
 update public.member_rewards set status='claimed',claimed_at=now(),expires_at=case when activation_deadline is not null then entitlement.expires_at else expires_at end where id=r.id;
 return jsonb_build_object('id',entitlement.id,'status','claimed','starts_at',entitlement.starts_at,'expires_at',entitlement.expires_at,'duplicate',false);
end $$;
revoke all on function public.claim_member_reward(uuid) from public,anon,authenticated;
grant execute on function public.claim_member_reward(uuid) to authenticated;

create function public.member_usage_vouchers() returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); result jsonb;
begin
 if u is null then raise exception 'MEMBER_VERIFY_REQUIRED'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'title',r.title,'duration_days',r.duration_days,
  'status',r.status,'activation_deadline',r.activation_deadline,'starts_at',e.starts_at,'expires_at',e.expires_at)
  order by r.created_at desc),'[]'::jsonb) into result
 from public.member_rewards r left join public.member_entitlements e on e.reward_id=r.id
 where r.user_id=u and r.activation_deadline is not null;
 return jsonb_build_object('mode','voucher','server_time',now(),'rows',result);
end $$;
revoke all on function public.member_usage_vouchers() from public,anon,authenticated;
grant execute on function public.member_usage_vouchers() to authenticated;

-- New accounts receive their own random code in the same signup transaction.
-- Existing unrelated auth triggers are preserved; existing users are provisioned lazily by self-only RPC.
create function public._member_provision_invite_code() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 perform public._member_ensure_code(new.id);
 return new;
end $$;
revoke all on function public._member_provision_invite_code() from public,anon,authenticated;
create trigger academy_provision_invite_code after insert on auth.users
 for each row execute function public._member_provision_invite_code();
commit;
