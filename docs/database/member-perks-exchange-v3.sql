-- 點數兌換商品 v3（2026-10-22，JUSTY 指示）：任務點數與儲值點數是同一種點數、同價格（儲值開放後 NT$1＝10 點）。
-- 前提：member-perks-exchange-v2.sql 已套用（2026-10-20 已由 JUSTY 套用）。
-- 調整 v2 既有 7 項價格、新增 7 項；全部 active=false，套用後不會開放兌換、不會發點。
-- 價格（親民版）：體驗 1 天 90 點～全工具 90 天 9,900 點；任務每月最多約 1,100 點，剛好換一張 7 天全工具券（1,290 點）前後。
begin;
insert into public.member_exchange_definitions(id,title,points,voucher_definition,duration_days,active) values
 ('vip-1d-v1','全工具體驗券 · 1 天',90,'vip-v1',1,false),
 ('choice-7d-v1','自選單品券 · 7 天',590,'choice-v1',7,false),
 ('choice-30d-v1','自選單品券 · 30 天',1490,'choice-v1',30,false),
 ('observation-7d-v1','盤勢雙指標券 · 7 天',790,'observation-v1',7,false),
 ('research-7d-v1','題材雷達券 · 7 天',790,'research-v1',7,false),
 ('advanced-7d-v1','進出場追蹤券 · 7 天',790,'advanced-v1',7,false),
 ('vip-90d-v1','全工具通行券 · 90 天',9900,'vip-v1',90,false)
on conflict (id) do nothing;
-- 全部商品價格（含 v2 既有 7 項）統一依台幣 × 10
update public.member_exchange_definitions d set points=v.points from (values
 ('vip-1d-v1',90),
 ('choice-3d-v1',290),
 ('choice-7d-v1',590),
 ('choice-30d-v1',1490),
 ('observation-3d-v1',390),
 ('observation-7d-v1',790),
 ('research-3d-v1',390),
 ('research-7d-v1',790),
 ('advanced-3d-v1',390),
 ('advanced-7d-v1',790),
 ('vip-3d-v1',690),
 ('vip-7d-v1',1290),
 ('vip-30d-v1',3990),
 ('vip-90d-v1',9900)
) as v(id,points) where d.id=v.id;
do $$ begin
 if exists(select 1 from public.member_exchange_definitions where active and id in ('vip-1d-v1','choice-7d-v1','choice-30d-v1','observation-7d-v1','research-7d-v1','advanced-7d-v1','vip-90d-v1')) then raise exception 'new exchange definitions must stay inactive'; end if;
 if (select count(*) from public.member_exchange_definitions)<14 then raise exception 'expected 14 exchange definitions'; end if;
end $$;
commit;
-- 驗證：select id,title,points,duration_days,active from public.member_exchange_definitions order by points,id;
