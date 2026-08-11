-- Location-scoped, read-only access to the legacy order history.
-- The historical payload remains in public.orders unchanged. Assigned legacy
-- references are tenant scoped; the unassigned fallback is available only
-- while the database contains exactly one organization and one location.
create or replace function public.get_location_order_history(
  p_organization uuid,
  p_location uuid,
  p_limit integer default 60
) returns table(id bigint,created_at timestamptz,data jsonb)
language plpgsql
security definer
stable
set search_path=pg_catalog,public,pg_temp
as $$
begin
  if auth.uid() is null or not public.has_location_role(
    p_organization,
    p_location,
    array['administrator','manager','bar_lead','inventory_staff','read_only_viewer']::public.app_role[]
  ) then
    raise exception 'Location history access required';
  end if;
  if not exists(select 1 from public.locations l where l.id=p_location and l.organization_id=p_organization) then
    raise exception 'Location is outside organization';
  end if;

  return query
  select o.id,o.created_at,o.data
  from public.orders o
  join public.legacy_order_references r on r.legacy_order_id=o.id
  where r.organization_id=p_organization
     or (
       r.organization_id is null
       and (select count(*) from public.organizations)=1
       and (select count(*) from public.locations)=1
     )
  order by o.created_at desc
  limit least(greatest(coalesce(p_limit,60),1),100);
end$$;

revoke all on function public.get_location_order_history(uuid,uuid,integer) from public,anon;
grant execute on function public.get_location_order_history(uuid,uuid,integer) to authenticated;
