begin;

update public.password_change_requirements r
set required=false,temporary_password_hash=null,completed_at=coalesce(r.completed_at,now())
from auth.users u
where r.user_id=u.id and r.required
  and u.encrypted_password is distinct from r.temporary_password_hash;

create or replace function public.password_change_required() returns boolean
language plpgsql volatile security definer
set search_path=pg_catalog,public,pg_temp
as $$
declare
  current_user_id uuid:=auth.uid();
  requirement public.password_change_requirements%rowtype;
  current_hash text;
begin
  if current_user_id is null then return false; end if;
  select * into requirement from public.password_change_requirements where user_id=current_user_id for update;
  if not found or not requirement.required then return false; end if;
  select encrypted_password into current_hash from auth.users where id=current_user_id;
  if current_hash is distinct from requirement.temporary_password_hash then
    update public.password_change_requirements
    set required=false,temporary_password_hash=null,completed_at=coalesce(completed_at,now())
    where user_id=current_user_id;
    return false;
  end if;
  return true;
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
  target_role public.app_role;
  temporary_password text;
begin
  if not exists(select 1 from public.memberships m join public.location_memberships lm on lm.membership_id=m.id where m.user_id=p_actor and m.organization_id=p_organization and lm.location_id=p_location and m.role in ('administrator','manager')) then raise exception 'Manager access required'; end if;
  select u.id,m.role into target_user,target_role from auth.users u join public.memberships m on m.user_id=u.id join public.location_memberships lm on lm.membership_id=m.id where lower(u.email)=lower(btrim(p_email)) and m.organization_id=p_organization and lm.location_id=p_location;
  if target_user is null then raise exception 'Authorized employee not found'; end if;
  if target_user=p_actor or target_role in ('administrator','manager') then raise exception 'Privileged accounts cannot receive temporary access'; end if;
  temporary_password:=public.admin_issue_temporary_password(p_email);
  insert into public.audit_events(organization_id,location_id,actor_id,event_type,entity_table,entity_id,detail)
  values(p_organization,p_location,p_actor,'employee.temporary_access_reissued','memberships',(select id from public.memberships where organization_id=p_organization and user_id=target_user),jsonb_build_object('user_id',target_user,'email',lower(btrim(p_email))));
  return temporary_password;
end
$$;

revoke all on function public.password_change_required() from public,anon,authenticated;
grant execute on function public.password_change_required() to authenticated;
revoke all on function public.service_issue_member_temporary_password(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.service_issue_member_temporary_password(uuid,uuid,uuid,text) to service_role;

commit;
