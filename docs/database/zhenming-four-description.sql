-- Preserve the strategy description privately in the existing RLS-protected admin_settings.
-- Run with an authorized database administrator; no schema/RLS changes.
insert into public.admin_settings(key,value,updated_at)
values (
  'strategy_zhenming4_description',
  $description$首根紅 K 實體至少 3%；首根成交量至少為前 5／10 日均量較高者的 1.5 倍（不含當日）。成交量連續遞增 2～3 根，後續紅黑 K 都計入。量縮後 12 個交易日內，當日最低價同時守住最後出量 K 棒低點與當日五日線即可篩出。
跌破時剔除；期限內重新站回可再篩入，期限不重算。以量縮首日為第 1 天。本項比對量價條件，整理位置仍需看圖確認。$description$,
  now()
)
on conflict (key) do update set value=excluded.value,updated_at=excluded.updated_at;
