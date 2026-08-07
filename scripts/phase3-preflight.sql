select count(*) as legacy_order_count from public.orders;
select md5(string_agg(id::text||':'||created_at::text||':'||data::text,'|' order by id)) as legacy_checksum from public.orders;
select column_name,data_type,is_nullable from information_schema.columns where table_schema='public' and table_name='orders' order by ordinal_position;
