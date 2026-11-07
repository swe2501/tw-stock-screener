-- Approved: automatic birthday 300 task points; no coupon or email/SMS.
-- Requires rewards policy v4, expiry v5, task bulk and notification inbox.
begin;
create table public.member_birthday_years_v6(
 user_id uuid not null references auth.users(id) on delete cascade,
 reward_year integer not null, birth_date date not null,
 ledger_id uuid references public.member_point_ledger(id), seen_at timestamptz,
 primary key(user_id,reward_year)
);
alter table public.member_birthday_years_v6 enable row level security;
revoke all on public.member_birthday_years_v6 from public,anon,authenticated;

create function public._member_birthday_date_v6(p_value text) returns date
language plpgsql immutable set search_path='' as $$
declare d date;begin
 if p_value is null or p_value !~ '^\d{4}-\d{2}-\d{2}$' then return null;end if;
 d:=p_value::date;
 if d<date '1900-01-01' then return null;end if;
 return d;
exception when invalid_datetime_format or datetime_field_overflow then return null;
end $$;

-- Freeze the first saved birthday for each reward year. Profile edits take effect next year.
create function public._member_birthday_capture_v6() returns trigger
language plpgsql security definer set search_path='' as $$
declare d date:=public._member_birthday_date_v6(new.raw_user_meta_data->>'birth_date');
 t date:=(clock_timestamp() at time zone 'Asia/Taipei')::date;
begin
 if d is not null and d<=t then
  insert into public.member_birthday_years_v6(user_id,reward_year,birth_date)
  values(new.id,extract(year from t)::integer,d) on conflict do nothing;
 end if;return new;
end $$;
create trigger member_birthday_capture_v6 after insert or update of raw_user_meta_data on auth.users
 for each row execute function public._member_birthday_capture_v6();

create function public._member_birthday_award_v6(p_user uuid,p_today date) returns jsonb
language plpgsql security definer set search_path='' as $$
declare y integer:=extract(year from p_today);b date;due date;k text:=y::text;
 prior public.member_task_claims%rowtype;l public.member_point_ledger%rowtype;
begin
 perform pg_advisory_xact_lock(hashtextextended('point-wallet:'||p_user,0));
 select * into prior from public.member_task_claims where user_id=p_user and task_id='birthday-v1' and period_key=k;
 if found then
  update public.member_birthday_years_v6 set ledger_id=prior.ledger_id where user_id=p_user and reward_year=y;
  return jsonb_build_object('id',prior.ledger_id,'points',prior.points,'duplicate',true);
 end if;
 if not exists(select 1 from public.member_task_definitions where id='birthday-v1' and active and points=300 and verifier='birthday') then return null;end if;
 select birth_date into b from public.member_birthday_years_v6 where user_id=p_user and reward_year=y;
 if b is null or not exists(select 1 from auth.users where id=p_user and (email_confirmed_at is not null or phone_confirmed_at is not null)) then return null;end if;
 -- Feb 29 birthdays receive the gift on Feb 28 in non-leap years.
 due:=make_date(y,extract(month from b)::integer,1)+least(extract(day from b)::integer,
 extract(day from (make_date(y,extract(month from b)::integer,1)+interval '1 month - 1 day'))::integer)-1;
 if due<>p_today then return null;end if;
 insert into public.member_point_ledger(user_id,description,points,source_event_key,pool)
 values(p_user,'生日快樂！願你每天都有值得期待的小美好。生日禮',300,'task:'||p_user||':birthday-v1:'||k,'task') returning * into l;
 insert into public.member_task_claims(user_id,task_id,period_key,points,ledger_id)
 values(p_user,'birthday-v1',k,300,l.id);
 update public.member_birthday_years_v6 set ledger_id=l.id where user_id=p_user and reward_year=y;
 return jsonb_build_object('id',l.id,'points',300,'duplicate',false);
end $$;

create function public._member_birthday_run_v6() returns jsonb
language plpgsql security definer set search_path='' as $$
declare t date:=(clock_timestamp() at time zone 'Asia/Taipei')::date;u uuid;r jsonb;n integer:=0;
begin
 insert into public.member_birthday_years_v6(user_id,reward_year,birth_date)
 select id,extract(year from t)::integer,d from
 (select id,public._member_birthday_date_v6(raw_user_meta_data->>'birth_date') d from auth.users) q
 where d is not null and d<=t on conflict do nothing;
 for u in select user_id from public.member_birthday_years_v6 where reward_year=extract(year from t) and ledger_id is null
 and extract(month from birth_date)=extract(month from t)
 and (extract(day from birth_date)=extract(day from t) or (extract(month from t)=2 and extract(day from t)=28 and extract(day from birth_date)=29
 and extract(day from (date_trunc('month',t)+interval '1 month - 1 day'))=28)) loop
  r:=public._member_birthday_award_v6(u,t);
  if r is not null and not (r->>'duplicate')::boolean then n:=n+1;end if;
 end loop;
 return jsonb_build_object('date',t,'awarded',n);
end $$;

create function public._member_task_exempt_v6(p_id text) returns boolean language sql immutable set search_path='' as $$
 select public._member_task_onboarding_v4(p_id) or p_id='birthday-v1'
$$;
do $$ declare signature text;definition text;begin
 foreach signature in array array['public._member_reward_usage_v4(uuid)','public.member_task_status()','public.claim_member_task(text)'] loop
  definition:=pg_get_functiondef(signature::regprocedure);
  if position('_member_task_onboarding_v4' in definition)=0 then raise exception 'Unexpected rewards definition: %',signature;end if;
  execute replace(definition,'_member_task_onboarding_v4','_member_task_exempt_v6');
 end loop;
end $$;
update public.member_task_definitions set title='生日禮',active=true,points=300,period='yearly',cap_group=null,
 voucher_definition=null,voucher_days=null where id='birthday-v1';

-- All public claim paths converge on the same annual receipt.
alter function public.claim_member_task(text) rename to _member_claim_pre_birthday_v6;
create function public.claim_member_task(p_task_id text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r jsonb;begin
 if auth.uid() is null then raise exception 'MEMBER_VERIFY_REQUIRED';end if;
 if p_task_id<>'birthday-v1' then return public._member_claim_pre_birthday_v6(p_task_id);end if;
 r:=public._member_birthday_award_v6(auth.uid(),(clock_timestamp() at time zone 'Asia/Taipei')::date);
 if r is null then raise exception 'MEMBER_TASK_INCOMPLETE';end if;return r;
end $$;

create function public.member_birthday_status(p_seen boolean default false) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid();r record;begin
 if u is null then raise exception 'MEMBER_VERIFY_REQUIRED';end if;
 select b.reward_year,b.seen_at,l.id,l.points,l.created_at,
 (l.created_at at time zone 'Asia/Taipei'+interval '1 year') at time zone 'Asia/Taipei' as expires_at into r
 from public.member_birthday_years_v6 b join public.member_point_ledger l on l.id=b.ledger_id
 where b.user_id=u and b.reward_year=extract(year from (clock_timestamp() at time zone 'Asia/Taipei')) and l.points=300;
 if not found then return jsonb_build_object('version',6,'awarded',false);end if;
 if p_seen then update public.member_birthday_years_v6 set seen_at=coalesce(seen_at,clock_timestamp()) where user_id=u and reward_year=r.reward_year;end if;
 return jsonb_build_object('version',6,'awarded',true,'year',r.reward_year,'points',r.points,'expires_at',r.expires_at,'seen',r.seen_at is not null or p_seen);
end $$;

-- Existing notification feed already includes the birthday ledger; no external messages.
revoke all on function public._member_birthday_date_v6(text),public._member_birthday_capture_v6(),
 public._member_birthday_award_v6(uuid,date),public._member_birthday_run_v6(),public._member_task_exempt_v6(text),
 public._member_claim_pre_birthday_v6(text),public.claim_member_task(text),public.member_birthday_status(boolean)
 from public,anon,authenticated;
grant execute on function public.claim_member_task(text),public.member_birthday_status(boolean) to authenticated;
commit;
