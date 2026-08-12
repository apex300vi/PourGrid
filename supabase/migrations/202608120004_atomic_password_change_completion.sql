begin;

create or replace function public.complete_password_requirement_on_auth_update()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public,pg_temp
as $$
begin
  if old.encrypted_password is distinct from new.encrypted_password then
    update public.password_change_requirements
    set required=false,
        temporary_password_hash=null,
        completed_at=now()
    where user_id=new.id
      and required
      and temporary_password_hash=old.encrypted_password;
  end if;
  return new;
end
$$;

revoke all on function public.complete_password_requirement_on_auth_update() from public,anon,authenticated;

drop trigger if exists complete_password_requirement_on_auth_update on auth.users;
create trigger complete_password_requirement_on_auth_update
after update of encrypted_password on auth.users
for each row
execute function public.complete_password_requirement_on_auth_update();

commit;
