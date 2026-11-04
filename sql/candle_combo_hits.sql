-- 2026-11-04 K棒組合 16 類命中紀錄（scripts/candle_combos.py 每晚重算最近 10 個交易日寫入）
-- 股名不重複存，查 security_master；組合中文名在前端對照。
-- 約 1.5 萬列（2024-07 起），每年約 +6,500 列，總量約 1～2 MB。
create table if not exists public.candle_combo_hits (
  code        text    not null,
  combo       text    not null,           -- 16 類代碼，例如 rising-three、reversal-doji
  start_date  date    not null,           -- 組合第一根
  end_date    date    not null,           -- 組合最後一根（完成日）
  liquid      boolean not null,           -- 篩選最低量：收盤≥100元需≥10萬股、<100元需≥50萬股；十字線免量
  primary key (code, combo, end_date),
  constraint candle_combo_hits_dates check (start_date <= end_date)
);
create index if not exists candle_combo_hits_end_idx on public.candle_combo_hits (end_date);

-- RLS：公開唯讀，只有 service_role（本機排程）可寫
alter table public.candle_combo_hits enable row level security;
drop policy if exists candle_combo_hits_read on public.candle_combo_hits;
create policy candle_combo_hits_read on public.candle_combo_hits for select to anon, authenticated using (true);
