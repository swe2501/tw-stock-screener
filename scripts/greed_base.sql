-- greed_base:每日全市場「基礎貪婪分」快照(compute_greed.py 每日覆蓋)
create table if not exists public.greed_base (
  code            text primary key,
  base            int  not null,           -- 0~100 基礎分
  price_score     int,                     -- 價格延伸度(30%)
  momentum_score  int,                     -- 動能與強弱(25%)
  volume_score    int,                     -- 量能與投機(25%)
  chip_score      int,                     -- 籌碼擁擠度(20%)
  exhaust         boolean default false,   -- 利多出盡⚠️(Q8)
  data_date       text,                    -- 資料日
  updated_at      timestamptz default now()
);
alter table public.greed_base enable row level security;
drop policy if exists greed_base_read on public.greed_base;
create policy greed_base_read on public.greed_base for select using (true);   -- 匿名可讀
