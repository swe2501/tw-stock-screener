-- 後台會員等級（管理員授權）＋ VIP（先見領航員）可讀主力資料
-- 走 option(a)：後台改等級＝寫一筆持久化 member_tiers（真正的權益，非僅 metadata）。
-- 與合夥人券系統（member_feature_access）並存，前端取兩者最高為有效等級。
-- 主力 RLS 為 additive：只新增「tier=vip 可 select」，不動合夥人既有 owner 政策。
-- 等級代碼照 docs/database/member-voucher-levels.sql。uat/prod 共用同一 Supabase。

create table if not exists public.member_tiers(
  user_id uuid primary key references auth.users(id) on delete cascade,
  tier    text not null default 'free' check(tier in ('free','observation','research','advanced','vip')),
  set_by  text,
  set_at  timestamptz not null default now()
);
alter table public.member_tiers enable row level security;
drop policy if exists member_tiers_self on public.member_tiers;
create policy member_tiers_self on public.member_tiers for select using (auth.uid() = user_id);
grant select on public.member_tiers to authenticated;

drop policy if exists broker_trades_vip_read on public.broker_trades;
create policy broker_trades_vip_read on public.broker_trades for select using (exists(select 1 from public.member_tiers m where m.user_id = auth.uid() and m.tier = 'vip'));
drop policy if exists broker_rankings_vip_read on public.broker_rankings;
create policy broker_rankings_vip_read on public.broker_rankings for select using (exists(select 1 from public.member_tiers m where m.user_id = auth.uid() and m.tier = 'vip'));
drop policy if exists broker_streaks_vip_read on public.broker_streaks;
create policy broker_streaks_vip_read on public.broker_streaks for select using (exists(select 1 from public.member_tiers m where m.user_id = auth.uid() and m.tier = 'vip'));
drop policy if exists broker_highwin_vip_read on public.broker_highwin;
create policy broker_highwin_vip_read on public.broker_highwin for select using (exists(select 1 from public.member_tiers m where m.user_id = auth.uid() and m.tier = 'vip'));
drop policy if exists broker_sell_alerts_vip_read on public.broker_sell_alerts;
create policy broker_sell_alerts_vip_read on public.broker_sell_alerts for select using (exists(select 1 from public.member_tiers m where m.user_id = auth.uid() and m.tier = 'vip'));
