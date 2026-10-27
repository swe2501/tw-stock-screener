-- Read-only verification; no user content, no read acknowledgements created.
select
 to_regprocedure('public.member_notification_export(text,timestamptz)') is not null as export_ready,
 to_regprocedure('public.member_notification_feed(timestamptz,text,timestamptz,integer)') is not null as feed_ready,
 to_regprocedure('public.member_notification_read(text[],boolean)') is not null as read_ready,
 (select relrowsecurity from pg_class where oid='public.member_notification_reads'::regclass) as rls_enabled,
 not has_table_privilege('authenticated','public.member_notification_reads','SELECT') and not has_table_privilege('authenticated','public.member_notification_reads','INSERT') as private_read_state,
 not has_function_privilege('anon','public.member_notification_feed(timestamptz,text,timestamptz,integer)','EXECUTE') and not has_function_privilege('authenticated','public._member_notification_events()','EXECUTE') as restricted_rpc,
 (select count(*) from public.member_notification_reads) as read_rows,
 (select count(*) from public.member_point_ledger) as ledger_rows,
 (select sum(points) from public.member_point_ledger) as ledger_points,
 (select active from public.member_ai_settings where id) as ai_active,
 (select stored_enabled from public.member_ai_settings where id) as stored_enabled;
