-- 2026-11-01 正規化收尾（Claude Code，用戶批准「都刪掉」）
-- 1) 選股紀錄：member_screen_records.stocks（JSON）停用 → 明細 member_screen_record_items 為唯一來源
--    存檔／刪除／任務資格與進度／研究文件鏡像比對／會員匯出全部改讀明細；RPC 簽章與回傳格式不變（仍回 stocks，由明細重建）
-- 2) otc_names 表停用 → 主檔 security_master 不再以它為來源；同名改為唯讀 view（從主檔即時讀，不重複存資料），
--    舊版 prod 前端與 App 讀 otc_names 仍可用
-- 作法：以線上 pg_get_functiondef 為底做「計數比對」的文字替換（次數不符整批 rollback），不手抄整個函式。
-- 備份：_bak_20261101_* 三張表（RLS 開、無 policy，anon/authenticated 讀不到）＋本機 JSON。

begin;

create table public._bak_20261101_defs as
select p.oid::regprocedure::text as f, pg_get_functiondef(p.oid) as def
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname in ('save_member_screen_record','save_member_screen_record_v2','delete_member_screen_record',
  '_member_task_progress','_member_task_eligible','member_data_export_page','save_member_research_document','member_screen_calendar',
  'sync_member_screen_record_items','refresh_security_master');
create table public._bak_20261101_otc_names as table public.otc_names;
create table public._bak_20261101_screen_stocks as select id, user_id, stocks from public.member_screen_records;
alter table public._bak_20261101_defs enable row level security;
alter table public._bak_20261101_otc_names enable row level security;
alter table public._bak_20261101_screen_stocks enable row level security;
revoke all on public._bak_20261101_defs, public._bak_20261101_otc_names, public._bak_20261101_screen_stocks from public, anon, authenticated;

create function pg_temp.rep(src text, a text, b text, n int) returns text language plpgsql as $f$
declare c int := (length(src) - length(replace(src, a, ''))) / length(a);
begin
  if c <> n then raise exception 'REPLACE_COUNT % <> % : %', c, n, left(a, 80); end if;
  return replace(src, a, b);
end $f$;

do $mig$
declare d text;
begin
  -- 明細寫入函式：由原同步觸發器改寫成一般函式（同一套驗證與觀測名稱邏輯）
  d := pg_get_functiondef('public.sync_member_screen_record_items()'::regprocedure);
  d := pg_temp.rep(d, 'public.sync_member_screen_record_items()', 'public._member_screen_write_items(p_id uuid, p_stocks jsonb)', 1);
  d := pg_temp.rep(d, 'RETURNS trigger', 'RETURNS void', 1);
  d := pg_temp.rep(d, ' if new.deleted_at is not null then return new; end if;', '', 1);
  d := replace(d, 'new.stocks', 'p_stocks');
  d := replace(d, 'new.id', 'p_id');
  d := replace(d, 'return new;', 'return;');
  if d ~* '\mnew\.' then raise exception 'WRITE_ITEMS_LEFTOVER_NEW'; end if;
  execute d;

  -- 存檔 v1／v2：不再寫 stocks 欄位，改寫明細；回傳的 row 仍附 stocks（由明細重建）
  foreach d in array array['public.save_member_screen_record(uuid,date,jsonb,jsonb,jsonb,text)',
                           'public.save_member_screen_record_v2(uuid,date,date,jsonb,jsonb,jsonb,text)'] loop
    d := pg_get_functiondef(d::regprocedure);
    d := pg_temp.rep(d, 'conditions,stocks,note)', 'conditions,note)', 1);
    d := pg_temp.rep(d, 'p_conditions,p_stocks,coalesce(p_note', 'p_conditions,coalesce(p_note', 1);
    d := pg_temp.rep(d, 'returning * into r;', 'returning * into r; perform public._member_screen_write_items(r.id, p_stocks);', 1);
    d := pg_temp.rep(d, 'to_jsonb(r)-''user_id''-''request_id''',
      '((to_jsonb(r)-''user_id''-''request_id'')||jsonb_build_object(''stocks'',public.member_screen_normalized_stocks(r.id)))', 2);
    execute d;
  end loop;

  -- 刪除：不再清 stocks，改刪自己的明細
  d := pg_get_functiondef('public.delete_member_screen_record(uuid)'::regprocedure);
  d := pg_temp.rep(d, 'conditions=''[]'',stocks=''[]'',note=''''', 'conditions=''[]'',note=''''', 1);
  d := pg_temp.rep(d, 'and user_id=u and deleted_at is null;',
    'and user_id=u and deleted_at is null; delete from public.member_screen_record_items i using public.member_screen_records r where i.record_id=r.id and r.id=p_record_id and r.user_id=u;', 1);
  execute d;

  -- 任務資格／進度：「有股票」改看明細
  d := pg_get_functiondef('public._member_task_eligible(uuid,text)'::regprocedure);
  d := pg_temp.rep(d, 'jsonb_typeof(stocks)=''array'' and jsonb_array_length(stocks)>0',
    'exists(select 1 from public.member_screen_record_items i where i.record_id=member_screen_records.id)', 1);
  d := pg_temp.rep(d, 'jsonb_typeof(r.stocks)=''array'' and jsonb_array_length(r.stocks)>0',
    'exists(select 1 from public.member_screen_record_items i where i.record_id=r.id)', 1);
  execute d;
  d := pg_get_functiondef('public._member_task_progress(uuid,text,text)'::regprocedure);
  -- 進度函式裡有兩處：一處在 alias r 的查詢（策略數），一處沒有 alias（天數）
  d := pg_temp.rep(d, 'jsonb_typeof(stocks)=''array'' and jsonb_array_length(stocks)>0 and r.record_date',
    'exists(select 1 from public.member_screen_record_items i where i.record_id=r.id) and r.record_date', 1);
  d := pg_temp.rep(d, 'jsonb_typeof(stocks)=''array'' and jsonb_array_length(stocks)>0',
    'exists(select 1 from public.member_screen_record_items i where i.record_id=member_screen_records.id)', 1);
  execute d;

  -- 研究文件鏡像比對：r.stocks 改由明細重建
  d := pg_get_functiondef('public.save_member_research_document(text,bigint,jsonb)'::regprocedure);
  d := pg_temp.rep(d, 'r.stocks=', 'public.member_screen_normalized_stocks(r.id)=', 1);
  execute d;

  -- 會員匯出：選股紀錄改讀含明細的匯出 view
  d := pg_get_functiondef('public.member_data_export_page(text,uuid,timestamp with time zone)'::regprocedure);
  d := pg_temp.rep(d, '(''screens'',''member_screen_records'',''recorded_at'')', '(''screens'',''member_screen_records_export'',''recorded_at'')', 1);
  execute d;

  -- 主檔：拿掉 otc_names 來源（既有 2 檔由主檔保留；之後新上櫃股名由 upload_otc_names.py 直接寫主檔）
  d := pg_get_functiondef('public.refresh_security_master()'::regprocedure);
  d := regexp_replace(d, '\s*union all select code,name,''otc'',''stock'',''otc_names'',2 from public\.otc_names', '');
  if d ~ 'otc_names' then raise exception 'REFRESH_STILL_READS_OTC_NAMES'; end if;
  execute d;
end $mig$;

revoke all on function public._member_screen_write_items(uuid, jsonb) from public, anon, authenticated;

drop trigger member_screen_items_sync on public.member_screen_records;
drop function public.sync_member_screen_record_items();
alter table public.member_screen_records drop column stocks;
create view public.member_screen_records_export as
select r.*, public.member_screen_normalized_stocks(r.id) as stocks from public.member_screen_records r;
revoke all on public.member_screen_records_export from public, anon, authenticated;

drop table public.otc_names cascade;   -- 連同 security_master_otc_sync 觸發器
create view public.otc_names as
select code, current_name as name from public.security_master where market = 'otc' and instrument_type = 'stock';
revoke all on public.otc_names from public;
grant select on public.otc_names to anon, authenticated;

commit;

-- 已於 2026-11-01 套用（Supabase SQL editor）。套用前同內容 + 驗證 + rollback 試跑：
--   任務資格（全部會員 × screen_first/daily/weekly/twenty）新舊 0 差異；匯出 15 筆 stocks 與原 JSON 0 差異；
--   存檔 v2 寫 1 筆明細、回傳 row.stocks 1 筆；刪除後明細 0；otc_names view 897 檔。
-- 套用後：stocks 欄位 0、舊觸發器 0、refresh_security_master 不含 otc_names、anon 讀 otc_names view 200／897 檔，
--   member_screen_records、member_screen_records_export、_bak_* 對 anon 皆 401。
-- 還原：函式原文在 public._bak_20261101_defs（f, def 可直接 execute）；stocks 原 JSON 在 _bak_20261101_screen_stocks；
--   otc_names 原表在 _bak_20261101_otc_names；本機另有 D:\stock_data\db_backup_20261101\*.json（含會員資料，不進 Git）。
