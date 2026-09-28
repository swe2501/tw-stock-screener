-- 每日新聞原始來源（比照合夥人 /news）：中央社財經 RSS、Yahoo 股市 RSS、證交所新聞、MOPS 上市/上櫃重大訊息
-- 由 scripts/news_feed.py 每 4 小時 upsert；保留 30 天（約 150 則/日 × 1KB × 30 ≈ 4.5MB）
create table if not exists public.news_feed (
  id           text primary key,            -- 原文連結（去重鍵）
  title        text not null,
  link         text not null,
  published_at timestamptz not null,
  news_date    date not null,               -- 台灣日期
  description  text not null default '',
  source       text not null,
  tags         jsonb not null default '[]', -- 產業／關鍵字標籤
  codes        jsonb not null default '[]', -- [{code,name}] 標題/內文提到的上市櫃個股
  fetched_at   timestamptz not null default now()
);
create index if not exists idx_news_feed_date on public.news_feed (news_date desc, published_at desc);

alter table public.news_feed enable row level security;
drop policy if exists "news_feed read" on public.news_feed;
create policy "news_feed read" on public.news_feed for select using (true);
