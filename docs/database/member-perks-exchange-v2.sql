-- PREPARED ONLY（2026-10-20）：點數兌換商品 v2，對應 docs/member-perks-program-2026-10-20.md 第 3 節。
-- 尚未套用。需 JUSTY 明確批准、由有 Supabase 權限者先在隔離環境驗證，再套用到 Taiwan stock2（bruqrbvbjxntgoljxsne）。
-- 前提：已套用 member-voucher-levels.sql、member-task-wallet.sql（2026-10-20 已部署，見 member-rewards-db-status.md）。
-- 所有定義維持 active=false：套用後不會開放兌換、不會發點、不會改變任何既有免費功能。
begin;

-- 1. 話題研究、出場追蹤允許由券開通（主力訊號／分點回測／神燈冥燈不在目錄中，仍只限管理員）
update public.member_feature_catalog set voucher_enabled=true where feature in ('hottopics','selltrack');

-- 2. 各券包含的工具（版本 +1，已核發的券保留核發當下的快照，不追溯）
update public.member_voucher_definitions set title='盤勢雙指標券',allowed_features=array['fhedge','breadth'],version=version+1 where id='observation-v1';
update public.member_voucher_definitions set title='題材雷達券',allowed_features=array['hottopics','breadth'],version=version+1 where id='research-v1';
update public.member_voucher_definitions set title='進出場追蹤券',allowed_features=array['selltrack','fhedge'],version=version+1 where id='advanced-v1';
-- vip-v1 由 _member_issue_voucher 自動展開為「所有 voucher_enabled 的會員研究工具」，第 1 步開通後即為四項全開，只改名稱。
update public.member_voucher_definitions set title='全工具通行券',version=version+1 where id='vip-v1';
update public.member_voucher_definitions set title='自選單品券',allowed_features=array['fhedge','breadth','hottopics','selltrack'],version=version+1 where id='choice-v1';

-- 3. 兌換商品與點數
update public.member_exchange_definitions set title='自選單品券 · 3 天',points=150 where id='choice-3d-v1';
update public.member_exchange_definitions set title='盤勢雙指標券 · 3 天',points=250 where id='observation-3d-v1';
update public.member_exchange_definitions set title='題材雷達券 · 3 天',points=250 where id='research-3d-v1';
update public.member_exchange_definitions set title='進出場追蹤券 · 3 天',points=250 where id='advanced-3d-v1';
update public.member_exchange_definitions set title='全工具通行券 · 3 天',points=500 where id='vip-3d-v1';
insert into public.member_exchange_definitions(id,title,points,voucher_definition,duration_days) values
 ('vip-7d-v1','全工具通行券 · 7 天',1000,'vip-v1',7),
 ('vip-30d-v1','全工具通行券 · 30 天',3500,'vip-v1',30)
on conflict (id) do nothing;

-- 4. 檢查：全部仍為關閉狀態
do $$ begin
 if exists(select 1 from public.member_exchange_definitions where active) then raise exception 'exchange definitions must stay inactive'; end if;
 if exists(select 1 from public.member_voucher_definitions where active) then raise exception 'voucher definitions must stay inactive'; end if;
end $$;

commit;

-- 正式開放兌換（另一步，需再次批准）：
-- update public.member_voucher_definitions set active=true where id in ('observation-v1','research-v1','advanced-v1','vip-v1','choice-v1');
-- update public.member_exchange_definitions set active=true;
