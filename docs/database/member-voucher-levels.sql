-- PREPARED ONLY. Apply after member-share-vouchers.sql with separate database approval.
-- Definitions start inactive: no campaign, payment, provider or existing free feature is changed.
begin;
create table public.member_feature_catalog (
 feature text primary key check(feature ~ '^[a-z][a-z0-9_]{1,39}$'),
 title text not null, route text not null,
 member_research boolean not null default true,
 voucher_enabled boolean not null default false,
 check(not member_research or feature not in ('sig','brank','mingdeng','admin','private_formula'))
);
insert into public.member_feature_catalog(feature,title,route,voucher_enabled) values
 ('fhedge','外資空單溫度計','fhedge',true),('breadth','大盤多空廣度','breadth',true);
insert into public.member_feature_catalog(feature,title,route) values
 ('hottopics','話題研究','hottopics'),('selltrack','出場追蹤','selltrack');
create table public.member_voucher_definitions (
 id text primary key, version integer not null default 1 check(version>0),
 title text not null, tier text not null check(tier in ('observation','research','advanced','vip','choice')),
 active boolean not null default false,
 allowed_features text[] not null default '{}',
 selection_count integer not null default 0,
 check((tier='choice' and selection_count=1) or (tier<>'choice' and selection_count=0))
);
insert into public.member_voucher_definitions(id,title,tier,allowed_features,selection_count) values
 ('observation-v1','觀察券','observation',array['fhedge','breadth'],0),
 ('research-v1','研究券','research','{}',0),
 ('advanced-v1','進階券','advanced','{}',0),
 ('vip-v1','VIP 券','vip','{}',0),
 ('choice-v1','自選券','choice',array['fhedge','breadth'],1);
alter table public.member_feature_catalog enable row level security;
alter table public.member_voucher_definitions enable row level security;
revoke all on public.member_feature_catalog,public.member_voucher_definitions from public,anon,authenticated;
grant all on public.member_feature_catalog,public.member_voucher_definitions to service_role;
alter table public.member_rewards
 add column voucher_tier text check(voucher_tier in ('observation','research','advanced','vip','choice')),
 add column voucher_definition text,
 add column voucher_version integer,
 add column allowed_features text[],
 add column selected_features text[];

-- Only trusted server tasks can issue a definition. No authenticated browser grant.
-- VIP expands the current MEMBER research catalog at issuance, never owner/admin/wildcards.
create function public._member_issue_voucher(p_user uuid,p_definition text,p_days integer,p_event text)
returns uuid language plpgsql security definer set search_path='' as $$
declare d public.member_voucher_definitions%rowtype; features text[]; reward uuid; deadline timestamptz;
begin
 if p_days is null or p_days<1 or p_days>366 or p_event is null or length(p_event)<8 then raise exception 'MEMBER_INPUT_INVALID'; end if;
 perform pg_advisory_xact_lock(hashtextextended('voucher-event:'||p_event,0));
 select id into reward from public.member_rewards where source_event_key=p_event and user_id=p_user;
 if found then return reward; end if;
 select * into d from public.member_voucher_definitions where id=p_definition and active;
 if not found then raise exception 'MEMBER_VOUCHER_UNAVAILABLE'; end if;
 if d.tier='vip' then
  if exists(select 1 from public.member_feature_catalog where member_research and not voucher_enabled) then raise exception 'MEMBER_VIP_NOT_READY'; end if;
  select array_agg(feature order by feature) into features from public.member_feature_catalog where member_research and voucher_enabled;
 else features:=d.allowed_features; end if;
 if coalesce(cardinality(features),0)=0 or cardinality(features)<>(select count(distinct x) from unnest(features) x)
  or exists(select 1 from unnest(features) x where not exists(select 1 from public.member_feature_catalog c where c.feature=x and c.member_research and c.voucher_enabled))
 then raise exception 'MEMBER_VOUCHER_CONFIG_INVALID'; end if;
 deadline:=((now() at time zone 'Asia/Taipei')+interval '1 month') at time zone 'Asia/Taipei';
 insert into public.member_rewards(user_id,title,description,feature,duration_days,expires_at,activation_deadline,source_event_key,
  voucher_tier,voucher_definition,voucher_version,allowed_features)
 values(p_user,d.title,'核發後一個月內啟用，啟用後享完整天數。','voucher_bundle',p_days,deadline,deadline,p_event,d.tier,d.id,d.version,features)
 returning id into reward;
 return reward;
end $$;
revoke all on function public._member_issue_voucher(uuid,text,integer,text) from public,anon,authenticated;
grant execute on function public._member_issue_voucher(uuid,text,integer,text) to service_role;

-- Confirmed product rule: every qualified group of three issues a VIP seven-day voucher.
-- Existing three-day trial scope is retained. Campaign remains off pending approval.
create or replace function public._member_share_grant(p_user uuid,p_event text,p_days integer,p_title text)
returns void language plpgsql security definer set search_path='' as $$
declare deadline timestamptz:=((now() at time zone 'Asia/Taipei')+interval '1 month') at time zone 'Asia/Taipei';
begin
 if p_days=7 and p_event like '%:round:%' then
  perform public._member_issue_voucher(p_user,'vip-v1',7,p_event);
 else
  insert into public.member_rewards(user_id,title,description,feature,duration_days,status,expires_at,activation_deadline,source_event_key)
  values(p_user,p_title||'使用券','核發後一個月內啟用，啟用後享完整天數。','research_tools',p_days,'ready',deadline,deadline,p_event)
  on conflict(source_event_key) do nothing;
 end if;
end $$;

-- Preserve legacy reward callers; typed vouchers must use the explicit selection RPC.
alter function public.claim_member_reward(uuid) rename to _member_claim_legacy_reward;
revoke all on function public._member_claim_legacy_reward(uuid) from public,anon,authenticated;
create function public.activate_member_voucher(p_reward_id uuid,p_features text[] default '{}')
returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); r public.member_rewards%rowtype; e public.member_entitlements%rowtype; chosen text[];
begin
 if u is null then raise exception 'MEMBER_VERIFY_REQUIRED'; end if;
 select * into r from public.member_rewards where id=p_reward_id and user_id=u for update;
 if not found then raise exception 'MEMBER_REWARD_NOT_FOUND'; end if;
 if r.voucher_tier is null then
  if coalesce(cardinality(p_features),0)>0 then raise exception 'MEMBER_SELECTION_INVALID'; end if;
  return public._member_claim_legacy_reward(p_reward_id);
 end if;
 if r.status='claimed' then
  select * into e from public.member_entitlements where reward_id=r.id;
  return jsonb_build_object('id',e.id,'status','claimed','starts_at',e.starts_at,'expires_at',e.expires_at,'features',r.selected_features,'duplicate',true);
 end if;
 if r.status<>'ready' or r.activation_deadline is null or now()>=r.activation_deadline then raise exception 'MEMBER_REWARD_EXPIRED'; end if;
 if r.voucher_tier='choice' then
  if p_features is null or cardinality(p_features)<>1 or p_features[1] is null or not(p_features<@r.allowed_features) then raise exception 'MEMBER_SELECTION_INVALID'; end if;
  chosen:=p_features;
 else
  if coalesce(cardinality(p_features),0)>0 then raise exception 'MEMBER_SELECTION_INVALID'; end if;
  chosen:=r.allowed_features;
 end if;
 if coalesce(cardinality(chosen),0)=0 or exists(select 1 from unnest(chosen) x where not exists(select 1 from public.member_feature_catalog c where c.feature=x and c.member_research and c.voucher_enabled)) then raise exception 'MEMBER_VOUCHER_UNAVAILABLE'; end if;
 insert into public.member_entitlements(user_id,feature,starts_at,expires_at,reward_id)
 values(u,'voucher_bundle',now(),now()+make_interval(days=>r.duration_days),r.id) returning * into e;
 update public.member_rewards set status='claimed',claimed_at=now(),expires_at=e.expires_at,selected_features=chosen where id=r.id;
 return jsonb_build_object('id',e.id,'status','claimed','starts_at',e.starts_at,'expires_at',e.expires_at,'features',chosen,'duplicate',false);
end $$;
create function public.claim_member_reward(p_reward_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
begin return public.activate_member_voucher(p_reward_id,'{}'); end $$;
revoke all on function public.activate_member_voucher(uuid,text[]),public.claim_member_reward(uuid) from public,anon,authenticated;
grant execute on function public.activate_member_voucher(uuid,text[]),public.claim_member_reward(uuid) to authenticated;

-- Access is scoped to actual tools, independent of whether a promotion is currently running.
create function public.member_feature_access() returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); features jsonb; tier text;
begin
 if u is null then raise exception 'MEMBER_VERIFY_REQUIRED'; end if;
 select coalesce(jsonb_object_agg(feature,expires_at),'{}'::jsonb) into features from (
  select c.feature,max(e.expires_at) expires_at from public.member_entitlements e
  join public.member_rewards r on r.id=e.reward_id and r.user_id=u
  join public.member_feature_catalog c on c.member_research and c.voucher_enabled and
   ((e.feature='research_tools' and c.feature in ('fhedge','breadth')) or
    (e.feature='voucher_bundle' and c.feature=any(r.selected_features)))
  where e.user_id=u and r.status='claimed' and e.starts_at<=now() and e.expires_at>now() group by c.feature
 ) live;
 select r.voucher_tier into tier from public.member_rewards r join public.member_entitlements e on e.reward_id=r.id
 where r.user_id=u and r.status='claimed' and e.user_id=u and e.starts_at<=now() and e.expires_at>now() and
 exists(select 1 from unnest(r.selected_features) f where features ? f)
 order by case r.voucher_tier when 'vip' then 4 when 'advanced' then 3 when 'research' then 2 when 'observation' then 1 else 0 end desc limit 1;
 return jsonb_build_object('server_time',now(),'features',features,'tier',tier);
end $$;
revoke all on function public.member_feature_access() from public,anon,authenticated;
grant execute on function public.member_feature_access() to authenticated;

create or replace function public.member_usage_vouchers() returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); result jsonb;
begin
 if u is null then raise exception 'MEMBER_VERIFY_REQUIRED'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'title',r.title,'duration_days',r.duration_days,
  'status',r.status,'tier',r.voucher_tier,'selection_count',case when r.voucher_tier='choice' then 1 else 0 end,
  'allowed_features',coalesce(r.allowed_features,array['fhedge','breadth']),'selected_features',r.selected_features,
  'activation_deadline',r.activation_deadline,'starts_at',e.starts_at,'expires_at',e.expires_at)
  order by r.created_at desc),'[]'::jsonb) into result
 from public.member_rewards r left join public.member_entitlements e on e.reward_id=r.id where r.user_id=u and r.activation_deadline is not null;
 return jsonb_build_object('mode','voucher','server_time',now(),'rows',result,'feature_catalog',
  (select coalesce(jsonb_agg(jsonb_build_object('id',feature,'title',title,'route',route) order by feature),'[]'::jsonb)
   from public.member_feature_catalog where member_research and voucher_enabled));
end $$;

-- Extend the existing share response without changing its qualification/issuance rules.
alter function public.member_share_unlock(boolean,boolean) rename to _member_share_voucher_status;
revoke all on function public._member_share_voucher_status(boolean,boolean) from public,anon,authenticated;
create function public.member_share_unlock(p_claim_trial boolean default false,p_confirm_shared boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; access jsonb;
begin
 result:=public._member_share_voucher_status(p_claim_trial,p_confirm_shared);
 access:=public.member_feature_access();
 return result||jsonb_build_object('feature_access',access->'features','membership_tier',access->'tier');
end $$;
revoke all on function public.member_share_unlock(boolean,boolean) from public,anon,authenticated;
grant execute on function public.member_share_unlock(boolean,boolean) to authenticated;
commit;
