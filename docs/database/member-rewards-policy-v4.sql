-- PREPARED ONLY. Apply AFTER member-task-bulk-claim.sql (and its prerequisites).
-- Changes future task awards only. Existing ledger/claims/vouchers are untouched.
begin;
create function public._member_task_onboarding_v4(p_id text) returns boolean
language sql immutable set search_path='' as $$
 select p_id=any(array['verify-contact-v1','name-v1','preferences-v1','learn-v1','watch-v1','note-v1','screen-first-v1','simulate-v1'])
$$;
create function public._member_reward_usage_v4(p_user uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object(
  'daily_research',jsonb_build_object('used',coalesce(sum(points) filter(where created_at >= date_trunc('day',now() at time zone 'Asia/Taipei') at time zone 'Asia/Taipei'),0),'limit',60),
  'weekly_research',jsonb_build_object('used',coalesce(sum(points),0),'limit',300))
 from public.member_task_claims where user_id=p_user and not public._member_task_onboarding_v4(task_id)
  and created_at >= date_trunc('week',now() at time zone 'Asia/Taipei') at time zone 'Asia/Taipei'
$$;
create or replace function public._member_task_cap(p_group text) returns integer
language sql immutable set search_path='' as $$
 select case p_group when 'daily_research' then 60 when 'weekly_research' then 300 when 'daily_video' then 15 else null end
$$;
-- Small awards remain earnable inside the daily envelope; no changes to active flags.
update public.member_task_definitions set points=least(points,40)
 where not public._member_task_onboarding_v4(id) and verifier<>'admin_review';
update public.member_task_definitions set points=30 where id='weekly-notes-v1';
-- No new streak vouchers; do not revoke previously issued vouchers.
update public.member_task_definitions set voucher_definition=null,voucher_days=null
 where verifier in ('task_streak7','task_streak15','task_streak30');
alter function public.member_task_status() rename to _member_task_status_pre_rewards_v4;
alter function public.claim_member_task(text) rename to _member_claim_task_pre_rewards_v4;
create function public.member_task_status() returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); s jsonb; rows jsonb;
begin
 if u is null then raise exception 'MEMBER_VERIFY_REQUIRED';end if;
 s:=public._member_task_status_pre_rewards_v4();
 select coalesce(jsonb_agg(x||jsonb_build_object('global_caps',not public._member_task_onboarding_v4(x->>'id'))),'[]') into rows
  from jsonb_array_elements(s->'rows') x;
 return s||jsonb_build_object('rows',rows,'caps',coalesce(s->'caps','{}')||public._member_reward_usage_v4(u),'rewards_policy_version',4);
end $$;
create function public.claim_member_task(p_task_id text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); d public.member_task_definitions%rowtype; k text; usage jsonb;
begin
 if u is null then raise exception 'MEMBER_VERIFY_REQUIRED';end if;
 perform pg_advisory_xact_lock(hashtextextended('point-wallet:'||u,0));
 select * into d from public.member_task_definitions where id=p_task_id and active;
 if not found then raise exception 'MEMBER_TASK_UNAVAILABLE';end if;
 k:=public._member_task_period_key(u,d.period,d.verifier);
 -- Idempotent retries still return the original receipt even at today's limit.
 if exists(select 1 from public.member_task_claims where user_id=u and task_id=d.id and period_key=k)
  or (d.period='once' and exists(select 1 from public.member_point_ledger where user_id=u and source_event_key='task:'||u||':'||d.id)) then
  return public._member_claim_task_pre_rewards_v4(p_task_id);
 end if;
 if not public._member_task_onboarding_v4(d.id) then
  usage:=public._member_reward_usage_v4(u);
  if (usage#>>'{daily_research,used}')::integer+d.points>60 or (usage#>>'{weekly_research,used}')::integer+d.points>300 then
   raise exception 'MEMBER_TASK_LIMIT_REACHED';
  end if;
 end if;
 return public._member_claim_task_pre_rewards_v4(p_task_id);
end $$;
revoke all on function public._member_task_onboarding_v4(text),public._member_reward_usage_v4(uuid),public._member_task_status_pre_rewards_v4(),public._member_claim_task_pre_rewards_v4(text),public.member_task_status(),public.claim_member_task(text) from public,anon,authenticated;
grant execute on function public.member_task_status(),public.claim_member_task(text) to authenticated;
commit;
