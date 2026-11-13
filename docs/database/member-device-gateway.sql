-- Run AFTER member-device-policy.sql. Leaves enforcement disabled.
-- Never silently replace an existing Data API pre-request hook.
begin;
do $$
declare existing text;
begin
 select x into existing from pg_catalog.pg_db_role_setting s
 left join pg_catalog.pg_roles r on r.oid=s.setrole,
 lateral unnest(s.setconfig) x
 where (r.rolname='authenticator' or s.setrole=0)
 and x like 'pgrst.db_pre_request=%'
 and x<>'pgrst.db_pre_request=public.member_device_pre_request' limit 1;
 if existing is not null then raise exception 'EXISTING_PRE_REQUEST_HOOK: compose and test before activation'; end if;
 if to_regprocedure('public.member_device_pre_request()') is null then raise exception 'DEVICE_MIGRATION_REQUIRED'; end if;
 execute 'alter role authenticator set pgrst.db_pre_request = ''public.member_device_pre_request''';
end $$;
notify pgrst, 'reload config';
notify pgrst, 'reload schema';
commit;
