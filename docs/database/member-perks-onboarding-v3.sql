-- 新手任務合計 500 點（2026-10-22，JUSTY 批准）：做完新手任務剛好可兌換「全方位研究 · 1 天體驗」（500 點）。
-- 前提：member-perks-tasks-v3-points.sql 已套用。可重複執行；只改點數，不改開關，已領過的紀錄不追溯。
-- 邀請第一位有效新會員維持 60 點（邀請另有「每滿 3 位送全方位研究 7 天券」）。
begin;
update public.member_task_definitions d set points=v.points from (values
 ('verify-contact-v1',100),('name-v1',50),('preferences-v1',30),('learn-v1',50),
 ('watch-v1',60),('note-v1',60),('screen-first-v1',60),('simulate-v1',90)
) as v(id,points) where d.id=v.id;
do $$ begin
 if (select sum(points) from public.member_task_definitions where id in ('verify-contact-v1','name-v1','preferences-v1','learn-v1','watch-v1','note-v1','screen-first-v1','simulate-v1'))<>500 then raise exception 'onboarding total must be 500'; end if;
end $$;
commit;
select id,title,points,active from public.member_task_definitions
 where id in ('verify-contact-v1','name-v1','preferences-v1','learn-v1','watch-v1','note-v1','screen-first-v1','simulate-v1') order by points desc;
