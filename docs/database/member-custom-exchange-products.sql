-- Applied 2026-11-13 with JUSTY authorization; shared UAT/prod database.
begin;
create or replace function public.admin_member_exchange_create(p_request_id uuid,p_title text,p_description text,p_features text[],p_days integer,p_points integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare pid text; result jsonb;
begin
 if p_request_id is null or length(trim(p_title)) not between 2 and 40 or length(coalesce(p_description,''))>500 or p_days not between 1 and 366 or p_points not between 1 and 1000000 then raise exception 'EXCHANGE_PRODUCT_INVALID';end if;
 if p_features is null or coalesce(cardinality(p_features),0)=0 or cardinality(p_features)<>(select count(distinct f) from unnest(p_features) f) or exists(select 1 from unnest(p_features) f where not exists(select 1 from public.member_feature_catalog c where c.feature=f and c.member_research and c.voucher_enabled)) then raise exception 'EXCHANGE_FEATURE_INVALID';end if;
 pid:='custom-'||replace(p_request_id::text,'-','');
 perform pg_advisory_xact_lock(hashtextextended('exchange-create:'||pid,0));
 select to_jsonb(e) into result from public.member_exchange_definitions e where id=pid;
 if result is not null then return result;end if;
 -- research is an internal voucher code: activation grants only this explicit snapshot, never a plan/tier.
 insert into public.member_voucher_definitions(id,title,tier,active,allowed_features,selection_count) values(pid,trim(p_title),'research',true,p_features,0);
 insert into public.member_exchange_definitions(id,title,points,duration_days,voucher_definition,active) values(pid,trim(p_title),p_points,p_days,pid,false);
 insert into public.admin_settings(key,value,updated_at) values('exchange:details:'||pid,jsonb_build_object('description',coalesce(p_description,''),'features',p_features,'audience','authenticated')::text,clock_timestamp());
 select to_jsonb(e) into result from public.member_exchange_definitions e where id=pid;
 return result;
end $$;
revoke all on function public.admin_member_exchange_create(uuid,text,text,text[],integer,integer) from public,anon,authenticated;
grant execute on function public.admin_member_exchange_create(uuid,text,text,text[],integer,integer) to service_role;

create or replace function public.member_point_exchange_options() returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'MEMBER_VERIFY_REQUIRED';end if;
 return jsonb_build_object('server_time',now(),'rows',(select coalesce(jsonb_agg(jsonb_build_object('id',e.id,'title',e.title,'points',e.points,'duration_days',e.duration_days,'tier',v.tier,'description',coalesce(a.value::jsonb->>'description',''),'feature_titles',(select coalesce(jsonb_agg(c.title order by c.title),'[]'::jsonb) from public.member_feature_catalog c where c.member_research and c.voucher_enabled and (v.tier='vip' or c.feature=any(v.allowed_features)))) order by e.points),'[]'::jsonb) from public.member_exchange_definitions e join public.member_voucher_definitions v on v.id=e.voucher_definition left join public.admin_settings a on a.key='exchange:details:'||e.id where e.active and v.active));
end $$;
revoke all on function public.member_point_exchange_options() from public,anon,authenticated;
grant execute on function public.member_point_exchange_options() to authenticated;
commit;
