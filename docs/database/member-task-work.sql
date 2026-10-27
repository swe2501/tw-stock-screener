-- PREPARED ONLY. Private task submissions, not client completion flags or cloud payload counts.
begin;
create table if not exists public.member_task_work(
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,
 request_id uuid not null,kind text not null check(kind in ('note','market','risk','review','summary','plan','watch_reason','screen_review','simulation')),
 reference_key text not null,title text not null,body text not null,context jsonb not null default '{}',
 recorded_at timestamptz not null default clock_timestamp(),content_hash text not null,
 unique(user_id,request_id),unique(user_id,kind,reference_key),unique(user_id,content_hash)
);
alter table public.member_task_work enable row level security;
revoke all on public.member_task_work from public,anon,authenticated;
grant select on public.member_task_work to authenticated;
drop policy if exists task_work_own on public.member_task_work;
create policy task_work_own on public.member_task_work for select to authenticated using(user_id=auth.uid());

create or replace function public.member_task_work_context(p_kind text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid();notes jsonb;screens jsonb;watch jsonb;today date:=(clock_timestamp() at time zone 'Asia/Taipei')::date;
begin
 if u is null then raise exception 'MEMBER_VERIFY_REQUIRED';end if;
 select coalesce(jsonb_agg(to_jsonb(t)),'[]') into notes from
  (select id,title,body,recorded_at from public.member_task_work where user_id=u and kind in ('note','market','risk') and (recorded_at at time zone 'Asia/Taipei')::date<today order by recorded_at desc limit 30)t;
 select coalesce(jsonb_agg(to_jsonb(t)),'[]') into screens from
  (select id,record_date,strategies from public.member_screen_records where user_id=u and deleted_at is null and to_char(record_date,'IYYY-"W"IW')=to_char(today-7,'IYYY-"W"IW') order by record_date desc limit 30)t;
 select coalesce(jsonb_agg(t.code),'[]') into watch from (select distinct code from public.watchlist where user_id=u order by code limit 100)t;
 return jsonb_build_object('notes',notes,'screens',screens,'watchlist',watch,'server_time',clock_timestamp());
end $$;

create or replace function public.submit_member_task_work(p_request_id uuid,p_kind text,p_reference text,p_title text,p_body text,p_context jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid();r public.member_task_work%rowtype;ref text;hash text;task_code text;start_day date;end_day date;today date:=(clock_timestamp() at time zone 'Asia/Taipei')::date;summary_item text;
begin
 if u is null then raise exception 'MEMBER_VERIFY_REQUIRED';end if;
 if p_request_id is null or p_kind is null or p_kind not in ('note','market','risk','review','summary','plan','watch_reason','screen_review','simulation')
  or length(trim(coalesce(p_title,''))) not between 2 and 80
  or length(regexp_replace(coalesce(p_body,''),'\s','','g')) not between 20 and 3000
  or p_context is null or jsonb_typeof(p_context)<>'object' or octet_length(p_context::text)>4000 then raise exception 'TASK_WORK_INPUT_INVALID';end if;
 perform pg_advisory_xact_lock(hashtextextended('task-work:'||u,0));
 select * into r from public.member_task_work where user_id=u and request_id=p_request_id;
 if found then return to_jsonb(r)-'user_id'||jsonb_build_object('duplicate',true);end if;
 hash:=md5(regexp_replace(trim(p_body),'\s','','g'));ref:=coalesce(nullif(trim(p_reference),''),p_request_id::text);
 if p_kind in ('summary','plan','screen_review') then ref:=to_char(today,'IYYY-"W"IW');end if;
 if p_kind='summary' then
  foreach summary_item in array array['observed','learned','next'] loop
   if length(regexp_replace(coalesce(p_context->>summary_item,''),'\s','','g'))<10 then raise exception 'TASK_WORK_SUMMARY_REQUIRED';end if;
  end loop;
 elsif p_kind in ('plan','watch_reason') then
  task_code:=p_context->>'code';
  if not exists(select 1 from public.watchlist where user_id=u and public.watchlist.code=task_code) then raise exception 'TASK_WORK_WATCH_REQUIRED';end if;
  if p_kind='watch_reason' then ref:=task_code||':'||today;end if;
 elsif p_kind='review' then
  if not exists(select 1 from public.member_task_work where user_id=u and id::text=p_reference and kind in ('note','market','risk') and (recorded_at at time zone 'Asia/Taipei')::date<today) then raise exception 'TASK_WORK_OLD_NOTE_REQUIRED';end if;
 elsif p_kind='screen_review' then
  if not exists(select 1 from public.member_screen_records where user_id=u and id::text=p_reference and deleted_at is null and to_char(record_date,'IYYY-"W"IW')=to_char(today-7,'IYYY-"W"IW')) then raise exception 'TASK_WORK_OLD_SCREEN_REQUIRED';end if;
 elsif p_kind='simulation' then
  task_code:=p_context->>'code';
  if task_code is null or task_code!~'^[0-9A-Z]{4,10}$' or not exists(select 1 from public.price_window where public.price_window.code=task_code) then raise exception 'TASK_WORK_CASE_REQUIRED';end if;
  if coalesce(p_context->>'entry','')!~'^\d{1,8}(\.\d{1,4})?$' or coalesce(p_context->>'exit','')!~'^\d{1,8}(\.\d{1,4})?$' then raise exception 'TASK_WORK_CASE_REQUIRED';end if;
  begin start_day:=(p_context->>'start_date')::date;end_day:=(p_context->>'end_date')::date;
   if start_day is null or end_day is null or start_day>end_day or end_day>today or coalesce((p_context->>'entry')::numeric,0)<=0 or coalesce((p_context->>'exit')::numeric,0)<=0 then raise exception 'TASK_WORK_CASE_REQUIRED';end if;
  exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow then raise exception 'TASK_WORK_CASE_REQUIRED';end;
  ref:=task_code||':'||start_day||':'||end_day;
 end if;
 if length(ref)>160 then raise exception 'TASK_WORK_INPUT_INVALID';end if;
 select * into r from public.member_task_work where user_id=u and (content_hash=hash or (kind=p_kind and reference_key=ref));
 if found then raise exception 'TASK_WORK_ALREADY_SAVED';end if;
 insert into public.member_task_work(user_id,request_id,kind,reference_key,title,body,context,content_hash)
  values(u,p_request_id,p_kind,ref,trim(p_title),trim(p_body),p_context,hash) returning * into r;
 return to_jsonb(r)-'user_id'||jsonb_build_object('duplicate',false);
end $$;

create or replace function public._member_task_work_progress(p_user uuid,p_verifier text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare n integer:=0;target integer:=1;today date:=(clock_timestamp() at time zone 'Asia/Taipei')::date;k text;daily boolean:=false;weekly boolean:=false;
begin
 if p_user is distinct from auth.uid() then raise exception 'MEMBER_VERIFY_REQUIRED';end if;
 case p_verifier
 when 'work_note' then k:='notes';
 when 'work_notes5' then k:='notes';target:=5;
 when 'work_notes20' then k:='notes';target:=20;
 when 'work_market' then k:='market';daily:=true;
 when 'work_risk' then k:='risk';daily:=true;
 when 'work_review' then k:='review';daily:=true;
 when 'work_watch_reason' then k:='watch_reason';daily:=true;
 when 'work_weekly_notes' then k:='notes';weekly:=true;target:=3;
 when 'work_summary' then k:='summary';weekly:=true;
 when 'work_summary4' then k:='summary';target:=4;
 when 'work_plan' then k:='plan';weekly:=true;
 when 'work_screen_review' then k:='screen_review';weekly:=true;
 when 'work_sim_first' then k:='simulation';
 when 'work_sim_week' then k:='simulation';weekly:=true;target:=2;
 when 'work_sim5' then k:='simulation';target:=5;
 else return jsonb_build_object('count',0,'target',1);end case;
 select case when p_verifier='work_weekly_notes' then count(distinct (recorded_at at time zone 'Asia/Taipei')::date) when k='notes' then count(distinct reference_key) else count(*) end into n from public.member_task_work
  where user_id=p_user and ((k='notes' and kind in ('note','market','risk','review')) or kind=k)
   and (not daily or (recorded_at at time zone 'Asia/Taipei')::date=today)
   and (not weekly or to_char(recorded_at at time zone 'Asia/Taipei','IYYY-"W"IW')=to_char(today,'IYYY-"W"IW'));
 return jsonb_build_object('count',n,'target',target);
end $$;
revoke all on function public._member_task_work_progress(uuid,text),public.member_task_work_context(text),public.submit_member_task_work(uuid,text,text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.member_task_work_context(text),public.submit_member_task_work(uuid,text,text,text,text,jsonb) to authenticated;
commit;
