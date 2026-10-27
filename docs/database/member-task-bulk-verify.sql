-- Read-only deployment verification; no member content or identity is returned.
select
 to_regprocedure('public.submit_member_task_work(uuid,text,text,text,text,jsonb)') is not null as work_rpc,
 to_regprocedure('public.claim_completed_member_tasks(uuid)') is not null as bulk_rpc,
 (select count(*) from public.member_task_definitions where id in ('learning5-v1','learning20-v1','challenge-first-v1','challenge8-v1','watch5-v1') and active) as new_tasks_active,
 (select count(*) from public.member_task_definitions where active) as active_tasks,
 (select count(*) from public.member_point_ledger) as ledger_rows,
 (select coalesce(sum(points),0) from public.member_point_ledger) as ledger_points,
 case when
 (select bool_and(relrowsecurity) from pg_class where oid in ('public.member_task_work'::regclass,'public.member_task_bulk_receipts'::regclass))
 and has_function_privilege('authenticated','public.claim_completed_member_tasks(uuid)','EXECUTE')
 and not has_function_privilege('anon','public.claim_completed_member_tasks(uuid)','EXECUTE')
 and not has_function_privilege('authenticated','public.claim_member_task_pre_bulk(text)','EXECUTE')
 and not has_table_privilege('authenticated','public.member_task_work','INSERT')
 and not has_table_privilege('authenticated','public.member_task_bulk_receipts','SELECT')
 then 'PASS' else 'CHECK' end as privacy_and_permissions,
 case when exists(select 1 from public.member_ai_settings where id and not active and not stored_enabled) then 'CLOSED' else 'CHANGED' end as ai_and_stored;
