-- 大戶/散戶 週買賣超（Phase 2，2026-10-04）
-- 來源：TDCC 集保股權分散表(holding_distribution，週)＋ stock_daily 當週收盤(市值換算)。
-- 門檻（用戶 2026-10-03 定案，見 [[chip-dadou-sandou-thresholds]]）：
--   大戶 = 持股≥300張 或 市值≥3000萬 → 等效門檻股數 = min(300*1000, 30,000,000 / 收盤價)
--   散戶 = 持股<20張 或 市值<100萬 → 等效門檻股數 = max(20*1000, 1,000,000 / 收盤價)
--   跨門檻的 TDCC 級距用「均勻分布」線性內插（近似）。
-- 週增減(net) = 本週持股 − 上週持股，單位張。覆蓋：熱門前 300 檔。
-- 容量：300 檔 × ~52 週 ≈ 1.6 萬列，極小。
-- RLS：公開讀(anon)、僅 service_role 寫（與 inst_daily 一致）。
create table if not exists public.holder_flow (
  code         text not null,
  week_date    date not null,
  big_shares   bigint,     -- 大戶持股（股）
  retail_shares bigint,    -- 散戶持股（股）
  total_shares bigint,
  big_pct      numeric,    -- 大戶持股占比 %
  retail_pct   numeric,    -- 散戶持股占比 %
  big_net      integer,    -- 大戶 週增減（張，正=買超）
  retail_net   integer,    -- 散戶 週增減（張）
  close_px     numeric,    -- 當週收盤（市值換算用，參考）
  updated_at   timestamptz not null default now(),
  primary key (code, week_date)
);
create index if not exists holder_flow_date_idx on public.holder_flow(week_date);

alter table public.holder_flow enable row level security;
drop policy if exists holder_flow_read on public.holder_flow;
create policy holder_flow_read on public.holder_flow for select to anon, authenticated using (true);
revoke all on public.holder_flow from anon, authenticated;
grant select on public.holder_flow to anon, authenticated;
