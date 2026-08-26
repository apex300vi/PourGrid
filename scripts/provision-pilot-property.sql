-- Provision a second PourGrid property for the two-property pilot.
--
-- Run this once, as the Supabase service role (SQL editor or psql), after editing the four
-- values in the settings block below. It is idempotent: re-running it will not duplicate the
-- organization, the location, or the membership.
--
-- It only creates the tenancy rows. Everything the property actually counts and orders --
-- its vendor list and its own SKUs -- is created by the property itself in the app's
-- onboarding screen the first time it signs in. Nothing is copied from Sapphire.
--
-- See docs/MULTI_PROPERTY_PILOT.md for the end-to-end pilot checklist.

begin;

do $$
declare
  -- ---- settings -----------------------------------------------------------
  v_organization_name constant text := 'St. Thomas Restaurant Group';
  v_location_name     constant text := 'SeaSalt';          -- or 'Paradise Pie'
  v_lead_email        constant text := 'lead@example.com'; -- the property's PourGrid lead
  v_lead_role         constant public.app_role := 'manager';
  -- -------------------------------------------------------------------------
  v_org_id uuid;
  v_location_id uuid;
  v_user_id uuid;
  v_membership_id uuid;
begin
  insert into public.organizations(name) values (v_organization_name)
    on conflict(name) do nothing;
  select id into strict v_org_id from public.organizations where name = v_organization_name;

  insert into public.locations(organization_id, name) values (v_org_id, v_location_name)
    on conflict(organization_id, name) do nothing;
  select id into strict v_location_id
    from public.locations where organization_id = v_org_id and name = v_location_name;

  select id into v_user_id from auth.users where lower(email) = lower(btrim(v_lead_email));
  if v_user_id is null then
    raise exception 'No auth user for %. Invite them first (Supabase Auth > Users), then re-run.', v_lead_email;
  end if;

  insert into public.profiles(id) values (v_user_id) on conflict(id) do nothing;

  insert into public.memberships(organization_id, user_id, role)
    values (v_org_id, v_user_id, v_lead_role)
    on conflict(organization_id, user_id) do update set role = excluded.role
    returning id into v_membership_id;

  insert into public.location_memberships(membership_id, location_id, organization_id)
    values (v_membership_id, v_location_id, v_org_id)
    on conflict(membership_id, location_id) do update set organization_id = excluded.organization_id;

  raise notice 'Pilot property ready: % / % (organization %, location %)',
    v_organization_name, v_location_name, v_org_id, v_location_id;
end
$$;

commit;

-- Verification: the pilot property must own zero orders, zero drafts, and zero counts.
-- select l.name, count(o.id) as orders
--   from public.locations l
--   left join public.structured_orders o on o.location_id = l.id
--  group by l.name order by l.name;
