-- APPLIED 2026-10-18 to bruqrbvbjxntgoljxsne after explicit shared-site approval.
-- INCIDENT 2026-10-18: Hook DISABLED after existing users were locked out.
-- Bootstrap below is defective: oldest historical sessions are not current devices.
-- Historical migration only: do not rerun or re-enable without recovery validation.
begin;
create table public.member_device_sessions (
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid primary key,
  admitted_at timestamptz not null default now()
);
create index member_device_sessions_owner on public.member_device_sessions(user_id);
alter table public.member_device_sessions enable row level security;
revoke all on public.member_device_sessions from public,anon,authenticated;
grant select,insert,delete on public.member_device_sessions to supabase_auth_admin;
create policy auth_manage_device_sessions on public.member_device_sessions
  for all to supabase_auth_admin using(true) with check(true);

create function public.member_device_limit_hook(event jsonb)
returns jsonb language plpgsql volatile set search_path='' as $$
declare
  u uuid := (event->>'user_id')::uuid;
  s uuid := (event->'claims'->>'session_id')::uuid;
begin
  if u is null or s is null or event->'claims'->>'sub' is distinct from u::text then
    return jsonb_build_object('error',jsonb_build_object('http_code',403,'message','MEMBER_SESSION_INVALID'));
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('member-device:'||u::text,0));
  -- A refreshable session survives access-token expiration and browser closure.
  delete from public.member_device_sessions d where d.user_id=u
    and not exists(select 1 from auth.sessions a where a.id=d.session_id and a.user_id=u
      and (a.not_after is null or a.not_after>now()));
  if exists(select 1 from public.member_device_sessions where user_id=u and session_id=s) then
    return jsonb_build_object('claims',event->'claims');
  end if;
  if (select count(*) from public.member_device_sessions where user_id=u)>=2 then
    return jsonb_build_object('error',jsonb_build_object('http_code',403,'message','MEMBER_DEVICE_LIMIT: 此帳號已有 2 台裝置登入，請先登出其中一台後再試。'));
  end if;
  insert into public.member_device_sessions(user_id,session_id) values(u,s);
  return jsonb_build_object('claims',event->'claims');
end $$;
revoke all on function public.member_device_limit_hook(jsonb) from public,anon,authenticated;
grant usage on schema public to supabase_auth_admin;
grant execute on function public.member_device_limit_hook(jsonb) to supabase_auth_admin;
-- Adopt existing oldest two live sessions; never delete Auth sessions.
insert into public.member_device_sessions(user_id,session_id)
 select user_id,id from (
  select user_id,id,row_number() over(partition by user_id order by created_at,id) n
  from auth.sessions where not_after is null or not_after>now()
 ) active where n<=2;
commit;
