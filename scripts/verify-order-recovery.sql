-- Confirms a recovered order really landed in order history, is attributed to the right
-- location, and is visible to the History reader the app uses. Read-only: no writes, no DDL.
-- Substitute the organization and location before running.
--
--   psql "$POURGRID_DATABASE_URL" \
--     -v organization="'00000000-0000-0000-0000-000000000000'" \
--     -v location="'00000000-0000-0000-0000-000000000000'" \
--     -f scripts/verify-order-recovery.sql
--
-- Or paste it into the Supabase SQL editor after replacing :organization and :location.

\if :{?organization}
\else
\set organization '00000000-0000-0000-0000-000000000000'
\endif
\if :{?location}
\else
\set location '00000000-0000-0000-0000-000000000000'
\endif

-- 1. The most recent saved orders for this location, newest first. A recovered order appears
--    here with the draft identity the device replayed.
select
  s.order_id,
  s.draft_id,
  s.created_at,
  o.data->>'orderType'   as workflow,
  o.data->>'date'        as order_date,
  o.data->>'time'        as order_time,
  jsonb_array_length(o.data->'items') as item_count,
  left(coalesce(o.data->>'note',''),60) as note
from public.legacy_order_submissions s
join public.orders o on o.id=s.order_id
where s.organization_id=:organization::uuid and s.location_id=:location::uuid
order by s.created_at desc
limit 20;

-- 2. Attribution must be consistent across both sides. Any row here is a save that wrote an
--    order without a matching, correctly scoped reference — it should return zero rows.
select s.order_id,s.draft_id,s.organization_id,s.location_id,r.organization_id as ref_organization,r.location_id as ref_location
from public.legacy_order_submissions s
left join public.legacy_order_references r on r.legacy_order_id=s.order_id
where s.organization_id=:organization::uuid and s.location_id=:location::uuid
  and (r.legacy_order_id is null or r.organization_id is distinct from s.organization_id or r.location_id is distinct from s.location_id);

-- 3. One order per draft identity. The unique constraint should make this impossible; a row
--    here would mean a recovery wrote a duplicate and needs manual reconciliation.
select draft_id,count(*) as saves,array_agg(order_id order by order_id) as order_ids
from public.legacy_order_submissions
where organization_id=:organization::uuid and location_id=:location::uuid
group by draft_id having count(*)>1;

-- 4. What the app actually reads. Run this as the authorized user (Supabase SQL editor with the
--    signed-in role, or via the REST RPC) — under psql as a superuser auth.uid() is null and the
--    function raises instead of returning rows. A recovered order must be in here to count as
--    recovered, because this is the source predictive ordering and build-to tracking consume.
select * from public.get_location_order_history_v2(:organization::uuid,:location::uuid,20,0);
