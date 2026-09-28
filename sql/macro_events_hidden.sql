-- 總經事件「移除」：管理員（籌碼會員）可隱藏已公開事件（高重要度或已列上），可還原。2026-09-28
alter table public.macro_events add column if not exists hidden    boolean not null default false;
alter table public.macro_events add column if not exists hidden_by text;
alter table public.macro_events add column if not exists hidden_at timestamptz;
-- 若既有更新權限是「欄位級」授權，補上新欄位（表級授權時此行無副作用）
grant update (hidden, hidden_by, hidden_at) on public.macro_events to authenticated;
