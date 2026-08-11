-- Complete shared recipe workflow. Existing recipes remain Draft and active.
alter table public.profit_lab_recipes
 add column if not exists status text not null default 'Draft' check(status in ('Draft','Testing','Approved','Retired')),
 add column if not exists outlet text,
 add column if not exists preparation text not null default 'Fill with ice',
 add column if not exists notes text not null default '',
 add column if not exists target_volume_oz numeric(8,3) not null default 6 check(target_volume_oz>0 and target_volume_oz<=128),
 add column if not exists archived_at timestamptz;

alter table public.profit_lab_ingredients
 add column if not exists volume_kind text not null default 'none' check(volume_kind in ('alcohol','non_alcoholic','none')),
 add column if not exists default_recipe_amount numeric(10,4) check(default_recipe_amount is null or default_recipe_amount>0),
 add column if not exists default_recipe_unit text check(default_recipe_unit is null or default_recipe_unit in ('oz','ml','tsp','tbsp','each','piece','flat')),
 add column if not exists category text not null default 'Custom';

update public.profit_lab_ingredients set volume_kind='non_alcoholic',default_recipe_unit='oz',category=case when key like 'island-oasis-%' then 'Frozen mixes' when key like '%bib' then 'Fountain beverages' else 'Juices' end where key in ('orange-juice','cranberry-juice','fruit-punch','pineapple-juice','grapefruit-juice','frozen-lime-juice','cream-of-coconut','island-oasis-pina-colada','island-oasis-ice-cream','island-oasis-banana','island-oasis-strawberry','island-oasis-passion-fruit','island-oasis-mango','island-oasis-guava','coke-bib','diet-coke-bib','fanta-orange-bib','sprite-bib','cranberry-bib');
update public.profit_lab_ingredients set category='Garnishes',default_recipe_unit='each' where key in ('lime-wedge','lemon-wedge','maraschino-cherry','california-orange');
update public.profit_lab_ingredients set category='Disposables',default_recipe_unit='each' where key in ('cup-12oz-translucent','jumbo-wrapped-paper-straw');

drop function public.list_profit_lab_ingredients(uuid,uuid);
create function public.list_profit_lab_ingredients(p_organization uuid,p_location uuid)
returns table(id uuid,key text,name text,source text,catalog_product_name text,package_case_price numeric,packages_per_case numeric,estimated_units_per_package numeric,preparation_yield numeric,waste_percent numeric,result_kind text,serving_label text,assumption_note text,cost_per_serving numeric,can_edit boolean,supplier_product_id text,package_volume_oz numeric,syrup_to_water_ratio numeric,used_by text[],volume_kind text,default_recipe_amount numeric,default_recipe_unit text,category text)
language plpgsql security definer stable set search_path=pg_catalog,public,pg_temp as $$begin if auth.uid() is null or not public.has_location_role(p_organization,p_location,array['administrator','manager','bar_lead','inventory_staff','read_only_viewer']::public.app_role[]) then raise exception 'Profit Lab access required'; end if; return query select i.id,i.key,i.name,i.source,i.catalog_product_name,i.package_case_price,i.packages_per_case,i.estimated_units_per_package,i.preparation_yield,i.waste_percent,i.result_kind,i.serving_label,i.assumption_note,case when i.key like '%-bib' then public.profit_lab_bib_cost_per_finished_oz(i.package_case_price,i.package_volume_oz,i.syrup_to_water_ratio) when i.package_case_price is null or i.estimated_units_per_package is null then null else i.package_case_price/(i.packages_per_case*i.estimated_units_per_package*i.preparation_yield*(1-i.waste_percent/100)) end,public.has_location_role(p_organization,p_location,array['administrator','manager','bar_lead']::public.app_role[]),i.supplier_product_id,i.package_volume_oz,i.syrup_to_water_ratio,i.used_by,i.volume_kind,i.default_recipe_amount,i.default_recipe_unit,i.category from public.profit_lab_ingredients i where i.organization_id=p_organization and i.location_id=p_location order by lower(i.category),lower(i.name); end$$;
revoke all on function public.list_profit_lab_ingredients(uuid,uuid) from public,anon;
grant execute on function public.list_profit_lab_ingredients(uuid,uuid) to authenticated;

-- Make the already-deployed supplier migration safely repeatable.
create or replace function public.seed_profit_lab_supplier_values_for_location() returns trigger language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$begin perform public.seed_profit_lab_supplier_values(new.organization_id,new.id); return new; end$$;
drop trigger if exists seed_profit_lab_supplier_values on public.locations;
create trigger seed_profit_lab_supplier_values after insert on public.locations for each row execute function public.seed_profit_lab_supplier_values_for_location();

create or replace function public.profit_lab_validate_ingredients(p_ingredients jsonb) returns void language plpgsql immutable set search_path=pg_catalog,public,pg_temp as $$
begin
 if jsonb_typeof(p_ingredients)<>'array' or jsonb_array_length(p_ingredients)<1 then raise exception 'Add at least one ingredient'; end if;
 if jsonb_array_length(p_ingredients)>500 then raise exception 'Recipe ingredient safety limit exceeded'; end if;
 if exists(select 1 from jsonb_array_elements(p_ingredients) i where length(btrim(coalesce(i->>'name',''))) not between 1 and 120 or coalesce((i->>'amount')::numeric,0)<=0 or coalesce(i->>'unit','') not in ('oz','ml','tsp','tbsp','each','piece','flat') or (nullif(i->>'ingredientId','') is null and coalesce((i->>'unitCost')::numeric,-1)<0)) then raise exception 'Every ingredient needs a valid name, amount, unit, and cost definition'; end if;
end$$;

create or replace function public.list_profit_lab_recipes(p_organization uuid,p_location uuid)
returns table(id uuid,name text,target_cost_percent numeric,menu_price numeric,ingredients jsonb,version integer,created_by uuid,updated_by uuid,created_at timestamptz,updated_at timestamptz,can_delete boolean,status text,outlet text,preparation text,notes text,target_volume_oz numeric,archived_at timestamptz)
language plpgsql security definer stable set search_path=pg_catalog,public,pg_temp as $$begin
 if auth.uid() is null or not public.has_location_role(p_organization,p_location,array['administrator','manager','bar_lead','inventory_staff','read_only_viewer']::public.app_role[]) then raise exception 'Profit Lab access required'; end if;
 return query select r.id,r.name,r.target_cost_percent,r.menu_price,r.ingredients,r.version,r.created_by,r.updated_by,r.created_at,r.updated_at,public.has_location_role(p_organization,p_location,array['administrator','manager']::public.app_role[]),r.status,r.outlet,r.preparation,r.notes,r.target_volume_oz,r.archived_at from public.profit_lab_recipes r where r.organization_id=p_organization and r.location_id=p_location order by (r.archived_at is not null),lower(r.name);
end$$;

create or replace function public.save_profit_lab_recipe(p_organization uuid,p_location uuid,p_recipe jsonb) returns uuid language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare rid uuid:=nullif(p_recipe->>'id','')::uuid; saved public.profit_lab_recipes; recipe_name text:=btrim(coalesce(p_recipe->>'name','')); ingredient_list jsonb:=p_recipe->'ingredients'; next_version integer;
begin
 if auth.uid() is null or not public.has_location_role(p_organization,p_location,array['administrator','manager','bar_lead']::public.app_role[]) then raise exception 'Profit Lab editor access required'; end if;
 if length(recipe_name) not between 1 and 120 then raise exception 'Recipe name is required'; end if;
 perform public.profit_lab_validate_ingredients(ingredient_list);
 if rid is null then insert into public.profit_lab_recipes(organization_id,location_id,name,target_cost_percent,menu_price,ingredients,status,outlet,preparation,notes,target_volume_oz,created_by,updated_by) values(p_organization,p_location,recipe_name,(p_recipe->>'target')::numeric,nullif(p_recipe->>'menuPrice','')::numeric,ingredient_list,coalesce(nullif(p_recipe->>'status',''),'Draft'),nullif(p_recipe->>'outlet',''),coalesce(p_recipe->>'preparation','Fill with ice'),coalesce(p_recipe->>'notes',''),coalesce(nullif(p_recipe->>'targetVolumeOz','')::numeric,6),auth.uid(),auth.uid()) returning * into saved;
 else select version+1 into next_version from public.profit_lab_recipes where id=rid and organization_id=p_organization and location_id=p_location for update; if not found then raise exception 'Recipe not found in this location'; end if; update public.profit_lab_recipes set name=recipe_name,target_cost_percent=(p_recipe->>'target')::numeric,menu_price=nullif(p_recipe->>'menuPrice','')::numeric,ingredients=ingredient_list,status=coalesce(nullif(p_recipe->>'status',''),'Draft'),outlet=nullif(p_recipe->>'outlet',''),preparation=coalesce(p_recipe->>'preparation','Fill with ice'),notes=coalesce(p_recipe->>'notes',''),target_volume_oz=coalesce(nullif(p_recipe->>'targetVolumeOz','')::numeric,6),version=next_version,updated_by=auth.uid(),updated_at=now() where id=rid returning * into saved; end if;
 insert into public.profit_lab_recipe_revisions(recipe_id,organization_id,location_id,version,snapshot,action,changed_by) values(saved.id,saved.organization_id,saved.location_id,saved.version,to_jsonb(saved),'saved',auth.uid()); return saved.id;
exception when unique_violation then raise exception 'A Profit Lab recipe with this name already exists'; end$$;

create function public.archive_profit_lab_recipe(p_organization uuid,p_location uuid,p_recipe uuid,p_archived boolean) returns void language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$declare saved public.profit_lab_recipes; begin if auth.uid() is null or not public.has_location_role(p_organization,p_location,array['administrator','manager','bar_lead']::public.app_role[]) then raise exception 'Profit Lab editor access required'; end if; update public.profit_lab_recipes set archived_at=case when p_archived then now() else null end,status=case when p_archived then 'Retired' else status end,version=version+1,updated_by=auth.uid(),updated_at=now() where id=p_recipe and organization_id=p_organization and location_id=p_location returning * into saved; if saved.id is null then raise exception 'Recipe not found in this location'; end if; insert into public.profit_lab_recipe_revisions(recipe_id,organization_id,location_id,version,snapshot,action,changed_by) values(saved.id,saved.organization_id,saved.location_id,saved.version,to_jsonb(saved),'saved',auth.uid()); end$$;

create function public.list_profit_lab_recipe_revisions(p_organization uuid,p_location uuid,p_recipe uuid) returns table(version integer,action text,changed_by uuid,changed_at timestamptz,snapshot jsonb) language plpgsql security definer stable set search_path=pg_catalog,public,pg_temp as $$begin if auth.uid() is null or not public.has_location_role(p_organization,p_location,array['administrator','manager','bar_lead']::public.app_role[]) then raise exception 'Profit Lab editor access required'; end if; return query select r.version,r.action,r.changed_by,r.changed_at,r.snapshot from public.profit_lab_recipe_revisions r where r.organization_id=p_organization and r.location_id=p_location and r.recipe_id=p_recipe order by r.version desc; end$$;

revoke all on function public.archive_profit_lab_recipe(uuid,uuid,uuid,boolean),public.list_profit_lab_recipe_revisions(uuid,uuid,uuid) from public,anon;
grant execute on function public.archive_profit_lab_recipe(uuid,uuid,uuid,boolean),public.list_profit_lab_recipe_revisions(uuid,uuid,uuid) to authenticated;
