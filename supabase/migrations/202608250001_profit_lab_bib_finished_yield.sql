-- Correct BIB costing with explicit water-to-syrup metadata and add recipe-only gun club soda.
alter table public.profit_lab_ingredients
 add column if not exists mix_ratio_basis text check(mix_ratio_basis is null or mix_ratio_basis='water_parts_per_one_syrup'),
 add column if not exists mix_ratio_source text,
 add column if not exists is_virtual_non_orderable boolean not null default false;

update public.profit_lab_ingredients
set syrup_to_water_ratio=5,
    mix_ratio_basis='water_parts_per_one_syrup',
    mix_ratio_source='Coca-Cola HVT dispenser manual: 5:1 for most carbonated products; BIB label governs exceptions. https://www.coca-colaparts.com/?fid=648&mod=parts&op=dwnattach',
    result_kind='exact',
    category='Fountain beverages',
    catalog_product_name=case key when 'coke-bib' then 'BIB Coke' when 'diet-coke-bib' then 'BIB Diet Coke' when 'sprite-bib' then 'BIB Sprite' else catalog_product_name end,
    assumption_note='5 US gal syrup (640 fl oz), 5 water parts per 1 syrup part, 3,840 finished fl oz. Water and CO2 allocation excluded.',
    updated_at=now()
where key in('coke-bib','diet-coke-bib','fanta-orange-bib','sprite-bib');

update public.profit_lab_ingredients
set syrup_to_water_ratio=null,
    mix_ratio_basis=null,
    mix_ratio_source='Official Coca-Cola dispenser manual requires the product BIB label for uncarbonated juice/mixer ratio. https://www.coca-colaparts.com/?fid=648&mod=parts&op=dwnattach',
    result_kind='estimated',
    category='Fountain beverages',
    catalog_product_name='BIB Cranberry',
    assumption_note='Mix ratio required: verified 3 US gal concentrate package (384 fl oz), but no authoritative product-label ratio is available.',
    updated_at=now()
where key='cranberry-bib';

insert into public.profit_lab_ingredients(organization_id,location_id,key,name,source,catalog_product_name,package_case_price,packages_per_case,estimated_units_per_package,preparation_yield,waste_percent,result_kind,serving_label,assumption_note,package_volume_oz,syrup_to_water_ratio,used_by,volume_kind,default_recipe_amount,default_recipe_unit,category,mix_ratio_basis,mix_ratio_source,is_virtual_non_orderable)
select l.organization_id,l.id,'lemonade-bib','BIB Lemonade','preset','BIB Lemonade',77.40,1,1,1,0,'estimated','finished fl oz','Mix ratio required: repository verifies purchase price, while official Coca-Cola material confirms fountain BIB but does not publish this package yield or label ratio.',null,null,array['SBB']::text[],'non_alcoholic',1,'oz','Fountain beverages',null,'https://www.cokesolutions.com/products/brands/minute-maid/minute-maid--lemonade',false
from public.locations l
on conflict(location_id,key) do update set catalog_product_name=excluded.catalog_product_name,package_case_price=excluded.package_case_price,result_kind=excluded.result_kind,serving_label=excluded.serving_label,assumption_note=excluded.assumption_note,category=excluded.category,mix_ratio_basis=null,mix_ratio_source=excluded.mix_ratio_source,is_virtual_non_orderable=false,updated_at=now();

insert into public.profit_lab_ingredients(organization_id,location_id,key,name,source,catalog_product_name,package_case_price,packages_per_case,estimated_units_per_package,preparation_yield,waste_percent,result_kind,serving_label,assumption_note,package_volume_oz,syrup_to_water_ratio,used_by,volume_kind,default_recipe_amount,default_recipe_unit,category,mix_ratio_basis,mix_ratio_source,is_virtual_non_orderable)
select l.organization_id,l.id,'club-soda-gun','BIB Club Soda','preset',null,0,1,1,1,0,'exact','finished fl oz','Virtual non-orderable gun ingredient: tap water carbonated with CO2; no syrup BIB, inventory demand, physical count, build-to, or vendor order.',null,null,array['SBB']::text[],'non_alcoholic',1,'oz','Merchants',null,'PourGrid business rule: water and CO2 allocation excluded.',true
from public.locations l
on conflict(location_id,key) do update set name=excluded.name,source=excluded.source,catalog_product_name=null,package_case_price=0,packages_per_case=1,estimated_units_per_package=1,preparation_yield=1,waste_percent=0,result_kind='exact',serving_label=excluded.serving_label,assumption_note=excluded.assumption_note,volume_kind='non_alcoholic',default_recipe_unit='oz',category='Merchants',mix_ratio_basis=null,mix_ratio_source=excluded.mix_ratio_source,is_virtual_non_orderable=true,updated_at=now();

create or replace function public.seed_profit_lab_bib_finished_yield_for_location() returns trigger
language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
begin
 update public.profit_lab_ingredients set syrup_to_water_ratio=5,mix_ratio_basis='water_parts_per_one_syrup',mix_ratio_source='Coca-Cola HVT dispenser manual: 5:1 for most carbonated products; BIB label governs exceptions. https://www.coca-colaparts.com/?fid=648&mod=parts&op=dwnattach',result_kind='exact',category='Fountain beverages',catalog_product_name=case key when 'coke-bib' then 'BIB Coke' when 'diet-coke-bib' then 'BIB Diet Coke' when 'sprite-bib' then 'BIB Sprite' else catalog_product_name end,assumption_note='5 US gal syrup (640 fl oz), 5 water parts per 1 syrup part, 3,840 finished fl oz. Water and CO2 allocation excluded.',updated_at=now() where location_id=new.id and key in('coke-bib','diet-coke-bib','fanta-orange-bib','sprite-bib');
 update public.profit_lab_ingredients set catalog_product_name='BIB Cranberry',syrup_to_water_ratio=null,mix_ratio_basis=null,mix_ratio_source='Official Coca-Cola dispenser manual requires the product BIB label for uncarbonated juice/mixer ratio.',assumption_note='Mix ratio required: verified 3 US gal concentrate package (384 fl oz), but no authoritative product-label ratio is available.',updated_at=now() where location_id=new.id and key='cranberry-bib';
 insert into public.profit_lab_ingredients(organization_id,location_id,key,name,source,catalog_product_name,package_case_price,packages_per_case,estimated_units_per_package,preparation_yield,waste_percent,result_kind,serving_label,assumption_note,used_by,volume_kind,default_recipe_amount,default_recipe_unit,category,mix_ratio_source,is_virtual_non_orderable) values
 (new.organization_id,new.id,'lemonade-bib','BIB Lemonade','preset','BIB Lemonade',77.40,1,1,1,0,'estimated','finished fl oz','Mix ratio required: product-label package yield and ratio are unavailable.',array['SBB']::text[],'non_alcoholic',1,'oz','Fountain beverages','https://www.cokesolutions.com/products/brands/minute-maid/minute-maid--lemonade',false),
 (new.organization_id,new.id,'club-soda-gun','BIB Club Soda','preset',null,0,1,1,1,0,'exact','finished fl oz','Virtual non-orderable gun ingredient: no syrup BIB or inventory demand.',array['SBB']::text[],'non_alcoholic',1,'oz','Merchants','PourGrid business rule: water and CO2 allocation excluded.',true)
 on conflict(location_id,key) do nothing;
 return new;
end$$;
revoke all on function public.seed_profit_lab_bib_finished_yield_for_location() from public,anon,authenticated;
drop trigger if exists zz_seed_profit_lab_bib_finished_yield on public.locations;
create trigger zz_seed_profit_lab_bib_finished_yield after insert on public.locations for each row execute function public.seed_profit_lab_bib_finished_yield_for_location();

comment on column public.profit_lab_ingredients.mix_ratio_basis is 'Direction-safe ratio basis. water_parts_per_one_syrup means finished ounces = syrup ounces * (1 + ratio).';
comment on column public.profit_lab_ingredients.is_virtual_non_orderable is 'True for recipe-only ingredients excluded from physical inventory, counts, build-tos, and vendor orders.';
