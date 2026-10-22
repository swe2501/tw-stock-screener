-- 點數兌換商品 v3（2026-10-22，JUSTY 指示）：任務點數與儲值點數是同一種點數、同價格（儲值開放後 NT$1＝10 點）。
-- 前提：member-perks-exchange-v2.sql 已套用（2026-10-20 已由 JUSTY 套用）。
-- 調整 v2 既有 7 項價格、新增 7 項；全部 active=false，套用後不會開放兌換、不會發點。
-- 價格（親民版、整數）：體驗 1 天 100 點～全工具 90 天 10,000 點；任務每月最多約 1,100 點，接近一張 7 天全工具券（1,300 點）。
begin;
insert into public.member_exchange_definitions(id,title,points,voucher_definition,duration_days,active) values
 ('vip-1d-v1','全工具體驗券 · 1 天',100,'vip-v1',1,false),
 ('choice-7d-v1','自選單品券 · 7 天',600,'choice-v1',7,false),
 ('choice-30d-v1','自選單品券 · 30 天',1500,'choice-v1',30,false),
 ('observation-7d-v1','盤勢雙指標券 · 7 天',800,'observation-v1',7,false),
 ('research-7d-v1','題材雷達券 · 7 天',800,'research-v1',7,false),
 ('advanced-7d-v1','進出場追蹤券 · 7 天',800,'advanced-v1',7,false),
 ('vip-90d-v1','全工具通行券 · 90 天',10000,'vip-v1',90,false)
on conflict (id) do nothing;
-- 全部商品價格（含 v2 既有 7 項）統一依台幣 × 10
update public.member_exchange_definitions d set points=v.points from (values
 ('vip-1d-v1',100),
 ('choice-3d-v1',300),
 ('choice-7d-v1',600),
 ('choice-30d-v1',1500),
 ('observation-3d-v1',400),
 ('observation-7d-v1',800),
 ('research-3d-v1',400),
 ('research-7d-v1',800),
 ('advanced-3d-v1',400),
 ('advanced-7d-v1',800),
 ('vip-3d-v1',700),
 ('vip-7d-v1',1300),
 ('vip-30d-v1',4000),
 ('vip-90d-v1',10000)
) as v(id,points) where d.id=v.id;
do $$ begin
 if exists(select 1 from public.member_exchange_definitions where active and id in ('vip-1d-v1','choice-7d-v1','choice-30d-v1','observation-7d-v1','research-7d-v1','advanced-7d-v1','vip-90d-v1')) then raise exception 'new exchange definitions must stay inactive'; end if;
 if (select count(*) from public.member_exchange_definitions)<14 then raise exception 'expected 14 exchange definitions'; end if;
end $$;
commit;
-- 驗證：select id,title,points,duration_days,active from public.member_exchange_definitions order by points,id;
