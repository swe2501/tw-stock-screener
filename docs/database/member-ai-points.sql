-- AI point 錢包（2026-10-22，JUSTY 批准設計；PREPARED ONLY，由 JUSTY 在 Supabase SQL Editor 套用）。
-- 前提：member-task-wallet.sql、member-perks-exchange-v3.sql 已套用。可重複執行。
-- 規則：
--   1. 點數只有一種，但帳本記錄來源（pool）：task＝任務獲得、stored＝儲值。既有紀錄全部是 task。
--   2. 只有「儲值點數」能轉成 AI point（1 點＝1 AI point）；任務點數不能轉。
--   3. AI point 可有小數（到小數第 4 位），AI 用多少扣多少，只捨不入，不會多扣。
--   4. AI point 可轉回儲值點數，只能轉整數點（小數留在 AI 錢包）。
--   5. 自動補充：餘額不足或低於門檻時，從儲值點數自動轉入設定的點數；儲值點數不夠就停止並回報。
--   6. 每次使用都有一筆明細（模型、用量、扣點），可設定單次上限，實際扣點不超過上限。
--   7. 兌換使用券時先扣任務點數，不夠再扣儲值點數，儲值點數盡量留給 AI。
-- 開關：member_ai_settings.active 預設 false。套用後不會開放轉換、不會扣點；儲值尚未開放前，儲值點數為 0，也無法轉換。
-- 實際的 AI 扣點只由伺服器（service_role）呼叫 member_ai_charge，瀏覽器不能扣點、不能自訂金額。
begin;

-- 1. 點數來源
alter table public.member_point_ledger add column if not exists pool text not null default 'task';
alter table public.member_point_ledger drop constraint if exists member_point_ledger_pool;
alter table public.member_point_ledger add constraint member_point_ledger_pool check(pool in ('task','stored'));

create or replace function public._member_pool_balance(p_user uuid,p_pool text) returns bigint
language sql stable security definer set search_path='' as $$
 select coalesce(sum(points),0)::bigint from public.member_point_ledger where user_id=p_user and pool=p_pool
$$;
revoke all on function public._member_pool_balance(uuid,text) from public,anon,authenticated;

-- 2. AI 錢包、明細、開關
create table if not exists public.member_ai_settings (
 id boolean primary key default true check(id), active boolean not null default false,
 stored_enabled boolean not null default false, updated_at timestamptz not null default now()
);
insert into public.member_ai_settings(id) values(true) on conflict (id) do nothing;

create table if not exists public.member_ai_wallets (
 user_id uuid primary key references auth.users(id) on delete cascade,
 balance numeric(16,4) not null default 0 check(balance>=0),
 auto_topup boolean not null default false,
 topup_points integer not null default 100 check(topup_points between 10 and 10000),
 topup_below numeric(16,4) not null default 5 check(topup_below between 0 and 10000),
 updated_at timestamptz not null default now()
);
create table if not exists public.member_ai_ledger (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 kind text not null check(kind in ('convert_in','convert_out','usage','auto_topup')),
 ai_delta numeric(16,4) not null check(ai_delta<>0),
 points_delta bigint not null default 0,
 balance_after numeric(16,4) not null check(balance_after>=0),
 description text not null check(length(trim(description)) between 1 and 200),
 request_id text not null check(length(request_id) between 1 and 120),
 detail jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now(),
 unique(user_id,kind,request_id)
);
create index if not exists member_ai_ledger_owner_date on public.member_ai_ledger(user_id,created_at desc);
alter table public.member_ai_settings enable row level security;
alter table public.member_ai_wallets enable row level security;
alter table public.member_ai_ledger enable row level security;
revoke all on public.member_ai_settings,public.member_ai_wallets,public.member_ai_ledger from public,anon,authenticated;
grant all on public.member_ai_settings,public.member_ai_wallets,public.member_ai_ledger to service_role;
grant select on public.member_ai_ledger to authenticated;
drop policy if exists member_ai_ledger_own on public.member_ai_ledger;
create policy member_ai_ledger_own on public.member_ai_ledger for select to authenticated using (user_id=(select auth.uid()));

-- 3. 內部：從儲值點數轉入 AI（呼叫者須已持有錢包鎖）
create or replace function public._member_ai_move_in(p_user uuid,p_points bigint,p_kind text,p_request text) returns numeric
language plpgsql security definer set search_path='' as $$
declare after numeric;
begin
 if p_points<1 then raise exception 'MEMBER_INPUT_INVALID'; end if;
 if public._member_pool_balance(p_user,'stored')<p_points then raise exception 'MEMBER_STORED_POINTS_INSUFFICIENT'; end if;
 insert into public.member_point_ledger(user_id,description,points,source_event_key,pool)
  values(p_user,case when p_kind='auto_topup' then '自動補充 AI point' else '轉入 AI point' end,-p_points,'ai-'||p_kind||':'||p_user||':'||p_request,'stored');
 insert into public.member_ai_wallets(user_id) values(p_user) on conflict (user_id) do nothing;
 update public.member_ai_wallets set balance=balance+p_points,updated_at=now() where user_id=p_user returning balance into after;
 insert into public.member_ai_ledger(user_id,kind,ai_delta,points_delta,balance_after,description,request_id)
  values(p_user,p_kind,p_points,-p_points,after,case when p_kind='auto_topup' then '自動補充' else '由儲值點數轉入' end,p_request);
 return after;
end $$;
revoke all on function public._member_ai_move_in(uuid,bigint,text,text) from public,anon,authenticated;

-- 4. 錢包摘要（任務點數、儲值點數分開；AI point 另列）
create or replace function public.member_wallet_summary() returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); task bigint; stored bigint; s public.member_ai_settings%rowtype; w public.member_ai_wallets%rowtype;
begin
 if u is null then raise exception 'MEMBER_VERIFY_REQUIRED'; end if;
 task:=public._member_pool_balance(u,'task'); stored:=public._member_pool_balance(u,'stored');
 if task<0 or stored<0 or task>9007199254740991 or stored>9007199254740991 then raise exception 'MEMBER_WALLET_REVIEW_REQUIRED'; end if;
 select * into s from public.member_ai_settings where id;
 select * into w from public.member_ai_wallets where user_id=u;
 return jsonb_build_object('task_points',task,'stored_enabled',coalesce(s.stored_enabled,false),'stored_points',stored,
  'ai_enabled',coalesce(s.active,false),'ai_points',coalesce(w.balance,0)::text,
  'ai_auto_topup',coalesce(w.auto_topup,false),'ai_topup_points',coalesce(w.topup_points,100),'ai_topup_below',coalesce(w.topup_below,5)::text,
  'server_time',now());
end $$;

-- 5. 會員操作：轉入、轉回、自動補充設定
create or replace function public.member_ai_convert(p_points integer,p_request_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); r public.member_ai_ledger%rowtype; after numeric;
begin
 if u is null then raise exception 'MEMBER_VERIFY_REQUIRED'; end if;
 if p_request_id is null or p_points is null or p_points<1 or p_points>100000 then raise exception 'MEMBER_INPUT_INVALID'; end if;
 if not coalesce((select active from public.member_ai_settings where id),false) then raise exception 'MEMBER_AI_UNAVAILABLE'; end if;
 perform pg_advisory_xact_lock(hashtextextended('point-wallet:'||u,0));
 select * into r from public.member_ai_ledger where user_id=u and kind='convert_in' and request_id=p_request_id::text;
 if found then return jsonb_build_object('ai_points',r.balance_after::text,'converted',r.ai_delta::text,'duplicate',true); end if;
 after:=public._member_ai_move_in(u,p_points,'convert_in',p_request_id::text);
 return jsonb_build_object('ai_points',after::text,'converted',p_points,'duplicate',false);
end $$;

create or replace function public.member_ai_convert_back(p_points integer,p_request_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); r public.member_ai_ledger%rowtype; bal numeric; after numeric;
begin
 if u is null then raise exception 'MEMBER_VERIFY_REQUIRED'; end if;
 if p_request_id is null or p_points is null or p_points<1 or p_points>100000 then raise exception 'MEMBER_INPUT_INVALID'; end if;
 if not coalesce((select active from public.member_ai_settings where id),false) then raise exception 'MEMBER_AI_UNAVAILABLE'; end if;
 perform pg_advisory_xact_lock(hashtextextended('point-wallet:'||u,0));
 select * into r from public.member_ai_ledger where user_id=u and kind='convert_out' and request_id=p_request_id::text;
 if found then return jsonb_build_object('ai_points',r.balance_after::text,'returned',-r.points_delta,'duplicate',true); end if;
 select balance into bal from public.member_ai_wallets where user_id=u for update;
 if coalesce(bal,0)<p_points then raise exception 'MEMBER_AI_POINTS_INSUFFICIENT'; end if;
 update public.member_ai_wallets set balance=balance-p_points,updated_at=now() where user_id=u returning balance into after;
 insert into public.member_point_ledger(user_id,description,points,source_event_key,pool) values(u,'AI point 轉回',p_points,'ai-convert_out:'||u||':'||p_request_id,'stored');
 insert into public.member_ai_ledger(user_id,kind,ai_delta,points_delta,balance_after,description,request_id)
  values(u,'convert_out',-p_points,p_points,after,'轉回儲值點數',p_request_id::text);
 return jsonb_build_object('ai_points',after::text,'returned',p_points,'duplicate',false);
end $$;

create or replace function public.member_ai_update_settings(p_auto_topup boolean,p_topup_points integer,p_topup_below numeric) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); w public.member_ai_wallets%rowtype;
begin
 if u is null then raise exception 'MEMBER_VERIFY_REQUIRED'; end if;
 if p_auto_topup is null or p_topup_points is null or p_topup_points not between 10 and 10000 or p_topup_below is null or p_topup_below not between 0 and 10000 then raise exception 'MEMBER_INPUT_INVALID'; end if;
 insert into public.member_ai_wallets(user_id,auto_topup,topup_points,topup_below) values(u,p_auto_topup,p_topup_points,trunc(p_topup_below,4))
 on conflict (user_id) do update set auto_topup=excluded.auto_topup,topup_points=excluded.topup_points,topup_below=excluded.topup_below,updated_at=now()
 returning * into w;
 return jsonb_build_object('ai_auto_topup',w.auto_topup,'ai_topup_points',w.topup_points,'ai_topup_below',w.topup_below::text);
end $$;

-- 6. 伺服器扣點（只給 service_role；AI 服務每次回應後呼叫一次）
--   p_amount：實際用量換算的 AI point，只捨不入到小數第 4 位；p_cap：事前顯示給會員的上限，實際扣點不超過它。
--   同一個 p_request_id 只會扣一次。餘額不足且開啟自動補充時，從儲值點數補足（每次補 topup_points 的整數倍）。
create or replace function public.member_ai_charge(p_user uuid,p_request_id text,p_amount numeric,p_cap numeric,p_detail jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.member_ai_ledger%rowtype; w public.member_ai_wallets%rowtype; amt numeric; need numeric; times bigint; after numeric; topped bigint:=0;
begin
 if p_user is null or p_request_id is null or p_amount is null or p_amount<=0 or p_amount>100000 or (p_cap is not null and p_cap<=0) then raise exception 'MEMBER_INPUT_INVALID'; end if;
 if not coalesce((select active from public.member_ai_settings where id),false) then raise exception 'MEMBER_AI_UNAVAILABLE'; end if;
 perform pg_advisory_xact_lock(hashtextextended('point-wallet:'||p_user,0));
 select * into r from public.member_ai_ledger where user_id=p_user and kind='usage' and request_id=p_request_id;
 if found then return jsonb_build_object('charged',(-r.ai_delta)::text,'ai_points',r.balance_after::text,'duplicate',true); end if;
 amt:=trunc(least(p_amount,coalesce(p_cap,p_amount)),4);
 if amt<=0 then return jsonb_build_object('charged','0','duplicate',false); end if;
 insert into public.member_ai_wallets(user_id) values(p_user) on conflict (user_id) do nothing;
 select * into w from public.member_ai_wallets where user_id=p_user for update;
 if w.balance<amt then
  if not w.auto_topup then raise exception 'MEMBER_AI_POINTS_INSUFFICIENT'; end if;
  need:=amt-w.balance; times:=ceil(need/w.topup_points)::bigint;
  perform public._member_ai_move_in(p_user,times*w.topup_points,'auto_topup',p_request_id||':before');
  topped:=times*w.topup_points;
 end if;
 update public.member_ai_wallets set balance=balance-amt,updated_at=now() where user_id=p_user returning * into w;
 insert into public.member_ai_ledger(user_id,kind,ai_delta,points_delta,balance_after,description,request_id,detail)
  values(p_user,'usage',-amt,0,w.balance,coalesce(nullif(left(p_detail->>'title',200),''),'AI 查詢'),p_request_id,coalesce(p_detail,'{}'::jsonb)||jsonb_build_object('requested',p_amount::text,'cap',p_cap::text));
 after:=w.balance;
 -- 用完後低於門檻：再補一次（儲值點數不夠就不補，不影響這次扣點）
 if w.auto_topup and w.balance<w.topup_below and public._member_pool_balance(p_user,'stored')>=w.topup_points then
  after:=public._member_ai_move_in(p_user,w.topup_points,'auto_topup',p_request_id||':after'); topped:=topped+w.topup_points;
 end if;
 return jsonb_build_object('charged',amt::text,'ai_points',after::text,'topped_up',topped,'duplicate',false);
end $$;

-- 7. 兌換使用券：先扣任務點數，不夠再扣儲值點數
create or replace function public.exchange_member_points(p_exchange_id text,p_request_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); d public.member_exchange_definitions%rowtype; receipt public.member_point_exchanges%rowtype;
 task bigint; stored bigint; from_task bigint; reward uuid; event text;
begin
 if u is null then raise exception 'MEMBER_VERIFY_REQUIRED'; end if;
 if p_request_id is null then raise exception 'MEMBER_INPUT_INVALID'; end if;
 perform pg_advisory_xact_lock(hashtextextended('point-wallet:'||u,0));
 select * into receipt from public.member_point_exchanges where user_id=u and request_id=p_request_id;
 if found then
  if receipt.exchange_id<>p_exchange_id then raise exception 'MEMBER_INPUT_INVALID'; end if;
  return jsonb_build_object('reward_id',receipt.reward_id,'points',receipt.points,'duplicate',true);
 end if;
 select * into d from public.member_exchange_definitions where id=p_exchange_id and active;
 if not found then raise exception 'MEMBER_EXCHANGE_UNAVAILABLE'; end if;
 task:=public._member_pool_balance(u,'task'); stored:=public._member_pool_balance(u,'stored');
 if task+stored<d.points then raise exception 'MEMBER_POINTS_INSUFFICIENT'; end if;
 event:='points-exchange:'||u||':'||p_request_id;
 reward:=public._member_issue_voucher(u,d.voucher_definition,d.duration_days,event);
 from_task:=least(greatest(task,0),d.points);
 if from_task>0 then insert into public.member_point_ledger(user_id,description,points,source_event_key,pool) values(u,d.title,-from_task,event,'task'); end if;
 if d.points-from_task>0 then insert into public.member_point_ledger(user_id,description,points,source_event_key,pool) values(u,d.title,-(d.points-from_task),event||':stored','stored'); end if;
 insert into public.member_point_exchanges(user_id,request_id,exchange_id,reward_id,points) values(u,p_request_id,d.id,reward,d.points);
 return jsonb_build_object('reward_id',reward,'points',d.points,'duplicate',false);
end $$;

revoke all on function public.member_wallet_summary(),public.member_ai_convert(integer,uuid),public.member_ai_convert_back(integer,uuid),public.member_ai_update_settings(boolean,integer,numeric),public.member_ai_charge(uuid,text,numeric,numeric,jsonb),public.exchange_member_points(text,uuid) from public,anon,authenticated;
grant execute on function public.member_wallet_summary(),public.member_ai_convert(integer,uuid),public.member_ai_convert_back(integer,uuid),public.member_ai_update_settings(boolean,integer,numeric),public.exchange_member_points(text,uuid) to authenticated;
grant execute on function public.member_ai_charge(uuid,text,numeric,numeric,jsonb) to service_role;

do $$ begin
 if coalesce((select active from public.member_ai_settings where id),true) then raise exception 'AI point must start inactive'; end if;
 if exists(select 1 from public.member_point_ledger where pool<>'task' and source_event_key not like 'ai-%' and source_event_key not like 'points-exchange:%:stored' and source_event_key not like 'stored:%') then raise exception 'unexpected stored rows'; end if;
end $$;
commit;

-- 正式開放（另一步，需再次批准）：update public.member_ai_settings set active=true,updated_at=now();
-- 儲值開放後：update public.member_ai_settings set stored_enabled=true,updated_at=now();
-- 儲值入點請以 pool='stored'、source_event_key='stored:<訂單編號>' 寫入 member_point_ledger。
