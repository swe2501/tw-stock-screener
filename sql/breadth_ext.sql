-- 市場廣度延伸指標（騰落線／多空頭排列／市場寬度／新高-新低／站上均線家數），比照玩股網四分頁＋合夥人需求
-- 每日 × market(all 上市櫃 / tse 上市 / otc 上櫃) × etf(incl 含ETF / excl 扣ETF) 一列；scripts/breadth_ext.py 產出
-- 容量：約 530 交易日 × 6 ≈ 3,200 列，< 1MB
create table if not exists public.breadth_ext (
  trade_date  date not null,
  market      text not null,          -- all / tse / otc
  etf         text not null,          -- incl / excl
  universe    int,                    -- 當日有成交且有前收的家數
  up int, down int, flat int, up_limit int, down_limit int,
  red_k int, black_k int,             -- 收>開 / 收<開
  ma20_cnt int, ma60_cnt int, ma240_cnt int, both_cnt int,   -- 站上 20/60/240 日線家數；both＝同時站上 20 與 60
  ma20_base int, ma60_base int, ma240_base int, both_base int, -- 有足夠歷史可計算的家數（比例分母）
  bull_s int, bear_s int, base_s int, -- 短均線 5>10>20 多頭 / 5<10<20 空頭 / 可計算家數
  bull_l int, bear_l int, base_l int, -- 長均線 20>60>240 多頭 / 20<60<240 空頭 / 可計算家數
  new_high int, new_low int, base_hl int,  -- 52 週(252 交易日)收盤新高/新低
  taiex numeric, taiex_ex2330 numeric,     -- 加權指數收盤 / 扣除台積電估算指數
  updated_at timestamptz not null default now(),
  primary key (trade_date, market, etf)
);
alter table public.breadth_ext enable row level security;
drop policy if exists "breadth_ext read" on public.breadth_ext;
create policy "breadth_ext read" on public.breadth_ext for select using (true);
