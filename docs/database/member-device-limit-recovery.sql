-- Recovery migration. Apply with dashboard Hook DISABLED and leave disabled.
-- Preserve old admission records; never delete Auth sessions or research data.
begin;
create table public.member_device_limit_control (
  singleton boolean primary key default true check(singleton),
  enabled boolean not null default false,
  policy_epoch uuid not null default gen_random_uuid()
);
insert into public.member_device_limit_control(singleton,enabled) values(true,false);
alter table public.member_device_limit_control enable row level security;
revoke all on public.member_device_limit_control from public,anon,authenticated;
grant select on public.member_device_limit_control to supabase_auth_admin;
create policy auth_read_device_limit_control on public.member_device_limit_control
  for select to supabase_auth_admin using(true);
alter table public.member_device_sessions add column policy_epoch uuid;
create index member_device_sessions_policy on public.member_device_sessions(user_id,policy_epoch);
grant update(policy_epoch) on public.member_device_sessions to supabase_auth_admin;

create or replace function public.member_device_limit_hook(event jsonb)
returns jsonb language plpgsql volatile set search_path='' as $$
declare
  u uuid := (event->>'user_id')::uuid;
  s uuid := (event->'claims'->>'session_id')::uuid;
  control public.member_device_limit_control%rowtype;
begin
  select * into control from public.member_device_limit_control where singleton;
  if not found then
    return jsonb_build_object('error',jsonb_build_object('http_code',503,'message','MEMBER_DEVICE_POLICY_UNAVAILABLE'));
  end if;
  -- Two explicit deployment gates: installing this function never enables limits.
  if not control.enabled then return jsonb_build_object('claims',event->'claims'); end if;
  if u is null or s is null or event->'claims'->>'sub' is distinct from u::text then
    return jsonb_build_object('error',jsonb_build_object('http_code',403,'message','MEMBER_SESSION_INVALID'));
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('member-device:'||u::text,0));
  delete from public.member_device_sessions d where d.user_id=u and d.policy_epoch=control.policy_epoch
    and not exists(select 1 from auth.sessions a where a.id=d.session_id and a.user_id=u
      and (a.not_after is null or a.not_after>now()));
  if exists(select 1 from public.member_device_sessions where user_id=u and session_id=s and policy_epoch=control.policy_epoch) then
    return jsonb_build_object('claims',event->'claims');
  end if;
  if (select count(*) from public.member_device_sessions where user_id=u and policy_epoch=control.policy_epoch)>=2 then
    return jsonb_build_object('error',jsonb_build_object('http_code',403,'message','MEMBER_DEVICE_LIMIT: 此帳號已有 2 台裝置登入，請先登出其中一台後再試。'));
  end if;
  insert into public.member_device_sessions(user_id,session_id,policy_epoch) values(u,s,control.policy_epoch)
    on conflict(session_id) do update set policy_epoch=excluded.policy_epoch;
  return jsonb_build_object('claims',event->'claims');
end $$;
commit;
-- DO NOT ENABLE until real Auth three-device + local logout/relogin tests pass.
-- Future activation must explicitly set enabled=true with a NEW policy_epoch;
-- historical sessions consume no slots until they actually use Auth again.
