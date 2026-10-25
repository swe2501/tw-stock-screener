-- 後台設定表（鍵值）：存算法公式總開關 algo_visible 與各公式 HTML（formula_*）
-- 僅 service_role 能讀寫（RLS 開、無 policy）；前端完全不碰，公式文字不落前端。
-- 已於 2026-10-24 在 Supabase SQL editor 執行。uat/prod 共用同一 Supabase。
create table if not exists public.admin_settings(
  key        text primary key,
  value      text,
  updated_at timestamptz not null default now()
);
alter table public.admin_settings enable row level security;

-- 可選：把程式內建預設公式 seed 進來（也可在後台「算法公式」分頁按一鍵 seed＝admin_seed_algo）。
-- insert into public.admin_settings(key,value) values ('algo_visible','false')
--   on conflict (key) do nothing;
