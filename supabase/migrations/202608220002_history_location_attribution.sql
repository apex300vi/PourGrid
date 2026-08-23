begin;
do $$
declare v_org uuid;v_location uuid;v_org_count integer;v_location_count integer;
begin
 select count(*),min(id::text)::uuid into v_org_count,v_org from public.organizations where lower(name)='sapphire beach bar';
 if v_org_count<>1 then raise exception 'Expected one Sapphire Beach Bar organization';end if;
 select count(*),min(id::text)::uuid into v_location_count,v_location from public.locations where organization_id=v_org;
 if v_location_count<>1 then raise exception 'Expected one production location for Sapphire Beach Bar';end if;
 update public.legacy_order_references r set organization_id=v_org,location_id=v_location,assigned_at=coalesce(r.assigned_at,now()) from public.orders o where o.id=r.legacy_order_id and r.organization_id is null and r.location_id is null and coalesce(o.data->>'type','') not in('counts','deadlines') and jsonb_typeof(o.data->'items')='array';
 update public.legacy_order_references r set location_id=s.location_id from public.legacy_order_submissions s where s.order_id=r.legacy_order_id and r.location_id is null;
end$$;
commit;


