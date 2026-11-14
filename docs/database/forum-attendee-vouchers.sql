-- Applied 2026-11-13 to Taiwan stock2 after JUSTY authorization; verified metadata and service-only access.
begin;
create or replace function public._forum_issue_attendee_voucher(p_user uuid,p_event text,p_definition text,p_days integer,p_actor text,p_manual boolean default true)
returns jsonb language plpgsql security definer set search_path='' as $$
declare ev jsonb; reward uuid; k text; legacy text; old jsonb; row_key text;
begin
 if p_user is null or p_days not between 1 and 90 or p_definition not in ('vip-v1','research-v1','choice-v1') or length(trim(p_actor))<2 then raise exception 'VOUCHER_INPUT_INVALID';end if;
 perform pg_advisory_xact_lock(hashtextextended('forum-voucher:'||p_event||':'||p_user::text,0));
 select e into ev from public.admin_settings a,lateral jsonb_array_elements(a.value::jsonb) e where a.key='forum:events' and e->>'id'=p_event;
 if ev is null or coalesce((ev->>'test')::boolean,false) then raise exception 'VOUCHER_EVENT_UNAVAILABLE';end if;
 if not exists(select 1 from public.admin_settings where key='forumcheckin:'||p_event||':'||p_user::text and not coalesce((value::jsonb->>'test')::boolean,false)) then raise exception 'VOUCHER_NOT_ATTENDED';end if;
 row_key:='forumvoucher:'||p_event||':'||p_user::text;
 select value::jsonb into old from public.admin_settings where key=row_key;
 if old is not null then return jsonb_build_object('duplicate',true,'record',old);end if;
 k:='forum-voucher:'||p_event||':'||p_user::text;
 legacy:=case when coalesce(ev->>'event_kind','technical_analysis')='technical_analysis' then 'forum-voucher:'||p_user::text else k end;
 select id into reward from public.member_rewards where user_id=p_user and source_event_key in (k,legacy) order by created_at limit 1;
 if reward is not null then return jsonb_build_object('duplicate',true,'reward_id',reward);end if;
 reward:=public._member_issue_voucher(p_user,p_definition,p_days,k);
 old:=jsonb_build_object('event',p_event,'user_id',p_user,'reward_id',reward,'definition',p_definition,'days',p_days,'actor',p_actor,'via',case when p_manual then 'manual' else 'automatic' end,'at',clock_timestamp());
 insert into public.admin_settings(key,value,updated_at) values(row_key,old::text,clock_timestamp());
 -- member_notification_events already includes member_rewards (kind reward / target gifts).
 return jsonb_build_object('duplicate',false,'reward_id',reward,'record',old);
end $$;
revoke all on function public._forum_issue_attendee_voucher(uuid,text,text,integer,text,boolean) from public,anon,authenticated;
grant execute on function public._forum_issue_attendee_voucher(uuid,text,text,integer,text,boolean) to service_role;

create or replace function public._forum_attendee_voucher_list(p_event text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare ev jsonb; result jsonb;
begin
 select e into ev from public.admin_settings a,lateral jsonb_array_elements(a.value::jsonb) e where a.key='forum:events' and e->>'id'=p_event;
 if ev is null then raise exception 'VOUCHER_EVENT_UNAVAILABLE';end if;
 select coalesce(jsonb_agg(jsonb_build_object('user_id',split_part(c.key,':',3),'at',c.value::jsonb->>'at','email',c.value::jsonb->>'email','phone',c.value::jsonb->>'phone','issued',r.id is not null or log.key is not null,'reward_id',r.id,'record',log.value::jsonb) order by c.key),'[]'::jsonb) into result
 from public.admin_settings c
 left join public.admin_settings log on log.key='forumvoucher:'||p_event||':'||split_part(c.key,':',3)
 left join lateral (select id from public.member_rewards where user_id=split_part(c.key,':',3)::uuid and source_event_key in ('forum-voucher:'||p_event||':'||split_part(c.key,':',3),case when coalesce(ev->>'event_kind','technical_analysis')='technical_analysis' then 'forum-voucher:'||split_part(c.key,':',3) else '' end) order by created_at limit 1)r on true
 where c.key like 'forumcheckin:'||p_event||':%' and not coalesce((c.value::jsonb->>'test')::boolean,false);
 return jsonb_build_object('attendees',result,'event_id',p_event);
end $$;
revoke all on function public._forum_attendee_voucher_list(text) from public,anon,authenticated;
grant execute on function public._forum_attendee_voucher_list(text) to service_role;

commit;
