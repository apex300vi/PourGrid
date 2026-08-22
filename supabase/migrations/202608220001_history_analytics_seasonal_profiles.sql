begin;
alter table public.legacy_order_references add column if not exists location_id uuid references public.locations(id);
do $$
declare v_org uuid;v_location uuid;v_count integer;
begin
 select count(*),min(l.organization_id::text)::uuid,min(l.id::text)::uuid into v_count,v_org,v_location from public.locations l where lower(l.name)='sapphire beach bar';
 if v_count>1 then raise exception 'Expected at most one Sapphire Beach Bar production location';end if;
 if v_count=1 then update public.legacy_order_references r set organization_id=v_org,location_id=v_location from public.orders o where o.id=r.legacy_order_id and r.organization_id is null and r.location_id is null and coalesce(o.data->>'type','') not in ('counts','deadlines') and jsonb_typeof(o.data->'items')='array';end if;
 update public.legacy_order_references r set location_id=s.location_id from public.legacy_order_submissions s where s.order_id=r.legacy_order_id and r.location_id is null;
end$$;
create index if not exists legacy_order_references_tenant_idx on public.legacy_order_references(organization_id,location_id,legacy_order_id);

create or replace function public.get_location_order_history_v2(p_organization uuid,p_location uuid,p_limit integer default 100,p_offset integer default 0)
returns table(source text,source_id text,dedupe_key text,created_at timestamptz,payload jsonb)
language plpgsql security definer stable set search_path=pg_catalog,public,pg_temp as $$
begin
 if auth.uid() is null or not public.has_location_role(p_organization,p_location,array['administrator','manager','bar_lead','inventory_staff','read_only_viewer']::public.app_role[]) then raise exception using errcode='42501',message='Location history access required';end if;
 if not exists(select 1 from public.locations where id=p_location and organization_id=p_organization) then raise exception using errcode='42501',message='Location is outside organization';end if;
 return query with unified as (
  select 'legacy'::text source,o.id::text source_id,coalesce(nullif(o.data->>'draftId',''),'legacy:'||o.id::text) dedupe_key,o.created_at,o.data payload
  from public.orders o join public.legacy_order_references r on r.legacy_order_id=o.id where r.organization_id=p_organization and r.location_id=p_location and coalesce(o.data->>'type','') not in ('counts','deadlines')
  union all
  select 'structured',so.id::text,'structured:'||so.id::text,coalesce(so.submitted_at,so.created_at),jsonb_build_object('id',so.id,'date',to_char(coalesce(so.submitted_at,so.created_at) at time zone 'America/St_Thomas','YYYY-MM-DD'),'time',to_char(coalesce(so.submitted_at,so.created_at) at time zone 'America/St_Thomas','HH12:MI AM'),'orderType',so.workflow,'items',coalesce((select jsonb_agg(jsonb_build_object('productId',ol.item_id,'name',ii.name,'calculatedOrderQty',ol.draft_units,'finalOrderQty',ol.submitted_units,'packageSize',ol.units_per_package) order by ii.name) from public.order_lines ol join public.inventory_items ii on ii.id=ol.item_id where ol.order_id=so.id),'[]'::jsonb),'counts',null,'calculationVersion','structured-v1')
  from public.structured_orders so where so.organization_id=p_organization and so.location_id=p_location and so.status<>'draft'
 ),ranked as(select u.*,row_number() over(partition by dedupe_key order by(source='structured')desc,created_at desc,source_id desc)n from unified u)
 select r.source,r.source_id,r.dedupe_key,r.created_at,r.payload from ranked r where n=1 order by r.created_at desc,r.source_id desc limit least(greatest(coalesce(p_limit,100),1),100) offset greatest(coalesce(p_offset,0),0);
end$$;
revoke all on function public.get_location_order_history_v2(uuid,uuid,integer,integer) from public,anon;
grant execute on function public.get_location_order_history_v2(uuid,uuid,integer,integer) to authenticated;

create table public.seasonal_profiles(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),location_id uuid not null references public.locations(id),profile_type text not null check(profile_type in('Normal','Offseason','Peak season','Event week','Custom')),name text not null check(length(btrim(name))between 1 and 80),percentage_multiplier integer not null check(percentage_multiplier between 50 and 150),start_date date,end_date date,note text,status text not null default'inactive' check(status in('inactive','scheduled','active','expired','archived')),calculation_version text not null default'seasonal-build-to-v1.0.0',created_by uuid not null references public.profiles(id),created_at timestamptz not null default now(),updated_by uuid not null references public.profiles(id),updated_at timestamptz not null default now(),activated_by uuid references public.profiles(id),activated_at timestamptz,check(end_date is null or start_date is null or end_date>=start_date),unique(organization_id,location_id,name)
);
alter table public.seasonal_profiles enable row level security;
revoke all on public.seasonal_profiles from public,anon,authenticated;

create function public.list_seasonal_profiles(p_organization uuid,p_location uuid,p_on_date date default null)
returns table(id uuid,profile_type text,name text,percentage_multiplier integer,start_date date,end_date date,note text,status text,is_effective boolean,calculation_version text,created_at timestamptz,updated_at timestamptz)
language plpgsql security definer stable set search_path=pg_catalog,public,pg_temp as $$
declare v_date date:=coalesce(p_on_date,(now()at time zone'America/St_Thomas')::date);
begin
 if auth.uid() is null or not public.has_location_role(p_organization,p_location,array['administrator','manager','bar_lead','inventory_staff','read_only_viewer']::public.app_role[])then raise exception using errcode='42501',message='Seasonal Profile access required';end if;
 return query select p.id,p.profile_type,p.name,p.percentage_multiplier,p.start_date,p.end_date,p.note,p.status,p.status in('active','scheduled')and v_date between coalesce(p.start_date,v_date)and coalesce(p.end_date,v_date),p.calculation_version,p.created_at,p.updated_at from public.seasonal_profiles p where p.organization_id=p_organization and p.location_id=p_location
 union all select null::uuid,'Normal','Normal',100,null::date,null::date,null::text,'active',not exists(select 1 from public.seasonal_profiles p where p.organization_id=p_organization and p.location_id=p_location and p.status in('active','scheduled')and v_date between coalesce(p.start_date,v_date)and coalesce(p.end_date,v_date)),'seasonal-build-to-v1.0.0',null::timestamptz,null::timestamptz order by is_effective desc,name;
end$$;

create function public.save_seasonal_profile(p_organization uuid,p_location uuid,p_profile jsonb)returns uuid
language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare v_id uuid;v_pct integer;v_type text;
begin
 if auth.uid() is null or not public.has_location_role(p_organization,p_location,array['administrator','manager']::public.app_role[])then raise exception using errcode='42501',message='Manager access required';end if;
 v_pct=(p_profile->>'percentageMultiplier')::integer;v_type=p_profile->>'profileType';
 if v_pct<50 or v_pct>150 then raise exception using errcode='22023',message='Percentage must be between 50 and 150';end if;
 if v_type not in('Offseason','Peak season','Event week','Custom')then raise exception using errcode='22023',message='Profile type is invalid';end if;
 if coalesce(p_profile->>'status','inactive')<>'inactive'then raise exception using errcode='22023',message='New profiles must be inactive';end if;
 insert into public.seasonal_profiles(organization_id,location_id,profile_type,name,percentage_multiplier,start_date,end_date,note,status,calculation_version,created_by,updated_by)values(p_organization,p_location,v_type,btrim(p_profile->>'name'),v_pct,nullif(p_profile->>'startDate','')::date,nullif(p_profile->>'endDate','')::date,nullif(btrim(p_profile->>'note'),''),'inactive',coalesce(nullif(p_profile->>'calculationVersion',''),'seasonal-build-to-v1.0.0'),auth.uid(),auth.uid())returning id into v_id;return v_id;
end$$;

create function public.activate_seasonal_profile(p_organization uuid,p_location uuid,p_profile uuid,p_effective_date date default null)returns void
language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare v_date date:=coalesce(p_effective_date,(now()at time zone'America/St_Thomas')::date);p public.seasonal_profiles;
begin
 if auth.uid() is null or not public.has_location_role(p_organization,p_location,array['administrator','manager']::public.app_role[])then raise exception using errcode='42501',message='Manager access required';end if;
 select*into p from public.seasonal_profiles where id=p_profile and organization_id=p_organization and location_id=p_location for update;if not found then raise exception'Profile not found in this location';end if;
 if exists(select 1 from public.seasonal_profiles x where x.id<>p.id and x.organization_id=p_organization and x.location_id=p_location and x.status in('active','scheduled')and daterange(coalesce(x.start_date,'-infinity'::date),coalesce(x.end_date,'infinity'::date),'[]')&&daterange(coalesce(p.start_date,v_date),coalesce(p.end_date,'infinity'::date),'[]'))then raise exception using errcode='23P01',message='Seasonal Profile dates overlap';end if;
 update public.seasonal_profiles set status=case when coalesce(start_date,v_date)>v_date then'scheduled'else'active'end,start_date=coalesce(start_date,v_date),activated_by=auth.uid(),activated_at=now(),updated_by=auth.uid(),updated_at=now()where id=p.id;
end$$;
revoke all on function public.list_seasonal_profiles(uuid,uuid,date),public.save_seasonal_profile(uuid,uuid,jsonb),public.activate_seasonal_profile(uuid,uuid,uuid,date)from public,anon;
grant execute on function public.list_seasonal_profiles(uuid,uuid,date),public.save_seasonal_profile(uuid,uuid,jsonb),public.activate_seasonal_profile(uuid,uuid,uuid,date)to authenticated;
commit;
