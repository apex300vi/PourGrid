begin;

create table if not exists public.password_change_requirements(
  user_id uuid primary key references auth.users(id) on delete cascade,
  required boolean not null default true,
  temporary_password_hash text,
  issued_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint password_change_requirement_state check (
    (required and temporary_password_hash is not null and completed_at is null)
    or (not required and temporary_password_hash is null and completed_at is not null)
  )
);

alter table public.password_change_requirements enable row level security;
revoke all on public.password_change_requirements from public,anon,authenticated;

create or replace function public.password_change_required() returns boolean
language sql stable security definer
set search_path=pg_catalog,public,pg_temp
as $$
  select coalesce((select r.required from public.password_change_requirements r where r.user_id=auth.uid()),false)
$$;

create or replace function public.complete_required_password_change() returns boolean
language plpgsql security definer
set search_path=pg_catalog,public,pg_temp
as $$
declare
  current_user_id uuid:=auth.uid();
  temporary_hash text;
  current_hash text;
  current_session text:=coalesce(auth.jwt()->>'session_id','');
begin
  if current_user_id is null then raise exception 'Authentication required'; end if;
  select temporary_password_hash into temporary_hash from public.password_change_requirements where user_id=current_user_id and required for update;
  if not found then return false; end if;
  select encrypted_password into current_hash from auth.users where id=current_user_id;
  if current_hash is null or current_hash=temporary_hash then raise exception 'A permanent password must be saved first'; end if;
  update public.password_change_requirements set required=false,temporary_password_hash=null,completed_at=now() where user_id=current_user_id;
  if current_session<>'' then delete from auth.sessions where user_id=current_user_id and id::text<>current_session; end if;
  return true;
end
$$;

create or replace function public.admin_issue_temporary_password(p_email text) returns text
language plpgsql security definer
set search_path=pg_catalog,public,pg_temp
as $$
declare
  target_user auth.users%rowtype;
  alphabet constant text:='ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*_-+=';
  random_bytes bytea:=gen_random_bytes(24);
  temporary_password text:='';
  temporary_hash text;
  i integer;
begin
  select * into target_user from auth.users where lower(email)=lower(btrim(p_email)) for update;
  if not found then raise exception 'Existing authentication user not found'; end if;
  for i in 0..23 loop temporary_password:=temporary_password||substr(alphabet,(get_byte(random_bytes,i)%length(alphabet))+1,1); end loop;
  temporary_hash:=crypt(temporary_password,gen_salt('bf',12));
  update auth.users set encrypted_password=temporary_hash,updated_at=now() where id=target_user.id;
  insert into public.password_change_requirements(user_id,required,temporary_password_hash,issued_at,completed_at)
  values(target_user.id,true,temporary_hash,now(),null)
  on conflict(user_id) do update set required=true,temporary_password_hash=excluded.temporary_password_hash,issued_at=excluded.issued_at,completed_at=null;
  delete from auth.sessions where user_id=target_user.id;
  return temporary_password;
end
$$;

revoke all on function public.password_change_required(),public.complete_required_password_change(),public.admin_issue_temporary_password(text) from public,anon,authenticated;
grant execute on function public.password_change_required(),public.complete_required_password_change() to authenticated;

commit;
