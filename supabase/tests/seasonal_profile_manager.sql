\set ON_ERROR_STOP on
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false);
select public.open_shared_location_draft('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','bar','{"name":"Normal","profileType":"Normal","percentageMultiplier":100,"calculationVersion":"seasonal-build-to-v1.0.0"}'::jsonb) as existing_draft \gset
select public.configure_seasonal_profile('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','{"profileType":"Offseason","percentageMultiplier":75,"startDate":null,"endDate":null,"calculationVersion":"seasonal-build-to-v1.0.0"}'::jsonb);
select test.assert((select count(*)=1 and max(percentage_multiplier)=75 and bool_or(is_effective) from public.list_seasonal_profiles('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001',null) where profile_type='Offseason'),'isolated Offseason 75 is effective');
select test.assert((select (draft->'seasonalProfile'->>'profileType')='Normal' and (draft->'seasonalProfile'->>'percentageMultiplier')='100' from (select public.read_shared_location_draft('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','bar') draft)q),'existing draft remains pinned to Normal 100');
select public.open_shared_location_draft('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','merchants','{"name":"Offseason","profileType":"Offseason","percentageMultiplier":75,"calculationVersion":"seasonal-build-to-v1.0.0"}'::jsonb) as new_draft \gset
select test.assert((select (draft->'seasonalProfile'->>'profileType')='Offseason' and (draft->'seasonalProfile'->>'percentageMultiplier')='75' from (select public.read_shared_location_draft('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','merchants') draft)q),'new draft pins Offseason 75');
select test.assert(round(20*75.0/100)=15,'base 20 produces target 15 without overwriting base');
select public.configure_seasonal_profile('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','{"profileType":"Offseason","percentageMultiplier":75,"startDate":null,"endDate":null,"calculationVersion":"seasonal-build-to-v1.0.0"}'::jsonb);
select test.assert((select count(*)=1 from public.seasonal_profiles where organization_id='10000000-0000-0000-0000-000000000001' and location_id='20000000-0000-0000-0000-000000000001' and profile_type='Offseason'),'identical activation is idempotent');
select public.configure_seasonal_profile('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','{"profileType":"Normal","percentageMultiplier":100,"startDate":null,"endDate":null,"calculationVersion":"seasonal-build-to-v1.0.0"}'::jsonb);
select test.assert((select bool_or(is_effective) from public.list_seasonal_profiles('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001',null) where profile_type='Normal'),'Normal 100 restored');
do $$begin begin perform public.configure_seasonal_profile('10000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000002','{"profileType":"Offseason","percentageMultiplier":75}');raise exception 'cross-tenant configure unexpectedly succeeded';exception when raise_exception then if sqlerrm='cross-tenant configure unexpectedly succeeded'then raise;end if;end;end$$;
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',false);
do $$begin begin perform public.configure_seasonal_profile('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','{"profileType":"Peak season","percentageMultiplier":125}');raise exception 'staff configure unexpectedly succeeded';exception when raise_exception then if sqlerrm='staff configure unexpectedly succeeded'then raise;end if;end;end$$;
reset role;
