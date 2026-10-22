-- 會員任務 v3：任務點數依「儲值 1 元＝10 點」重新校準＋學習中心任務（2026-10-22，JUSTY 批准方向：任務點與儲值點維持分開記帳）。
-- 前提：member-perks-tasks-v2.sql 已套用（2026-10-20 已由 JUSTY 套用）。
-- 目標：認真使用的會員每週最多約 270 點、每月約 1,100 點，約等於一張 7 天全工具通行券（1,000 點）。
--   每日上限 30 → 20；每週研究上限 150 → 100；每週學習挑戰 30 點另計、不占上限。
-- 本檔只改任務定義與上限函式，不動 ledger、不動兌換商品價格、不啟用任何任務（active 維持原值，新任務一律 false）。
begin;

-- 1. 上限：每日 20、每週 100、獎勵影片每日 15（不變）
create or replace function public._member_task_cap(p_group text) returns integer
language sql immutable set search_path='' as $$
 select case p_group when 'daily_research' then 20 when 'weekly_research' then 100 when 'daily_video' then 15 else null end
$$;
revoke all on function public._member_task_cap(text) from public,anon,authenticated;

-- 2. 既有任務點數與名稱
update public.member_task_definitions d set points=v.points,title=coalesce(v.title,d.title),cap_group=case when v.uncap then null else d.cap_group end
from (values
 ('note-v1',30,null,false),
 ('daily-check-v1',5,null,false),
 ('daily-risk-v1',5,null,false),
 ('daily-review-v1',5,null,false),
 ('daily-learn-v1',5,'讀完一篇學習內容',false),
 ('weekly-notes-v1',30,null,false),
 ('weekly-summary-v1',20,null,false),
 ('weekly-screen-v1',20,null,false),
 ('weekly-screen-review-v1',20,null,false),
 ('weekly-simulation-v1',20,null,false),
 ('weekly-plan-v1',20,null,false),
 ('weekly-learn-v1',30,'完成本週學習挑戰',true),
 ('notes5-v1',50,null,false),
 ('notes20-v1',100,null,false),
 ('strategies3-v1',50,null,false),
 ('weekly4-v1',100,null,false),
 ('learning3-v1',30,'讀完三篇學習內容',false)
) as v(id,points,title,uncap)
where d.id=v.id;

-- 3. 新增學習里程碑（全部先關閉）
insert into public.member_task_definitions(id,title,verifier,points,period,cap_group,sort,voucher_definition,voucher_days,active) values
 ('learning10-v1','讀完十篇學習內容','member_report',50,'once',null,47,null,null,false),
 ('learning30-v1','讀完三十篇學習內容','member_report',100,'once',null,48,null,null,false),
 ('challenge4-v1','完成四次每週學習挑戰','member_report',100,'once',null,49,null,null,false)
on conflict (id) do nothing;

-- 4. 檢查
do $$ declare bad text; begin
 if public._member_task_cap('daily_research')<>20 or public._member_task_cap('weekly_research')<>100 then raise exception 'cap not updated'; end if;
 select string_agg(id,',') into bad from public.member_task_definitions where id in ('learning10-v1','learning30-v1','challenge4-v1') and active;
 if bad is not null then raise exception 'new tasks must start inactive: %',bad; end if;
 if (select cap_group from public.member_task_definitions where id='weekly-learn-v1') is not null then raise exception 'weekly-learn must be uncapped'; end if;
end $$;
commit;

-- 驗證查詢（套用後可執行）：
-- select id,title,points,period,cap_group,active from public.member_task_definitions order by sort,id;
