-- 點數兌換商品 v3「方案重整」（2026-10-22，JUSTY 指示）：任務點數與儲值點數是同一種點數、同價格（儲值開放後 NT$1＝10 點）。
-- 前提：member-perks-exchange-v2.sql 已套用（2026-10-20 已由 JUSTY 套用）。可重複執行。
-- 商品最多 8 項，現行 8 項（價格只標點數；名稱不含進出場／買賣字眼）：
--   全方位研究 1 天 500（體驗）、7 天 2,500、30 天 8,800、90 天 24,000
--   研究入門（四項任選一項）7 天 1,000、30 天 3,800
--   研究進階（外資空單溫度計＋大盤多空廣度＋話題研究）7 天 1,800、30 天 6,800
-- 退場商品（choice-3d／observation-3d／research-3d／advanced-3d／vip-3d，以及舊版 v3 的 observation-7d／advanced-7d）
--   （research-7d-v1 重新上架為研究進階 7 天）保留資料列以免影響既有紀錄，一律 active=false，不在網站上出現。
-- 「出場追蹤」更名為「持股觀察站」（只改顯示名稱，功能代號 selltrack 不變）。
-- 全部定義維持 active=false：套用後不會開放兌換、不會發點。
begin;

-- 1. 工具與券名稱
update public.member_feature_catalog set title='持股觀察站' where feature='selltrack';
update public.member_voucher_definitions set title='全方位研究券',version=version+1 where id='vip-v1' and title<>'全方位研究券';
update public.member_voucher_definitions set title='研究入門券',version=version+1 where id='choice-v1' and title<>'研究入門券';
update public.member_voucher_definitions set title='研究進階券',allowed_features=array['fhedge','breadth','hottopics'],version=version+1
 where id='research-v1' and (title<>'研究進階券' or allowed_features<>array['fhedge','breadth','hottopics']);
update public.member_voucher_definitions set title='持股觀察雙工具券',version=version+1 where id='advanced-v1' and title<>'持股觀察雙工具券';

-- 2. 現行商品
insert into public.member_exchange_definitions(id,title,points,voucher_definition,duration_days,active) values
 ('vip-1d-v1','全方位研究 · 1 天體驗',500,'vip-v1',1,false),
 ('choice-7d-v1','研究入門 · 7 天',1000,'choice-v1',7,false),
 ('research-7d-v1','研究進階 · 7 天',1800,'research-v1',7,false),
 ('choice-30d-v1','研究入門 · 30 天',3800,'choice-v1',30,false),
 ('research-30d-v1','研究進階 · 30 天',6800,'research-v1',30,false),
 ('vip-90d-v1','全方位研究 · 90 天',24000,'vip-v1',90,false)
on conflict (id) do nothing;
update public.member_exchange_definitions d set title=v.title,points=v.points from (values
 ('vip-1d-v1','全方位研究 · 1 天體驗',500),
 ('choice-7d-v1','研究入門 · 7 天',1000),
 ('research-7d-v1','研究進階 · 7 天',1800),
 ('vip-7d-v1','全方位研究 · 7 天',2500),
 ('choice-30d-v1','研究入門 · 30 天',3800),
 ('research-30d-v1','研究進階 · 30 天',6800),
 ('vip-30d-v1','全方位研究 · 30 天',8800),
 ('vip-90d-v1','全方位研究 · 90 天',24000)
) as v(id,title,points) where d.id=v.id;

-- 3. 退場商品：保留、關閉（舊名稱中的「進出場追蹤」一併改掉）
update public.member_exchange_definitions set title=replace(title,'進出場追蹤券','持股觀察雙工具券') where title like '%進出場追蹤券%';
update public.member_exchange_definitions set active=false
 where id not in ('vip-1d-v1','choice-7d-v1','research-7d-v1','vip-7d-v1','choice-30d-v1','research-30d-v1','vip-30d-v1','vip-90d-v1');
update public.member_exchange_definitions set title='（已停售）'||title
 where id not in ('vip-1d-v1','choice-7d-v1','research-7d-v1','vip-7d-v1','choice-30d-v1','research-30d-v1','vip-30d-v1','vip-90d-v1') and title not like '（已停售）%';

-- 4. 檢查
do $$ begin
 if (select count(*) from public.member_exchange_definitions where id in ('vip-1d-v1','choice-7d-v1','research-7d-v1','vip-7d-v1','choice-30d-v1','research-30d-v1','vip-30d-v1','vip-90d-v1'))<>8 then raise exception 'expected 8 current products'; end if;
 if exists(select 1 from public.member_exchange_definitions where title ~ '進出場|出場|買賣') then raise exception 'product titles must not use trading wording'; end if;
 if (select string_agg(points::text,',' order by points) from public.member_exchange_definitions where id in ('vip-1d-v1','choice-7d-v1','research-7d-v1','vip-7d-v1','choice-30d-v1','research-30d-v1','vip-30d-v1','vip-90d-v1'))<>'500,1000,1800,2500,3800,6800,8800,24000' then raise exception 'unexpected prices'; end if;
end $$;
commit;

-- 驗證：select id,title,points,duration_days,active from public.member_exchange_definitions order by active desc,points,id;
-- 正式開放兌換（另一步，需再次批准；只開現行 8 項）：
-- update public.member_voucher_definitions set active=true where id in ('vip-v1','choice-v1','research-v1');
-- update public.member_exchange_definitions set active=true where id in ('vip-1d-v1','choice-7d-v1','research-7d-v1','vip-7d-v1','choice-30d-v1','research-30d-v1','vip-30d-v1','vip-90d-v1');
