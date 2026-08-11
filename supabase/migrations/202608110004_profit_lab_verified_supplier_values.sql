alter table public.profit_lab_ingredients add column if not exists supplier_product_id text, add column if not exists package_volume_oz numeric(14,6) check(package_volume_oz is null or package_volume_oz>0), add column if not exists syrup_to_water_ratio numeric(12,6) check(syrup_to_water_ratio is null or syrup_to_water_ratio>0), add column if not exists used_by text[] not null default '{}';

create or replace function public.seed_profit_lab_supplier_values(p_organization uuid,p_location uuid) returns void language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
begin
 insert into public.profit_lab_ingredients(organization_id,location_id,key,name,source,catalog_product_name,supplier_product_id,package_case_price,packages_per_case,estimated_units_per_package,preparation_yield,waste_percent,result_kind,serving_label,assumption_note,package_volume_oz,syrup_to_water_ratio,used_by)
 select p_organization,p_location,v.key,v.name,'preset',v.name,v.product_id,v.price,v.packages,v.units,v.prep,0,v.kind,v.label,v.note,v.volume_oz,null,v.used_by from (values
 ('orange-juice','Orange juice','3209726',44.24,8,64,1,'exact','fl oz','Verified 8 x 64 fl oz case.',64::numeric,array['SBB']::text[]),
 ('cranberry-juice','Cranberry juice','3402205',33.98,8,48,1,'exact','fl oz','Verified 8 x 48 fl oz case.',48,array['SBB']),
 ('fruit-punch','Fruit punch','3209720',40.44,8,64,1,'exact','fl oz','Verified 8 x 64 fl oz case.',64,array['SBB']),
 ('pineapple-juice','Pineapple juice','3209725',47.18,8,64,1,'exact','fl oz','Verified 8 x 64 fl oz case.',64,array['SBB']),
 ('grapefruit-juice','Grapefruit juice','3403210',38.58,24,7.2,1,'exact','fl oz','Verified 24 x 7.2 fl oz case.',7.2,array['SBB']),
 ('frozen-lime-juice','Frozen lime juice','1400850',75.92,12,33.8140227,1,'exact','fl oz','Verified 12 x 1 liter; 1 liter = 33.8140227 US fl oz.',33.8140227,array['SBB']),
 ('cream-of-coconut','Cream of coconut','3402300',73.88,24,15,1,'exact','fl oz','Verified 24 x 15 fl oz case.',15,array['SBB']),
 ('island-oasis-pina-colada','Island Oasis Pina Colada','1408600',86.55,12,32,1,'exact','fl oz','Verified 12 x 1 US quart. User enters recipe amount.',32,array['SBB']),
 ('island-oasis-ice-cream','Island Oasis Ice Cream','1407800',87.34,12,32,1,'exact','fl oz','Verified 12 x 1 US quart. User enters recipe amount.',32,array['SBB']),
 ('island-oasis-banana','Island Oasis Banana','1407200',86.55,12,32,1,'exact','fl oz','Verified 12 x 1 US quart. User enters recipe amount.',32,array['SBB']),
 ('island-oasis-strawberry','Island Oasis Strawberry','1409400',86.55,12,32,1,'exact','fl oz','Verified 12 x 1 US quart. User enters recipe amount.',32,array['SBB']),
 ('island-oasis-passion-fruit','Island Oasis Passion Fruit','1408300',86.55,12,32,1,'exact','fl oz','Verified 12 x 1 US quart. User enters recipe amount.',32,array['SBB']),
 ('island-oasis-mango','Island Oasis Mango','1408000',86.55,12,32,1,'exact','fl oz','Verified 12 x 1 US quart. User enters recipe amount.',32,array['SBB']),
 ('island-oasis-guava','Island Oasis Guava','1407600',86.82,12,32,1,'exact','fl oz','Verified 12 x 1 US quart. User enters recipe amount.',32,array['SBB']),
 ('lime-wedge','Lime wedge','2602600',37.07,1,200,8,'exact','wedge','Verified 200-count and 8 wedges per lime; waste adjustable.',null,array['SBB']),
 ('lemon-wedge','Lemon wedge','2601500',69.33,1,200,8,'exact','wedge','Verified 200-count, about 34 lb, and 8 wedges per lemon; waste adjustable.',null,array['SBB']),
 ('maraschino-cherry','Maraschino cherry','3813800',111.44,4,275,1,'estimated','cherry','Verified 4 one-gallon jars; approximately 275 cherries per jar, adjustable.',null,array['SBB']),
 ('california-orange','California orange','2605000',69.17,1,88,1,'exact','each','Verified 88-count. Whole-orange cost; no wedge yield invented.',null,array['PP']),
 ('cup-12oz-translucent','Dart translucent 12 oz cup','6809200',52.63,20,50,1,'exact','each','Verified 20 sleeves x 50 cups.',null,array['SBB']),
 ('jumbo-wrapped-paper-straw','Jumbo wrapped paper straw','6812601',161.03,12,500,1,'exact','each','Verified 12 packs x 500 straws.',null,array['SBB']),
 ('coke-bib','Coke BIB',null,77.40,1,640,1,'estimated','finished fl oz','Verified 5-gallon syrup package. Ratio is unverified.',640,array['SBB']),
 ('diet-coke-bib','Diet Coke BIB',null,77.40,1,640,1,'estimated','finished fl oz','Verified 5-gallon syrup package. Ratio is unverified.',640,array['SBB']),
 ('fanta-orange-bib','Fanta Orange BIB',null,77.40,1,640,1,'estimated','finished fl oz','Verified 5-gallon syrup package. Ratio is unverified.',640,array['SBB']),
 ('sprite-bib','Sprite BIB',null,77.40,1,640,1,'estimated','finished fl oz','Verified 5-gallon syrup package. Ratio is unverified.',640,array['SBB']),
 ('cranberry-bib','Cranberry BIB',null,57.80,1,384,1,'estimated','finished fl oz','Verified 3-gallon syrup package. Ratio is unverified.',384,array['SBB'])
 ) v(key,name,product_id,price,packages,units,prep,kind,label,note,volume_oz,used_by)
 on conflict(location_id,key) do update set name=excluded.name,supplier_product_id=excluded.supplier_product_id,package_case_price=excluded.package_case_price,packages_per_case=excluded.packages_per_case,estimated_units_per_package=excluded.estimated_units_per_package,preparation_yield=excluded.preparation_yield,result_kind=excluded.result_kind,serving_label=excluded.serving_label,assumption_note=excluded.assumption_note,package_volume_oz=excluded.package_volume_oz,used_by=excluded.used_by,updated_at=now();
end$$;
select public.seed_profit_lab_supplier_values(l.organization_id,l.id) from public.locations l;
create function public.seed_profit_lab_supplier_values_for_location() returns trigger language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$begin perform public.seed_profit_lab_supplier_values(new.organization_id,new.id); return new; end$$;
create trigger seed_profit_lab_supplier_values after insert on public.locations for each row execute function public.seed_profit_lab_supplier_values_for_location();

create or replace function public.profit_lab_bib_cost_per_finished_oz(p_case_price numeric,p_syrup_oz numeric,p_syrup_to_water_ratio numeric) returns numeric language sql immutable set search_path=pg_catalog,public,pg_temp as $$ select case when p_case_price is null or p_syrup_oz<=0 or p_syrup_to_water_ratio is null or p_syrup_to_water_ratio<=0 then null else p_case_price/(p_syrup_oz*(1+p_syrup_to_water_ratio)) end $$;
revoke all on function public.seed_profit_lab_supplier_values(uuid,uuid) from public,anon,authenticated;
revoke all on function public.seed_profit_lab_supplier_values_for_location() from public,anon,authenticated;
revoke all on function public.profit_lab_bib_cost_per_finished_oz(numeric,numeric,numeric) from public,anon;
grant execute on function public.profit_lab_bib_cost_per_finished_oz(numeric,numeric,numeric) to authenticated;
