-- 點數兌換商品 v3（2026-10-22，JUSTY 指示：任務點數與儲值點數同價值 1 元＝10 點，並增加商品）。
-- 前提：member-perks-exchange-v2.sql 已套用（2026-10-20 已由 JUSTY 套用）。
-- 只新增商品定義，價格沿用 v2 既有 7 項不變；全部 active=false，套用後不會開放兌換、不會發點。
-- 價格以「1 元＝10 點」換算：體驗 1 天 80 點（約 NT$8）～全工具 90 天 9,000 點（約 NT$900）。
begin;
insert into public.member_exchange_definitions(id,title,points,voucher_definition,duration_days,active) values
 ('vip-1d-v1','全工具體驗券 · 1 天',80,'vip-v1',1,false),
 ('choice-7d-v1','自選單品券 · 7 天',300,'choice-v1',7,false),
 ('choice-30d-v1','自選單品券 · 30 天',900,'choice-v1',30,false),
 ('observation-7d-v1','盤勢雙指標券 · 7 天',500,'observation-v1',7,false),
 ('research-7d-v1','題材雷達券 · 7 天',500,'research-v1',7,false),
 ('advanced-7d-v1','進出場追蹤券 · 7 天',500,'advanced-v1',7,false),
 ('vip-90d-v1','全工具通行券 · 90 天',9000,'vip-v1',90,false)
on conflict (id) do nothing;
do $$ begin
 if exists(select 1 from public.member_exchange_definitions where active and id in ('vip-1d-v1','choice-7d-v1','choice-30d-v1','observation-7d-v1','research-7d-v1','advanced-7d-v1','vip-90d-v1')) then raise exception 'new exchange definitions must stay inactive'; end if;
 if (select count(*) from public.member_exchange_definitions)<14 then raise exception 'expected 14 exchange definitions'; end if;
end $$;
commit;
-- 驗證：select id,title,points,duration_days,active from public.member_exchange_definitions order by points,id;
