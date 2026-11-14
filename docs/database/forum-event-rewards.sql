-- Applied 2026-11-13 to Taiwan stock2 after JUSTY authorization; verified metadata and service-only access.
-- Registration and eligibility use existing private admin_settings records.
begin;
create or replace function public._forum_registration_state(p_user uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare events jsonb; reset_at timestamptz; missed integer; visited boolean; active_rows jsonb;
begin
 select value::jsonb into events from public.admin_settings where key='forum:events';
 events:=coalesce(events,'[]'::jsonb);
 select (value::jsonb->>'at')::timestamptz into reset_at from public.admin_settings
 where key='forumregistration-reset:'||p_user::text;
 select exists(select 1 from public.member_point_ledger where user_id=p_user
 and source_event_key='forum-attend:'||p_user::text) into visited;
 select count(*) into missed from public.admin_settings r
 join lateral jsonb_array_elements(events) e on e->>'id'=r.value::jsonb->>'event'
 where r.key like 'forumregistration:%:'||p_user::text and r.value::jsonb->>'status'='registered'
 and not coalesce((e->>'test')::boolean,false)
 and (e->>'date'||' '||coalesce(e->>'end','17:30'))::timestamp at time zone 'Asia/Taipei'<now()
 and (reset_at is null or (r.value::jsonb->>'at')::timestamptz>reset_at)
 and not exists(select 1 from public.admin_settings c where c.key='forumcheckin:'||(e->>'id')||':'||p_user::text);
 select coalesce(jsonb_agg(r.value::jsonb),'[]'::jsonb) into active_rows
 from public.admin_settings r where r.key like 'forumregistration:%:'||p_user::text;
 return jsonb_build_object('attended',visited,'no_shows',missed,'blocked',missed>=3,
 'registrations',active_rows,'server_time',clock_timestamp());
end $$;

create or replace function public._forum_registration_change(p_user uuid,p_event text,p_cancel boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare ev jsonb; current_row jsonb; s jsonb; k text; occupancy integer; n integer;
begin
 if p_user is null or p_event is null or p_event !~ '^(TPE|TXG|KHH)[0-9]{4}[A-Z]?$' then
  raise exception 'FORUM_REGISTRATION_INVALID';end if;
 -- Serialize both one-person eligibility and per-event capacity checks.
 perform pg_advisory_xact_lock(hashtextextended('forum-user:'||p_user::text,0));
 perform pg_advisory_xact_lock(hashtextextended('forum-event:'||p_event,0));
 select e into ev from public.admin_settings a,
 lateral jsonb_array_elements(a.value::jsonb) e where a.key='forum:events' and e->>'id'=p_event;
 if ev is null or coalesce((ev->>'test')::boolean,false) then raise exception 'FORUM_REGISTRATION_UNAVAILABLE';end if;
 k:='forumregistration:'||p_event||':'||p_user::text;
 select value::jsonb into current_row from public.admin_settings where key=k;
 s:=public._forum_registration_state(p_user);
 if p_cancel then
  if current_row is null or current_row->>'status'<>'registered' then return s;end if;
  if (ev->>'date'||' '||coalesce(ev->>'start','13:30'))::timestamp at time zone 'Asia/Taipei'<=now()
   then raise exception 'FORUM_CANCELLATION_CLOSED';end if;
  update public.admin_settings set value=(current_row||jsonb_build_object('status','cancelled','cancelled_at',clock_timestamp()))::text,
   updated_at=clock_timestamp() where key=k;
  return public._forum_registration_state(p_user);
 end if;
 if coalesce(ev->>'event_kind','technical_analysis')='technical_analysis' and (s->>'attended')::boolean then raise exception 'FORUM_ALREADY_ATTENDED';end if;
 if coalesce(ev->>'limit_group','')<>'' and ev->>'event_kind'='activity' and exists(
 select 1 from public.admin_settings c, public.admin_settings a,lateral jsonb_array_elements(a.value::jsonb) e
 where a.key='forum:events' and c.key='forumcheckin:'||(e->>'id')||':'||p_user::text
 and e->>'limit_group'=ev->>'limit_group') then raise exception 'FORUM_ALREADY_ATTENDED';end if;
 if (s->>'blocked')::boolean then
  insert into public.admin_settings(key,value,updated_at)
  values('forumnotice:'||p_user::text||':'||coalesce((select value::jsonb->>'at' from public.admin_settings where key='forumregistration-reset:'||p_user::text),'initial'),jsonb_build_object('at',clock_timestamp(),
   'title','論壇報名暫停','text','你已累計三次報名未到場，本次未能完成報名。如需協助，請聯絡工作人員。')::text,clock_timestamp())
  on conflict(key) do nothing;
  return s||jsonb_build_object('denied','FORUM_NO_SHOW_LIMIT');
 end if;
 if ev->>'status'<>'published' or (ev->>'date'||' '||coalesce(ev->>'start','13:30'))::timestamp at time zone 'Asia/Taipei'<=now()
  then raise exception 'FORUM_REGISTRATION_CLOSED';end if;
 if current_row->>'status'='registered' then return s;end if;
 if exists(select 1 from jsonb_array_elements(s->'registrations') r
   join lateral (select e from public.admin_settings a,lateral jsonb_array_elements(a.value::jsonb) e
    where a.key='forum:events' and e->>'id'=r->>'event')q on true
   where r->>'status'='registered' and (q.e->>'date'||' '||coalesce(q.e->>'end','17:30'))::timestamp at time zone 'Asia/Taipei'>now())
  then raise exception 'FORUM_REGISTRATION_ACTIVE';end if;
 n:=coalesce((ev->>'capacity')::integer,0);
 select count(*) into occupancy from (
  select split_part(key,':',3) as uid from public.admin_settings
   where key like 'forumregistration:'||p_event||':%' and value::jsonb->>'status'='registered'
  union
  select split_part(key,':',3) from public.admin_settings where key like 'forumcheckin:'||p_event||':%'
 )q;
 if n>0 and occupancy>=n then raise exception 'FORUM_REGISTRATION_FULL';end if;
 insert into public.admin_settings(key,value,updated_at)
 values(k,jsonb_build_object('event',p_event,'user_id',p_user,'status','registered','at',clock_timestamp())::text,clock_timestamp())
 on conflict(key) do update set value=excluded.value,updated_at=excluded.updated_at;
 return public._forum_registration_state(p_user);
end $$;
create or replace function public._forum_registration_reset(p_user uuid,p_reason text,p_actor text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v jsonb;begin
 if p_user is null or length(trim(p_reason)) not between 2 and 300 or length(trim(p_actor))<3 then
  raise exception 'FORUM_RESET_INVALID';end if;
 perform pg_advisory_xact_lock(hashtextextended('forum-user:'||p_user::text,0));
 v:=jsonb_build_object('at',clock_timestamp(),'reason',p_reason,'actor',p_actor);
 insert into public.admin_settings(key,value,updated_at) values('forumregistration-reset:'||p_user::text,v::text,clock_timestamp())
 on conflict(key) do update set value=excluded.value,updated_at=excluded.updated_at;
 insert into public.admin_settings(key,value,updated_at)
 values('forumregistration-audit:'||p_user::text||':'||extract(epoch from clock_timestamp())::text,v::text,clock_timestamp());
 return public._forum_registration_state(p_user);
end $$;
revoke all on function public._forum_registration_state(uuid),public._forum_registration_change(uuid,text,boolean),public._forum_registration_reset(uuid,text,text) from public,anon,authenticated;
grant execute on function public._forum_registration_state(uuid),public._forum_registration_change(uuid,text,boolean),public._forum_registration_reset(uuid,text,text) to service_role;


-- New event attendance and task completion share one transaction and user lock.
create or replace function public._forum_event_attend(p_user uuid,p_event text,p_via text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare ev jsonb; pts integer; entry uuid; task public.member_task_definitions%rowtype; k text;
begin
 if p_user is null or p_via not in ('qr','code') then raise exception 'FORUM_INVALID'; end if;
 perform pg_advisory_xact_lock(hashtextextended('forum-user:'||p_user::text,0));
 perform pg_advisory_xact_lock(hashtextextended('forum-event:'||p_event,0));
 select e into ev from public.admin_settings a,lateral jsonb_array_elements(a.value::jsonb) e where a.key='forum:events' and e->>'id'=p_event;
 if ev is null or coalesce((ev->>'test')::boolean,false) or ev->>'status'='draft' then raise exception 'FORUM_UNAVAILABLE';end if;
 if ev->>'event_kind'='technical_analysis' then
  k:='forum-attend:'||p_user::text;
 else k:='event-attend:'||p_event||':'||p_user::text;end if;
 if exists(select 1 from public.member_point_ledger where source_event_key=k)
 or exists(select 1 from public.admin_settings where key='forumcheckin:'||p_event||':'||p_user::text) then raise exception 'FORUM_ALREADY';end if;
 if coalesce(ev->>'limit_group','')<>'' and ev->>'event_kind'<>'technical_analysis' and exists(
 select 1 from public.admin_settings c, public.admin_settings a,lateral jsonb_array_elements(a.value::jsonb) e
 where a.key='forum:events' and c.key='forumcheckin:'||(e->>'id')||':'||p_user::text
 and e->>'limit_group'=ev->>'limit_group') then raise exception 'FORUM_ALREADY';end if;
 pts:=coalesce((ev->>'reward_points')::integer,1000);
 if pts not between 1 and 10000 then raise exception 'FORUM_POINTS_INVALID';end if;
 insert into public.member_point_ledger(user_id,points,description,source_event_key)
 values(p_user,pts,'活動到場獎勵（'||p_event||'）',k) returning id into entry;
 insert into public.admin_settings(key,value,updated_at) values('forumcheckin:'||p_event||':'||p_user::text,jsonb_build_object('at',clock_timestamp(),'via',p_via,'points',pts)::text,clock_timestamp());
 select * into task from public.member_task_definitions where id='evt-'||lower(p_event)||'-v1';
 if task.id is not null then
  insert into public.member_task_claims(user_id,task_id,period_key,points,ledger_id)
  values(p_user,task.id,'once',pts,entry);
 end if;
 return jsonb_build_object('points',pts,'ledger_id',entry);
end $$;
create or replace function public._forum_event_task_save(p_event text,p_title text,p_active boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare ev jsonb; tid text; result jsonb;
begin
 if length(trim(p_title)) not between 2 and 40 then raise exception 'TASK_TITLE_INVALID';end if;
 perform pg_advisory_xact_lock(hashtextextended('forum-event:'||p_event,0));
 select e into ev from public.admin_settings a,lateral jsonb_array_elements(a.value::jsonb) e where a.key='forum:events' and e->>'id'=p_event;
 if ev is null or coalesce((ev->>'test')::boolean,false) then raise exception 'FORUM_UNAVAILABLE';end if;
 tid:='evt-'||lower(p_event)||'-v1';
 insert into public.member_task_definitions(id,title,points,period,verifier,active,sort)
 values(tid,trim(p_title),coalesce((ev->>'reward_points')::int,1000),'once','admin_review',p_active,200)
 on conflict(id) do update set title=excluded.title,points=excluded.points,active=excluded.active;
 insert into public.admin_settings(key,value,updated_at) values('task:event:'||tid,to_jsonb(p_event)::text,clock_timestamp()) on conflict(key) do update set value=excluded.value,updated_at=excluded.updated_at;
 -- Preserve earlier check-ins as completed tasks without another ledger entry.
 insert into public.member_task_claims(user_id,task_id,period_key,points,ledger_id)
 select l.user_id,tid,'once',l.points,l.id from public.member_point_ledger l
 where l.source_event_key='event-attend:'||p_event||':'||l.user_id::text
 or (coalesce(ev->>'event_kind','technical_analysis')='technical_analysis' and l.source_event_key='forum-attend:'||l.user_id::text and exists(select 1 from public.admin_settings a where a.key='forumcheckin:'||p_event||':'||l.user_id::text))
 on conflict do nothing;
 select to_jsonb(t) into result from public.member_task_definitions t where id=tid;
 return result;
end $$;
revoke all on function public._forum_event_attend(uuid,text,text),public._forum_event_task_save(text,text,boolean) from public,anon,authenticated;
grant execute on function public._forum_event_attend(uuid,text,text),public._forum_event_task_save(text,text,boolean) to service_role;
create or replace function public._forum_event_task_points_sync()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.key='forum:events' then
  update public.member_task_definitions t set points=coalesce((e->>'reward_points')::int,1000)
  from jsonb_array_elements(new.value::jsonb) e where t.id='evt-'||lower(e->>'id')||'-v1';
 end if;
 return new;
end $$;
revoke all on function public._forum_event_task_points_sync() from public,anon,authenticated;
drop trigger if exists forum_event_task_points_sync on public.admin_settings;
create trigger forum_event_task_points_sync after insert or update of value on public.admin_settings for each row when(new.key='forum:events') execute function public._forum_event_task_points_sync();
commit;
