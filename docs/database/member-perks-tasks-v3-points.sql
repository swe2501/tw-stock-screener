-- 會員任務 v3「黏著版」（2026-10-22，JUSTY 批准）：任務點數與儲值點數同一種（儲值開放後 NT$1＝10 點）。
-- 目標：讓會員天天回來做任務。點數上限每日 40、每週 200、每週學習挑戰 50 另計（每月最多約 2,300 點）；
--   全工具 30 天定價 10,000 點（NT$1,000，見 member-perks-exchange-v3.sql）。天天做任務的人靠「連續打卡送使用券」一直有工具用：
--   連續 7 天：50 點＋全工具 3 天券（每週一次）；連續 15 天：100 點＋全工具 7 天券（每月一次）；連續 30 天：200 點＋全工具 14 天券（每月一次）。
--   防刷：連續天數只看伺服器的每日任務領取紀錄；每日／每週上限與「同一期間只能領一次」不變。
-- 前提：member-perks-tasks-v2.sql 已套用（2026-10-20 已由 JUSTY 套用）。
-- 本檔改任務定義、上限、期間（新增 monthly）、驗證（新增連續打卡），不動 ledger、不啟用任何任務（新任務一律 false）。
begin;

-- 1. 上限：每日 40、每週 200、獎勵影片每日 15（不變）
create or replace function public._member_task_cap(p_group text) returns integer
language sql immutable set search_path='' as $$
 select case p_group when 'daily_research' then 40 when 'weekly_research' then 200 when 'daily_video' then 15 else null end
$$;
revoke all on function public._member_task_cap(text) from public,anon,authenticated;

-- 2. 既有任務點數與名稱
update public.member_task_definitions d set points=v.points,title=coalesce(v.title,d.title),cap_group=case when v.uncap then null else d.cap_group end
from (values
 ('note-v1',30,null,false),
 ('daily-market-v1',20,null,false),
 ('daily-screen-v1',10,null,false),
 ('daily-check-v1',10,null,false),
 ('daily-risk-v1',10,null,false),
 ('daily-review-v1',10,null,false),
 ('daily-learn-v1',10,'讀完一篇學習內容',false),
 ('weekly-notes-v1',60,null,false),
 ('weekly-summary-v1',40,null,false),
 ('weekly-screen-v1',40,null,false),
 ('weekly-screen-review-v1',40,null,false),
 ('weekly-simulation-v1',40,null,false),
 ('weekly-plan-v1',40,null,false),
 ('weekly-learn-v1',50,'完成本週學習挑戰',true),
 ('notes5-v1',50,null,false),
 ('notes20-v1',100,null,false),
 ('strategies3-v1',50,null,false),
 ('weekly4-v1',100,null,false),
 ('learning3-v1',30,'讀完三篇學習內容',false)
) as v(id,points,title,uncap)
where d.id=v.id;

-- 2b. 期間新增 monthly（台北時間 YYYY-MM）；驗證新增連續打卡（以伺服器的每日任務領取紀錄判斷，不讀研究內容）
alter table public.member_task_definitions drop constraint if exists member_task_definitions_period_v2;
alter table public.member_task_definitions drop constraint if exists member_task_definitions_period_v3;
alter table public.member_task_definitions add constraint member_task_definitions_period_v3 check(period in ('once','daily','weekly','monthly','yearly'));
alter table public.member_task_definitions drop constraint if exists member_task_definitions_verifier_v2;
alter table public.member_task_definitions drop constraint if exists member_task_definitions_verifier_v3;
alter table public.member_task_definitions add constraint member_task_definitions_verifier_v3 check(verifier in ('verified_contact','qualified_invite','profile_name','profile_preferences','watchlist_first','member_report','admin_review','birthday','anniversary','task_streak7','task_streak15','task_streak30'));

create or replace function public._member_task_period_key(p_user uuid,p_period text,p_verifier text) returns text
language plpgsql stable security definer set search_path='' as $$
declare t timestamp:=now() at time zone 'Asia/Taipei'; joined timestamptz;
begin
 if p_verifier='anniversary' then
  select created_at into joined from auth.users where id=p_user;
  return 'year-'||coalesce(extract(year from age(now(),joined))::int,0);
 end if;
 return case p_period when 'once' then 'once' when 'daily' then to_char(t,'YYYY-MM-DD')
  when 'weekly' then to_char(t,'IYYY-"W"IW') when 'monthly' then to_char(t,'YYYY-MM') when 'yearly' then to_char(t,'YYYY') end;
end $$;
revoke all on function public._member_task_period_key(uuid,text,text) from public,anon,authenticated;

-- 連續 N 天：今天往回 N 天（台北日期），每天都至少領過一項每日研究任務
create or replace function public._member_task_streak(p_user uuid,p_days integer) returns boolean
language sql stable security definer set search_path='' as $$
 select count(distinct c.period_key)=p_days from public.member_task_claims c
 where c.user_id=p_user and c.cap_group='daily_research'
  and c.period_key in (select to_char((now() at time zone 'Asia/Taipei')::date-g,'YYYY-MM-DD') from generate_series(0,p_days-1) g)
$$;
revoke all on function public._member_task_streak(uuid,integer) from public,anon,authenticated;

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
  eligible:=true;
 elsif p_verifier='birthday' then
  birth:=meta->>'birth_date';
  eligible:=birth ~ '^\d{4}-\d{2}-\d{2}$' and substr(birth,6,2)=to_char(now() at time zone 'Asia/Taipei','MM');
 elsif p_verifier='anniversary' then
  eligible:=joined is not null and joined<=now()-interval '1 year';
 elsif p_verifier='task_streak7' then
  eligible:=public._member_task_streak(p_user,7);
 elsif p_verifier='task_streak15' then
  eligible:=public._member_task_streak(p_user,15);
 elsif p_verifier='task_streak30' then
  eligible:=public._member_task_streak(p_user,30);
 elsif p_verifier='admin_review' then
  eligible:=false;
 end if;
 return coalesce(eligible,false);
end $$;
revoke all on function public._member_task_eligible(uuid,text) from public,anon,authenticated;

-- 3. 新增學習里程碑（全部先關閉）
insert into public.member_task_definitions(id,title,verifier,points,period,cap_group,sort,voucher_definition,voucher_days,active) values
 ('learning10-v1','讀完十篇學習內容','member_report',50,'once',null,47,null,null,false),
 ('learning30-v1','讀完三十篇學習內容','member_report',100,'once',null,48,null,null,false),
 ('challenge4-v1','完成四次每週學習挑戰','member_report',100,'once',null,49,null,null,false),
 ('streak7-v1','連續 7 天完成每日任務','task_streak7',50,'weekly',null,26,'vip-v1',3,false),
 ('streak15-v1','連續 15 天完成每日任務','task_streak15',100,'monthly',null,27,'vip-v1',7,false),
 ('streak30-v1','連續 30 天完成每日任務','task_streak30',200,'monthly',null,28,'vip-v1',14,false)
on conflict (id) do nothing;

-- 4. 檢查
do $$ declare bad text; begin
 if public._member_task_cap('daily_research')<>40 or public._member_task_cap('weekly_research')<>200 then raise exception 'cap not updated'; end if;
 select string_agg(id,',') into bad from public.member_task_definitions where id in ('learning10-v1','learning30-v1','challenge4-v1','streak7-v1','streak15-v1','streak30-v1') and active;
 if bad is not null then raise exception 'new tasks must start inactive: %',bad; end if;
 if (select cap_group from public.member_task_definitions where id='weekly-learn-v1') is not null then raise exception 'weekly-learn must be uncapped'; end if;
end $$;
commit;

-- 驗證查詢（套用後可執行）：
-- select id,title,points,period,cap_group,active from public.member_task_definitions order by sort,id;
