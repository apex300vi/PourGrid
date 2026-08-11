-- Shared, location-scoped Profit Lab recipes with revision history.
create table public.profit_lab_recipes(
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  location_id uuid not null,
  name text not null check(length(btrim(name)) between 1 and 120),
  target_cost_percent numeric(5,2) not null check(target_cost_percent between 5 and 40),
  menu_price numeric(12,2) check(menu_price is null or menu_price>0),
  ingredients jsonb not null check(jsonb_typeof(ingredients)='array' and jsonb_array_length(ingredients) between 1 and 50),
  version integer not null default 1 check(version>0),
  created_by uuid not null references public.profiles(id),
  updated_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profit_lab_location_org_fk foreign key(location_id,organization_id) references public.locations(id,organization_id),
  constraint profit_lab_location_name_unique unique(location_id,name)
);

create table public.profit_lab_recipe_revisions(
  id bigint generated always as identity primary key,
  recipe_id uuid not null,
  organization_id uuid not null,
  location_id uuid not null,
  version integer not null,
  snapshot jsonb not null,
  action text not null check(action in ('saved','deleted')),
  changed_by uuid not null references public.profiles(id),
  changed_at timestamptz not null default now(),
  constraint profit_lab_revision_location_org_fk foreign key(location_id,organization_id) references public.locations(id,organization_id),
  constraint profit_lab_revision_unique unique(recipe_id,version)
);

create index profit_lab_recipes_location_updated on public.profit_lab_recipes(location_id,updated_at desc);
create index profit_lab_revisions_recipe on public.profit_lab_recipe_revisions(recipe_id,version desc);
alter table public.profit_lab_recipes enable row level security;
alter table public.profit_lab_recipe_revisions enable row level security;
revoke all on public.profit_lab_recipes,public.profit_lab_recipe_revisions from anon,authenticated;

create function public.profit_lab_validate_ingredients(p_ingredients jsonb) returns void
language plpgsql immutable set search_path=pg_catalog,public,pg_temp as $$
begin
  if jsonb_typeof(p_ingredients)<>'array' or jsonb_array_length(p_ingredients) not between 1 and 50 then raise exception 'Add between 1 and 50 ingredients'; end if;
  if exists(select 1 from jsonb_array_elements(p_ingredients) i where
    length(btrim(coalesce(i->>'name',''))) not between 1 and 120 or
    coalesce(i->>'unit','') not in ('oz','each') or
    coalesce((i->>'amount')::numeric,0)<=0 or
    coalesce((i->>'unitCost')::numeric,-1)<0
  ) then raise exception 'Every ingredient needs a name, valid unit, positive amount, and non-negative unit cost'; end if;
end$$;

create function public.list_profit_lab_recipes(p_organization uuid,p_location uuid)
returns table(id uuid,name text,target_cost_percent numeric,menu_price numeric,ingredients jsonb,version integer,created_by uuid,updated_by uuid,created_at timestamptz,updated_at timestamptz,can_delete boolean)
language plpgsql security definer stable set search_path=pg_catalog,public,pg_temp as $$
begin
  if auth.uid() is null or not public.has_location_role(p_organization,p_location,array['administrator','manager','bar_lead','inventory_staff','read_only_viewer']::public.app_role[]) then raise exception 'Profit Lab access required'; end if;
  if not exists(select 1 from public.locations l where l.id=p_location and l.organization_id=p_organization) then raise exception 'Location is outside organization'; end if;
  return query select r.id,r.name,r.target_cost_percent,r.menu_price,r.ingredients,r.version,r.created_by,r.updated_by,r.created_at,r.updated_at,
    public.has_location_role(p_organization,p_location,array['administrator','manager']::public.app_role[])
  from public.profit_lab_recipes r where r.organization_id=p_organization and r.location_id=p_location order by lower(r.name);
end$$;

create function public.save_profit_lab_recipe(p_organization uuid,p_location uuid,p_recipe jsonb) returns uuid
language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare rid uuid; current_version integer; next_version integer; recipe_name text:=btrim(coalesce(p_recipe->>'name','')); target numeric; price numeric; ingredient_list jsonb:=p_recipe->'ingredients'; saved public.profit_lab_recipes;
begin
  if auth.uid() is null or not public.has_location_role(p_organization,p_location,array['administrator','manager','bar_lead']::public.app_role[]) then raise exception 'Profit Lab editor access required'; end if;
  if not exists(select 1 from public.locations l where l.id=p_location and l.organization_id=p_organization) then raise exception 'Location is outside organization'; end if;
  if length(recipe_name) not between 1 and 120 then raise exception 'Recipe name is required'; end if;
  target:=(p_recipe->>'target')::numeric;
  if target not between 5 and 40 then raise exception 'Target cost must be between 5 and 40 percent'; end if;
  price:=nullif(p_recipe->>'menuPrice','')::numeric;
  if price is not null and price<=0 then raise exception 'Menu price must be positive'; end if;
  perform public.profit_lab_validate_ingredients(ingredient_list);
  rid:=nullif(p_recipe->>'id','')::uuid;
  if rid is null then
    insert into public.profit_lab_recipes(organization_id,location_id,name,target_cost_percent,menu_price,ingredients,created_by,updated_by)
    values(p_organization,p_location,recipe_name,target,price,ingredient_list,auth.uid(),auth.uid()) returning * into saved;
  else
    select version into current_version from public.profit_lab_recipes where id=rid and organization_id=p_organization and location_id=p_location for update;
    if not found then raise exception 'Recipe not found in this location'; end if;
    next_version:=current_version+1;
    update public.profit_lab_recipes set name=recipe_name,target_cost_percent=target,menu_price=price,ingredients=ingredient_list,version=next_version,updated_by=auth.uid(),updated_at=now()
    where id=rid returning * into saved;
  end if;
  insert into public.profit_lab_recipe_revisions(recipe_id,organization_id,location_id,version,snapshot,action,changed_by)
  values(saved.id,saved.organization_id,saved.location_id,saved.version,to_jsonb(saved),'saved',auth.uid());
  return saved.id;
exception when unique_violation then raise exception 'A Profit Lab recipe with this name already exists';
end$$;

create function public.delete_profit_lab_recipe(p_organization uuid,p_location uuid,p_recipe uuid) returns void
language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare saved public.profit_lab_recipes;
begin
  if auth.uid() is null or not public.has_location_role(p_organization,p_location,array['administrator','manager']::public.app_role[]) then raise exception 'Manager access required to delete recipes'; end if;
  select * into saved from public.profit_lab_recipes where id=p_recipe and organization_id=p_organization and location_id=p_location for update;
  if not found then raise exception 'Recipe not found in this location'; end if;
  delete from public.profit_lab_recipes where id=p_recipe;
  insert into public.profit_lab_recipe_revisions(recipe_id,organization_id,location_id,version,snapshot,action,changed_by)
  values(saved.id,saved.organization_id,saved.location_id,saved.version+1,to_jsonb(saved),'deleted',auth.uid());
end$$;

revoke all on function public.profit_lab_validate_ingredients(jsonb),public.list_profit_lab_recipes(uuid,uuid),public.save_profit_lab_recipe(uuid,uuid,jsonb),public.delete_profit_lab_recipe(uuid,uuid,uuid) from public,anon;
grant execute on function public.list_profit_lab_recipes(uuid,uuid),public.save_profit_lab_recipe(uuid,uuid,jsonb),public.delete_profit_lab_recipe(uuid,uuid,uuid) to authenticated;
