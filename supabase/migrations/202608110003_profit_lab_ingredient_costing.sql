-- Reusable, location-scoped ingredient costing assumptions for Profit Lab.
create table public.profit_lab_ingredients(
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  location_id uuid not null,
  key text not null check(length(btrim(key)) between 1 and 80),
  name text not null check(length(btrim(name)) between 1 and 120),
  source text not null check(source in ('preset','catalog','custom')),
  catalog_product_name text,
  package_case_price numeric(12,2) check(package_case_price is null or package_case_price>=0),
  packages_per_case numeric(12,3) not null default 1 check(packages_per_case>0),
  estimated_units_per_package numeric(12,3) check(estimated_units_per_package is null or estimated_units_per_package>0),
  preparation_yield numeric(12,3) not null default 1 check(preparation_yield>0),
  waste_percent numeric(5,2) not null default 0 check(waste_percent between 0 and 95),
  result_kind text not null default 'estimated' check(result_kind in ('exact','estimated')),
  serving_label text not null default 'serving',
  assumption_note text not null default '',
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profit_lab_ingredient_location_org_fk foreign key(location_id,organization_id) references public.locations(id,organization_id),
  constraint profit_lab_ingredient_key_unique unique(location_id,key)
);
alter table public.profit_lab_ingredients enable row level security;
revoke all on public.profit_lab_ingredients from anon,authenticated;

-- Prices are intentionally null: no verified production invoice values exist.
-- Yield defaults are conspicuous starting estimates and remain editable in one place.
insert into public.profit_lab_ingredients(organization_id,location_id,key,name,source,catalog_product_name,packages_per_case,estimated_units_per_package,preparation_yield,waste_percent,result_kind,serving_label,assumption_note)
select l.organization_id,l.id,p.key,p.name,'preset',p.product,p.packages,p.units,p.prep,0,'estimated',p.label,p.note
from public.locations l cross join (values
 ('lime-wedge','Lime wedge','Limes',1::numeric,200::numeric,8::numeric,'wedge','Starting estimate: 200 limes per case; verify against the supplier case label or invoice.'),
 ('lemon-wedge','Lemon wedge','Lemons',1::numeric,200::numeric,8::numeric,'wedge','Starting estimate: 200 lemons per case; verify against the supplier case label or invoice.'),
 ('maraschino-cherry','Maraschino cherry','Maraschino Cherries',4::numeric,400::numeric,1::numeric,'cherry','Verified packaging: four 1-gallon containers per case. Starting estimate: 400 cherries per gallon; verify the container label.')
) p(key,name,product,packages,units,prep,label,note)
on conflict(location_id,key) do nothing;

create function public.seed_profit_lab_garnishes_for_location()
returns trigger language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
begin
 insert into public.profit_lab_ingredients(organization_id,location_id,key,name,source,catalog_product_name,packages_per_case,estimated_units_per_package,preparation_yield,waste_percent,result_kind,serving_label,assumption_note) values
  (new.organization_id,new.id,'lime-wedge','Lime wedge','preset','Limes',1,200,8,0,'estimated','wedge','Starting estimate: 200 limes per case; verify against the supplier case label or invoice.'),
  (new.organization_id,new.id,'lemon-wedge','Lemon wedge','preset','Lemons',1,200,8,0,'estimated','wedge','Starting estimate: 200 lemons per case; verify against the supplier case label or invoice.'),
  (new.organization_id,new.id,'maraschino-cherry','Maraschino cherry','preset','Maraschino Cherries',4,400,1,0,'estimated','cherry','Verified packaging: four 1-gallon containers per case. Starting estimate: 400 cherries per gallon; verify the container label.')
 on conflict(location_id,key) do nothing;
 return new;
end$$;

create trigger seed_profit_lab_garnishes after insert on public.locations
for each row execute function public.seed_profit_lab_garnishes_for_location();

create function public.list_profit_lab_ingredients(p_organization uuid,p_location uuid)
returns table(id uuid,key text,name text,source text,catalog_product_name text,package_case_price numeric,packages_per_case numeric,estimated_units_per_package numeric,preparation_yield numeric,waste_percent numeric,result_kind text,serving_label text,assumption_note text,cost_per_serving numeric,can_edit boolean)
language plpgsql security definer stable set search_path=pg_catalog,public,pg_temp as $$
begin
 if auth.uid() is null or not public.has_location_role(p_organization,p_location,array['administrator','manager','bar_lead','inventory_staff','read_only_viewer']::public.app_role[]) then raise exception 'Profit Lab access required'; end if;
 return query select i.id,i.key,i.name,i.source,i.catalog_product_name,i.package_case_price,i.packages_per_case,i.estimated_units_per_package,i.preparation_yield,i.waste_percent,i.result_kind,i.serving_label,i.assumption_note,
  case when i.package_case_price is null or i.estimated_units_per_package is null then null else i.package_case_price/(i.packages_per_case*i.estimated_units_per_package*i.preparation_yield*(1-i.waste_percent/100)) end,
  public.has_location_role(p_organization,p_location,array['administrator','manager','bar_lead']::public.app_role[])
 from public.profit_lab_ingredients i where i.organization_id=p_organization and i.location_id=p_location order by lower(i.name);
end$$;

create function public.save_profit_lab_ingredient(p_organization uuid,p_location uuid,p_ingredient jsonb) returns uuid
language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare rid uuid:=nullif(p_ingredient->>'id','')::uuid; saved public.profit_lab_ingredients;
begin
 if auth.uid() is null or not public.has_location_role(p_organization,p_location,array['administrator','manager','bar_lead']::public.app_role[]) then raise exception 'Profit Lab editor access required'; end if;
 if rid is null then
  insert into public.profit_lab_ingredients(organization_id,location_id,key,name,source,catalog_product_name,package_case_price,packages_per_case,estimated_units_per_package,preparation_yield,waste_percent,result_kind,serving_label,assumption_note,created_by,updated_by)
  values(p_organization,p_location,coalesce(nullif(btrim(p_ingredient->>'key'),''),gen_random_uuid()::text),btrim(p_ingredient->>'name'),coalesce(p_ingredient->>'source','custom'),nullif(p_ingredient->>'catalogProductName',''),nullif(p_ingredient->>'packageCasePrice','')::numeric,(p_ingredient->>'packagesPerCase')::numeric,nullif(p_ingredient->>'estimatedUnitsPerPackage','')::numeric,(p_ingredient->>'preparationYield')::numeric,(p_ingredient->>'wastePercent')::numeric,coalesce(p_ingredient->>'resultKind','estimated'),coalesce(nullif(btrim(p_ingredient->>'servingLabel'),''),'serving'),coalesce(p_ingredient->>'assumptionNote',''),auth.uid(),auth.uid()) returning * into saved;
 else
  update public.profit_lab_ingredients set package_case_price=nullif(p_ingredient->>'packageCasePrice','')::numeric,packages_per_case=(p_ingredient->>'packagesPerCase')::numeric,estimated_units_per_package=nullif(p_ingredient->>'estimatedUnitsPerPackage','')::numeric,preparation_yield=(p_ingredient->>'preparationYield')::numeric,waste_percent=(p_ingredient->>'wastePercent')::numeric,result_kind=coalesce(p_ingredient->>'resultKind','estimated'),assumption_note=coalesce(p_ingredient->>'assumptionNote',''),updated_by=auth.uid(),updated_at=now()
  where id=rid and organization_id=p_organization and location_id=p_location returning * into saved;
 end if;
 if saved.id is null then raise exception 'Ingredient not found in this location'; end if;
 return saved.id;
end$$;

create or replace function public.profit_lab_validate_ingredients(p_ingredients jsonb) returns void
language plpgsql immutable set search_path=pg_catalog,public,pg_temp as $$
begin
 if jsonb_typeof(p_ingredients)<>'array' or jsonb_array_length(p_ingredients) not between 1 and 50 then raise exception 'Add between 1 and 50 ingredients'; end if;
 if exists(select 1 from jsonb_array_elements(p_ingredients) i where length(btrim(coalesce(i->>'name',''))) not between 1 and 120 or coalesce((i->>'amount')::numeric,0)<=0 or (nullif(i->>'ingredientId','') is null and (coalesce(i->>'unit','') not in ('oz','each') or coalesce((i->>'unitCost')::numeric,-1)<0))) then raise exception 'Every ingredient needs a shared definition or a valid inline cost'; end if;
end$$;

revoke all on function public.list_profit_lab_ingredients(uuid,uuid),public.save_profit_lab_ingredient(uuid,uuid,jsonb) from public,anon;
grant execute on function public.list_profit_lab_ingredients(uuid,uuid),public.save_profit_lab_ingredient(uuid,uuid,jsonb) to authenticated;

create function public.guard_profit_lab_ingredient_references() returns trigger language plpgsql set search_path=pg_catalog,public,pg_temp as $$begin if exists(select 1 from jsonb_array_elements(new.ingredients) i where nullif(i->>'ingredientId','') is not null and not exists(select 1 from public.profit_lab_ingredients d where d.id=(i->>'ingredientId')::uuid and d.organization_id=new.organization_id and d.location_id=new.location_id)) then raise exception 'Shared ingredient is outside this location'; end if; return new; end$$;
create trigger guard_profit_lab_ingredient_references before insert or update on public.profit_lab_recipes for each row execute function public.guard_profit_lab_ingredient_references();
