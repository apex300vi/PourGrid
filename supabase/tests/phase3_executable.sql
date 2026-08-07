\set ON_ERROR_STOP on
create function test.assert(ok boolean,message text) returns void language plpgsql as $$begin if not coalesce(ok,false) then raise exception 'ASSERTION FAILED: %',message; end if; end$$;
grant usage on schema test to authenticated;
grant execute on function test.assert(boolean,text) to authenticated;
select test.assert((select row_count=33 from test.legacy_before),'bootstrap has 33 legacy rows');
select test.assert((select b.row_count=count(*) and b.checksum=md5(string_agg(o.id::text||':'||o.created_at::text||':'||o.data::text,'|' order by o.id)) from test.legacy_before b cross join public.orders o group by b.row_count,b.checksum),'legacy rows and JSON preserved');
select test.assert((select count(*)=33 from public.legacy_order_references where classification='legacy_unassigned' and organization_id is null),'legacy rows quarantined');
select test.assert(not has_table_privilege('anon','public.orders','select') and not has_table_privilege('anon','public.structured_orders','select'),'anonymous privileges denied');
select test.assert(not has_table_privilege('authenticated','public.inventory_movements','insert,update,delete'),'movement writes denied');
select test.assert(not has_table_privilege('authenticated','public.audit_events','insert,update,delete'),'audit writes denied');
select test.assert(not has_function_privilege('authenticated','public.apply_movement_balance()','execute'),'trigger helper not executable');
select test.assert(not has_function_privilege('authenticated','public.block_immutable_change()','execute'),'immutability helper not executable');
select test.assert(has_function_privilege('authenticated','public.finalize_receiving(uuid)','execute'),'finalize RPC narrowly granted');
select test.assert((select proconfig @> array['search_path=pg_catalog, public, pg_temp'] or proconfig @> array['search_path=pg_catalog,public,pg_temp'] from pg_proc where oid='public.finalize_receiving(uuid)'::regprocedure),'safe finalize search_path');
select test.assert(not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('admin_upsert_membership','approve_receiving_exception','finalize_baseline','finalize_receiving','approve_reconciliation') and (not p.prosecdef or not (p.proconfig @> array['search_path=pg_catalog, public, pg_temp'] or p.proconfig @> array['search_path=pg_catalog,public,pg_temp']))),'all privileged RPCs are security definer with safe search_path');
select test.assert(not has_function_privilege('authenticated','public.enforce_phase3_workflow()','execute'),'workflow trigger helper not executable');

insert into auth.users(id) values
 ('00000000-0000-0000-0000-000000000001'),('00000000-0000-0000-0000-000000000002'),('00000000-0000-0000-0000-000000000003'),('00000000-0000-0000-0000-000000000004'),('00000000-0000-0000-0000-000000000005');
insert into public.profiles(id,display_name) select id,'test' from auth.users;
insert into public.organizations(id,name) values('10000000-0000-0000-0000-000000000001','Sapphire Beach Bar'),('10000000-0000-0000-0000-000000000002','Other Tenant');
insert into public.locations(id,organization_id,name) values('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','Main'),('20000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000002','Other'),('20000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000001','Private storage');
insert into public.memberships(id,organization_id,user_id,role) values
 ('30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','administrator'),
 ('30000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','manager'),
 ('30000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000003','inventory_staff'),
 ('30000000-0000-0000-0000-000000000004','10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000004','read_only_viewer'),
 ('30000000-0000-0000-0000-000000000005','10000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000005','administrator');
insert into public.location_memberships(membership_id,location_id,organization_id) values
 ('30000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001'),
 ('30000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001'),
 ('30000000-0000-0000-0000-000000000003','20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001'),
 ('30000000-0000-0000-0000-000000000004','20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001'),
 ('30000000-0000-0000-0000-000000000005','20000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000002');
insert into public.vendors(id,organization_id,name,workflow) values('40000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','Bellows','bar'),('40000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000002','Other Vendor','bar');
insert into public.inventory_items(id,organization_id,name,workflow,units_per_package) values
 ('50000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','Vodka','bar',12),
 ('50000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','Gin','bar',6),
 ('50000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000001','Juice','merchants',8),
 ('50000000-0000-0000-0000-000000000004','10000000-0000-0000-0000-000000000002','Other Item','bar',12);

-- Explicit role boundaries: administrators manage organization/membership,
-- managers manage catalog data, while staff cannot invoke administration RPCs.
set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
update public.organizations set name='Sapphire Beach Bar Verified' where id='10000000-0000-0000-0000-000000000001';
select test.assert((select name='Sapphire Beach Bar Verified' from public.organizations where id='10000000-0000-0000-0000-000000000001'),'administrator can update own organization');
select test.assert(public.admin_upsert_membership('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000004','read_only_viewer','20000000-0000-0000-0000-000000000001')='30000000-0000-0000-0000-000000000004','administrator can manage membership');
do $$begin begin perform public.admin_upsert_membership('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000004','read_only_viewer','20000000-0000-0000-0000-000000000002'); raise exception 'cross-tenant location assignment unexpectedly succeeded'; exception when raise_exception then if sqlerrm='cross-tenant location assignment unexpectedly succeeded' then raise; end if; end; end$$;
reset role;
set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false);
update public.vendors set name='Bellows Verified' where id='40000000-0000-0000-0000-000000000001';
select test.assert((select name='Bellows Verified' from public.vendors where id='40000000-0000-0000-0000-000000000001'),'manager can manage catalog');
reset role;
set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',false);
do $$begin begin perform public.admin_upsert_membership('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000004','read_only_viewer','20000000-0000-0000-0000-000000000001'); raise exception 'staff administration unexpectedly succeeded'; exception when raise_exception then if sqlerrm='staff administration unexpectedly succeeded' then raise; end if; end; end$$;
reset role;

set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',false);
select test.assert((select count(*)=1 from public.organizations),'staff sees own organization only');
select test.assert((select count(*)=1 from public.locations),'staff sees own location only');
do $$begin begin insert into public.structured_orders(id,organization_id,location_id,vendor_id,workflow,created_by) values(gen_random_uuid(),'10000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000002','40000000-0000-0000-0000-000000000002','bar',auth.uid()); raise exception 'cross tenant insert unexpectedly succeeded'; exception when insufficient_privilege then null; end; end$$;
do $$begin begin insert into public.structured_orders(id,organization_id,location_id,vendor_id,workflow,created_by) values(gen_random_uuid(),'10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000003','40000000-0000-0000-0000-000000000001','bar',auth.uid()); raise exception 'cross location insert unexpectedly succeeded'; exception when insufficient_privilege then null; end; end$$;
do $$begin begin insert into public.structured_orders(id,organization_id,location_id,vendor_id,workflow,created_by) values(gen_random_uuid(),'10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','merchants',auth.uid()); raise exception 'vendor workflow mismatch unexpectedly succeeded'; exception when raise_exception then if sqlerrm='vendor workflow mismatch unexpectedly succeeded' then raise; end if; end; end$$;
do $$begin begin insert into public.inventory_movements(organization_id,location_id,item_id,workflow,kind,quantity_units,source_table,source_id,created_by) values('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001','bar','receipt',1,'bypass',gen_random_uuid(),auth.uid()); raise exception 'direct movement insert unexpectedly succeeded'; exception when insufficient_privilege then null; end; begin insert into public.audit_events(organization_id,location_id,actor_id,event_type,entity_table) values('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001',auth.uid(),'bypass','test'); raise exception 'direct audit insert unexpectedly succeeded'; exception when insufficient_privilege then null; end; end$$;
reset role;

set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',false);
select test.assert((select count(*)=1 from public.organizations),'viewer can read authorized organization');
do $$begin begin insert into public.structured_orders(organization_id,location_id,vendor_id,workflow,created_by) values('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','bar',auth.uid()); raise exception 'viewer insert unexpectedly succeeded'; exception when insufficient_privilege then null; end; end$$;
reset role;

-- Staff creates baseline/count via WITH CHECK; only manager can finalize it.
set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',false);
insert into public.inventory_baselines(id,organization_id,location_id,version,created_by) values('60000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001',1,auth.uid());
insert into public.inventory_baseline_lines(id,baseline_id,organization_id,location_id,item_id,counted_units) values
 ('61000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001',0),
 ('61000000-0000-0000-0000-000000000002','60000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000002',5);
do $$begin begin perform public.finalize_baseline('60000000-0000-0000-0000-000000000001'); raise exception 'staff finalized baseline'; exception when raise_exception then if sqlerrm='staff finalized baseline' then raise; end if; end; end$$;
reset role;
set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false); select public.finalize_baseline('60000000-0000-0000-0000-000000000001'); reset role;
select test.assert((select status='finalized' from public.inventory_baselines where id='60000000-0000-0000-0000-000000000001'),'manager finalized baseline');
select test.assert((select quantity_units=0 from public.location_inventory_balances where item_id='50000000-0000-0000-0000-000000000001'),'zero baseline recorded');

-- A replacement baseline must create a balance for a newly introduced item.
set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',false);
insert into public.inventory_baselines(id,organization_id,location_id,version,created_by) values('60000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001',2,auth.uid());
insert into public.inventory_baseline_lines(id,baseline_id,organization_id,location_id,item_id,counted_units) values('61000000-0000-0000-0000-000000000003','60000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000003',7);
reset role;
set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false); select public.finalize_baseline('60000000-0000-0000-0000-000000000002'); reset role;
select test.assert((select quantity_units=7 from public.location_inventory_balances where location_id='20000000-0000-0000-0000-000000000001' and item_id='50000000-0000-0000-0000-000000000003'),'replacement baseline creates missing item balance');
select test.assert((select kind='correction' and quantity_units=7 from public.inventory_movements where source_id='61000000-0000-0000-0000-000000000003'),'replacement baseline records compensating movement for new item');

-- Partial then remaining receipt. 1 package is exactly 12 units.
set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',false);
insert into public.structured_orders(id,organization_id,location_id,vendor_id,workflow,status,submitted_at,created_by) values('70000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','bar','submitted',now(),auth.uid());
reset role;
insert into public.order_lines(id,order_id,organization_id,location_id,item_id,draft_units,submitted_units,expected_units,units_per_package) values('71000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001',24,24,24,12);
set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',false);
insert into public.receiving_sessions(id,organization_id,location_id,order_id,workflow,created_by) values('72000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000001','bar',auth.uid());
insert into public.receiving_lines(id,session_id,order_line_id,organization_id,location_id,order_id,received_packages,received_loose_units,units_per_package) values('73000000-0000-0000-0000-000000000001','72000000-0000-0000-0000-000000000001','71000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000001',1,0,12);
select test.assert((select received_units=12 from public.receiving_lines where id='73000000-0000-0000-0000-000000000001'),'package conversion generated 12 units');
select public.finalize_receiving('72000000-0000-0000-0000-000000000001');
select public.finalize_receiving('72000000-0000-0000-0000-000000000001');
reset role;
select test.assert((select status='partially_received' from public.structured_orders where id='70000000-0000-0000-0000-000000000001'),'partial receipt visible');
select test.assert((select received_units=12 from public.order_lines where id='71000000-0000-0000-0000-000000000001'),'partial quantity applied once');
select test.assert((select count(*)=1 from public.inventory_movements where source_id='73000000-0000-0000-0000-000000000001'),'duplicate finalization idempotent');

set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',false);
insert into public.receiving_sessions(id,organization_id,location_id,order_id,workflow,created_by) values('72000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000001','bar',auth.uid());
insert into public.receiving_lines(id,session_id,order_line_id,organization_id,location_id,order_id,received_packages,received_loose_units,units_per_package) values('73000000-0000-0000-0000-000000000002','72000000-0000-0000-0000-000000000002','71000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000001',0,12,12);
select public.finalize_receiving('72000000-0000-0000-0000-000000000002'); reset role;
select test.assert((select status='received' from public.structured_orders where id='70000000-0000-0000-0000-000000000001'),'multiple sessions complete order');
select test.assert((select received_units=24 from public.order_lines where id='71000000-0000-0000-0000-000000000001'),'remaining quantity applied');

-- Substitution plus over-receipt needs both approvals.
insert into public.structured_orders(id,organization_id,location_id,vendor_id,workflow,status,submitted_at,created_by) values('70000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','bar','submitted',now(),'00000000-0000-0000-0000-000000000003');
insert into public.order_lines(id,order_id,organization_id,location_id,item_id,draft_units,submitted_units,expected_units,units_per_package) values('71000000-0000-0000-0000-000000000002','70000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001',6,6,6,12);
insert into public.receiving_sessions(id,organization_id,location_id,order_id,workflow,created_by) values('72000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000002','bar','00000000-0000-0000-0000-000000000003');
insert into public.receiving_lines(id,session_id,order_line_id,organization_id,location_id,order_id,received_packages,received_loose_units,units_per_package,substitution_item_id) values('73000000-0000-0000-0000-000000000003','72000000-0000-0000-0000-000000000003','71000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000002',0,8,6,'50000000-0000-0000-0000-000000000002');
insert into public.approved_exceptions(id,organization_id,location_id,receiving_line_id,exception_type,reason,requested_by) values
 ('74000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','73000000-0000-0000-0000-000000000003','substitution','vendor replacement','00000000-0000-0000-0000-000000000003'),
 ('74000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','73000000-0000-0000-0000-000000000003','over_receipt','sealed package','00000000-0000-0000-0000-000000000003');
set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false); select public.approve_receiving_exception('74000000-0000-0000-0000-000000000001',true); select public.approve_receiving_exception('74000000-0000-0000-0000-000000000002',true); reset role;
set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',false); select public.finalize_receiving('72000000-0000-0000-0000-000000000003'); reset role;
select test.assert((select quantity_units=8 and item_id='50000000-0000-0000-0000-000000000002' from public.inventory_movements where source_id='73000000-0000-0000-0000-000000000003'),'approved substitution and over-receipt applied');

-- Reconciliation and compensating correction.
insert into public.reconciliation_requests(id,organization_id,location_id,item_id,workflow,requested_adjustment_units,reason,requested_by) values('80000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001','bar',-2,'breakage','00000000-0000-0000-0000-000000000003');
set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false); select public.approve_reconciliation('80000000-0000-0000-0000-000000000001',true); reset role;
select test.assert((select status='approved' from public.reconciliation_requests where id='80000000-0000-0000-0000-000000000001'),'manager approved reconciliation');
select test.assert(not exists(select 1 from public.location_inventory_balances b left join (select location_id,item_id,sum(quantity_units) quantity_units from public.inventory_movements group by location_id,item_id) m using(location_id,item_id) where b.quantity_units<>coalesce(m.quantity_units,0)),'balances reconstruct from movements');
do $$begin begin update public.inventory_movements set quantity_units=999 where id=(select id from public.inventory_movements limit 1); raise exception 'movement update succeeded'; exception when raise_exception then if sqlerrm='movement update succeeded' then raise; end if; end; begin delete from public.audit_events; raise exception 'audit delete succeeded'; exception when raise_exception then if sqlerrm='audit delete succeeded' then raise; end if; end; end$$;

-- Prepare one session for the external two-client concurrency test.
insert into public.structured_orders(id,organization_id,location_id,vendor_id,workflow,status,submitted_at,created_by) values('70000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','bar','submitted',now(),'00000000-0000-0000-0000-000000000003');
insert into public.order_lines(id,order_id,organization_id,location_id,item_id,draft_units,submitted_units,expected_units,units_per_package) values('71000000-0000-0000-0000-000000000003','70000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001',1,1,1,12);
insert into public.receiving_sessions(id,organization_id,location_id,order_id,workflow,created_by) values('72000000-0000-0000-0000-000000000004','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000003','bar','00000000-0000-0000-0000-000000000003');
insert into public.receiving_lines(id,session_id,order_line_id,organization_id,location_id,order_id,received_packages,received_loose_units,units_per_package) values('73000000-0000-0000-0000-000000000004','72000000-0000-0000-0000-000000000004','71000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000003',0,1,12);
select 'phase3 executable database verification passed' result;
