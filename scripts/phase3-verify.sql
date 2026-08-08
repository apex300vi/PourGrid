select count(*) as legacy_order_count from public.orders;
select count(*) as classified_legacy_count from public.legacy_order_references where classification='legacy_unassigned' and organization_id is null;
select md5(string_agg(id::text||':'||created_at::text||':'||data::text,'|' order by id)) as legacy_checksum from public.orders;
select b.location_id,b.item_id,b.quantity_units,coalesce(sum(m.quantity_units),0) reconstructed from public.location_inventory_balances b left join public.inventory_movements m using(location_id,item_id) group by b.location_id,b.item_id,b.quantity_units having b.quantity_units<>coalesce(sum(m.quantity_units),0);
select tablename,rowsecurity from pg_tables where schemaname='public' and tablename not in ('orders') order by tablename;
