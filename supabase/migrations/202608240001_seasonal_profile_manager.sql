begin;
create or replace function public.configure_seasonal_profile(p_organization uuid,p_location uuid,p_profile jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare v_type text:=p_profile->>'profileType';v_pct integer:=coalesce((p_profile->>'percentageMultiplier')::integer,100);v_start date:=coalesce(nullif(p_profile->>'startDate','')::date,(now() at time zone 'America/St_Thomas')::date);v_end date:=nullif(p_profile->>'endDate','')::date;v_today date:=(now() at time zone 'America/St_Thomas')::date;v_id uuid;
begin
 if auth.uid() is null or not public.has_location_role(p_organization,p_location,array['administrator','manager']::public.app_role[]) then raise exception using errcode='42501',message='Manager access required';end if;
 if not exists(select 1 from public.locations where id=p_location and organization_id=p_organization) then raise exception using errcode='42501',message='Location is outside organization';end if;
 if v_type not in('Normal','Offseason','Peak season','Event week','Custom') or v_pct<50 or v_pct>150 or v_pct%5<>0 then raise exception using errcode='22023',message='Profile selection is invalid';end if;
 if v_type='Normal' and v_pct<>100 then raise exception using errcode='22023',message='Normal is fixed at 100 percent';end if;
 if v_end is not null and v_end<v_start then raise exception using errcode='22023',message='End date precedes start date';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_organization::text||p_location::text,0));
 if v_type='Normal' then
  update public.seasonal_profiles set status=case when status='scheduled' then'archived'else'expired'end,end_date=least(coalesce(end_date,v_today),v_today),updated_by=auth.uid(),updated_at=now() where organization_id=p_organization and location_id=p_location and status in('active','scheduled');
  return jsonb_build_object('profileType','Normal','percentageMultiplier',100,'status','active','message','Normal 100% restored');
 end if;
 if exists(select 1 from public.seasonal_profiles x where x.organization_id=p_organization and x.location_id=p_location and x.profile_type<>v_type and x.status='scheduled' and daterange(x.start_date,coalesce(x.end_date,'infinity'::date),'[]')&&daterange(v_start,coalesce(v_end,'infinity'::date),'[]')) then raise exception using errcode='23P01',message='Seasonal Profile dates overlap';end if;
 if v_start>v_today then
  if exists(select 1 from public.seasonal_profiles where organization_id=p_organization and location_id=p_location and profile_type=v_type and status='active') then raise exception using errcode='23P01',message='The active profile cannot also be scheduled';end if;
  update public.seasonal_profiles set end_date=least(coalesce(end_date,v_start-1),v_start-1),updated_by=auth.uid(),updated_at=now() where organization_id=p_organization and location_id=p_location and status='active' and start_date<v_start;
 else
  if v_end is null then select min(start_date)-1 into v_end from public.seasonal_profiles where organization_id=p_organization and location_id=p_location and status='scheduled' and start_date>v_today;end if;
  update public.seasonal_profiles set status='expired',end_date=least(coalesce(end_date,v_today),v_today),updated_by=auth.uid(),updated_at=now() where organization_id=p_organization and location_id=p_location and profile_type<>v_type and status='active';
 end if;
 insert into public.seasonal_profiles(organization_id,location_id,profile_type,name,percentage_multiplier,start_date,end_date,note,status,calculation_version,created_by,updated_by,activated_by,activated_at)
 values(p_organization,p_location,v_type,v_type,v_pct,v_start,v_end,'Automatically recorded: '||v_type||' '||v_pct||'% from '||v_start||coalesce(' through '||v_end,''),case when v_start>v_today then'scheduled'else'active'end,coalesce(nullif(p_profile->>'calculationVersion',''),'seasonal-build-to-v1.0.0'),auth.uid(),auth.uid(),auth.uid(),now())
 on conflict(organization_id,location_id,name) do update set percentage_multiplier=excluded.percentage_multiplier,start_date=excluded.start_date,end_date=excluded.end_date,note=excluded.note,status=excluded.status,calculation_version=excluded.calculation_version,updated_by=auth.uid(),updated_at=now(),activated_by=auth.uid(),activated_at=now() returning id into v_id;
 return jsonb_build_object('id',v_id,'profileType',v_type,'percentageMultiplier',v_pct,'status',case when v_start>v_today then'scheduled'else'active'end,'message',v_type||' '||v_pct||'% '||case when v_start>v_today then'scheduled'else'activated'end);
end$$;
revoke all on function public.configure_seasonal_profile(uuid,uuid,jsonb) from public,anon;
grant execute on function public.configure_seasonal_profile(uuid,uuid,jsonb) to authenticated;
drop policy if exists seasonal_profile_location_read on public.seasonal_profiles;
create policy seasonal_profile_location_read on public.seasonal_profiles for select to authenticated using(public.has_location_role(organization_id,location_id,array['administrator','manager']::public.app_role[]));
grant select on public.seasonal_profiles to authenticated;
do $$begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') and not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='seasonal_profiles') then alter publication supabase_realtime add table public.seasonal_profiles;end if;
end$$;
create or replace function public.save_seasonal_profile(p_organization uuid,p_location uuid,p_profile jsonb) returns uuid
language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare v_result jsonb;
begin
 v_result:=public.configure_seasonal_profile(p_organization,p_location,p_profile);
 return nullif(v_result->>'id','')::uuid;
end$$;
commit;
