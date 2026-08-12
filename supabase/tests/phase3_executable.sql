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

insert into auth.users(id,email) values
 ('00000000-0000-0000-0000-000000000001','admin@example.com'),('00000000-0000-0000-0000-000000000002','manager@example.com'),('00000000-0000-0000-0000-000000000003','staff@example.com'),('00000000-0000-0000-0000-000000000004','viewer@example.com'),('00000000-0000-0000-0000-000000000005','other@example.com');
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

-- Invitations are admin-only, idempotent, location-scoped, and accepted from a
-- fresh authenticated identity into exactly one membership and location link.
insert into auth.users(id,email) values('00000000-0000-0000-0000-000000000006','lead@example.com');
set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
select set_config('request.jwt.claims',jsonb_build_object('email','admin@example.com','iat',extract(epoch from now())::bigint)::text,false);
select public.admin_create_invitation('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','Lead@Example.com','bar_lead');
select public.admin_create_invitation('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','lead@example.com','bar_lead');
select test.assert((select count(*)=1 from public.admin_list_invitations('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001') where email='lead@example.com'),'duplicate invitation is idempotent');
reset role;
set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000006',false);
select set_config('request.jwt.claims',jsonb_build_object('email','lead@example.com','iat',extract(epoch from now()+interval '1 minute')::bigint)::text,false);
select test.assert(public.accept_access_invitation(),'new user accepts current invitation');
select test.assert(not public.accept_access_invitation(),'accepted invitation cannot be reused');
select test.assert((select count(*)=1 from public.memberships where user_id=auth.uid() and organization_id='10000000-0000-0000-0000-000000000001' and role='bar_lead'),'Bar Lead membership is unique and least privilege');
select test.assert((select count(*)=1 from public.location_memberships lm join public.memberships m on m.id=lm.membership_id where m.user_id=auth.uid() and lm.location_id='20000000-0000-0000-0000-000000000001'),'Bar Lead location membership is unique');
select public.save_profit_lab_recipe('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001',jsonb_build_object('name','Test Painkiller','target',18,'menuPrice',15,'ingredients',jsonb_build_array(jsonb_build_object('source','catalog','productName','Vodka','name','Vodka','amount',2,'unit','oz','unitCost',0.5)))) as profit_recipe_id \gset
select public.save_profit_lab_recipe('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001',jsonb_build_object('id',:'profit_recipe_id','name','Test Painkiller','target',20,'menuPrice',15,'ingredients',jsonb_build_array(jsonb_build_object('source','catalog','productName','Vodka','name','Vodka','amount',2,'unit','oz','unitCost',0.5))));
select test.assert((select count(*)=1 and max(version)=2 from public.list_profit_lab_recipes('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001') where name='Test Painkiller'),'Bar Lead creates and updates a shared Profit Lab recipe');
select test.assert(not has_table_privilege('authenticated','public.profit_lab_recipe_revisions','select,insert,update,delete'),'Profit Lab revision table stays private');
reset role;
select test.assert((select count(*)=2 from public.profit_lab_recipe_revisions where recipe_id=:'profit_recipe_id'),'Profit Lab saves immutable revision history');
-- Current Menu import accepts its narrow revision action, is atomic and repeatable,
-- and leaves a same-name manual recipe untouched.
insert into public.profit_lab_recipes(organization_id,location_id,name,target_cost_percent,menu_price,ingredients,status,created_by,updated_by)
values('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','Manual Conflict',18,12,'[{"name":"Vodka","amount":1,"unit":"oz","unitCost":0.5}]','Draft','00000000-0000-0000-0000-000000000006','00000000-0000-0000-0000-000000000006');
set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000006',false);
do $$declare before_count bigint; begin
  select count(*) into before_count from public.list_profit_lab_recipes('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001');
  begin
    perform public.import_profit_lab_current_menu('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001',jsonb_build_array(
      jsonb_build_object('sourceKey','fixture-valid','name','Fixture Valid','menuPrice',12,'ingredients',jsonb_build_array(jsonb_build_object('name','Vodka','amount',1,'unit','oz','unitCost',0.5))),
      jsonb_build_object('sourceKey','fixture-invalid','name','Fixture Invalid','menuPrice',12,'ingredients','[]'::jsonb)
    ),'fixture.xlsx','v-test');
  exception when others then null; end;
  perform test.assert((select count(*)=before_count from public.list_profit_lab_recipes('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001')),'Current Menu import is atomic');
end$$;
select test.assert((select added=1 and ignored=0 and collided=1 from public.import_profit_lab_current_menu('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001',jsonb_build_array(
  jsonb_build_object('sourceKey','fixture-menu','name','Fixture Menu','menuPrice',12,'ingredients',jsonb_build_array(jsonb_build_object('name','Vodka','amount',1,'unit','oz','unitCost',0.5))),
  jsonb_build_object('sourceKey','fixture-conflict','name','Manual Conflict','menuPrice',12,'ingredients',jsonb_build_array(jsonb_build_object('name','Vodka','amount',1,'unit','oz','unitCost',0.5)))
),'fixture.xlsx','v-test')),'Current Menu first import reports add and manual collision');
select test.assert((select added=0 and ignored=1 and collided=0 from public.import_profit_lab_current_menu('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001',jsonb_build_array(
  jsonb_build_object('sourceKey','fixture-menu','name','Fixture Menu','menuPrice',12,'ingredients',jsonb_build_array(jsonb_build_object('name','Vodka','amount',1,'unit','oz','unitCost',0.5)))
),'fixture.xlsx','v-test')),'Current Menu retry reports existing source');
select test.assert((select count(*)=1 from public.list_profit_lab_recipes('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001') where source_key='fixture-menu'),'Current Menu retry creates no duplicates');
select test.assert((select count(*)=1 from public.list_profit_lab_recipes('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001') where name='Manual Conflict' and source_key is null),'manual recipe conflict remains preserved');
reset role;
select test.assert((select count(*)=1 from public.profit_lab_recipe_revisions where action='current_menu_import' and snapshot->>'source_key'='fixture-menu'),'current_menu_import revision action is accepted');
do $$declare recipe uuid; begin select id into recipe from public.profit_lab_recipes where name='Test Painkiller'; begin insert into public.profit_lab_recipe_revisions(recipe_id,organization_id,location_id,version,snapshot,action,changed_by) values(recipe,'10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001',99,'{}','not_allowed','00000000-0000-0000-0000-000000000006'); raise exception 'invalid revision action unexpectedly accepted'; exception when check_violation then null; end; end$$;
select test.assert(true,'invalid revision action remains rejected');
set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000006',false);
do $$declare recipe uuid; begin begin perform public.list_profit_lab_recipes('10000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000002'); raise exception 'cross-tenant Profit Lab read unexpectedly succeeded'; exception when raise_exception then if sqlerrm='cross-tenant Profit Lab read unexpectedly succeeded' then raise; end if; end; select id into recipe from public.list_profit_lab_recipes('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001') where name='Test Painkiller'; begin perform public.delete_profit_lab_recipe('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001',recipe); raise exception 'Bar Lead Profit Lab delete unexpectedly succeeded'; exception when raise_exception then if sqlerrm='Bar Lead Profit Lab delete unexpectedly succeeded' then raise; end if; end; end$$;
reset role;
-- Transaction-wrapped Profit Lab supplier fixtures are provisioned by location triggers.
select test.assert((select count(*)=3 from public.profit_lab_ingredients where location_id='20000000-0000-0000-0000-000000000001' and key in ('lime-wedge','lemon-wedge','maraschino-cherry')),'required garnish presets seeded per location');
select test.assert((select package_case_price=111.44 and packages_per_case=4 and estimated_units_per_package=275 and preparation_yield=1 and result_kind='estimated' from public.profit_lab_ingredients where location_id='20000000-0000-0000-0000-000000000001' and key='maraschino-cherry'),'verified cherry packaging price and approximate yield retained');
select test.assert((select supplier_product_id='2605000' and package_case_price=69.17 and used_by=array['PP']::text[] from public.profit_lab_ingredients where location_id='20000000-0000-0000-0000-000000000001' and key='california-orange'),'whole-orange supplier value stays searchable outside its usual outlet');
set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000006',false);
select public.save_profit_lab_ingredient('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001',jsonb_build_object('id',(select id from public.list_profit_lab_ingredients('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001') where key='lime-wedge'),'packageCasePrice','80','packagesPerCase','1','estimatedUnitsPerPackage','200','preparationYield','8','wastePercent','20','resultKind','estimated','assumptionNote','fixture'));
select test.assert((select abs(cost_per_serving-0.0625)<0.000001 from public.list_profit_lab_ingredients('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001') where key='lime-wedge'),'waste-adjusted lime wedge cost is correct');
do $$begin begin perform public.list_profit_lab_ingredients('10000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000002'); raise exception 'cross-tenant ingredient read unexpectedly succeeded'; exception when raise_exception then if sqlerrm='cross-tenant ingredient read unexpectedly succeeded' then raise; end if; end; end$$;
reset role;
update public.legacy_order_references set organization_id='10000000-0000-0000-0000-000000000001',assigned_by='00000000-0000-0000-0000-000000000001',assigned_at=now() where legacy_order_id=(select min(legacy_order_id) from public.legacy_order_references);
set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000006',false);
select test.assert((select count(*)>0 from public.get_location_order_history('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001',60)),'Bar Lead reads assigned location history');
do $$begin begin perform public.get_location_order_history('10000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000002',60); raise exception 'cross-tenant history unexpectedly succeeded'; exception when raise_exception then if sqlerrm='cross-tenant history unexpectedly succeeded' then raise; end if; end; begin update public.orders set data='{}'::jsonb; raise exception 'historical mutation unexpectedly succeeded'; exception when insufficient_privilege then null; end; end$$;
insert into public.structured_orders(organization_id,location_id,vendor_id,workflow,created_by) values('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','bar',auth.uid());
select test.assert((select count(*)=1 from public.structured_orders where organization_id='10000000-0000-0000-0000-000000000001' and location_id='20000000-0000-0000-0000-000000000001'),'Bar Lead reads only authorized structured history');
do $$begin begin insert into public.inventory_baselines(organization_id,location_id,version,created_by) values('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001',99,auth.uid()); raise exception 'Bar Lead baseline insert unexpectedly succeeded'; exception when insufficient_privilege then null; end; begin perform public.admin_create_invitation('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','blocked@example.com','bar_lead'); raise exception 'Bar Lead administration unexpectedly succeeded'; exception when raise_exception then if sqlerrm='Bar Lead administration unexpectedly succeeded' then raise; end if; end; end$$;
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
