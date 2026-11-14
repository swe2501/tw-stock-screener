-- PREPARED ONLY. Requires member-notification-inbox.sql. Apply after approval.
begin;
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
 and v.effective_at between now()-interval '90 days' and now()
 union all
 select a.key,'forum',a.value::jsonb->>'title',a.value::jsonb->>'text',
 (a.value::jsonb->>'at')::timestamptz,'events',a.key
 from public.admin_settings a where a.key like 'forumnotice:'||auth.uid()::text||':%'
 and (a.value::jsonb->>'at')::timestamptz>=now()-interval '90 days';
$$;
revoke all on function public._member_notification_events() from public,anon,authenticated;
commit;
