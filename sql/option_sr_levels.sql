-- 選擇權支撐壓力改「OI 三層峰值」（2026-09-28）：每側三層明細＋參考價
alter table public.option_sr add column if not exists res_levels jsonb;   -- [{strike,oi,oi_delta,dist,pct,med_mult,reason}] 壓力 近→遠
alter table public.option_sr add column if not exists sup_levels jsonb;   -- 支撐 近→遠
alter table public.option_sr add column if not exists ref_price  numeric; -- 參考價（台指期 TX 近月一般盤結算價）
alter table public.option_sr add column if not exists ref_kind   text;    -- 參考價來源說明
