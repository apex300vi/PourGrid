begin;

alter function public.admin_issue_temporary_password(text)
set search_path=pg_catalog,extensions,public,pg_temp;

commit;
