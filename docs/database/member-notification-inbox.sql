-- PREPARED ONLY: separate approval required for shared Taiwan stock2.
-- Requires member-service-completion.sql. No email, campaign or payment activation.
begin;
create table if not exists public.member_notification_reads(
 user_id uuid not null references auth.users(id),event_key text not null,
 read_at timestamptz not null default clock_timestamp(),primary key(user_id,event_key)
);
alter table public.member_notification_reads enable row level security;
revoke all on public.member_notification_reads from public,anon,authenticated;
grant all on public.member_notification_reads to service_role;

create or replace function public._member_notification_events()
returns table(event_key text,kind text,title text,body text,happened_at timestamptz,target text,reference text)
language sql stable security definer set search_path='' as $$
 select 'ledger:'||l.id,'points',case when l.points>0 then '點數已轉入' else '點數異動紀錄' end,
 l.description||' · '||case when l.points>0 then '+' else '' end||l.points::text||' 點',l.created_at,'wallet',l.id::text
 from public.member_point_ledger l where l.user_id=auth.uid() and l.created_at>=now()-interval '90 days'
 union all
 select 'case:'||m.id,'case','案件有新回覆',t.subject||'：'||left(m.body,160),m.created_at,'cases',m.ticket_id::text
 from public.member_case_messages m join public.member_feedback_tickets t on t.id=m.ticket_id
 where m.user_id=auth.uid() and m.author_kind='support' and m.created_at>=now()-interval '90 days'
 union all
 select 'reward:'||r.id,'reward','新的使用券與禮遇',r.title,r.created_at,'gifts',r.id::text
 from public.member_rewards r where r.user_id=auth.uid() and r.created_at>=now()-interval '90 days'
 union all
 select 'rule:'||v.id,'rule','規則與權益公告',coalesce(v.terms->>'title',v.item_id)||' · '||v.announcement,v.effective_at,'rules',v.id::text
 from public.member_rule_versions v where auth.uid() is not null and v.actor_id is not null
 and v.effective_at between now()-interval '90 days' and now();
$$;
revoke all on function public._member_notification_events() from public,anon,authenticated;

create or replace function public.member_notification_feed(p_before timestamptz default null,p_before_key text default null,p_until timestamptz default null,p_limit integer default 20)
returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid();cutoff timestamptz:=coalesce(p_until,clock_timestamp());items jsonb;unread bigint;begin
 if u is null then raise exception 'MEMBER_VERIFY_REQUIRED';end if;
 if p_limit is null or p_limit not between 1 and 50 or ((p_before is null)<>(p_before_key is null)) then raise exception 'MEMBER_INPUT_INVALID';end if;
 select count(*) into unread from public._member_notification_events() e
 where e.happened_at<=cutoff and not exists(select 1 from public.member_notification_reads r where r.user_id=u and r.event_key=e.event_key);
 select coalesce(jsonb_agg(to_jsonb(q) order by happened_at desc,event_key desc),'[]') into items from
 (select e.*,r.read_at from public._member_notification_events() e
 left join public.member_notification_reads r on r.user_id=u and r.event_key=e.event_key
 where e.happened_at<=cutoff and (p_before is null or (e.happened_at,e.event_key)<(p_before,p_before_key))
 order by e.happened_at desc,e.event_key desc limit p_limit+1)q;
 return jsonb_build_object('rows',(select coalesce(jsonb_agg(x.value order by x.ordinality),'[]') from jsonb_array_elements(items) with ordinality x where x.ordinality<=p_limit),
 'has_more',jsonb_array_length(items)>p_limit,'unread_count',unread,'until',cutoff,'retention_days',90);
end $$;
create or replace function public.member_notification_read(p_keys text[] default '{}',p_all boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid();changed integer;begin
 if u is null then raise exception 'MEMBER_VERIFY_REQUIRED';end if;
 if p_all is null or p_keys is null or cardinality(p_keys)>100 or array_position(p_keys,null) is not null or (p_all and cardinality(p_keys)>0) then raise exception 'MEMBER_INPUT_INVALID';end if;
 if not p_all and exists(select 1 from unnest(p_keys) k where not exists(select 1 from public._member_notification_events() e where e.event_key=k)) then raise exception 'MEMBER_NOTIFICATION_UNAVAILABLE';end if;
 insert into public.member_notification_reads(user_id,event_key)
 select u,e.event_key from public._member_notification_events() e where p_all or e.event_key=any(p_keys)
 on conflict(user_id,event_key) do nothing;
 get diagnostics changed=row_count;
 return jsonb_build_object('marked',changed,'server_time',clock_timestamp());
end $$;
revoke all on function public.member_notification_feed(timestamptz,text,timestamptz,integer),public.member_notification_read(text[],boolean) from public,anon,authenticated;
grant execute on function public.member_notification_feed(timestamptz,text,timestamptz,integer),public.member_notification_read(text[],boolean) to authenticated;
-- Keep account-data portability complete when adding private read acknowledgements.
create or replace function public.member_notification_export(p_after text default null,p_until timestamptz default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid();items jsonb;begin
 if u is null then raise exception 'MEMBER_VERIFY_REQUIRED';end if;
 select coalesce(jsonb_agg(to_jsonb(q) order by id),'[]') into items from
 (select event_key as id,event_key,read_at from public.member_notification_reads where user_id=u and read_at<=coalesce(p_until,clock_timestamp()) and (p_after is null or event_key>p_after) order by event_key limit 101)q;
 return jsonb_build_object('rows',(select coalesce(jsonb_agg(x.value order by x.ordinality),'[]') from jsonb_array_elements(items) with ordinality x where x.ordinality<=100),'has_more',jsonb_array_length(items)>100);
end $$;
revoke all on function public.member_notification_export(text,timestamptz) from public,anon,authenticated;
grant execute on function public.member_notification_export(text,timestamptz) to authenticated;
commit;
