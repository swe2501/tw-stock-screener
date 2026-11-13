-- Upgrade the already-deployed functions without changing grants or the policy switch.
begin;
do $$
declare definition text; needle text;
begin
 select pg_get_functiondef('public.member_device_cap(uuid)'::regprocedure) into definition;
 needle:=' select value::jsonb into cfg from public.admin_settings where key=''member_commerce_v1'';';
 if strpos(definition,'93f16c68-d103-4092-b938-93e34012d3c1')=0 then
  if strpos(definition,needle)=0 then raise exception 'DEVICE_CAP_VERSION_CHANGED'; end if;
  definition:=replace(definition,needle,' if u=''93f16c68-d103-4092-b938-93e34012d3c1''::uuid then return 0; end if;'||chr(10)||needle);
  execute definition;
 end if;
 select pg_get_functiondef('public.member_device_manage(text,uuid,text)'::regprocedure) into definition;
 if strpos(definition,'''unlimited''')=0 then
  if strpos(definition,'where session_id=s and n<=lim)')=0 or strpos(definition,'''limit'',lim,''devices''')=0 then raise exception 'DEVICE_MANAGE_VERSION_CHANGED'; end if;
  definition:=replace(definition,'if exists(select 1 from public.member_device_leases where session_id=s and user_id=u and not revoked','if lim=0 or exists(select 1 from public.member_device_leases where session_id=s and user_id=u and not revoked');
  definition:=replace(definition,'where session_id=s and n<=lim)','where session_id=s and (lim=0 or n<=lim))');
  definition:=replace(definition,'''limit'',lim,''devices''','''limit'',lim,''unlimited'',lim=0,''devices''');
  execute definition;
 end if;
 select pg_get_functiondef('public.member_device_require()'::regprocedure) into definition;
 if strpos(definition,'public.member_device_cap(u)=0')=0 then
  if strpos(definition,'where session_id=s and n<=public.member_device_cap(u))')=0 then raise exception 'DEVICE_GATE_VERSION_CHANGED'; end if;
  definition:=replace(definition,'where session_id=s and n<=public.member_device_cap(u))','where session_id=s and (public.member_device_cap(u)=0 or n<=public.member_device_cap(u)))');
  execute definition;
 end if;
end $$;
notify pgrst,'reload schema';
commit;
