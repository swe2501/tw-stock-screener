-- 2026-11-05 單根 K 棒訊號（scripts/candle_combos.py 每晚重算最近 10 個交易日寫入）
-- 跟 candle_combo_hits 分表：舊版前端不認得這些代碼，混在一起會把每根訊號畫成黃框。
-- 十字線沿用 candle_combo_hits 的 reversal-doji，不另存。股名查 security_master。
-- 約 18 萬列（2024-07 起），每年約 +7.7 萬列；以現有表換算每列約 0.2 KB → 約 38 MB（資料庫 273 MB／上限 500 MB）。
create table if not exists public.candle_signal_hits (
  code        text not null,
  signal      text not null,   -- long-lower-3/5、long-upper-3/5、one-line、spinning-top、candle-sell、gravestone、hanging-man、hanging-man-main、hanging-man-retail
  start_date  date not null,   -- 訊號那根（吊人線確認列＝吊人線那天）
  end_date    date not null,   -- 標示日（吊人線確認列＝確認那天；其他＝start_date）
  primary key (code, signal, start_date),
  constraint candle_signal_hits_dates check (start_date <= end_date)
);
create index if not exists candle_signal_hits_end_idx on public.candle_signal_hits (end_date);

-- RLS：公開唯讀，只有 service_role（本機排程）可寫
alter table public.candle_signal_hits enable row level security;
drop policy if exists candle_signal_hits_read on public.candle_signal_hits;
create policy candle_signal_hits_read on public.candle_signal_hits for select to anon, authenticated using (true);
