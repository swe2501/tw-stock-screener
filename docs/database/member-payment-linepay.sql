-- 2026-11-08 會員方案付款（LINE Pay 測試環境第一階段）
-- 先套用 member-membership-lifecycle.sql（member_subscription_periods），再套用本檔。
-- 只新增／放寬，不改既有資料；member_payment_orders 套用時為空表。
-- 正式價格未定：只放 4 個 sandbox_only 測試方案（30 天、10～40 元），正式站不會用到。
begin;

-- ── 價格表：付款時後端只認這裡的價格，不信任網頁送來的金額 ──
create table if not exists public.member_plans(
 plan_code text primary key check(plan_code ~ '^[a-z0-9_]{3,40}$'),
 tier text not null check(tier in ('observation','research','advanced','vip')),
 days int not null check(days between 1 and 400),
 price_twd int not null check(price_twd between 1 and 100000),
 label text not null check(length(label) between 1 and 60),
 active boolean not null default false,
 sandbox_only boolean not null default true,   -- true：只在 LINE Pay 測試環境可購買
 updated_at timestamptz not null default now()
);
alter table public.member_plans enable row level security;
revoke all on public.member_plans from public,anon,authenticated;
grant select,insert,update on public.member_plans to service_role;

insert into public.member_plans(plan_code,tier,days,price_twd,label,active,sandbox_only) values
 ('observation_30d_test','observation',30,10,'市場觀察員 30 天（測試）',true,true),
 ('research_30d_test','research',30,20,'研究員 30 天（測試）',true,true),
 ('advanced_30d_test','advanced',30,30,'進階 30 天（測試）',true,true),
 ('vip_30d_test','vip',30,40,'VIP 30 天（測試）',true,true)
on conflict (plan_code) do nothing;

-- ── 訂單：擴充合夥人 member_payment_orders（原為儲值點數），一本帳記全站付款 ──
alter table public.member_payment_orders
 add column if not exists kind text not null default 'stored_points',
 add column if not exists plan_code text references public.member_plans(plan_code),
 add column if not exists provider text,
 add column if not exists provider_env text,
 add column if not exists provider_txn_id text,
 add column if not exists period_id bigint references public.member_subscription_periods(id),
 add column if not exists failure_code text,
 add column if not exists updated_at timestamptz not null default now();
alter table public.member_payment_orders alter column points drop not null;
alter table public.member_payment_orders drop constraint if exists member_payment_orders_kind_check;
alter table public.member_payment_orders add constraint member_payment_orders_kind_check check(kind in ('stored_points','membership'));
alter table public.member_payment_orders drop constraint if exists member_payment_orders_provider_env_check;
alter table public.member_payment_orders add constraint member_payment_orders_provider_env_check check(provider_env is null or provider_env in ('sandbox','production'));
-- 儲值單一定有點數、沒有方案；會員方案單一定有方案、沒有點數
alter table public.member_payment_orders drop constraint if exists member_payment_orders_kind_shape;
alter table public.member_payment_orders add constraint member_payment_orders_kind_shape check(
 (kind='stored_points' and points is not null and plan_code is null) or
 (kind='membership' and plan_code is not null and points is null and provider is not null and provider_env is not null));
-- 同一筆 LINE Pay 交易只能對到一張訂單；同一段已付款期間只能對到一張訂單
create unique index if not exists member_payment_orders_provider_txn on public.member_payment_orders(provider,provider_txn_id) where provider_txn_id is not null;
create unique index if not exists member_payment_orders_period on public.member_payment_orders(period_id) where period_id is not null;
create index if not exists member_payment_orders_user_created on public.member_payment_orders(user_id,created_at desc);

commit;
