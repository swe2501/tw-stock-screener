-- 明燈與冥燈 Phase 1（2026-10-01）
-- mingdeng_calls：管理者登錄的「真人點名」（引擎原料）
-- mingdeng_scores：回測引擎算出的每位真人績效（神燈/冥燈天梯資料來源）
-- RLS：付費內容 → 僅 allowed_viewers 白名單(authenticated)可讀；寫入由管理者 token(calls)或 service_role(scores/engine)。
--      anon 完全不授權(不可讀不可寫)。容量：手動登錄，小量，無爆量風險。

-- ── 點名表 ──
create table if not exists public.mingdeng_calls (
  id          uuid primary key default gen_random_uuid(),
  person      text not null,              -- 真人/帳號名
  platform    text,                       -- 來源平台：youtube / 名嘴雜誌 / 社群大戶 / 國會大股東申報 ...
  code        text not null,              -- 股票代號
  call_date   date not null,              -- 點名日
  direction   text not null default 'long' check (direction in ('long','short')),  -- long=看多 short=看空
  source_url  text,                       -- 來源連結（選填）
  note        text,                       -- 備註（選填）
  created_by  text,                       -- 登錄者 email
  created_at  timestamptz not null default now()
);
create index if not exists mingdeng_calls_person_idx on public.mingdeng_calls(person);
create index if not exists mingdeng_calls_code_idx   on public.mingdeng_calls(code);

-- ── 績效表（引擎產出；PK=真人+方向）──
create table if not exists public.mingdeng_scores (
  person         text not null,
  direction      text not null default 'long',
  n              int,                      -- 已滿 20 交易日的有效樣本數
  win_rate       numeric,                  -- 看對率 %
  rev_win_rate   numeric,                  -- 反向勝率 %（=100-win_rate）
  avg_follow_ret numeric,                  -- 平均跟單報酬 %（看空=放空報酬）
  avg_mdd        numeric,                  -- 平均最大回撤 %
  buy_drop_rate  numeric,                  -- 一買即跌率 %
  label          text,                     -- 明燈 / 冥燈 / 觀察
  latest_date    date,                     -- 最近一次點名日
  updated_at     timestamptz not null default now(),
  primary key (person, direction)
);

-- ── RLS ──
alter table public.mingdeng_calls  enable row level security;
alter table public.mingdeng_scores enable row level security;

-- 白名單判斷：JWT email 在授權名單內（對應前端 index.html VIEWER_EMAILS；日後加人兩邊都要改）
-- 2026-10-01 改用自含 email 清單(不依賴 allowed_viewers 表結構)；若之後要單一來源可改回 (select email from allowed_viewers)
drop policy if exists mingdeng_calls_read  on public.mingdeng_calls;
drop policy if exists mingdeng_calls_write on public.mingdeng_calls;
drop policy if exists mingdeng_calls_del   on public.mingdeng_calls;
create policy mingdeng_calls_read  on public.mingdeng_calls for select to authenticated
  using ( (auth.jwt() ->> 'email') in ('swe250165@gmail.com','qa5518556130@gmail.com','wenpin0617@gmail.com') );
create policy mingdeng_calls_write on public.mingdeng_calls for insert to authenticated
  with check ( (auth.jwt() ->> 'email') in ('swe250165@gmail.com','qa5518556130@gmail.com','wenpin0617@gmail.com') );
create policy mingdeng_calls_del   on public.mingdeng_calls for delete to authenticated
  using ( (auth.jwt() ->> 'email') in ('swe250165@gmail.com','qa5518556130@gmail.com','wenpin0617@gmail.com') );

drop policy if exists mingdeng_scores_read on public.mingdeng_scores;
create policy mingdeng_scores_read on public.mingdeng_scores for select to authenticated
  using ( (auth.jwt() ->> 'email') in ('swe250165@gmail.com','qa5518556130@gmail.com','wenpin0617@gmail.com') );

-- ── 權限：anon 不給任何權；authenticated 讀(+calls 可增刪)；service_role 由預設全權(引擎寫 scores) ──
revoke all on public.mingdeng_calls  from anon;
revoke all on public.mingdeng_scores from anon;
grant select, insert, delete on public.mingdeng_calls to authenticated;
grant select on public.mingdeng_scores to authenticated;
