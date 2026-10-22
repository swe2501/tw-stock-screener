-- APPROVED/APPLIED 2026-10-22 to shared Taiwan stock2 after explicit JUSTY approval.
-- Future changes require separate approval; see docs/member-learning-release-2026-10-22.md.
-- Requires member-perks-tasks-v3-points.sql. Apply catalog-v1 immediately after this transaction.
-- No task is activated; existing task prices, caps, claims and balances are retained.
begin;
create table if not exists public.member_learning_catalog(
 id text primary key, answers jsonb not null, choices jsonb not null,
 min_seconds integer not null default 30 check(min_seconds between 30 and 3600),
 check(jsonb_typeof(answers)='array' and jsonb_array_length(answers)>0),
 check(jsonb_array_length(answers)=jsonb_array_length(choices))
);
create table if not exists public.member_learning_challenges_catalog(
 id text primary key, slot integer not null unique check(slot between 0 and 9),
 lesson_ids jsonb not null, answers jsonb not null, choices jsonb not null
);
create table if not exists public.member_learning_attempts(
 user_id uuid not null references auth.users(id) on delete cascade,
 lesson_id text not null references public.member_learning_catalog(id),
 started_at timestamptz not null default clock_timestamp(),primary key(user_id,lesson_id)
);
create table if not exists public.member_learning_completions(
 user_id uuid not null references auth.users(id) on delete cascade,
 lesson_id text not null references public.member_learning_catalog(id),
 completed_at timestamptz not null default clock_timestamp(),score integer not null,total integer not null,
 primary key(user_id,lesson_id),check(total>0 and score between 0 and total)
);
create table if not exists public.member_learning_weekly_results(
 user_id uuid not null references auth.users(id) on delete cascade,
 week_key text not null,challenge_id text not null references public.member_learning_challenges_catalog(id),
 completed_at timestamptz not null default clock_timestamp(),score integer not null,total integer not null,
 primary key(user_id,week_key),check(total>0 and score between 0 and total)
);
alter table public.member_learning_catalog enable row level security;
alter table public.member_learning_challenges_catalog enable row level security;
alter table public.member_learning_attempts enable row level security;
alter table public.member_learning_completions enable row level security;
alter table public.member_learning_weekly_results enable row level security;
revoke all on public.member_learning_catalog,public.member_learning_challenges_catalog,public.member_learning_attempts,public.member_learning_completions,public.member_learning_weekly_results from public,anon,authenticated;
grant select on public.member_learning_completions,public.member_learning_weekly_results to authenticated;
drop policy if exists learning_own_completions on public.member_learning_completions;
create policy learning_own_completions on public.member_learning_completions for select to authenticated using(user_id=auth.uid());
drop policy if exists learning_own_weekly on public.member_learning_weekly_results;
create policy learning_own_weekly on public.member_learning_weekly_results for select to authenticated using(user_id=auth.uid());

create or replace function public._member_learning_grade(p_answers jsonb,p_expected jsonb,p_choices jsonb) returns integer
language plpgsql immutable set search_path='' as $$
declare score integer:=0;i integer;n integer:=jsonb_array_length(p_expected);a jsonb;
begin
 if p_answers is null or jsonb_typeof(p_answers)<>'array' then raise exception 'LEARNING_INPUT_INVALID';end if;
 if jsonb_array_length(p_answers)<>n then raise exception 'LEARNING_INPUT_INVALID';end if;
 for i in 0..n-1 loop
  a:=p_answers->i;
  if jsonb_typeof(a)<>'number' or a::text !~ '^\d{1,2}$' then raise exception 'LEARNING_INPUT_INVALID';end if;
  if (a::text)::integer>=(p_choices->>i)::integer then raise exception 'LEARNING_INPUT_INVALID';end if;
  if a=p_expected->i then score:=score+1;end if;
 end loop;
 return score;
end $$;

create or replace function public.member_learning_start(p_lesson_id text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid();d public.member_learning_catalog%rowtype;t timestamptz;
begin
 if u is null then raise exception 'MEMBER_VERIFY_REQUIRED';end if;
 select * into d from public.member_learning_catalog where id=p_lesson_id;
 if not found then raise exception 'LEARNING_UNAVAILABLE';end if;
 insert into public.member_learning_attempts(user_id,lesson_id) values(u,p_lesson_id)
 on conflict(user_id,lesson_id) do update set started_at=case when member_learning_attempts.started_at<clock_timestamp()-interval '24 hours' then clock_timestamp() else member_learning_attempts.started_at end returning started_at into t;
 return jsonb_build_object('started_at',t,'ready_at',t+make_interval(secs=>d.min_seconds),'server_time',clock_timestamp());
end $$;

create or replace function public.member_learning_complete(p_lesson_id text,p_answers jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid();d public.member_learning_catalog%rowtype;r public.member_learning_completions%rowtype;t timestamptz;s integer;n integer;
begin
 if u is null then raise exception 'MEMBER_VERIFY_REQUIRED';end if;
 perform pg_advisory_xact_lock(hashtextextended('learning:'||u,0));
 select * into r from public.member_learning_completions where user_id=u and lesson_id=p_lesson_id;
 if found then return to_jsonb(r)-'user_id'||jsonb_build_object('duplicate',true);end if;
 select * into d from public.member_learning_catalog where id=p_lesson_id;
 if not found then raise exception 'LEARNING_UNAVAILABLE';end if;
 select started_at into t from public.member_learning_attempts where user_id=u and lesson_id=p_lesson_id;
 if t is null or t>clock_timestamp()-make_interval(secs=>d.min_seconds) or t<clock_timestamp()-interval '24 hours' then raise exception 'LEARNING_READ_REQUIRED';end if;
 s:=public._member_learning_grade(p_answers,d.answers,d.choices);n:=jsonb_array_length(d.answers);
 if s<ceil(n*0.8) then raise exception 'LEARNING_QUIZ_REQUIRED';end if;
 insert into public.member_learning_completions(user_id,lesson_id,score,total) values(u,p_lesson_id,s,n) returning * into r;
 return to_jsonb(r)-'user_id'||jsonb_build_object('duplicate',false);
end $$;

create or replace function public.member_learning_challenge(p_week_key text,p_answers jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid();wk text:=to_char(clock_timestamp() at time zone 'Asia/Taipei','IYYY-"W"IW');
 d public.member_learning_challenges_catalog%rowtype;r public.member_learning_weekly_results%rowtype;s integer;n integer;
begin
 if u is null then raise exception 'MEMBER_VERIFY_REQUIRED';end if;
 if p_week_key is distinct from wk then raise exception 'LEARNING_WEEK_CHANGED';end if;
 perform pg_advisory_xact_lock(hashtextextended('learning:'||u,0));
 select * into r from public.member_learning_weekly_results where user_id=u and week_key=wk;
 if found then return to_jsonb(r)-'user_id'||jsonb_build_object('duplicate',true,'passed',true);end if;
 select * into d from public.member_learning_challenges_catalog where slot=mod(extract(week from clock_timestamp() at time zone 'Asia/Taipei')::integer,10);
 if not found then raise exception 'LEARNING_UNAVAILABLE';end if;
 if exists(select 1 from jsonb_array_elements_text(d.lesson_ids) x(id) where not exists(select 1 from public.member_learning_completions c where c.user_id=u and c.lesson_id=x.id)) then raise exception 'LEARNING_LESSONS_REQUIRED';end if;
 s:=public._member_learning_grade(p_answers,d.answers,d.choices);n:=jsonb_array_length(d.answers);
 if s<ceil(n*0.8) then raise exception 'LEARNING_QUIZ_REQUIRED';end if;
 insert into public.member_learning_weekly_results(user_id,week_key,challenge_id,score,total) values(u,wk,d.id,s,n) returning * into r;
 return to_jsonb(r)-'user_id'||jsonb_build_object('duplicate',false,'passed',true);
end $$;

-- Capability flag: new website must not trust a pre-migration member_report result.
do $$ begin
 if to_regprocedure('public.member_task_status_pre_learning()') is null then
  alter function public.member_task_status() rename to member_task_status_pre_learning;
 end if;
end $$;
create or replace function public.member_task_status() returns jsonb
language sql security definer set search_path='' as $$
 select public.member_task_status_pre_learning()||jsonb_build_object('learning_verification',1)
$$;
revoke all on function public.member_task_status_pre_learning(),public.member_task_status() from public,anon,authenticated;
grant execute on function public.member_task_status() to authenticated;

-- Preserve all existing verifiers without trusting user_metadata for learning rewards.
do $$ begin
 if to_regprocedure('public._member_task_eligible_pre_learning(uuid,text)') is null then
  alter function public._member_task_eligible(uuid,text) rename to _member_task_eligible_pre_learning;
 end if;
end $$;
alter table public.member_task_definitions drop constraint if exists member_task_definitions_verifier_v3;
alter table public.member_task_definitions drop constraint if exists member_task_definitions_verifier_v4;
alter table public.member_task_definitions add constraint member_task_definitions_verifier_v4 check(verifier in ('verified_contact','qualified_invite','profile_name','profile_preferences','watchlist_first','member_report','admin_review','birthday','anniversary','task_streak7','task_streak15','task_streak30','learning_first','learning_daily','learning_three','learning_ten','learning_thirty','learning_week','learning_four_weeks'));
create or replace function public._member_task_eligible(p_user uuid,p_verifier text) returns boolean
language plpgsql security definer set search_path='' as $$
declare n integer;
begin
 if p_user is distinct from auth.uid() then raise exception 'MEMBER_VERIFY_REQUIRED';end if;
 if p_verifier in ('learning_first','learning_daily','learning_three','learning_ten','learning_thirty') then
  select count(*) into n from public.member_learning_completions where user_id=p_user
   and (p_verifier<>'learning_daily' or (completed_at at time zone 'Asia/Taipei')::date=(clock_timestamp() at time zone 'Asia/Taipei')::date);
  return n>=case p_verifier when 'learning_three' then 3 when 'learning_ten' then 10 when 'learning_thirty' then 30 else 1 end;
 elsif p_verifier='learning_week' then
  return exists(select 1 from public.member_learning_weekly_results where user_id=p_user and week_key=to_char(clock_timestamp() at time zone 'Asia/Taipei','IYYY-"W"IW'));
 elsif p_verifier='learning_four_weeks' then
  return (select count(*)>=4 from public.member_learning_weekly_results where user_id=p_user);
 end if;
 return public._member_task_eligible_pre_learning(p_user,p_verifier);
end $$;
update public.member_task_definitions set verifier=case id when 'learn-v1' then 'learning_first' when 'daily-learn-v1' then 'learning_daily' when 'learning3-v1' then 'learning_three' when 'learning10-v1' then 'learning_ten' when 'learning30-v1' then 'learning_thirty' when 'weekly-learn-v1' then 'learning_week' when 'challenge4-v1' then 'learning_four_weeks' end
where id in ('learn-v1','daily-learn-v1','learning3-v1','learning10-v1','learning30-v1','weekly-learn-v1','challenge4-v1');
revoke all on function public._member_learning_grade(jsonb,jsonb,jsonb),public._member_task_eligible_pre_learning(uuid,text),public._member_task_eligible(uuid,text),public.member_learning_start(text),public.member_learning_complete(text,jsonb),public.member_learning_challenge(text,jsonb) from public,anon,authenticated;
grant execute on function public.member_learning_start(text),public.member_learning_complete(text,jsonb),public.member_learning_challenge(text,jsonb) to authenticated;
commit;
