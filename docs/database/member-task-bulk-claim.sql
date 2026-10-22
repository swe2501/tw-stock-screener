-- PREPARED ONLY: separate shared-database approval required. Requires learning-verification + screen-calendar.
-- Does not activate tasks, change existing prices/caps, or modify previous claims.
begin;
create table if not exists public.member_task_bulk_receipts(
 user_id uuid not null references auth.users(id) on delete cascade,
 request_id uuid not null,result jsonb not null,created_at timestamptz not null default clock_timestamp(),
 primary key(user_id,request_id)
);
alter table public.member_task_bulk_receipts enable row level security;
revoke all on public.member_task_bulk_receipts from public,anon,authenticated;

do $$ begin
 if to_regprocedure('public._member_task_eligible_pre_bulk(uuid,text)') is null then
  alter function public._member_task_eligible(uuid,text) rename to _member_task_eligible_pre_bulk;
 end if;
 if to_regprocedure('public.member_task_status_pre_bulk()') is null then
  alter function public.member_task_status() rename to member_task_status_pre_bulk;
 end if;
 if to_regprocedure('public.claim_member_task_pre_bulk(text)') is null then
  alter function public.claim_member_task(text) rename to claim_member_task_pre_bulk;
 end if;
end $$;
alter table public.member_task_definitions drop constraint if exists member_task_definitions_verifier_v4;
alter table public.member_task_definitions drop constraint if exists member_task_definitions_verifier_v5;
alter table public.member_task_definitions add constraint member_task_definitions_verifier_v5 check(verifier in (
 'verified_contact','qualified_invite','profile_name','profile_preferences','watchlist_first','member_report','admin_review','birthday','anniversary',
 'task_streak7','task_streak15','task_streak30','learning_first','learning_daily','learning_three','learning_ten','learning_thirty','learning_week','learning_four_weeks',
 'learning_five','learning_twenty','learning_first_week','learning_eight_weeks','watchlist_five','screen_first','screen_daily','screen_weekly','screen_twenty','screen_three_strategies','work_note','work_market','work_risk','work_review','work_weekly_notes','work_summary','work_plan','work_screen_review','work_sim_first','work_sim_week','work_notes5','work_notes20','work_sim5','work_summary4','work_watch_reason'));

create or replace function public._member_task_verifier_trusted(p_verifier text) returns boolean
language sql immutable set search_path='' as $$
 select p_verifier=any(array['verified_contact','qualified_invite','profile_name','profile_preferences','watchlist_first','birthday','anniversary',
 'task_streak7','task_streak15','task_streak30','learning_first','learning_daily','learning_three','learning_ten','learning_thirty','learning_week','learning_four_weeks',
 'learning_five','learning_twenty','learning_first_week','learning_eight_weeks','watchlist_five','screen_first','screen_daily','screen_weekly','screen_twenty','screen_three_strategies','work_note','work_market','work_risk','work_review','work_weekly_notes','work_summary','work_plan','work_screen_review','work_sim_first','work_sim_week','work_notes5','work_notes20','work_sim5','work_summary4','work_watch_reason'])
$$;
create or replace function public._member_task_eligible(p_user uuid,p_verifier text) returns boolean
language plpgsql security definer set search_path='' as $$
declare n integer;birth date;today date:=(clock_timestamp() at time zone 'Asia/Taipei')::date;
begin
 if p_user is distinct from auth.uid() then raise exception 'MEMBER_VERIFY_REQUIRED';end if;
 if not public._member_task_verifier_trusted(p_verifier) then return false;end if;
 if p_verifier='birthday' then
  begin select (raw_user_meta_data->>'birth_date')::date into birth from auth.users where id=p_user;exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow then return false;end;
  return coalesce(birth<=today and extract(month from birth)=extract(month from today),false);
 end if;
 if p_verifier like 'work_%' then return (public._member_task_work_progress(p_user,p_verifier)->>'count')::integer>=(public._member_task_work_progress(p_user,p_verifier)->>'target')::integer;end if;
 if p_verifier in ('learning_five','learning_twenty') then
  select count(*) into n from public.member_learning_completions where user_id=p_user;
  return n>=case p_verifier when 'learning_five' then 5 else 20 end;
 elsif p_verifier in ('learning_first_week','learning_eight_weeks') then
  select count(*) into n from public.member_learning_weekly_results where user_id=p_user;
  return n>=case p_verifier when 'learning_first_week' then 1 else 8 end;
 elsif p_verifier='watchlist_five' then
  select count(distinct code) into n from public.watchlist where user_id=p_user and code~'^[0-9A-Z]{4,10}$';return n>=5;
 elsif p_verifier in ('screen_first','screen_daily','screen_weekly','screen_twenty') then
  select count(distinct record_date) into n from public.member_screen_records
  where user_id=p_user and deleted_at is null
   and jsonb_typeof(stocks)='array' and jsonb_array_length(stocks)>0
   and record_date=(recorded_at at time zone 'Asia/Taipei')::date
   and (p_verifier<>'screen_daily' or record_date=today)
   and (p_verifier<>'screen_weekly' or to_char(record_date,'IYYY-"W"IW')=to_char(today,'IYYY-"W"IW'));
  return n>=case p_verifier when 'screen_weekly' then 3 when 'screen_twenty' then 20 else 1 end;
 elsif p_verifier='screen_three_strategies' then
  select count(distinct trim(x.strategy)) into n from public.member_screen_records r
   cross join lateral jsonb_array_elements_text(r.strategies) x(strategy)
   where r.user_id=p_user and r.deleted_at is null and trim(x.strategy)<>''
    and jsonb_typeof(r.stocks)='array' and jsonb_array_length(r.stocks)>0
    and r.record_date=(r.recorded_at at time zone 'Asia/Taipei')::date;
  return n>=3;
 end if;
 return public._member_task_eligible_pre_bulk(p_user,p_verifier);
end $$;
update public.member_task_definitions set verifier=case id when 'screen-first-v1' then 'screen_first' when 'daily-screen-v1' then 'screen_daily' when 'weekly-screen-v1' then 'screen_weekly' when 'screen20-v1' then 'screen_twenty' when 'strategies3-v1' then 'screen_three_strategies' end
where id in ('screen-first-v1','daily-screen-v1','weekly-screen-v1','screen20-v1','strategies3-v1');
update public.member_task_definitions set verifier=case id when 'note-v1' then 'work_note' when 'daily-market-v1' then 'work_market' when 'daily-risk-v1' then 'work_risk' when 'daily-review-v1' then 'work_review' when 'daily-check-v1' then 'work_watch_reason' when 'weekly-notes-v1' then 'work_weekly_notes' when 'weekly-summary-v1' then 'work_summary' when 'weekly-plan-v1' then 'work_plan' when 'weekly-screen-review-v1' then 'work_screen_review' when 'simulate-v1' then 'work_sim_first' when 'weekly-simulation-v1' then 'work_sim_week' when 'notes5-v1' then 'work_notes5' when 'notes20-v1' then 'work_notes20' when 'reviews5-v1' then 'work_sim5' when 'weekly4-v1' then 'work_summary4' end where id in ('note-v1','daily-market-v1','daily-risk-v1','daily-review-v1','daily-check-v1','weekly-notes-v1','weekly-summary-v1','weekly-plan-v1','weekly-screen-review-v1','simulate-v1','weekly-simulation-v1','notes5-v1','notes20-v1','reviews5-v1','weekly4-v1');
insert into public.member_task_definitions(id,title,verifier,points,period,sort,active) values
 ('learning5-v1','核驗五篇學習內容','learning_five',40,'once',47,false),
 ('learning20-v1','核驗二十篇學習內容','learning_twenty',80,'once',48,false),
 ('challenge-first-v1','完成第一週學習挑戰','learning_first_week',30,'once',49,false),
 ('challenge8-v1','完成八週學習挑戰','learning_eight_weeks',150,'once',50,false),
 ('watch5-v1','建立五檔自選觀察清單','watchlist_five',30,'once',51,false)
on conflict(id) do nothing;

create or replace function public._member_task_progress(p_user uuid,p_id text,p_verifier text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare n integer:=0;target integer:=1;today date:=(clock_timestamp() at time zone 'Asia/Taipei')::date;i integer;meta jsonb;share jsonb;
begin
 if p_user is distinct from auth.uid() then raise exception 'MEMBER_VERIFY_REQUIRED';end if;
 if p_verifier like 'work_%' then return public._member_task_work_progress(p_user,p_verifier);end if;
 select raw_user_meta_data into meta from auth.users where id=p_user;
 if p_verifier='profile_name' then n:=case when length(trim(coalesce(meta->>'display_name','')))>0 then 1 else 0 end;
 elsif p_verifier='profile_preferences' then n:=case when jsonb_typeof(meta->'member_preferences')='object' and meta->'member_preferences'<>'{}'::jsonb then 1 else 0 end;
 elsif p_verifier='verified_contact' then select count(*) into n from auth.users where id=p_user and (email_confirmed_at is not null or phone_confirmed_at is not null);
 elsif p_verifier in ('watchlist_first','watchlist_five') then select count(distinct code) into n from public.watchlist where user_id=p_user and (p_verifier='watchlist_first' or code~'^[0-9A-Z]{4,10}$');target:=case when p_verifier='watchlist_five' then 5 else 1 end;
 elsif p_verifier in ('learning_first','learning_daily','learning_three','learning_five','learning_ten','learning_twenty','learning_thirty') then
  target:=case p_verifier when 'learning_three' then 3 when 'learning_five' then 5 when 'learning_ten' then 10 when 'learning_twenty' then 20 when 'learning_thirty' then 30 else 1 end;
  select count(*) into n from public.member_learning_completions where user_id=p_user and (p_verifier<>'learning_daily' or (completed_at at time zone 'Asia/Taipei')::date=today);
 elsif p_verifier in ('learning_week','learning_first_week','learning_four_weeks','learning_eight_weeks') then
  target:=case p_verifier when 'learning_four_weeks' then 4 when 'learning_eight_weeks' then 8 else 1 end;
  select count(*) into n from public.member_learning_weekly_results where user_id=p_user and (p_verifier<>'learning_week' or week_key=to_char(today,'IYYY-"W"IW'));
 elsif p_verifier='screen_three_strategies' then
  target:=3;select count(distinct trim(x.strategy)) into n from public.member_screen_records r cross join lateral jsonb_array_elements_text(r.strategies) x(strategy) where r.user_id=p_user and r.deleted_at is null and trim(x.strategy)<>'' and jsonb_typeof(stocks)='array' and jsonb_array_length(stocks)>0 and r.record_date=(r.recorded_at at time zone 'Asia/Taipei')::date;
 elsif p_verifier in ('screen_first','screen_daily','screen_weekly','screen_twenty') then
  target:=case p_verifier when 'screen_weekly' then 3 when 'screen_twenty' then 20 else 1 end;
  select count(distinct record_date) into n from public.member_screen_records where user_id=p_user and deleted_at is null and jsonb_typeof(stocks)='array' and jsonb_array_length(stocks)>0 and record_date=(recorded_at at time zone 'Asia/Taipei')::date and (p_verifier<>'screen_daily' or record_date=today) and (p_verifier<>'screen_weekly' or to_char(record_date,'IYYY-"W"IW')=to_char(today,'IYYY-"W"IW'));
 elsif p_verifier in ('task_streak7','task_streak15','task_streak30') then
  target:=case p_verifier when 'task_streak7' then 7 when 'task_streak15' then 15 else 30 end;
  for i in 0..target-1 loop exit when not exists(select 1 from public.member_task_claims where user_id=p_user and cap_group='daily_research' and period_key=to_char(today-i,'YYYY-MM-DD'));n:=n+1;end loop;
 elsif p_verifier='qualified_invite' then share:=public.member_share_unlock();n:=coalesce((share->>'confirmed_count')::integer,0);if not coalesce((share->>'campaign_active')::boolean,false) then return jsonb_build_object('count',n,'target',target,'reason','邀請活動尚未開放；已有的邀請紀錄會保留，開放後再核對資格。');end if;
 elsif p_verifier in ('birthday','anniversary') then n:=case when public._member_task_eligible(p_user,p_verifier) then 1 else 0 end;
 end if;
 return jsonb_build_object('count',n,'target',target);
end $$;
revoke all on function public._member_task_progress(uuid,text,text) from public,anon,authenticated;

create or replace function public.member_task_status() returns jsonb
language plpgsql security definer set search_path='' as $$
declare original jsonb;rows jsonb;
begin
 original:=public.member_task_status_pre_bulk();
 select coalesce(jsonb_agg(x.row||jsonb_build_object('server_verified',public._member_task_verifier_trusted(d.verifier),
  'eligible',coalesce((x.row->>'eligible')::boolean,false) and public._member_task_verifier_trusted(d.verifier),
  'progress',public._member_task_progress(auth.uid(),d.id,d.verifier),
  'verification_note',case when d.verifier='admin_review' then '由管理端審核' when not public._member_task_verifier_trusted(d.verifier) then '任務核驗準備中，完成紀錄會保留' else '完成條件由伺服器重新確認' end) order by x.ord),'[]'::jsonb)
 into rows from jsonb_array_elements(original->'rows') with ordinality x(row,ord)
 join public.member_task_definitions d on d.id=x.row->>'id';
 return original||jsonb_build_object('rows',rows,'bulk_claim_version',1);
end $$;
create or replace function public.claim_member_task(p_task_id text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid();v text;
begin
 if u is null then raise exception 'MEMBER_VERIFY_REQUIRED';end if;
 perform pg_advisory_xact_lock(hashtextextended('point-wallet:'||u,0));
 select verifier into v from public.member_task_definitions where id=p_task_id and active;
 if v is null then raise exception 'MEMBER_TASK_UNAVAILABLE';end if;
 if v='admin_review' then raise exception 'MEMBER_TASK_REVIEW_ONLY';end if;
 -- Preserve lookup of a historical receipt; never issue a new self-reported award.
 if not public._member_task_verifier_trusted(v) then
  if exists(select 1 from public.member_task_claims where user_id=u and task_id=p_task_id
    and period_key=public._member_task_period_key(u,(select period from public.member_task_definitions where id=p_task_id),v)) then
   return public.claim_member_task_pre_bulk(p_task_id);
  end if;
  raise exception 'MEMBER_TASK_EVIDENCE_REQUIRED';
 end if;
 return public.claim_member_task_pre_bulk(p_task_id);
end $$;

create or replace function public.claim_completed_member_tasks(p_request_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid();prior jsonb;s jsonb;candidate jsonb;r jsonb;result jsonb;code text;
 rows jsonb:='[]';processed text[]:='{}';points integer:=0;awarded integer:=0;duplicates integer:=0;capped integer:=0;
begin
 if u is null then raise exception 'MEMBER_VERIFY_REQUIRED';end if;
 if p_request_id is null then raise exception 'MEMBER_INPUT_INVALID';end if;
 perform pg_advisory_xact_lock(hashtextextended('point-wallet:'||u,0));
 select receipt.result into prior from public.member_task_bulk_receipts receipt where user_id=u and request_id=p_request_id;
 if found then return prior||jsonb_build_object('duplicate',true);end if;
 loop
  s:=public.member_task_status();
  select x into candidate from jsonb_array_elements(s->'rows') x
   where (x->>'eligible')::boolean and (x->>'server_verified')::boolean
    and not (x->>'claimed')::boolean and not coalesce((x->>'review_only')::boolean,false)
    and not ((x->>'id')=any(processed)) limit 1;
  exit when candidate is null;
  processed:=array_append(processed,candidate->>'id');
  if cardinality(processed)>100 then raise exception 'MEMBER_TASK_CATALOG_TOO_LARGE';end if;
  begin
   r:=public.claim_member_task(candidate->>'id');
   if coalesce((r->>'duplicate')::boolean,false) then duplicates:=duplicates+1;
   else awarded:=awarded+1;points:=points+(r->>'points')::integer;end if;
   rows:=rows||jsonb_build_array(jsonb_build_object('task_id',candidate->>'id','title',candidate->>'title','status',case when coalesce((r->>'duplicate')::boolean,false) then 'already_claimed' else 'awarded' end,'receipt',r));
  exception when raise_exception then
   get stacked diagnostics code=MESSAGE_TEXT;
   if code not in ('MEMBER_TASK_LIMIT_REACHED','MEMBER_TASK_INCOMPLETE','MEMBER_TASK_UNAVAILABLE','MEMBER_TASK_EVIDENCE_REQUIRED','MEMBER_TASK_REVIEW_ONLY') then raise;end if;
   if code='MEMBER_TASK_LIMIT_REACHED' then capped:=capped+1;end if;
   rows:=rows||jsonb_build_array(jsonb_build_object('task_id',candidate->>'id','title',candidate->>'title','status','skipped','reason',code));
  end;
  candidate:=null;
 end loop;
 result:=jsonb_build_object('request_id',p_request_id,'awarded_count',awarded,'awarded_points',points,'already_claimed_count',duplicates,'capped_count',capped,'rows',rows,'server_time',clock_timestamp(),'duplicate',false);
 insert into public.member_task_bulk_receipts(user_id,request_id,result) values(u,p_request_id,result);
 return result;
end $$;
revoke all on function public._member_task_verifier_trusted(text),public._member_task_eligible_pre_bulk(uuid,text),public._member_task_eligible(uuid,text),public.member_task_status_pre_bulk(),public.member_task_status(),public.claim_member_task_pre_bulk(text),public.claim_member_task(text),public.claim_completed_member_tasks(uuid) from public,anon,authenticated;
grant execute on function public.member_task_status(),public.claim_member_task(text),public.claim_completed_member_tasks(uuid) to authenticated;
commit;
