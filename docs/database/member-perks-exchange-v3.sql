-- 點數兌換商品 v3（2026-10-22，JUSTY 指示）：任務點數與儲值點數是同一種點數、同價格（儲值開放後 NT$1＝10 點）。
-- 前提：member-perks-exchange-v2.sql 已套用（2026-10-20 已由 JUSTY 套用）。
-- 調整 v2 既有 7 項價格、新增 7 項；全部 active=false，套用後不會開放兌換、不會發點。
-- 價格：以全工具 30 天 NT$1,000（10,000 點）為基準；體驗 1 天 500、3 天 1,200、7 天 2,500、90 天 27,000（九折）；單項 3／7／30 天 400／800／3,000；雙工具 3／7 天 700／1,500。
--   做任務的會員主要靠連續打卡送的使用券（見 member-perks-tasks-v3-points.sql）。
begin;
insert into public.member_exchange_definitions(id,title,points,voucher_definition,duration_days,active) values
 ('vip-1d-v1','全工具體驗券 · 1 天',500,'vip-v1',1,false),
 ('choice-7d-v1','自選單品券 · 7 天',800,'choice-v1',7,false),
 ('choice-30d-v1','自選單品券 · 30 天',3000,'choice-v1',30,false),
 ('observation-7d-v1','盤勢雙指標券 · 7 天',1500,'observation-v1',7,false),
 ('research-7d-v1','題材雷達券 · 7 天',1500,'research-v1',7,false),
 ('advanced-7d-v1','進出場追蹤券 · 7 天',1500,'advanced-v1',7,false),
 ('vip-90d-v1','全工具通行券 · 90 天',27000,'vip-v1',90,false)
on conflict (id) do nothing;
-- 全部商品價格（含 v2 既有 7 項）統一依台幣 × 10
update public.member_exchange_definitions d set points=v.points from (values
 ('vip-1d-v1',500),
 ('choice-3d-v1',400),
 ('choice-7d-v1',800),
 ('choice-30d-v1',3000),
 ('observation-3d-v1',700),
 ('observation-7d-v1',1500),
 ('research-3d-v1',700),
 ('research-7d-v1',1500),
 ('advanced-3d-v1',700),
 ('advanced-7d-v1',1500),
 ('vip-3d-v1',1200),
 ('vip-7d-v1',2500),
 ('vip-30d-v1',10000),
 ('vip-90d-v1',27000)
) as v(id,points) where d.id=v.id;
do $$ begin
 if exists(select 1 from public.member_exchange_definitions where active and id in ('vip-1d-v1','choice-7d-v1','choice-30d-v1','observation-7d-v1','research-7d-v1','advanced-7d-v1','vip-90d-v1')) then raise exception 'new exchange definitions must stay inactive'; end if;
 if (select count(*) from public.member_exchange_definitions)<14 then raise exception 'expected 14 exchange definitions'; end if;
end $$;
commit;
-- 驗證：select id,title,points,duration_days,active from public.member_exchange_definitions order by points,id;
