-- Install only after inspecting the target project. Installation leaves enforcement OFF.
-- Independent of the retired member_device_limit_hook. Do not enable both policies.
begin;
create table public.member_device_policy_control (
 singleton boolean primary key default true check(singleton),
 enabled boolean not null default false
);
insert into public.member_device_policy_control values(true,false);
create table public.member_device_leases (
 session_id uuid primary key,
 user_id uuid not null references auth.users(id) on delete cascade,
 label text not null default '瀏覽器',
 admitted_at timestamptz not null default now(),
 seen_at timestamptz not null default now(),
 revoked boolean not null default false
);
create index member_device_leases_owner on public.member_device_leases(user_id,seen_at);
alter table public.member_device_leases enable row level security;
alter table public.member_device_policy_control enable row level security;
revoke all on public.member_device_leases,public.member_device_policy_control from public,anon,authenticated;

create function public.member_device_policy() returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('ready',true,'enabled',enabled,'idle_seconds',300)
 from public.member_device_policy_control where singleton
$$;

-- Resolve actual grants, never user_metadata, selected card or submitted tier.
create function public.member_device_cap(u uuid) returns integer
language plpgsql stable security definer set search_path='' as $$
declare cfg jsonb; cap integer:=1; n integer;
begin
 -- Chief navigator: server-owned account ID; never email, nickname or editable metadata.
 if u='93f16c68-d103-4092-b938-93e34012d3c1'::uuid then return 0; end if;
 select value::jsonb into cfg from public.admin_settings where key='member_commerce_v1';
 select max(coalesce((p->>'device_limit')::int,1)) into n
 from jsonb_array_elements(coalesce(cfg->'products','[]')) p where p->>'tier'='free';
 cap:=greatest(cap,coalesce(n,1));
 select max(coalesce((p->>'device_limit')::int,case m.tier when 'vip' then 3 when 'research' then 2 when 'advanced' then 2 else 1 end)) into n
 from public.member_tiers m left join lateral (
  select value p from jsonb_array_elements(coalesce(cfg->'products','[]'))
  where (case value->>'tier' when 'advanced' then 'research' else value->>'tier' end)
    =(case m.tier when 'advanced' then 'research' else m.tier end)
 ) products on true
 where m.user_id=u and (m.expires_at is null or m.expires_at>now());
 cap:=greatest(cap,coalesce(n,1));
 select max(coalesce(plan.device_limit,case s.tier when 'vip' then 3 when 'research' then 2 when 'advanced' then 2 else 1 end)) into n
 from public.member_subscription_periods s
 left join public.member_payment_orders o on o.period_id=s.id and o.user_id=u and o.status='paid'
 left join public.member_plans plan on plan.plan_code=o.plan_code
 where s.user_id=u and s.starts_at<=now() and s.expires_at>now() and s.revoked_at is null;
 return least(10,greatest(cap,coalesce(n,1)));
end $$;
alter table public.member_plans add column if not exists commerce_features jsonb;
alter table public.member_plans add column if not exists device_limit integer check(device_limit between 1 and 10);

create function public.member_device_manage(p_action text default 'status',p_target uuid default null,p_label text default '瀏覽器') returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare u uuid:=auth.uid(); s uuid:=(auth.jwt()->>'session_id')::uuid; lim integer; live boolean; ok boolean; records jsonb;
begin
 if u is null or s is null or not exists(select 1 from auth.sessions where id=s and user_id=u and (not_after is null or not_after>now())) then
  raise sqlstate 'PT401' using message='MEMBER_SESSION_INVALID';
 end if;
 if p_action not in ('status','claim','takeover','list','revoke','release') then raise sqlstate 'PT400' using message='INVALID_DEVICE_ACTION'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('member-device-lease:'||u::text,0));
 select enabled into live from public.member_device_policy_control where singleton;
 if live is null then raise sqlstate 'PT503' using message='MEMBER_DEVICE_POLICY_UNAVAILABLE'; end if;
 lim:=public.member_device_cap(u);
 if p_action='revoke' then
  update public.member_device_leases set revoked=true where user_id=u and session_id=p_target;
 elsif p_action='release' then
  update public.member_device_leases set revoked=true where user_id=u and session_id=s;
 elsif p_action='takeover' then
  update public.member_device_leases set revoked=true where user_id=u and session_id<>s;
  insert into public.member_device_leases(session_id,user_id,label) values(s,u,left(p_label,80))
  on conflict(session_id) do update set revoked=false,seen_at=now(),admitted_at=now(),label=excluded.label;
 elsif p_action='claim' and live then
  if not exists(select 1 from public.member_device_leases where session_id=s and revoked) then
   if lim=0 or exists(select 1 from public.member_device_leases where session_id=s and user_id=u and not revoked and seen_at>now()-interval '5 minutes')
    or (select count(*) from public.member_device_leases d join auth.sessions a on a.id=d.session_id and a.user_id=u
      where d.user_id=u and not d.revoked and d.seen_at>now()-interval '5 minutes' and (a.not_after is null or a.not_after>now()))<lim then
    insert into public.member_device_leases(session_id,user_id,label) values(s,u,left(p_label,80))
    on conflict(session_id) do update set seen_at=now(),label=excluded.label,admitted_at=case when member_device_leases.seen_at<=now()-interval '5 minutes' then now() else member_device_leases.admitted_at end;
   end if;
  end if;
 end if;
 -- Rank existing leases too: expired paid grants or reduced caps cannot retain extra slots.
 select exists(select 1 from (
  select d.session_id,row_number() over(order by d.admitted_at,d.session_id) n
  from public.member_device_leases d join auth.sessions a on a.id=d.session_id and a.user_id=u
  where d.user_id=u and not d.revoked and d.seen_at>now()-interval '5 minutes' and (a.not_after is null or a.not_after>now())
 ) admitted where session_id=s and (lim=0 or n<=lim)) into ok;
 select coalesce(jsonb_agg(jsonb_build_object('id',d.session_id,'label',d.label,'last_seen_at',d.seen_at,'current',d.session_id=s) order by d.admitted_at),'[]') into records
 from public.member_device_leases d join auth.sessions a on a.id=d.session_id and a.user_id=u
 where d.user_id=u and not d.revoked and d.seen_at>now()-interval '5 minutes' and (a.not_after is null or a.not_after>now());
 return jsonb_build_object('enabled',live,'allowed',not live or ok,'limit',lim,'unlimited',lim=0,'devices',records,'server_time',now(),'idle_seconds',300);
end $$;

create function public.admin_member_device_policy(p_enabled boolean default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare ready boolean; live boolean;
begin
 select exists(select 1 from pg_catalog.pg_db_role_setting settings join pg_catalog.pg_roles r on r.oid=settings.setrole,
  lateral unnest(settings.setconfig) x where r.rolname='authenticator'
  and x='pgrst.db_pre_request=public.member_device_pre_request') into ready;
 if p_enabled is true and not ready then raise exception 'DEVICE_GATE_NOT_INSTALLED'; end if;
 if p_enabled is not null then update public.member_device_policy_control set enabled=p_enabled where singleton; end if;
 select enabled into live from public.member_device_policy_control where singleton;
 return jsonb_build_object('enabled',live,'gate_ready',ready,'ready',true);
end $$;
revoke all on function public.admin_member_device_policy(boolean) from public,anon,authenticated;
grant execute on function public.admin_member_device_policy(boolean) to service_role;

-- Read-only gate: safe on GET/HEAD and inside RLS. Never reserves slots here.
create function public.member_device_require() returns void
language plpgsql stable security definer set search_path='' as $$
declare u uuid:=auth.uid(); s uuid:=(auth.jwt()->>'session_id')::uuid; live boolean; ok boolean;
begin
 select enabled into live from public.member_device_policy_control where singleton;
 if live is null then raise sqlstate 'PT503' using message='MEMBER_DEVICE_POLICY_UNAVAILABLE'; end if;
 if not live then return; end if;
 if u is null or s is null then raise sqlstate 'PT401' using message='MEMBER_SESSION_INVALID'; end if;
 select exists(select 1 from (
  select d.session_id,row_number() over(order by d.admitted_at,d.session_id) n
  from public.member_device_leases d join auth.sessions a on a.id=d.session_id and a.user_id=u
  where d.user_id=u and not d.revoked and d.seen_at>now()-interval '5 minutes' and (a.not_after is null or a.not_after>now())
 ) admitted where session_id=s and (public.member_device_cap(u)=0 or n<=public.member_device_cap(u))) into ok;
 if not ok then raise sqlstate 'PT409' using message='MEMBER_DEVICE_LIMIT',detail='請管理登入裝置，或選擇在這台繼續使用。'; end if;
end $$;

create function public.member_device_pre_request() returns void
language plpgsql stable security definer set search_path='' as $$
begin
 if auth.jwt()->>'role' is distinct from 'authenticated' then return; end if;
 if current_setting('request.path',true) in ('/rpc/member_device_manage','/rpc/member_device_policy','/rpc/member_device_require') then return; end if;
 perform public.member_device_require();
end $$;
revoke all on function public.member_device_cap(uuid),public.member_device_manage(text,uuid,text),public.member_device_require(),public.member_device_pre_request(),public.member_device_policy() from public,anon,authenticated;
grant execute on function public.member_device_manage(text,uuid,text),public.member_device_require(),public.member_device_pre_request() to authenticated;
grant execute on function public.member_device_policy(),public.member_device_pre_request() to anon,authenticated,service_role;
create or replace function public.admin_member_commerce_save(p_config jsonb,p_revision bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
declare old jsonb; item jsonb; previous jsonb; items jsonb:='[]'; code text; result jsonb;
begin
 perform pg_advisory_xact_lock(74123114);
 select value::jsonb into old from public.admin_settings where key='member_commerce_v1' for update;
 if coalesce((old->>'revision')::bigint,0)<>p_revision then raise exception 'COMMERCE_CONFLICT'; end if;
 if jsonb_typeof(p_config->'payments_enabled')<>'boolean' or jsonb_typeof(p_config->'products')<>'array'
    or jsonb_array_length(p_config->'products') < 1 then raise exception 'COMMERCE_INVALID'; end if;
 for item in select value from jsonb_array_elements(p_config->'products') loop
  if item->>'tier' not in ('free','observation','research','advanced','vip') then raise exception 'COMMERCE_INVALID'; end if;
  select value into previous from jsonb_array_elements(coalesce(old->'products','[]')) where value->>'id'=item->>'id';
  -- Older deployed API versions omit this new field: retain the existing value.
  if not (item ? 'device_limit') then
   item:=item||jsonb_build_object('device_limit',coalesce((previous->>'device_limit')::int,
    case item->>'tier' when 'vip' then 3 when 'research' then 2 when 'advanced' then 2 else 1 end));
  end if;
  if coalesce((item->>'device_limit')::int,0) not between 1 and 10 then raise exception 'COMMERCE_DEVICE_INVALID'; end if;
  code:=null;
  if item->>'tier'<>'free' then
   select value into previous from jsonb_array_elements(coalesce(old->'products','[]')) where value->>'id'=item->>'id';
   -- Commercial terms and granted features are immutable per purchased plan version.
   if previous is not null and previous->>'plan_code' is not null
      and (previous->>'tier',previous->>'days',previous->>'price_twd',previous->>'name',previous->>'sandbox_only',previous->'features',previous->>'device_limit')
       is not distinct from (item->>'tier',item->>'days',item->>'price_twd',item->>'name',item->>'sandbox_only',item->'features',item->>'device_limit') then
    code:=previous->>'plan_code';
   else
    code:='mc_'||replace(gen_random_uuid()::text,'-','');
    insert into public.member_plans(plan_code,tier,days,price_twd,label,active,sandbox_only,commerce_features,device_limit)
     values(code,item->>'tier',(item->>'days')::int,(item->>'price_twd')::int,item->>'name',false,
      (item->>'sandbox_only')::boolean,item->'features',(item->>'device_limit')::int);
   end if;
  end if;
  items:=items||jsonb_build_array(item||jsonb_build_object('plan_code',code));
 end loop;
 result:=jsonb_build_object('revision',p_revision+1,'payments_enabled',p_config->'payments_enabled','products',items);
 insert into public.admin_settings(key,value,updated_at) values('member_commerce_v1',result::text,now())
 on conflict(key) do update set value=excluded.value,updated_at=excluded.updated_at;
 return result;
end $$;

commit;
-- Separate activation: inspect/preserve any EXISTING pgrst.db_pre_request before composing
-- this gate; configure Vercel MEMBER_DEVICE_POLICY_ENABLED=true only after migration.
-- The public catalog only reports enabled after DB enabled=true. Do NOT enable here.
