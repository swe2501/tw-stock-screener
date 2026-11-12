-- PREPARED ONLY. UAT/prod share the database: do not apply without explicit approval.
-- Depends on admin-settings.sql, member-payment-linepay.sql, member-membership-lifecycle.sql.
-- No payment activation, campaign changes, or existing entitlement removal.
begin;
alter table public.member_plans add column if not exists commerce_features jsonb;

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
  code:=null;
  if item->>'tier'<>'free' then
   select value into previous from jsonb_array_elements(coalesce(old->'products','[]')) where value->>'id'=item->>'id';
   -- Commercial terms and granted features are immutable per purchased plan version.
   if previous is not null and previous->>'plan_code' is not null
      and (previous->>'tier',previous->>'days',previous->>'price_twd',previous->>'name',previous->>'sandbox_only',previous->'features')
       is not distinct from (item->>'tier',item->>'days',item->>'price_twd',item->>'name',item->>'sandbox_only',item->'features') then
    code:=previous->>'plan_code';
   else
    code:='mc_'||replace(gen_random_uuid()::text,'-','');
    insert into public.member_plans(plan_code,tier,days,price_twd,label,active,sandbox_only,commerce_features)
     values(code,item->>'tier',(item->>'days')::int,(item->>'price_twd')::int,item->>'name',false,
      (item->>'sandbox_only')::boolean,item->'features');
   end if;
  end if;
  items:=items||jsonb_build_array(item||jsonb_build_object('plan_code',code));
 end loop;
 result:=jsonb_build_object('revision',p_revision+1,'payments_enabled',p_config->'payments_enabled','products',items);
 insert into public.admin_settings(key,value,updated_at) values('member_commerce_v1',result::text,now())
 on conflict(key) do update set value=excluded.value,updated_at=excluded.updated_at;
 return result;
end $$;

create or replace function public.member_commerce_create_order(p_user uuid,p_plan text,p_env text,p_order text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare cfg jsonb; product jsonb;
begin
 perform pg_advisory_xact_lock(74123114);
 select value::jsonb into cfg from public.admin_settings where key='member_commerce_v1';
 if coalesce((cfg->>'payments_enabled')::boolean,false) is not true then raise exception 'PAY_DISABLED'; end if;
 select value into product from jsonb_array_elements(cfg->'products') where value->>'plan_code'=p_plan
  and (value->>'active')::boolean and value->>'tier'<>'free'
  and (value->>'sandbox_only')::boolean=(p_env='sandbox');
 if product is null or p_env not in ('sandbox','production') then raise exception 'PLAN_UNAVAILABLE'; end if;
 insert into public.member_payment_orders(user_id,order_key,provider_event_key,status,expected_amount,currency,kind,
    plan_code,provider,provider_env)
 values(p_user,p_order,'linepay:'||p_order,'pending',(product->>'price_twd')::int,'TWD','membership',p_plan,'linepay',p_env);
 return product;
end $$;

create or replace function public.member_commerce_access(p_user uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare cfg jsonb; features jsonb; next_change timestamptz;
begin
 if p_user is null then raise exception 'MEMBER_VERIFY_REQUIRED'; end if;
 select value::jsonb into cfg from public.admin_settings where key='member_commerce_v1';
 if cfg is null then
  return jsonb_build_object('configured',false,'features','[]'::jsonb,'server_time',now());
 end if;
 with grants as (
  -- Free benefits are independent of whether a free comparison card is listed.
  select jsonb_array_elements_text(p->'features') feature from jsonb_array_elements(cfg->'products') p where p->>'tier'='free'
  union
  -- Existing explicit administrator grants keep their tier; delisting does not revoke them.
  select jsonb_array_elements_text(p->'features') from jsonb_array_elements(cfg->'products') p
   join public.member_tiers m on (case m.tier when 'advanced' then 'research' else m.tier end)
    =(case p->>'tier' when 'advanced' then 'research' else p->>'tier' end)
    and m.user_id=p_user and (m.expires_at is null or m.expires_at>now())
  union
  -- Paid plan snapshots preserve purchased features after a product is edited or delisted.
  select jsonb_array_elements_text(coalesce(plan.commerce_features,p->'features','[]'))
   from public.member_subscription_periods s
   left join public.member_payment_orders o on o.period_id=s.id and o.user_id=p_user and o.status='paid'
   left join public.member_plans plan on plan.plan_code=o.plan_code
   left join lateral (select value p from jsonb_array_elements(cfg->'products') where value->>'tier'=s.tier limit 1) legacy on true
   where s.user_id=p_user and s.starts_at<=now() and s.expires_at>now() and s.revoked_at is null
  union
  -- Vouchers only grant their actual selected feature scope, never an entire plan.
  select c.feature from public.member_entitlements e
   join public.member_rewards r on r.id=e.reward_id and r.user_id=p_user and r.status='claimed'
   join public.member_feature_catalog c on c.member_research and c.voucher_enabled
    and ((e.feature='research_tools' and c.feature in ('breadth','fhedge'))
      or (e.feature='voucher_bundle' and c.feature=any(r.selected_features)))
   where e.user_id=p_user and e.starts_at<=now() and e.expires_at>now()
 ) select coalesce(jsonb_agg(distinct feature),'[]') into features from grants;
 select min(t) into next_change from (
  select expires_at t from public.member_subscription_periods where user_id=p_user and revoked_at is null and expires_at>now()
  union all select expires_at from public.member_entitlements where user_id=p_user and expires_at>now()
  union all select expires_at from public.member_tiers where user_id=p_user and expires_at>now()
 ) times;
 return jsonb_build_object('configured',true,'features',features,'server_time',now(),'next_change_at',next_change);
end $$;

revoke all on function public.admin_member_commerce_save(jsonb,bigint),
 public.member_commerce_create_order(uuid,text,text,text),public.member_commerce_access(uuid) from public,anon,authenticated;
grant execute on function public.admin_member_commerce_save(jsonb,bigint),
 public.member_commerce_create_order(uuid,text,text,text),public.member_commerce_access(uuid) to service_role;
commit;
