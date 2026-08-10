create type public.invitation_status as enum ('pending','accepted','revoked');

create table public.access_invitations(
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  location_id uuid not null,
  email text not null check(email=lower(btrim(email)) and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  role public.app_role not null default 'bar_lead',
  status public.invitation_status not null default 'pending',
  sent_at timestamptz not null default now(),
  expires_at timestamptz not null default (now()+interval '72 hours'),
  resend_count integer not null default 0 check(resend_count>=0),
  invited_by uuid not null references public.profiles(id),
  accepted_by uuid references public.profiles(id),
  accepted_at timestamptz,
  revoked_by uuid references public.profiles(id),
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  constraint invitation_location_org_fk foreign key(location_id,organization_id) references public.locations(id,organization_id),
  constraint invitation_role_limited check(role in ('bar_lead','inventory_staff','read_only_viewer')),
  constraint invitation_terminal_state check(
    (status='pending' and accepted_at is null and revoked_at is null) or
    (status='accepted' and accepted_at is not null and accepted_by is not null and revoked_at is null) or
    (status='revoked' and revoked_at is not null and revoked_by is not null and accepted_at is null)
  )
);
create unique index one_pending_invitation_per_location_email on public.access_invitations(organization_id,location_id,email) where status='pending';
create index invitation_email_status on public.access_invitations(email,status,expires_at desc);
alter table public.access_invitations enable row level security;
revoke all on public.access_invitations from anon,authenticated;

-- Bar Leads can read their tenant and perform order/receiving work. They cannot
-- administer access, edit catalog data, approve exceptions, reconcile, or create/finalize baselines.
drop policy if exists tenant_read on public.organizations;
create policy tenant_read on public.organizations for select to authenticated using(public.has_org_role(id,array['administrator','manager','bar_lead','inventory_staff','read_only_viewer']::public.app_role[]));
drop policy if exists tenant_read on public.locations;
create policy tenant_read on public.locations for select to authenticated using(public.has_location_role(organization_id,id,array['administrator','manager','bar_lead','inventory_staff','read_only_viewer']::public.app_role[]));
do $$declare t text; begin foreach t in array array['structured_orders','receiving_sessions','approved_exceptions','inventory_baselines','location_inventory_balances','inventory_movements','reconciliation_requests','audit_events'] loop
 execute format('drop policy if exists tenant_read on public.%I',t);
 execute format('create policy tenant_read on public.%I for select to authenticated using (public.has_location_role(organization_id,location_id,array[''administrator'',''manager'',''bar_lead'',''inventory_staff'',''read_only_viewer'']::public.app_role[]))',t);
end loop; end$$;
do $$declare t text; begin foreach t in array array['vendors','inventory_items'] loop
 execute format('drop policy if exists tenant_read on public.%I',t);
 execute format('create policy tenant_read on public.%I for select to authenticated using(public.has_org_role(organization_id,array[''administrator'',''manager'',''bar_lead'',''inventory_staff'',''read_only_viewer'']::public.app_role[]))',t);
end loop; end$$;
drop policy if exists order_line_read on public.order_lines;
create policy order_line_read on public.order_lines for select to authenticated using(exists(select 1 from public.structured_orders o where o.id=order_id and public.has_location_role(o.organization_id,o.location_id,array['administrator','manager','bar_lead','inventory_staff','read_only_viewer']::public.app_role[])));
drop policy if exists receiving_line_read on public.receiving_lines;
create policy receiving_line_read on public.receiving_lines for select to authenticated using(exists(select 1 from public.receiving_sessions s where s.id=session_id and public.has_location_role(s.organization_id,s.location_id,array['administrator','manager','bar_lead','inventory_staff','read_only_viewer']::public.app_role[])));
drop policy if exists baseline_line_read on public.inventory_baseline_lines;
create policy baseline_line_read on public.inventory_baseline_lines for select to authenticated using(exists(select 1 from public.inventory_baselines b where b.id=baseline_id and public.has_location_role(b.organization_id,b.location_id,array['administrator','manager','bar_lead','inventory_staff','read_only_viewer']::public.app_role[])));

drop policy if exists order_insert on public.structured_orders;
create policy order_insert on public.structured_orders for insert to authenticated with check(created_by=auth.uid() and public.has_location_role(organization_id,location_id,array['administrator','manager','bar_lead','inventory_staff']::public.app_role[]));
drop policy if exists order_update on public.structured_orders;
create policy order_update on public.structured_orders for update to authenticated using(public.has_location_role(organization_id,location_id,array['administrator','manager','bar_lead','inventory_staff']::public.app_role[])) with check(created_by=auth.uid() and public.has_location_role(organization_id,location_id,array['administrator','manager','bar_lead','inventory_staff']::public.app_role[]));
drop policy if exists order_line_insert on public.order_lines;
create policy order_line_insert on public.order_lines for insert to authenticated with check(exists(select 1 from public.structured_orders o where o.id=order_id and o.status='draft' and public.has_location_role(o.organization_id,o.location_id,array['administrator','manager','bar_lead','inventory_staff']::public.app_role[])));
drop policy if exists order_line_update on public.order_lines;
create policy order_line_update on public.order_lines for update to authenticated using(exists(select 1 from public.structured_orders o where o.id=order_id and o.status='draft' and public.has_location_role(o.organization_id,o.location_id,array['administrator','manager','bar_lead','inventory_staff']::public.app_role[]))) with check(exists(select 1 from public.structured_orders o where o.id=order_id and o.status='draft' and public.has_location_role(o.organization_id,o.location_id,array['administrator','manager','bar_lead','inventory_staff']::public.app_role[])));
drop policy if exists session_insert on public.receiving_sessions;
create policy session_insert on public.receiving_sessions for insert to authenticated with check(created_by=auth.uid() and status='in_progress' and public.has_location_role(organization_id,location_id,array['administrator','manager','bar_lead','inventory_staff']::public.app_role[]));
drop policy if exists session_update on public.receiving_sessions;
create policy session_update on public.receiving_sessions for update to authenticated using(status='in_progress' and public.has_location_role(organization_id,location_id,array['administrator','manager','bar_lead','inventory_staff']::public.app_role[])) with check(status='in_progress' and created_by=auth.uid() and public.has_location_role(organization_id,location_id,array['administrator','manager','bar_lead','inventory_staff']::public.app_role[]));
drop policy if exists receiving_line_insert on public.receiving_lines;
create policy receiving_line_insert on public.receiving_lines for insert to authenticated with check(exists(select 1 from public.receiving_sessions s where s.id=session_id and s.status='in_progress' and public.has_location_role(s.organization_id,s.location_id,array['administrator','manager','bar_lead','inventory_staff']::public.app_role[])));
drop policy if exists receiving_line_update on public.receiving_lines;
create policy receiving_line_update on public.receiving_lines for update to authenticated using(exists(select 1 from public.receiving_sessions s where s.id=session_id and s.status='in_progress' and public.has_location_role(s.organization_id,s.location_id,array['administrator','manager','bar_lead','inventory_staff']::public.app_role[]))) with check(exists(select 1 from public.receiving_sessions s where s.id=session_id and s.status='in_progress' and public.has_location_role(s.organization_id,s.location_id,array['administrator','manager','bar_lead','inventory_staff']::public.app_role[])));

create function public.admin_create_invitation(p_organization uuid,p_location uuid,p_email text,p_role public.app_role default 'bar_lead') returns public.access_invitations
language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare normalized text:=lower(btrim(p_email)); result public.access_invitations; existing_user uuid;
begin
 if not public.has_org_role(p_organization,array['administrator']::public.app_role[]) then raise exception 'Administrator access required'; end if;
 if not exists(select 1 from public.locations l where l.id=p_location and l.organization_id=p_organization) then raise exception 'Location is outside organization'; end if;
 if p_role not in ('bar_lead','inventory_staff','read_only_viewer') then raise exception 'Role is not invitational'; end if;
 if normalized !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'Valid email required'; end if;
 select id into existing_user from auth.users where lower(email)=normalized;
 if existing_user is not null and exists(select 1 from public.memberships where organization_id=p_organization and user_id=existing_user) then raise exception 'User already belongs to this organization'; end if;
 select * into result from public.access_invitations where organization_id=p_organization and location_id=p_location and email=normalized and status='pending';
 if found then return result; end if;
 insert into public.access_invitations(organization_id,location_id,email,role,invited_by) values(p_organization,p_location,normalized,p_role,auth.uid()) returning * into result;
 return result;
end$$;

create function public.admin_list_invitations(p_organization uuid,p_location uuid) returns table(id uuid,email text,role public.app_role,state text,sent_at timestamptz,expires_at timestamptz,resend_count integer,accepted_by uuid)
language plpgsql security definer stable set search_path=pg_catalog,public,pg_temp as $$begin
 if not public.has_org_role(p_organization,array['administrator']::public.app_role[]) then raise exception 'Administrator access required'; end if;
 if not exists(select 1 from public.locations l where l.id=p_location and l.organization_id=p_organization) then raise exception 'Location is outside organization'; end if;
 return query select i.id,i.email,i.role,case when i.status='pending' and i.expires_at<=now() then 'expired' else i.status::text end,i.sent_at,i.expires_at,i.resend_count,i.accepted_by from public.access_invitations i where i.organization_id=p_organization and i.location_id=p_location order by i.created_at desc;
end$$;

create function public.admin_resend_invitation(p_invitation uuid) returns public.access_invitations
language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$declare result public.access_invitations; begin
 select * into result from public.access_invitations where id=p_invitation for update;
 if not found then raise exception 'Unknown invitation'; end if;
 if not public.has_org_role(result.organization_id,array['administrator']::public.app_role[]) then raise exception 'Administrator access required'; end if;
 if result.status<>'pending' then raise exception 'Only pending or expired invitations can be resent'; end if;
 update public.access_invitations set sent_at=now(),expires_at=now()+interval '72 hours',resend_count=resend_count+1 where id=p_invitation returning * into result;
 return result;
end$$;

create function public.admin_revoke_invitation(p_invitation uuid) returns void
language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$declare result public.access_invitations; begin
 select * into result from public.access_invitations where id=p_invitation for update;
 if not found then raise exception 'Unknown invitation'; end if;
 if not public.has_org_role(result.organization_id,array['administrator']::public.app_role[]) then raise exception 'Administrator access required'; end if;
 if result.status<>'pending' then raise exception 'Only pending invitations can be revoked'; end if;
 update public.access_invitations set status='revoked',revoked_by=auth.uid(),revoked_at=now() where id=p_invitation;
end$$;

create function public.accept_access_invitation() returns boolean
language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare normalized text:=lower(coalesce(auth.jwt()->>'email','')); issued_at timestamptz:=to_timestamp(coalesce((auth.jwt()->>'iat')::bigint,0)); invitation public.access_invitations; member_id uuid;
begin
 if auth.uid() is null or normalized='' then return false; end if;
 select * into invitation from public.access_invitations where email=normalized and status='pending' and expires_at>now() and sent_at<=issued_at+interval '5 seconds' order by sent_at desc limit 1 for update;
 if not found then return false; end if;
 insert into public.profiles(id,display_name) values(auth.uid(),coalesce(nullif(auth.jwt()->>'user_name',''),split_part(normalized,'@',1))) on conflict(id) do nothing;
 insert into public.memberships(organization_id,user_id,role) values(invitation.organization_id,auth.uid(),invitation.role) on conflict(organization_id,user_id) do nothing returning id into member_id;
 if member_id is null then select id into member_id from public.memberships where organization_id=invitation.organization_id and user_id=auth.uid(); end if;
 insert into public.location_memberships(membership_id,location_id,organization_id) values(member_id,invitation.location_id,invitation.organization_id) on conflict do nothing;
 update public.access_invitations set status='accepted',accepted_by=auth.uid(),accepted_at=now() where id=invitation.id;
 return true;
end$$;

create function public.admin_change_member_role(p_organization uuid,p_user uuid,p_role public.app_role) returns void
language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$begin
 if not public.has_org_role(p_organization,array['administrator']::public.app_role[]) then raise exception 'Administrator access required'; end if;
 if p_user=auth.uid() then raise exception 'Administrators cannot change their own role'; end if;
 if p_role not in ('bar_lead','inventory_staff','read_only_viewer') then raise exception 'Role change is not permitted'; end if;
 update public.memberships set role=p_role where organization_id=p_organization and user_id=p_user;
 if not found then raise exception 'Unknown organization member'; end if;
 update public.access_invitations set role=p_role where organization_id=p_organization and accepted_by=p_user and status='accepted';
end$$;

revoke all on function public.admin_create_invitation(uuid,uuid,text,public.app_role),public.admin_list_invitations(uuid,uuid),public.admin_resend_invitation(uuid),public.admin_revoke_invitation(uuid),public.accept_access_invitation(),public.admin_change_member_role(uuid,uuid,public.app_role) from public,anon;
grant execute on function public.admin_create_invitation(uuid,uuid,text,public.app_role),public.admin_list_invitations(uuid,uuid),public.admin_resend_invitation(uuid),public.admin_revoke_invitation(uuid),public.accept_access_invitation(),public.admin_change_member_role(uuid,uuid,public.app_role) to authenticated;
