create or replace function public.list_seasonal_profiles(p_organization uuid,p_location uuid,p_on_date date default null)
returns table(id uuid,profile_type text,name text,percentage_multiplier integer,start_date date,end_date date,note text,status text,is_effective boolean,calculation_version text,created_at timestamptz,updated_at timestamptz)
language plpgsql security definer stable set search_path=pg_catalog,public,pg_temp as $$
declare v_date date:=coalesce(p_on_date,(now()at time zone'America/St_Thomas')::date);
begin
 if auth.uid() is null or not public.has_location_role(p_organization,p_location,array['administrator','manager','bar_lead','inventory_staff','read_only_viewer']::public.app_role[])then raise exception using errcode='42501',message='Seasonal Profile access required';end if;
 return query select q.id,q.profile_type,q.name,q.percentage_multiplier,q.start_date,q.end_date,q.note,q.status,q.is_effective,q.calculation_version,q.created_at,q.updated_at from (
  select p.id,p.profile_type,p.name,p.percentage_multiplier,p.start_date,p.end_date,p.note,p.status,p.status in('active','scheduled')and v_date between coalesce(p.start_date,v_date)and coalesce(p.end_date,v_date) is_effective,p.calculation_version,p.created_at,p.updated_at from public.seasonal_profiles p where p.organization_id=p_organization and p.location_id=p_location
  union all
  select null::uuid,'Normal','Normal',100,null::date,null::date,null::text,'active',not exists(select 1 from public.seasonal_profiles p where p.organization_id=p_organization and p.location_id=p_location and p.status in('active','scheduled')and v_date between coalesce(p.start_date,v_date)and coalesce(p.end_date,v_date)),'seasonal-build-to-v1.0.0',null::timestamptz,null::timestamptz
 )q order by q.is_effective desc,q.name;
end$$;
revoke all on function public.list_seasonal_profiles(uuid,uuid,date) from public,anon;
grant execute on function public.list_seasonal_profiles(uuid,uuid,date) to authenticated;
