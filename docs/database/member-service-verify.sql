-- Read-only post-migration verification. Returns counts/booleans, never member content.
with required(signature) as (values
 ('public.member_service_access()'),
 ('public.member_ledger_page(text,timestamp with time zone,uuid,timestamp with time zone,date,date,text)'),
 ('public.member_case_list(timestamp with time zone,uuid,boolean)'),
 ('public.member_case_detail(uuid)'),('public.member_case_file(uuid)'),
 ('public.member_case_reply(uuid,uuid,text,jsonb,text,boolean)'),
 ('public.member_identity_recovery_begin(uuid,text)'),
 ('public.member_identity_recovery_status(uuid,boolean)'),
 ('public.member_admin_adjust(uuid,uuid,bigint,text,text,uuid)'),
 ('public.member_admin_catalog(text,text,uuid,jsonb,text,integer,boolean,text)'),
 ('public.member_rules_page(bigint)'),('public.member_admin_overview()'),
 ('public.member_admin_account(uuid)'),
 ('public.member_admin_audit(timestamp with time zone,uuid)'),
 ('public.member_data_export_page(text,uuid,timestamp with time zone)')
), private_tables(name) as (values
 ('member_service_admins'),('member_service_audit'),('member_case_messages'),('member_case_files'),
 ('member_rule_versions'),('member_benefit_terms'),('member_identity_recovery'),('member_payment_orders')
)
select
 (select bool_and(to_regprocedure(signature) is not null) from required) as all_rpcs_present,
 (select bool_and(has_function_privilege('authenticated',to_regprocedure(signature),'EXECUTE') and not has_function_privilege('anon',to_regprocedure(signature),'EXECUTE')) from required) as rpc_permissions,
 (select bool_and(c.relrowsecurity and not has_table_privilege('authenticated',c.oid,'SELECT') and not has_table_privilege('authenticated',c.oid,'INSERT') and not has_table_privilege('authenticated',c.oid,'UPDATE') and not has_table_privilege('authenticated',c.oid,'DELETE')) from private_tables t join pg_class c on c.oid=to_regclass('public.'||t.name)) as private_tables_protected,
 not has_function_privilege('authenticated','public._member_service_admin(text)','EXECUTE') as admin_helper_private,
 (select count(*) from pg_trigger where tgrelid='public.member_point_ledger'::regclass and tgname='member_ledger_capture' and tgenabled='O')=1 as ledger_capture_enabled,
 (select count(*) from pg_trigger where tgrelid='public.member_rewards'::regclass and tgname='member_capture_reward' and tgenabled='O')=1 as reward_capture_enabled,
 (select count(*) from public.member_rewards r where not exists(select 1 from public.member_benefit_terms b where b.reward_id=r.id)) as rewards_missing_terms,
 (select count(*) from public.member_service_admins where active) as active_admins,
 (select count(*) from public.member_point_ledger) as ledger_rows,
 (select coalesce(sum(points),0) from public.member_point_ledger) as ledger_points,
 (select active from public.member_ai_settings where id) as ai_active,
 (select stored_enabled from public.member_ai_settings where id) as stored_enabled;
-- Compare ledger counts/sums, admins and flags with the before-deployment record.
-- The migration must not create claims, change balances, enable products or assign administrators.
