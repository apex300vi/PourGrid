\set ON_ERROR_STOP on
begin;
do $$
declare v numeric;
begin
 v:=public.profit_lab_bib_cost_per_finished_oz(77.40,640,5);
 if abs(v-(77.40/3840))>0.000000001 then raise exception '5:1 finished cost incorrect: %',v; end if;
 if public.profit_lab_bib_cost_per_finished_oz(77.40,640,null) is not null then raise exception 'missing ratio fabricated a cost'; end if;
 if public.profit_lab_bib_cost_per_finished_oz(null,640,5) is not null then raise exception 'null price fabricated a cost'; end if;
end$$;
do $$
declare locations_count integer;club_count integer;
begin
 select count(*) into locations_count from public.locations;
 select count(*) into club_count from public.profit_lab_ingredients where key='club-soda-gun' and is_virtual_non_orderable and package_case_price=0 and category='Merchants' and catalog_product_name is null;
 if club_count<>locations_count then raise exception 'club soda was not seeded once per location: % / %',club_count,locations_count; end if;
 if exists(select 1 from public.profit_lab_ingredients where key in('coke-bib','diet-coke-bib','fanta-orange-bib','sprite-bib') and (syrup_to_water_ratio<>5 or mix_ratio_basis<>'water_parts_per_one_syrup')) then raise exception 'ready carbonated BIB lacks valid 5:1 metadata'; end if;
 if exists(select 1 from public.profit_lab_ingredients where key='cranberry-bib' and (package_volume_oz<>384 or syrup_to_water_ratio is not null or public.profit_lab_bib_cost_per_finished_oz(package_case_price,package_volume_oz,syrup_to_water_ratio) is not null or assumption_note not ilike 'Mix ratio required:%')) then raise exception 'cranberry must remain an unresolved 3 gallon BIB'; end if;
 if exists(select 1 from public.profit_lab_ingredients where key='lemonade-bib' and (catalog_product_name<>'Minute Maid Lemonade Bag in box, 5 Gallons' or supplier_product_id<>'931422' or package_volume_oz<>640 or estimated_units_per_package<>640 or preparation_yield<>6 or syrup_to_water_ratio<>5 or mix_ratio_basis<>'water_parts_per_one_syrup' or abs(public.profit_lab_bib_cost_per_finished_oz(package_case_price,package_volume_oz,syrup_to_water_ratio)-(package_case_price/3840))>0.000000001)) then raise exception 'verified Minute Maid 5 gallon Lemonade metadata or yield is incorrect'; end if;
 if exists(select 1 from public.profit_lab_ingredients where key='club-soda-gun' and package_case_price/(packages_per_case*estimated_units_per_package*preparation_yield*(1-waste_percent/100))<>0) then raise exception 'club soda cost is not exactly zero'; end if;
end$$;
rollback;
