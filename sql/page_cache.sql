-- page_cache：前一晚先算好的整頁資料（產業地圖 sectors／題材列表 themes），前端直接讀，不必等後端現算。
-- 容量：每個 kind 只有 1 列、每日覆寫（約 60~80 KB／列），總量固定在 200 KB 以內，不會隨時間成長。
create table if not exists public.page_cache (
  kind        text primary key,
  trade_date  date,
  payload     jsonb not null,
  updated_at  timestamptz not null default now()
);
alter table public.page_cache enable row level security;
drop policy if exists page_cache_read on public.page_cache;
create policy page_cache_read on public.page_cache for select to anon, authenticated using (true);
-- 寫入只走 service_role（本機排程 scripts/page_cache_push.py），不開放 anon 寫入。
