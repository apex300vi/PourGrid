-- Ensure every successful transactional legacy order is immediately visible to
-- its authorized location History reader. This migration replaces one function
-- and performs no data writes.
create or replace function public.save_location_order(
  p_organization uuid,
  p_location uuid,
  p_draft_id text,
  p_order jsonb
) returns bigint
language plpgsql
security definer
set search_path=pg_catalog,public,pg_temp
as $$
declare
  v_user uuid:=auth.uid();
  v_existing public.legacy_order_submissions%rowtype;
  v_order_id bigint;
  v_hash text;
begin
  if v_user is null or not public.has_location_role(
    p_organization,p_location,
    array['administrator','manager','bar_lead','inventory_staff']::public.app_role[]
  ) then
    raise exception using errcode='42501',message='Active ordering access is required';
  end if;
  if not exists(
    select 1 from public.locations l
    where l.id=p_location and l.organization_id=p_organization
  ) then
    raise exception using errcode='22023',message='Location is outside organization';
  end if;
  if p_order is null or jsonb_typeof(p_order)<>'object' then
    raise exception using errcode='22023',message='Order payload must be an object';
  end if;
  if nullif(btrim(p_draft_id),'') is null or p_order->>'draftId' is distinct from p_draft_id then
    raise exception using errcode='22023',message='A matching draft identity is required';
  end if;
  if coalesce(p_order->>'orderType','') not in ('bar','merchants') then
    raise exception using errcode='22023',message='Order workflow is invalid';
  end if;
  if coalesce(p_order->>'type','') in ('counts','deadlines') then
    raise exception using errcode='22023',message='Order payload is not History-visible';
  end if;
  if jsonb_typeof(p_order->'counts') is distinct from 'object' or jsonb_typeof(p_order->'items') is distinct from 'array' then
    raise exception using errcode='22023',message='Count snapshot and order items are required';
  end if;
  if jsonb_array_length(p_order->'items')=0 then
    raise exception using errcode='22023',message='At least one order item is required';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_organization::text||':'||p_location::text||':'||p_draft_id,0));
  v_hash:=md5(p_order::text);
  select * into v_existing from public.legacy_order_submissions
    where organization_id=p_organization and location_id=p_location and draft_id=p_draft_id;
  if found then
    if v_existing.payload_hash<>v_hash then
      raise exception using errcode='23505',message='This draft was already saved with different contents';
    end if;
    if not exists(
      select 1 from public.legacy_order_references r
      where r.legacy_order_id=v_existing.order_id
        and r.organization_id=p_organization
        and r.location_id=p_location
    ) then
      raise exception using errcode='23514',message='Saved order attribution is invalid';
    end if;
    return v_existing.order_id;
  end if;

  insert into public.orders(data) values(p_order) returning id into v_order_id;
  insert into public.legacy_order_references(
    legacy_order_id,classification,organization_id,location_id,assigned_by,assigned_at
  ) values(
    v_order_id,'legacy_unassigned',p_organization,p_location,v_user,now()
  );
  insert into public.legacy_order_submissions(
    order_id,organization_id,location_id,draft_id,payload_hash,created_by
  ) values(
    v_order_id,p_organization,p_location,p_draft_id,v_hash,v_user
  );

  if not exists(
    select 1 from public.legacy_order_references r
    join public.legacy_order_submissions s on s.order_id=r.legacy_order_id
    where r.legacy_order_id=v_order_id
      and r.organization_id=p_organization and r.location_id=p_location
      and s.organization_id=p_organization and s.location_id=p_location
      and s.draft_id=p_draft_id and s.payload_hash=v_hash
  ) then
    raise exception using errcode='23514',message='Saved order attribution could not be established';
  end if;
  return v_order_id;
end$$;

revoke all on function public.save_location_order(uuid,uuid,text,jsonb) from public,anon;
grant execute on function public.save_location_order(uuid,uuid,text,jsonb) to authenticated;
