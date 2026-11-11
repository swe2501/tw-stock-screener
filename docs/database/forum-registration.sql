-- PREPARED ONLY. Apply to the shared project only after approval.
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
 if (s->>'attended')::boolean then raise exception 'FORUM_ALREADY_ATTENDED';end if;
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
commit;
