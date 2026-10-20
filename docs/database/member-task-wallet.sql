-- PREPARED ONLY; requires member-services-supplement.sql and member-voucher-levels.sql.
-- Task and exchange definitions start inactive. No recharge, cash conversion or payment service.
begin;
create table public.member_task_definitions (
 id text primary key, title text not null, active boolean not null default false,
 verifier text not null check(verifier in ('verified_contact','qualified_invite')),
 points integer not null check(points between 1 and 10000)
);
insert into public.member_task_definitions(id,title,verifier,points) values
 ('verify-contact-v1','完成信箱或手機驗證','verified_contact',20),
 ('invite-first-v1','邀請第一位有效新會員','qualified_invite',60);
create table public.member_exchange_definitions (
 id text primary key,title text not null,active boolean not null default false,
 points integer not null check(points between 1 and 1000000),
 voucher_definition text not null references public.member_voucher_definitions(id),
 duration_days integer not null check(duration_days between 1 and 366)
);
insert into public.member_exchange_definitions(id,title,points,voucher_definition,duration_days) values
 ('choice-3d-v1','自選券 · 3 天',180,'choice-v1',3),
 ('observation-3d-v1','觀察券 · 3 天',300,'observation-v1',3),
 ('research-3d-v1','研究券 · 3 天',600,'research-v1',3),
 ('advanced-3d-v1','進階券 · 3 天',1200,'advanced-v1',3),
 ('vip-3d-v1','VIP 券 · 3 天',2400,'vip-v1',3);
create table public.member_point_exchanges (
 user_id uuid not null references auth.users(id) on delete cascade,
 request_id uuid not null, exchange_id text not null,
 reward_id uuid not null references public.member_rewards(id),
 points integer not null check(points>0),created_at timestamptz not null default now(),
 primary key(user_id,request_id)
);
alter table public.member_task_definitions enable row level security;
alter table public.member_exchange_definitions enable row level security;
alter table public.member_point_exchanges enable row level security;
revoke all on public.member_task_definitions,public.member_exchange_definitions,public.member_point_exchanges from public,anon,authenticated;
grant all on public.member_task_definitions,public.member_exchange_definitions,public.member_point_exchanges to service_role;

create function public.member_wallet_summary() returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); balance bigint;
begin
 if u is null then raise exception 'MEMBER_VERIFY_REQUIRED'; end if;
 select coalesce(sum(points),0)::bigint into balance from public.member_point_ledger where user_id=u;
 if balance<0 or balance>9007199254740991 then raise exception 'MEMBER_WALLET_REVIEW_REQUIRED'; end if;
 return jsonb_build_object('task_points',balance,'stored_enabled',false,'stored_points',null,'server_time',now());
end $$;

-- Proof uses server Auth verification / the existing qualified referral reconciler.
-- Client metadata, browser completion flags and caller-supplied points are never accepted.
create function public._member_task_eligible(p_user uuid,p_verifier text) returns boolean
language plpgsql security definer set search_path='' as $$
declare eligible boolean:=false; progress jsonb;
begin
 if p_user is distinct from auth.uid() then raise exception 'MEMBER_VERIFY_REQUIRED'; end if;
 if p_verifier='verified_contact' then
  select email_confirmed_at is not null or phone_confirmed_at is not null into eligible from auth.users where id=p_user;
 elsif p_verifier='qualified_invite' then
  progress:=public.member_share_unlock();
  eligible:=coalesce((progress->>'campaign_active')::boolean,false) and coalesce((progress->>'verified')::boolean,false) and (progress->>'confirmed_count')::integer>=1;
 end if;
 return coalesce(eligible,false);
end $$;
revoke all on function public._member_task_eligible(uuid,text) from public,anon,authenticated;

create function public.member_task_status() returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); rows jsonb:='[]'; d record;
begin
 if u is null then raise exception 'MEMBER_VERIFY_REQUIRED'; end if;
 for d in select * from public.member_task_definitions where active order by id loop
  rows:=rows||jsonb_build_array(jsonb_build_object('id',d.id,'title',d.title,'points',d.points,
   'claimed',exists(select 1 from public.member_point_ledger where user_id=u and source_event_key='task:'||u||':'||d.id),
   'eligible',public._member_task_eligible(u,d.verifier)));
 end loop;
 return jsonb_build_object('server_time',now(),'rows',rows);
end $$;

create function public.claim_member_task(p_task_id text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); d public.member_task_definitions%rowtype; event text; entry public.member_point_ledger%rowtype;
begin
 if u is null then raise exception 'MEMBER_VERIFY_REQUIRED'; end if;
 perform pg_advisory_xact_lock(hashtextextended('point-wallet:'||u,0));
 event:='task:'||u||':'||p_task_id;
 select * into entry from public.member_point_ledger where user_id=u and source_event_key=event;
 if found then return jsonb_build_object('id',entry.id,'points',entry.points,'duplicate',true); end if;
 select * into d from public.member_task_definitions where id=p_task_id and active;
 if not found then raise exception 'MEMBER_TASK_UNAVAILABLE'; end if;
 if not public._member_task_eligible(u,d.verifier) then raise exception 'MEMBER_TASK_INCOMPLETE'; end if;
 insert into public.member_point_ledger(user_id,description,points,source_event_key) values(u,d.title,d.points,event) returning * into entry;
 return jsonb_build_object('id',entry.id,'points',entry.points,'duplicate',false);
end $$;

create function public.member_point_exchange_options() returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'MEMBER_VERIFY_REQUIRED'; end if;
 return jsonb_build_object('server_time',now(),'rows',(select coalesce(jsonb_agg(jsonb_build_object(
  'id',e.id,'title',e.title,'points',e.points,'duration_days',e.duration_days,'tier',v.tier) order by e.points),'[]'::jsonb)
  from public.member_exchange_definitions e join public.member_voucher_definitions v on v.id=e.voucher_definition where e.active and v.active));
end $$;

-- The debit, voucher issuance and request receipt commit together or all roll back.
create function public.exchange_member_points(p_exchange_id text,p_request_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); d public.member_exchange_definitions%rowtype; receipt public.member_point_exchanges%rowtype;
 balance bigint; reward uuid; event text;
begin
 if u is null then raise exception 'MEMBER_VERIFY_REQUIRED'; end if;
 if p_request_id is null then raise exception 'MEMBER_INPUT_INVALID'; end if;
 perform pg_advisory_xact_lock(hashtextextended('point-wallet:'||u,0));
 select * into receipt from public.member_point_exchanges where user_id=u and request_id=p_request_id;
 if found then
  if receipt.exchange_id<>p_exchange_id then raise exception 'MEMBER_INPUT_INVALID'; end if;
  return jsonb_build_object('reward_id',receipt.reward_id,'points',receipt.points,'duplicate',true);
 end if;
 select * into d from public.member_exchange_definitions where id=p_exchange_id and active;
 if not found then raise exception 'MEMBER_EXCHANGE_UNAVAILABLE'; end if;
 select coalesce(sum(points),0)::bigint into balance from public.member_point_ledger where user_id=u;
 if balance<d.points then raise exception 'MEMBER_POINTS_INSUFFICIENT'; end if;
 event:='points-exchange:'||u||':'||p_request_id;
 reward:=public._member_issue_voucher(u,d.voucher_definition,d.duration_days,event);
 insert into public.member_point_ledger(user_id,description,points,source_event_key) values(u,d.title,-d.points,event);
 insert into public.member_point_exchanges(user_id,request_id,exchange_id,reward_id,points) values(u,p_request_id,d.id,reward,d.points);
 return jsonb_build_object('reward_id',reward,'points',d.points,'duplicate',false);
end $$;
revoke all on function public.member_wallet_summary(),public.member_task_status(),public.claim_member_task(text),public.member_point_exchange_options(),public.exchange_member_points(text,uuid) from public,anon,authenticated;
grant execute on function public.member_wallet_summary(),public.member_task_status(),public.claim_member_task(text),public.member_point_exchange_options(),public.exchange_member_points(text,uuid) to authenticated;
commit;
