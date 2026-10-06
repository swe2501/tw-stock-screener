-- 美國公債殖利率曲線（美債對標模組用）（2026-10-06）
-- 來源：U.S. Department of the Treasury — Daily Treasury Par Yield Curve Rates（官方 XML，免金鑰）
--   https://home.treasury.gov/resource-center/data-chart-center/interest-rates/pages/xml?data=daily_treasury_yield_curve&field_tdr_date_value=YYYY
-- 由 scripts/ust_yields_push.py 每日抓最新交易日存入。容量：每日 1 列、約 12 欄，極小。
-- RLS：公開資訊 → anon 可讀；僅 service_role 寫。
create table if not exists public.ust_yields (
  trade_date date primary key,
  m1  numeric, m3  numeric, m6  numeric,
  y1  numeric, y2  numeric, y3  numeric, y5 numeric, y7 numeric,
  y10 numeric, y20 numeric, y30 numeric,
  updated_at timestamptz not null default now()
);
alter table public.ust_yields enable row level security;
drop policy if exists ust_yields_read on public.ust_yields;
create policy ust_yields_read on public.ust_yields for select to anon, authenticated using (true);
revoke all on public.ust_yields from anon, authenticated;
grant select on public.ust_yields to anon, authenticated;
