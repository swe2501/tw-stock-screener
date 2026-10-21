-- 會員任務 v2（2026-10-20，JUSTY 批准）：每日／每週／每年任務、每日與每週點數上限、任務附贈使用券。
-- 對應 docs/member-perks-program-2026-10-20.md 第 2、6 節。前提：member-task-wallet.sql、member-voucher-levels.sql 已部署。
-- 套用後所有新任務維持 active=false；開放另行 update active=true。
-- 驗證原則：
--   伺服器 verifier 只讀取伺服器資料（Auth 驗證狀態、帳號建立時間、會員自填資料欄位、自選表）。
--   member_report＝會員完成動作後由網站回報，伺服器只負責「同一期間一次」與點數上限，不讀取研究內文。
--   admin_review＝只能由管理端（service role）發點，會員端不能領。
begin;

-- 1. 任務定義擴充
alter table public.member_task_definitions
 add column if not exists period text not null default 'once',
 add column if not exists cap_group text,
 add column if not exists voucher_definition text references public.member_voucher_definitions(id),
 add column if not exists voucher_days integer,
 add column if not exists sort integer not null default 100;
do $$ declare c record; begin
 for c in select conname from pg_constraint where conrelid='public.member_task_definitions'::regclass and contype='c' and pg_get_constraintdef(oid) like '%verifier%' loop
  execute format('alter table public.member_task_definitions drop constraint %I',c.conname);
 end loop;
end $$;
alter table public.member_task_definitions
 add constraint member_task_definitions_verifier_v2 check(verifier in ('verified_contact','qualified_invite','profile_name','profile_preferences','watchlist_first','member_report','admin_review','birthday','anniversary')),
 add constraint member_task_definitions_period_v2 check(period in ('once','daily','weekly','yearly')),
 add constraint member_task_definitions_cap_v2 check(cap_group is null or cap_group in ('daily_research','weekly_research','daily_video')),
 add constraint member_task_definitions_voucher_v2 check((voucher_definition is null)=(voucher_days is null) and (voucher_days is null or voucher_days between 1 and 366));

-- 2. 每一次領取的紀錄（期間唯一；上限依此加總）。ledger 仍是點數唯一來源。
create table if not exists public.member_task_claims (
 user_id uuid not null references auth.users(id) on delete cascade,
 task_id text not null references public.member_task_definitions(id),
 period_key text not null,
 cap_group text,
 points integer not null check(points>0),
 ledger_id uuid not null references public.member_point_ledger(id),
 reward_id uuid references public.member_rewards(id),
 created_at timestamptz not null default now(),
 primary key(user_id,task_id,period_key)
);
create index if not exists member_task_claims_cap on public.member_task_claims(user_id,cap_group,period_key);
alter table public.member_task_claims enable row level security;
revoke all on public.member_task_claims from public,anon,authenticated;
grant all on public.member_task_claims to service_role;

-- 3. 上限（每日 30、每週 150、獎勵影片每日 15）
create or replace function public._member_task_cap(p_group text) returns integer
language sql immutable set search_path='' as $$
 select case p_group when 'daily_research' then 30 when 'weekly_research' then 150 when 'daily_video' then 15 else null end
$$;
revoke all on function public._member_task_cap(text) from public,anon,authenticated;

-- 4. 期間鍵（台北時間）；anniversary 以「第幾週年」為鍵
create or replace function public._member_task_period_key(p_user uuid,p_period text,p_verifier text) returns text
language plpgsql stable security definer set search_path='' as $$
declare t timestamp:=now() at time zone 'Asia/Taipei'; joined timestamptz;
begin
 if p_verifier='anniversary' then
  select created_at into joined from auth.users where id=p_user;
  return 'year-'||coalesce(extract(year from age(now(),joined))::int,0);
 end if;
 return case p_period when 'once' then 'once' when 'daily' then to_char(t,'YYYY-MM-DD')
  when 'weekly' then to_char(t,'IYYY-"W"IW') when 'yearly' then to_char(t,'YYYY') end;
end $$;
revoke all on function public._member_task_period_key(uuid,text,text) from public,anon,authenticated;

-- 5. 資格判斷（擴充既有函式；原兩種 verifier 行為不變）
create or replace function public._member_task_eligible(p_user uuid,p_verifier text) returns boolean
language plpgsql security definer set search_path='' as $$
declare eligible boolean:=false; progress jsonb; meta jsonb; joined timestamptz; birth text;
begin
 if p_user is distinct from auth.uid() then raise exception 'MEMBER_VERIFY_REQUIRED'; end if;
 select raw_user_meta_data,created_at into meta,joined from auth.users where id=p_user;
 if p_verifier='verified_contact' then
  select email_confirmed_at is not null or phone_confirmed_at is not null into eligible from auth.users where id=p_user;
 elsif p_verifier='qualified_invite' then
  progress:=public.member_share_unlock();
  eligible:=coalesce((progress->>'campaign_active')::boolean,false) and coalesce((progress->>'verified')::boolean,false) and (progress->>'confirmed_count')::integer>=1;
 elsif p_verifier='profile_name' then
  eligible:=length(trim(coalesce(meta->>'display_name','')))>0;
 elsif p_verifier='profile_preferences' then
  eligible:=jsonb_typeof(meta->'member_preferences')='object' and meta->'member_preferences'<>'{}'::jsonb;
 elsif p_verifier='watchlist_first' then
  execute 'select exists(select 1 from public.watchlist where user_id=$1)' into eligible using p_user;
 elsif p_verifier='member_report' then
  eligible:=true;  -- 網站回報；伺服器負責期間唯一與上限
 elsif p_verifier='birthday' then
  birth:=meta->>'birth_date';
  eligible:=birth ~ '^\d{4}-\d{2}-\d{2}$' and substr(birth,6,2)=to_char(now() at time zone 'Asia/Taipei','MM');
 elsif p_verifier='anniversary' then
  eligible:=joined is not null and joined<=now()-interval '1 year';
 elsif p_verifier='admin_review' then
  eligible:=false;
 end if;
 return coalesce(eligible,false);
end $$;
revoke all on function public._member_task_eligible(uuid,text) from public,anon,authenticated;

-- 6. 任務狀態（新增 period、cap 剩餘；claimed 依目前期間判斷）
create or replace function public.member_task_status() returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); rows jsonb:='[]'; d record; k text; used integer; caps jsonb:='{}';
begin
 if u is null then raise exception 'MEMBER_VERIFY_REQUIRED'; end if;
 for d in select * from public.member_task_definitions where active order by sort,id loop
  k:=public._member_task_period_key(u,d.period,d.verifier);
  rows:=rows||jsonb_build_array(jsonb_build_object('id',d.id,'title',d.title,'points',d.points,'period',d.period,'cap_group',d.cap_group,
   'voucher_days',d.voucher_days,'review_only',d.verifier='admin_review',
   'claimed',case when d.period='once' and d.verifier in ('verified_contact','qualified_invite')
     then exists(select 1 from public.member_point_ledger where user_id=u and source_event_key='task:'||u||':'||d.id)
       or exists(select 1 from public.member_task_claims where user_id=u and task_id=d.id)
     when d.cap_group='daily_video' then (select coalesce(sum(points),0) from public.member_task_claims where user_id=u and task_id=d.id and period_key like k||'#%')+d.points>public._member_task_cap('daily_video')
     else exists(select 1 from public.member_task_claims where user_id=u and task_id=d.id and period_key=k) end,
   'eligible',public._member_task_eligible(u,d.verifier)));
 end loop;
 for k in select unnest(array['daily_research','weekly_research','daily_video']) loop
  select coalesce(sum(points),0) into used from public.member_task_claims where user_id=u and cap_group=k
   and split_part(period_key,'#',1)=public._member_task_period_key(u,case when k='weekly_research' then 'weekly' else 'daily' end,'');
  caps:=caps||jsonb_build_object(k,jsonb_build_object('used',used,'limit',public._member_task_cap(k)));
 end loop;
 return jsonb_build_object('server_time',now(),'rows',rows,'caps',caps);
end $$;

-- 7. 領取（同一會員鎖內：期間唯一 → 上限 → 寫 ledger → 附贈券），重送回原結果
create or replace function public.claim_member_task(p_task_id text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); d public.member_task_definitions%rowtype; k text; event text; entry public.member_point_ledger%rowtype;
 prior public.member_task_claims%rowtype; used integer; cap integer; reward uuid;
begin
 if u is null then raise exception 'MEMBER_VERIFY_REQUIRED'; end if;
 perform pg_advisory_xact_lock(hashtextextended('point-wallet:'||u,0));
 select * into d from public.member_task_definitions where id=p_task_id and active;
 if not found then raise exception 'MEMBER_TASK_UNAVAILABLE'; end if;
 if d.verifier='admin_review' then raise exception 'MEMBER_TASK_REVIEW_ONLY'; end if;
 k:=public._member_task_period_key(u,d.period,d.verifier);
 -- 獎勵影片：同一天可領多次（上限 15 點＝3 支），以序號區分
 if d.cap_group='daily_video' then
  k:=k||'#'||((select count(*) from public.member_task_claims where user_id=u and task_id=d.id and period_key like k||'#%')+1);
 end if;
 -- 舊版一次性任務的事件鍵沿用，已領過的不會再領
 event:=case when d.period='once' then 'task:'||u||':'||d.id else 'task:'||u||':'||d.id||':'||k end;
 select * into entry from public.member_point_ledger where user_id=u and source_event_key=event;
 if found then return jsonb_build_object('id',entry.id,'points',entry.points,'duplicate',true); end if;
 select * into prior from public.member_task_claims where user_id=u and task_id=d.id and period_key=k;
 if found then return jsonb_build_object('id',prior.ledger_id,'points',prior.points,'duplicate',true); end if;
 if not public._member_task_eligible(u,d.verifier) then raise exception 'MEMBER_TASK_INCOMPLETE'; end if;
 if d.cap_group is not null then
  cap:=public._member_task_cap(d.cap_group);
  select coalesce(sum(points),0) into used from public.member_task_claims where user_id=u and cap_group=d.cap_group
   and split_part(period_key,'#',1)=public._member_task_period_key(u,case when d.cap_group='weekly_research' then 'weekly' else 'daily' end,'');
  if used+d.points>cap then raise exception 'MEMBER_TASK_LIMIT_REACHED'; end if;
 end if;
 insert into public.member_point_ledger(user_id,description,points,source_event_key) values(u,d.title,d.points,event) returning * into entry;
 if d.voucher_definition is not null then reward:=public._member_issue_voucher(u,d.voucher_definition,d.voucher_days,event||':voucher'); end if;
 insert into public.member_task_claims(user_id,task_id,period_key,cap_group,points,ledger_id,reward_id)
  values(u,d.id,k,d.cap_group,d.points,entry.id,reward);
 return jsonb_build_object('id',entry.id,'points',entry.points,'reward_id',reward,'duplicate',false);
end $$;
revoke all on function public.member_task_status(),public.claim_member_task(text) from public,anon,authenticated;
grant execute on function public.member_task_status(),public.claim_member_task(text) to authenticated;

-- 8. 管理端審核發點（service role 專用）
create or replace function public.admin_award_member_task(p_user uuid,p_task_id text,p_points integer,p_reason text,p_reference text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare d public.member_task_definitions%rowtype; event text; entry public.member_point_ledger%rowtype;
begin
 if p_points is null or p_points<1 or p_points>1000 or length(trim(coalesce(p_reason,'')))<2 or length(trim(coalesce(p_reference,'')))<2 then raise exception 'MEMBER_INPUT_INVALID'; end if;
 select * into d from public.member_task_definitions where id=p_task_id and verifier='admin_review';
 if not found then raise exception 'MEMBER_TASK_UNAVAILABLE'; end if;
 perform pg_advisory_xact_lock(hashtextextended('point-wallet:'||p_user,0));
 event:='task:'||p_user||':'||d.id||':'||trim(p_reference);
 select * into entry from public.member_point_ledger where user_id=p_user and source_event_key=event;
 if found then return jsonb_build_object('id',entry.id,'points',entry.points,'duplicate',true); end if;
 insert into public.member_point_ledger(user_id,description,points,source_event_key) values(p_user,d.title||'：'||left(trim(p_reason),200),p_points,event) returning * into entry;
 insert into public.member_task_claims(user_id,task_id,period_key,cap_group,points,ledger_id) values(p_user,d.id,'review-'||left(trim(p_reference),80),null,p_points,entry.id);
 return jsonb_build_object('id',entry.id,'points',entry.points,'duplicate',false);
end $$;
revoke all on function public.admin_award_member_task(uuid,text,integer,text,text) from public,anon,authenticated;
grant execute on function public.admin_award_member_task(uuid,text,integer,text,text) to service_role;

-- 9. 任務定義（id＝網站任務 id＋-v1；全部先關閉）
update public.member_task_definitions set sort=10 where id='verify-contact-v1';
update public.member_task_definitions set sort=80 where id='invite-first-v1';
insert into public.member_task_definitions(id,title,verifier,points,period,cap_group,sort,voucher_definition,voucher_days) values
 ('name-v1','設定研究暱稱','profile_name',20,'once',null,11,null,null),
 ('preferences-v1','設定通知偏好','profile_preferences',10,'once',null,12,null,null),
 ('watch-v1','建立第一份自選','watchlist_first',30,'once',null,13,null,null),
 ('learn-v1','讀完第一篇導讀','member_report',20,'once',null,14,null,null),
 ('note-v1','寫下第一則筆記','member_report',40,'once',null,15,null,null),
 ('screen-first-v1','記錄第一筆選股','member_report',30,'once',null,16,null,null),
 ('simulate-v1','完成一次模擬檢討','member_report',50,'once',null,17,null,null),
 ('daily-market-v1','記錄今日市場觀察','member_report',10,'daily','daily_research',20,null,null),
 ('daily-screen-v1','記錄今日選股','member_report',5,'daily','daily_research',21,null,null),
 ('daily-check-v1','更新一個觀察理由','member_report',10,'daily','daily_research',22,null,null),
 ('daily-risk-v1','補上一項風險條件','member_report',10,'daily','daily_research',23,null,null),
 ('daily-learn-v1','閱讀一段研究導讀','member_report',5,'daily','daily_research',24,null,null),
 ('daily-review-v1','回看一則舊筆記','member_report',10,'daily','daily_research',25,null,null),
 ('weekly-notes-v1','一週三篇有效筆記','member_report',60,'weekly','weekly_research',30,null,null),
 ('weekly-summary-v1','完成本週研究回顧','member_report',40,'weekly','weekly_research',31,null,null),
 ('weekly-screen-v1','一週記錄三天選股','member_report',30,'weekly','weekly_research',32,null,null),
 ('weekly-screen-review-v1','回看上週選股表現','member_report',30,'weekly','weekly_research',33,null,null),
 ('weekly-simulation-v1','檢討兩個歷史案例','member_report',40,'weekly','weekly_research',34,null,null),
 ('weekly-learn-v1','完成一組學習導讀','member_report',30,'weekly','weekly_research',35,null,null),
 ('weekly-plan-v1','整理下週觀察清單','member_report',30,'weekly','weekly_research',36,null,null),
 ('notes5-v1','累積五篇研究筆記','member_report',60,'once',null,40,null,null),
 ('notes20-v1','累積二十篇有效筆記','member_report',120,'once',null,41,null,null),
 ('screen20-v1','累積二十天選股紀錄','member_report',100,'once',null,42,null,null),
 ('strategies3-v1','用三種不同招式記錄選股','member_report',60,'once',null,43,null,null),
 ('reviews5-v1','完成五次模擬檢討','member_report',80,'once',null,44,null,null),
 ('weekly4-v1','完成四份週回顧','member_report',120,'once',null,45,null,null),
 ('learning3-v1','讀完三篇入門導讀','member_report',50,'once',null,46,null,null),
 ('feedback-v1','協助改善一個問題','admin_review',40,'once',null,81,null,null),
 ('event-v1','參加一場學院活動','admin_review',100,'once',null,82,null,null),
 ('ad-video-v1','觀看一支獎勵影片','member_report',5,'daily','daily_video',90,null,null),
 ('birthday-v1','生日當月禮','birthday',100,'yearly',null,91,'research-v1',3),
 ('anniversary-v1','會員週年禮','anniversary',200,'yearly',null,92,null,null)
on conflict (id) do nothing;

-- 10. 檢查：新任務全部關閉
do $$ begin
 if exists(select 1 from public.member_task_definitions where active and id not in ('verify-contact-v1','invite-first-v1')) then raise exception 'new tasks must start inactive'; end if;
end $$;
commit;

-- 開放（另一步）：
-- update public.member_task_definitions set active=true where verifier<>'admin_review' and id<>'ad-video-v1';
