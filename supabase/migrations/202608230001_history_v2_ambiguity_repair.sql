create or replace function public.get_location_order_history_v2(p_organization uuid,p_location uuid,p_limit integer default 100,p_offset integer default 0)
returns table(source text,source_id text,dedupe_key text,created_at timestamptz,payload jsonb)
language plpgsql security definer stable set search_path=pg_catalog,public,pg_temp as $$
begin
 if auth.uid() is null or not public.has_location_role(p_organization,p_location,array['administrator','manager','bar_lead','inventory_staff','read_only_viewer']::public.app_role[]) then raise exception using errcode='42501',message='Location history access required';end if;
 if not exists(select 1 from public.locations where id=p_location and organization_id=p_organization) then raise exception using errcode='42501',message='Location is outside organization';end if;
 return query with unified as (
  select 'legacy'::text source,o.id::text source_id,coalesce(nullif(o.data->>'draftId',''),'legacy:'||o.id::text) dedupe_key,o.created_at,o.data payload
  from public.orders o join public.legacy_order_references lr on lr.legacy_order_id=o.id where lr.organization_id=p_organization and lr.location_id=p_location and coalesce(o.data->>'type','') not in ('counts','deadlines')
  union all
  select 'structured',so.id::text,'structured:'||so.id::text,coalesce(so.submitted_at,so.created_at),jsonb_build_object('id',so.id,'date',to_char(coalesce(so.submitted_at,so.created_at) at time zone 'America/St_Thomas','YYYY-MM-DD'),'time',to_char(coalesce(so.submitted_at,so.created_at) at time zone 'America/St_Thomas','HH12:MI AM'),'orderType',so.workflow,'items',coalesce((select jsonb_agg(jsonb_build_object('productId',ol.item_id,'name',ii.name,'calculatedOrderQty',ol.draft_units,'finalOrderQty',ol.submitted_units,'packageSize',ol.units_per_package) order by ii.name) from public.order_lines ol join public.inventory_items ii on ii.id=ol.item_id where ol.order_id=so.id),'[]'::jsonb),'counts',null,'calculationVersion','structured-v1')
  from public.structured_orders so where so.organization_id=p_organization and so.location_id=p_location and so.status<>'draft'
 ),ranked as(select u.*,row_number() over(partition by u.dedupe_key order by(u.source='structured')desc,u.created_at desc,u.source_id desc)n from unified u)
 select r.source,r.source_id,r.dedupe_key,r.created_at,r.payload from ranked r where r.n=1 order by r.created_at desc,r.source_id desc limit least(greatest(coalesce(p_limit,100),1),100) offset greatest(coalesce(p_offset,0),0);
end$$;
revoke all on function public.get_location_order_history_v2(uuid,uuid,integer,integer) from public,anon;
grant execute on function public.get_location_order_history_v2(uuid,uuid,integer,integer) to authenticated;
