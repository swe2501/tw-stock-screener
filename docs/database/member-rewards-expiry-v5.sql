-- Points expiry and future voucher policy. Apply once after rewards v4 and member-ai-points.
-- Existing TASK balances receive a complete year from activation. Stored/AI balances are untouched.
begin;
lock table public.member_point_ledger in share row exclusive mode;
create table public.member_reward_policy_v5(id boolean primary key default true check(id),effective_at timestamptz not null default now(),legacy_expires_at timestamptz not null default (((now() at time zone 'Asia/Taipei')+interval '1 year') at time zone 'Asia/Taipei'));
insert into public.member_reward_policy_v5(id) values(true);
create table public.member_task_point_lots_v5(
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,
 ledger_id uuid unique references public.member_point_ledger(id),remaining bigint not null check(remaining>=0),
 earned_at timestamptz not null,expires_at timestamptz not null,legacy boolean not null default false
);
create index member_task_lots_v5_owner_expiry on public.member_task_point_lots_v5(user_id,expires_at,id) where remaining>0;
alter table public.member_reward_policy_v5 enable row level security;
alter table public.member_task_point_lots_v5 enable row level security;
revoke all on public.member_reward_policy_v5,public.member_task_point_lots_v5 from public,anon,authenticated;
grant all on public.member_reward_policy_v5,public.member_task_point_lots_v5 to service_role;
do $$begin
 if exists(select 1 from public.member_point_ledger where pool='task' group by user_id having sum(points)<0) then raise exception 'MEMBER_WALLET_REVIEW_REQUIRED';end if;
end $$;
insert into public.member_task_point_lots_v5(user_id,remaining,earned_at,expires_at,legacy)
 select l.user_id,sum(l.points),p.effective_at,p.legacy_expires_at,true from public.member_point_ledger l cross join public.member_reward_policy_v5 p where l.pool='task' group by l.user_id,p.effective_at,p.legacy_expires_at having sum(l.points)>0;
create function public._member_expire_task_points_v5(p_user uuid) returns void language plpgsql security definer set search_path='' as $$
declare lot record;
begin
 perform pg_advisory_xact_lock(hashtextextended('point-wallet:'||p_user,0));
 for lot in select * from public.member_task_point_lots_v5 where user_id=p_user and remaining>0 and expires_at<=now() order by expires_at,id for update loop
  update public.member_task_point_lots_v5 set remaining=0 where id=lot.id;
  insert into public.member_point_ledger(user_id,description,points,source_event_key,pool)
   values(p_user,'任務點數到期（僅扣除該批未使用點數）',-lot.remaining,'points-expiry-v5:'||lot.id,'task');
 end loop;
end $$;
create function public._member_task_lot_before_v5() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.pool='task' and new.source_event_key not like 'points-expiry-v5:%' then perform public._member_expire_task_points_v5(new.user_id);end if;
 return new;
end $$;
create function public._member_task_lot_after_v5() returns trigger language plpgsql security definer set search_path='' as $$
declare needed bigint;used bigint;lot record;
begin
 if new.pool<>'task' or new.source_event_key like 'points-expiry-v5:%' then return new;end if;
 if new.points>0 then
  insert into public.member_task_point_lots_v5(user_id,ledger_id,remaining,earned_at,expires_at)
   values(new.user_id,new.id,new.points,new.created_at,((new.created_at at time zone 'Asia/Taipei')+interval '1 year') at time zone 'Asia/Taipei');
 else
  needed:=-new.points;
  for lot in select * from public.member_task_point_lots_v5 where user_id=new.user_id and remaining>0 order by expires_at,earned_at,id for update loop
   used:=least(needed,lot.remaining);update public.member_task_point_lots_v5 set remaining=remaining-used where id=lot.id;needed:=needed-used;exit when needed=0;
  end loop;
  if needed>0 then raise exception 'MEMBER_INSUFFICIENT_POINTS';end if;
 end if;
 return new;
end $$;
-- Alphabetically precedes member_ledger_capture, so captured balances include expiry.
create trigger a_member_task_lot_before_v5 before insert on public.member_point_ledger for each row execute function public._member_task_lot_before_v5();
create trigger member_task_lot_after_v5 after insert on public.member_point_ledger for each row execute function public._member_task_lot_after_v5();
alter function public.member_wallet_summary() rename to _member_wallet_summary_pre_expiry_v5;
create function public.member_wallet_summary() returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid();p public.member_reward_policy_v5%rowtype;s jsonb;next_at timestamptz;next_points bigint;soon bigint;
begin
 if u is null then raise exception 'MEMBER_VERIFY_REQUIRED';end if;
 perform public._member_expire_task_points_v5(u);
 s:=public._member_wallet_summary_pre_expiry_v5();select * into strict p from public.member_reward_policy_v5;
 select min(expires_at),coalesce(sum(remaining) filter(where expires_at<=now()+interval '30 days'),0) into next_at,soon from public.member_task_point_lots_v5 where user_id=u and remaining>0;
 select coalesce(sum(remaining),0) into next_points from public.member_task_point_lots_v5 where user_id=u and remaining>0 and expires_at=next_at;
 return s||jsonb_build_object('point_expiry_policy',jsonb_build_object('version',5,'effective_at',p.effective_at,'legacy_expires_at',p.legacy_expires_at,'validity_months',12,'voucher_activation_months',3,'next_expiry_at',next_at,'next_expiry_points',next_points,'expiring_30d_points',soon,'warning_days',jsonb_build_array(30,7)));
end $$;
alter function public.exchange_member_points(text,uuid) rename to _member_exchange_pre_expiry_v5;
create function public.exchange_member_points(p_exchange_id text,p_request_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'MEMBER_VERIFY_REQUIRED';end if;
 perform public._member_expire_task_points_v5(auth.uid());
 return public._member_exchange_pre_expiry_v5(p_exchange_id,p_request_id);
end $$;
-- Future issued definition vouchers only. Already-issued deadlines are preserved.
do $$declare original text;updated text;begin
 original:=pg_get_functiondef('public._member_issue_voucher(uuid,text,integer,text)'::regprocedure);
 updated:=replace(replace(original,'interval ''1 month''','interval ''3 months'''),'核發後一個月內啟用','核發後三個月內啟用');
 if updated=original then raise exception 'VOUCHER_ISSUER_REVIEW_REQUIRED';end if;
 execute updated;
end $$;
revoke all on function public._member_expire_task_points_v5(uuid),public._member_task_lot_before_v5(),public._member_task_lot_after_v5(),public._member_wallet_summary_pre_expiry_v5(),public._member_exchange_pre_expiry_v5(text,uuid),public.member_wallet_summary(),public.exchange_member_points(text,uuid) from public,anon,authenticated;
grant execute on function public.member_wallet_summary(),public.exchange_member_points(text,uuid) to authenticated;
commit;
