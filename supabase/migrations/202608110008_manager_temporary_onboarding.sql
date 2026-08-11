begin;

create or replace function public.service_manager_can_onboard(p_actor uuid,p_organization uuid,p_location uuid) returns boolean
language sql stable security definer
set search_path=pg_catalog,public,pg_temp
as $$
  select exists(select 1 from public.memberships m join public.location_memberships lm on lm.membership_id=m.id where m.user_id=p_actor and m.organization_id=p_organization and lm.location_id=p_location and m.role in ('administrator','manager'))
$$;

create or replace function public.service_onboard_employee(
  p_actor uuid,p_organization uuid,p_location uuid,p_user uuid,p_email text,p_role public.app_role
) returns uuid
language plpgsql security definer
set search_path=pg_catalog,public,pg_temp
as $$
declare
  member_id uuid;
  current_hash text;
  normalized text:=lower(btrim(p_email));
begin
  if not exists(select 1 from public.memberships m join public.location_memberships lm on lm.membership_id=m.id where m.user_id=p_actor and m.organization_id=p_organization and lm.location_id=p_location and m.role in ('administrator','manager')) then raise exception 'Manager access required'; end if;
  if p_role not in ('bar_lead','inventory_staff','read_only_viewer') then raise exception 'Role is not available for onboarding'; end if;
  if not exists(select 1 from public.locations where id=p_location and organization_id=p_organization) then raise exception 'Location is outside organization'; end if;
  select encrypted_password into current_hash from auth.users where id=p_user and lower(email)=normalized for update;
  if not found or current_hash is null or current_hash='' then raise exception 'Authentication user is not ready'; end if;
  insert into public.profiles(id,display_name) values(p_user,split_part(normalized,'@',1)) on conflict(id) do nothing;
  insert into public.memberships(organization_id,user_id,role) values(p_organization,p_user,p_role)
  on conflict(organization_id,user_id) do update set role=excluded.role returning id into member_id;
  insert into public.location_memberships(membership_id,location_id,organization_id) values(member_id,p_location,p_organization) on conflict(membership_id,location_id) do update set organization_id=excluded.organization_id;
  insert into public.password_change_requirements(user_id,required,temporary_password_hash,issued_at,completed_at)
  values(p_user,true,current_hash,now(),null)
  on conflict(user_id) do update set required=true,temporary_password_hash=excluded.temporary_password_hash,issued_at=excluded.issued_at,completed_at=null;
  delete from auth.sessions where user_id=p_user;
  insert into public.audit_events(organization_id,location_id,actor_id,event_type,entity_table,entity_id,detail)
  values(p_organization,p_location,p_actor,'employee.temporary_access_issued','memberships',member_id,jsonb_build_object('user_id',p_user,'email',normalized,'role',p_role));
  return member_id;
end
$$;

create or replace function public.service_issue_member_temporary_password(
  p_actor uuid,p_organization uuid,p_location uuid,p_email text
) returns text
language plpgsql security definer
set search_path=pg_catalog,extensions,public,pg_temp
as $$
declare
  target_user uuid;
  temporary_password text;
begin
  if not exists(select 1 from public.memberships m join public.location_memberships lm on lm.membership_id=m.id where m.user_id=p_actor and m.organization_id=p_organization and lm.location_id=p_location and m.role in ('administrator','manager')) then raise exception 'Manager access required'; end if;
  select u.id into target_user from auth.users u join public.memberships m on m.user_id=u.id join public.location_memberships lm on lm.membership_id=m.id where lower(u.email)=lower(btrim(p_email)) and m.organization_id=p_organization and lm.location_id=p_location;
  if target_user is null then raise exception 'Authorized employee not found'; end if;
  temporary_password:=public.admin_issue_temporary_password(p_email);
  insert into public.audit_events(organization_id,location_id,actor_id,event_type,entity_table,entity_id,detail)
  values(p_organization,p_location,p_actor,'employee.temporary_access_reissued','memberships',(select id from public.memberships where organization_id=p_organization and user_id=target_user),jsonb_build_object('user_id',target_user,'email',lower(btrim(p_email))));
  return temporary_password;
end
$$;

revoke all on function public.service_manager_can_onboard(uuid,uuid,uuid),public.service_onboard_employee(uuid,uuid,uuid,uuid,text,public.app_role),public.service_issue_member_temporary_password(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.service_manager_can_onboard(uuid,uuid,uuid),public.service_onboard_employee(uuid,uuid,uuid,uuid,text,public.app_role),public.service_issue_member_temporary_password(uuid,uuid,uuid,text) to service_role;

commit;
