-- Enrich the existing canonical Cranberry BIB with its verified product identity and finished yield.
update public.profit_lab_ingredients
set catalog_product_name='Harvest Valley 19% Cranberry Juice Cocktail',
    supplier_product_id='758477',
    package_volume_oz=384,
    estimated_units_per_package=384,
    preparation_yield=5,
    syrup_to_water_ratio=4,
    mix_ratio_basis='water_parts_per_one_syrup',
    mix_ratio_source='Gordon Food Service item 758477: Harvest Valley 19% Cranberry Juice Cocktail, 4 to 1 ratio, 3 gal BIB. https://gfsstore.com/products/758477/',
    result_kind='exact',
    serving_label='finished fl oz',
    assumption_note='Verified 3 US gal concentrate package (384 fl oz), 4 water parts per 1 concentrate part, 1,920 finished fl oz.',
    updated_at=now()
where key='cranberry-bib';

create or replace function public.seed_profit_lab_bib_finished_yield_for_location() returns trigger language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
begin
 update public.profit_lab_ingredients set syrup_to_water_ratio=5,mix_ratio_basis='water_parts_per_one_syrup',mix_ratio_source='Coca-Cola HVT dispenser manual: 5:1 for most carbonated products; BIB label governs exceptions. https://www.coca-colaparts.com/?fid=648&mod=parts&op=dwnattach',result_kind='exact',category='Fountain beverages',catalog_product_name=case key when 'coke-bib' then 'BIB Coke' when 'diet-coke-bib' then 'BIB Diet Coke' when 'sprite-bib' then 'BIB Sprite' else catalog_product_name end,assumption_note='5 US gal syrup (640 fl oz), 5 water parts per 1 syrup part, 3,840 finished fl oz. Water and CO2 allocation excluded.',updated_at=now() where location_id=new.id and key in('coke-bib','diet-coke-bib','fanta-orange-bib','sprite-bib');
 update public.profit_lab_ingredients set catalog_product_name='Harvest Valley 19% Cranberry Juice Cocktail',supplier_product_id='758477',package_volume_oz=384,estimated_units_per_package=384,preparation_yield=5,syrup_to_water_ratio=4,mix_ratio_basis='water_parts_per_one_syrup',mix_ratio_source='Gordon Food Service item 758477: Harvest Valley 19% Cranberry Juice Cocktail, 4 to 1 ratio, 3 gal BIB. https://gfsstore.com/products/758477/',result_kind='exact',serving_label='finished fl oz',assumption_note='Verified 3 US gal concentrate package (384 fl oz), 4 water parts per 1 concentrate part, 1,920 finished fl oz.',updated_at=now() where location_id=new.id and key='cranberry-bib';
 insert into public.profit_lab_ingredients(organization_id,location_id,key,name,source,catalog_product_name,supplier_product_id,package_case_price,packages_per_case,estimated_units_per_package,preparation_yield,waste_percent,result_kind,serving_label,assumption_note,package_volume_oz,syrup_to_water_ratio,used_by,volume_kind,default_recipe_amount,default_recipe_unit,category,mix_ratio_basis,mix_ratio_source,is_virtual_non_orderable) values
 (new.organization_id,new.id,'lemonade-bib','BIB Minute Maid Lemonade 5 gal','preset','Minute Maid Lemonade Bag in box, 5 Gallons','931422',77.40,1,640,6,0,'exact','finished fl oz','Verified 5 US gal concentrate package (640 fl oz), 5 water parts per 1 concentrate part, 3,840 finished fl oz.',640,5,array['SBB']::text[],'non_alcoholic',1,'oz','Fountain beverages','water_parts_per_one_syrup','Minute Maid item 931422, GTIN 00049000988338, 1/5 gal; one gallon syrup yields 768 finished fl oz.',false),
 (new.organization_id,new.id,'club-soda-gun','BIB Club Soda','preset',null,null,0,1,1,1,0,'exact','finished fl oz','Virtual non-orderable gun ingredient: no syrup BIB or inventory demand.',null,null,array['SBB']::text[],'non_alcoholic',1,'oz','Merchants',null,'PourGrid business rule: water and CO2 allocation excluded.',true)
 on conflict(location_id,key) do update set name=excluded.name,catalog_product_name=excluded.catalog_product_name,supplier_product_id=excluded.supplier_product_id,package_case_price=excluded.package_case_price,packages_per_case=excluded.packages_per_case,estimated_units_per_package=excluded.estimated_units_per_package,preparation_yield=excluded.preparation_yield,waste_percent=excluded.waste_percent,result_kind=excluded.result_kind,serving_label=excluded.serving_label,assumption_note=excluded.assumption_note,package_volume_oz=excluded.package_volume_oz,syrup_to_water_ratio=excluded.syrup_to_water_ratio,mix_ratio_basis=excluded.mix_ratio_basis,mix_ratio_source=excluded.mix_ratio_source,is_virtual_non_orderable=excluded.is_virtual_non_orderable,updated_at=now();
 return new;
end$$;

revoke all on function public.seed_profit_lab_bib_finished_yield_for_location() from public,anon,authenticated;
