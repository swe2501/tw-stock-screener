-- 籌碼對比柱狀圖：三大法人每日淨買賣超（逐日單檔歷史）（2026-10-03）
-- 來源：本機 institutional_trades（TWSE/TPEx T86 三大法人日報）→ 每日由 scripts/inst_daily_push.py 推送
-- 單位：張（本機 net_shares 股 ÷1000 四捨五入）
-- 保留：滾動最近 120 交易日（約 6 個月，對齊 3mo/6mo 日K 視窗）；推送時刪除更舊列
-- 容量估算：2421 檔 × 120 日 ≈ 29 萬列，每列約 95 bytes（含 PK 索引）≈ ~28 MB
-- RLS：三大法人為公開資訊 → anon 可讀（與 institutional_flow 一致）；寫入僅 service_role（引擎）。

create table if not exists public.inst_daily (
  code        text not null,
  trade_date  date not null,
  foreign_net int,          -- 外資（含外資自營）淨買賣超（張，正=買超）
  trust_net   int,          -- 投信 淨買賣超（張）
  dealer_net  int,          -- 自營商合計 淨買賣超（張）
  total_net   int,          -- 三大法人合計 淨買賣超（張）
  updated_at  timestamptz not null default now(),
  primary key (code, trade_date)
);
create index if not exists inst_daily_date_idx on public.inst_daily(trade_date);

-- ── RLS：公開讀、僅 service_role 寫 ──
alter table public.inst_daily enable row level security;
drop policy if exists inst_daily_read on public.inst_daily;
create policy inst_daily_read on public.inst_daily for select to anon, authenticated using (true);
-- 不建立任何 anon/authenticated 的 insert/update/delete policy → 前端無法寫；service_role 繞過 RLS 由引擎寫入。

revoke all on public.inst_daily from anon, authenticated;
grant select on public.inst_daily to anon, authenticated;
