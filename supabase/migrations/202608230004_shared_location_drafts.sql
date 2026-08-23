-- Atomic, tenant-scoped, realtime in-progress order collaboration.
create table public.shared_location_drafts(
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id),
 location_id uuid not null references public.locations(id),
 workspace text not null check(workspace in('bar','merchants')),
 state text not null default 'active' check(state in('active','finalizing','closed','abandoned')),
 revision bigint not null default 0 check(revision>=0),
 reviewed_revision bigint,
 seasonal_snapshot jsonb not null default '{"name":"Normal","profileType":"Normal","percentageMultiplier":100,"calculationVersion":"seasonal-build-to-v1.0.0"}'::jsonb,
 workflow_state jsonb not null default '{}'::jsonb,
 final_order_id bigint references public.orders(id),
 created_by uuid not null references public.profiles(id),
 created_at timestamptz not null default now(),
 updated_by uuid not null references public.profiles(id),
 updated_at timestamptz not null default now(),
 closed_at timestamptz,
 check(location_id is not null)
);
create unique index shared_location_drafts_one_active on public.shared_location_drafts(organization_id,location_id,workspace) where state in('active','finalizing');
create index shared_location_drafts_scope on public.shared_location_drafts(organization_id,location_id,workspace,updated_at desc);

create table public.shared_draft_fields(
 draft_id uuid not null references public.shared_location_drafts(id) on delete cascade,
 product_key text not null,
 field_key text not null check(field_key in('count','cases','halves','loose','adjustment','adjustment_meta','note','touched','review_state')),
 value jsonb not null,
 revision bigint not null check(revision>0),
 updated_by uuid not null references public.profiles(id),
 updated_at timestamptz not null default now(),
 primary key(draft_id,product_key,field_key)
);
create index shared_draft_fields_revision on public.shared_draft_fields(draft_id,revision);

create table public.shared_draft_mutations(
 draft_id uuid not null references public.shared_location_drafts(id) on delete cascade,
 idempotency_key uuid not null,
 product_key text not null,
 field_key text not null,
 expected_field_revision bigint,
 resulting_revision bigint not null,
 actor_id uuid not null references public.profiles(id),
 created_at timestamptz not null default now(),
 primary key(draft_id,idempotency_key)
);

create table public.shared_draft_conflicts(
 id uuid primary key default gen_random_uuid(),draft_id uuid not null references public.shared_location_drafts(id) on delete cascade,
 product_key text not null,field_key text not null,server_value jsonb not null,incoming_value jsonb not null,
 server_revision bigint not null,expected_revision bigint,created_by uuid not null references public.profiles(id),created_at timestamptz not null default now(),resolved_at timestamptz,resolved_by uuid references public.profiles(id)
);
create index shared_draft_conflicts_open on public.shared_draft_conflicts(draft_id,created_at) where resolved_at is null;

create table public.shared_draft_audit(
 id bigint generated always as identity primary key,draft_id uuid not null references public.shared_location_drafts(id) on delete cascade,
 actor_id uuid not null references public.profiles(id),product_key text not null,field_key text not null,revision bigint not null,event text not null check(event in('created','updated','conflict','imported','reviewed','finalized','abandoned')),created_at timestamptz not null default now()
);
create index shared_draft_audit_revision on public.shared_draft_audit(draft_id,revision);

create table public.shared_draft_presence(
 draft_id uuid not null references public.shared_location_drafts(id) on delete cascade,session_id uuid not null,user_id uuid not null references public.profiles(id),last_seen_at timestamptz not null default now(),primary key(draft_id,session_id)
);
create index shared_draft_presence_expiry on public.shared_draft_presence(draft_id,last_seen_at);

alter table public.shared_location_drafts enable row level security;
alter table public.shared_draft_fields enable row level security;
alter table public.shared_draft_mutations enable row level security;
alter table public.shared_draft_conflicts enable row level security;
alter table public.shared_draft_audit enable row level security;
alter table public.shared_draft_presence enable row level security;
revoke all on public.shared_location_drafts,public.shared_draft_fields,public.shared_draft_mutations,public.shared_draft_conflicts,public.shared_draft_audit,public.shared_draft_presence from public,anon,authenticated;

create function public.require_shared_draft_access(p_organization uuid,p_location uuid,p_write boolean default false) returns uuid language plpgsql security definer stable set search_path=pg_catalog,public,pg_temp as $$
declare actor uuid:=auth.uid();roles public.app_role[];
begin
 roles:=case when p_write then array['administrator','manager','bar_lead','inventory_staff']::public.app_role[] else array['administrator','manager','bar_lead','inventory_staff','read_only_viewer']::public.app_role[] end;
 if actor is null or not public.has_location_role(p_organization,p_location,roles) then raise exception using errcode='42501',message='Shared draft location access required';end if;
 if not exists(select 1 from public.locations l where l.id=p_location and l.organization_id=p_organization) then raise exception using errcode='42501',message='Location is outside organization';end if;
 return actor;
end$$;
revoke all on function public.require_shared_draft_access(uuid,uuid,boolean) from public,anon,authenticated;

create function public.open_shared_location_draft(p_organization uuid,p_location uuid,p_workspace text,p_seasonal_snapshot jsonb default null) returns uuid language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare actor uuid;draft uuid;
begin
 actor:=public.require_shared_draft_access(p_organization,p_location,true);
 if p_workspace not in('bar','merchants') then raise exception using errcode='22023',message='Invalid shared draft workspace';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_organization::text||':'||p_location::text||':'||p_workspace,0));
 select d.id into draft from public.shared_location_drafts d where d.organization_id=p_organization and d.location_id=p_location and d.workspace=p_workspace and d.state in('active','finalizing') for update;
 if draft is null then
  insert into public.shared_location_drafts(organization_id,location_id,workspace,seasonal_snapshot,created_by,updated_by) values(p_organization,p_location,p_workspace,coalesce(p_seasonal_snapshot,'{"name":"Normal","profileType":"Normal","percentageMultiplier":100,"calculationVersion":"seasonal-build-to-v1.0.0"}'::jsonb),actor,actor) returning id into draft;
  insert into public.shared_draft_audit(draft_id,actor_id,product_key,field_key,revision,event) values(draft,actor,'$draft','$state',0,'created');
 end if;return draft;
end$$;

create function public.read_shared_location_draft(p_organization uuid,p_location uuid,p_workspace text) returns jsonb language plpgsql security definer stable set search_path=pg_catalog,public,pg_temp as $$
declare draft public.shared_location_drafts;result jsonb;
begin
 perform public.require_shared_draft_access(p_organization,p_location,false);
 select * into draft from public.shared_location_drafts d where d.organization_id=p_organization and d.location_id=p_location and d.workspace=p_workspace and d.state in('active','finalizing');
 if draft.id is null then return null;end if;
 select jsonb_build_object('id',draft.id,'workspace',draft.workspace,'state',draft.state,'revision',draft.revision,'reviewedRevision',draft.reviewed_revision,'seasonalProfile',draft.seasonal_snapshot,'workflowState',draft.workflow_state,'updatedAt',draft.updated_at,'updatedBy',draft.updated_by,'fields',coalesce((select jsonb_agg(jsonb_build_object('productKey',f.product_key,'fieldKey',f.field_key,'value',f.value,'revision',f.revision,'updatedAt',f.updated_at,'updatedBy',f.updated_by) order by f.revision) from public.shared_draft_fields f where f.draft_id=draft.id),'[]'::jsonb),'conflicts',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'productKey',c.product_key,'fieldKey',c.field_key,'serverValue',c.server_value,'incomingValue',c.incoming_value,'serverRevision',c.server_revision,'expectedRevision',c.expected_revision,'createdAt',c.created_at) order by c.created_at) from public.shared_draft_conflicts c where c.draft_id=draft.id and c.resolved_at is null),'[]'::jsonb)) into result;
 return result;
end$$;

create function public.update_shared_draft_field(p_organization uuid,p_location uuid,p_draft uuid,p_product_key text,p_field_key text,p_value jsonb,p_expected_field_revision bigint,p_idempotency_key uuid) returns jsonb language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare actor uuid;draft public.shared_location_drafts;field public.shared_draft_fields;prior bigint;next_revision bigint;
begin
 actor:=public.require_shared_draft_access(p_organization,p_location,true);
 if nullif(btrim(p_product_key),'') is null or p_field_key not in('count','cases','halves','loose','adjustment','adjustment_meta','note','touched','review_state') or p_value is null or p_idempotency_key is null then raise exception using errcode='22023',message='Complete atomic draft mutation required';end if;
 select d.* into draft from public.shared_location_drafts d where d.id=p_draft and d.organization_id=p_organization and d.location_id=p_location for update;
 if draft.id is null or draft.state<>'active' then raise exception using errcode='23514',message='Active shared draft unavailable';end if;
 select m.resulting_revision into prior from public.shared_draft_mutations m where m.draft_id=p_draft and m.idempotency_key=p_idempotency_key;
 if prior is not null then return jsonb_build_object('status','acknowledged','revision',prior,'idempotent',true);end if;
 select f.* into field from public.shared_draft_fields f where f.draft_id=p_draft and f.product_key=p_product_key and f.field_key=p_field_key for update;
 if found and field.revision is distinct from p_expected_field_revision then
  insert into public.shared_draft_conflicts(draft_id,product_key,field_key,server_value,incoming_value,server_revision,expected_revision,created_by) values(p_draft,p_product_key,p_field_key,field.value,p_value,field.revision,p_expected_field_revision,actor);
  insert into public.shared_draft_audit(draft_id,actor_id,product_key,field_key,revision,event) values(p_draft,actor,p_product_key,p_field_key,field.revision,'conflict');
  return jsonb_build_object('status','conflict','revision',draft.revision,'fieldRevision',field.revision,'serverValue',field.value,'incomingValue',p_value);
 end if;
 if not found and p_expected_field_revision is not null then return jsonb_build_object('status','conflict','revision',draft.revision,'fieldRevision',null,'serverValue',null,'incomingValue',p_value);end if;
 next_revision:=draft.revision+1;
 insert into public.shared_draft_fields(draft_id,product_key,field_key,value,revision,updated_by) values(p_draft,p_product_key,p_field_key,p_value,next_revision,actor) on conflict(draft_id,product_key,field_key) do update set value=excluded.value,revision=excluded.revision,updated_by=excluded.updated_by,updated_at=now();
 update public.shared_location_drafts set revision=next_revision,reviewed_revision=null,updated_by=actor,updated_at=now() where id=p_draft;
 insert into public.shared_draft_mutations(draft_id,idempotency_key,product_key,field_key,expected_field_revision,resulting_revision,actor_id) values(p_draft,p_idempotency_key,p_product_key,p_field_key,p_expected_field_revision,next_revision,actor);
 insert into public.shared_draft_audit(draft_id,actor_id,product_key,field_key,revision,event) values(p_draft,actor,p_product_key,p_field_key,next_revision,'updated');
 return jsonb_build_object('status','acknowledged','revision',next_revision,'fieldRevision',next_revision,'idempotent',false,'updatedAt',now(),'updatedBy',actor);
end$$;

create function public.import_legacy_shared_draft(p_organization uuid,p_location uuid,p_workspace text,p_legacy_draft_id text,p_fields jsonb,p_seasonal_snapshot jsonb,p_idempotency_key uuid) returns jsonb language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare actor uuid;v_draft_id uuid;draft public.shared_location_drafts;item jsonb;next_revision bigint;imported integer:=0;
begin
 actor:=public.require_shared_draft_access(p_organization,p_location,true);
 if exists(select 1 from public.legacy_order_submissions s where s.organization_id=p_organization and s.location_id=p_location and s.draft_id=p_legacy_draft_id) then return jsonb_build_object('status','completed_excluded','imported',0);end if;
 v_draft_id:=public.open_shared_location_draft(p_organization,p_location,p_workspace,p_seasonal_snapshot);
 select * into draft from public.shared_location_drafts d where d.id=v_draft_id for update;
 if exists(select 1 from public.shared_draft_mutations m where m.draft_id=v_draft_id and m.idempotency_key=p_idempotency_key) then return jsonb_build_object('status','acknowledged','imported',0,'idempotent',true,'draftId',v_draft_id);end if;
 if exists(select 1 from public.shared_draft_fields f where f.draft_id=v_draft_id) then return jsonb_build_object('status','server_preserved','imported',0,'draftId',v_draft_id,'revision',draft.revision);end if;
 if jsonb_typeof(p_fields)<>'array' then raise exception using errcode='22023',message='Legacy draft fields must be an array';end if;
 for item in select value from jsonb_array_elements(p_fields) loop
  if nullif(item->>'productKey','') is null or item->>'fieldKey' not in('count','cases','halves','loose','adjustment','adjustment_meta','note','touched','review_state') then raise exception using errcode='22023',message='Invalid legacy draft field';end if;
  next_revision:=draft.revision+imported+1;insert into public.shared_draft_fields(draft_id,product_key,field_key,value,revision,updated_by) values(v_draft_id,item->>'productKey',item->>'fieldKey',item->'value',next_revision,actor);imported:=imported+1;
 end loop;
 if imported=0 then return jsonb_build_object('status','empty_ignored','imported',0,'draftId',v_draft_id);end if;
 next_revision:=draft.revision+imported;update public.shared_location_drafts set revision=next_revision,seasonal_snapshot=coalesce(p_seasonal_snapshot,seasonal_snapshot),updated_by=actor,updated_at=now() where id=v_draft_id;
 insert into public.shared_draft_mutations(draft_id,idempotency_key,product_key,field_key,expected_field_revision,resulting_revision,actor_id) values(v_draft_id,p_idempotency_key,'$migration','$legacy',null,next_revision,actor);
 insert into public.shared_draft_audit(draft_id,actor_id,product_key,field_key,revision,event) values(v_draft_id,actor,'$migration','$legacy',next_revision,'imported');
 return jsonb_build_object('status','imported','imported',imported,'draftId',v_draft_id,'revision',next_revision);
end$$;

create function public.review_shared_location_draft(p_organization uuid,p_location uuid,p_draft uuid) returns jsonb language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare actor uuid;draft public.shared_location_drafts;snapshot jsonb;
begin actor:=public.require_shared_draft_access(p_organization,p_location,false);select * into draft from public.shared_location_drafts where id=p_draft and organization_id=p_organization and location_id=p_location and state='active' for update;if draft.id is null then raise exception using errcode='23514',message='Active shared draft unavailable';end if;
 select jsonb_build_object('draftId',draft.id,'workspace',draft.workspace,'revision',draft.revision,'seasonalProfile',draft.seasonal_snapshot,'workflowState',draft.workflow_state,'fields',coalesce(jsonb_agg(jsonb_build_object('productKey',f.product_key,'fieldKey',f.field_key,'value',f.value,'revision',f.revision) order by f.revision),'[]'::jsonb)) into snapshot from public.shared_draft_fields f where f.draft_id=draft.id;
 update public.shared_location_drafts set reviewed_revision=draft.revision where id=draft.id;insert into public.shared_draft_audit(draft_id,actor_id,product_key,field_key,revision,event) values(draft.id,actor,'$review','$revision',draft.revision,'reviewed');return snapshot;end$$;

create function public.finalize_shared_location_draft(p_organization uuid,p_location uuid,p_draft uuid,p_reviewed_revision bigint,p_order jsonb) returns bigint language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare actor uuid;draft public.shared_location_drafts;order_id bigint;
begin actor:=public.require_shared_draft_access(p_organization,p_location,true);select * into draft from public.shared_location_drafts where id=p_draft and organization_id=p_organization and location_id=p_location for update;if draft.id is null or draft.state not in('active','finalizing') then raise exception using errcode='23514',message='Active shared draft unavailable';end if;if draft.revision<>p_reviewed_revision or draft.reviewed_revision<>p_reviewed_revision then raise exception using errcode='40001',message='Shared draft changed after Review; refresh Review';end if;
 update public.shared_location_drafts set state='finalizing',updated_by=actor,updated_at=now() where id=draft.id;order_id:=public.save_location_order(p_organization,p_location,p_order->>'draftId',p_order);update public.shared_location_drafts set state='closed',final_order_id=order_id,closed_at=now(),updated_by=actor,updated_at=now() where id=draft.id;insert into public.shared_draft_audit(draft_id,actor_id,product_key,field_key,revision,event) values(draft.id,actor,'$draft','$state',draft.revision,'finalized');return order_id;end$$;

create function public.abandon_shared_location_draft(p_organization uuid,p_location uuid,p_draft uuid) returns void language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$declare actor uuid;changed integer;begin actor:=public.require_shared_draft_access(p_organization,p_location,true);update public.shared_location_drafts set state='abandoned',closed_at=now(),updated_by=actor,updated_at=now() where id=p_draft and organization_id=p_organization and location_id=p_location and state='active';get diagnostics changed=row_count;if changed<>1 then raise exception using errcode='23514',message='Active shared draft unavailable';end if;insert into public.shared_draft_audit(draft_id,actor_id,product_key,field_key,revision,event) select id,actor,'$draft','$state',revision,'abandoned' from public.shared_location_drafts where id=p_draft;end$$;

create function public.heartbeat_shared_draft(p_organization uuid,p_location uuid,p_draft uuid,p_session uuid) returns void language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$declare actor uuid;begin actor:=public.require_shared_draft_access(p_organization,p_location,false);if not exists(select 1 from public.shared_location_drafts where id=p_draft and organization_id=p_organization and location_id=p_location and state='active') then raise exception using errcode='23514',message='Active shared draft unavailable';end if;insert into public.shared_draft_presence(draft_id,session_id,user_id,last_seen_at) values(p_draft,p_session,actor,now()) on conflict(draft_id,session_id) do update set user_id=excluded.user_id,last_seen_at=excluded.last_seen_at;delete from public.shared_draft_presence where draft_id=p_draft and last_seen_at<now()-interval '75 seconds';end$$;
create function public.list_shared_draft_presence(p_organization uuid,p_location uuid,p_draft uuid) returns table(user_id uuid,last_seen_at timestamptz) language plpgsql security definer stable set search_path=pg_catalog,public,pg_temp as $$begin perform public.require_shared_draft_access(p_organization,p_location,false);return query select p.user_id,p.last_seen_at from public.shared_draft_presence p join public.shared_location_drafts d on d.id=p.draft_id where p.draft_id=p_draft and d.organization_id=p_organization and d.location_id=p_location and p.last_seen_at>=now()-interval '75 seconds' order by p.last_seen_at desc;end$$;

revoke all on function public.open_shared_location_draft(uuid,uuid,text,jsonb),public.read_shared_location_draft(uuid,uuid,text),public.update_shared_draft_field(uuid,uuid,uuid,text,text,jsonb,bigint,uuid),public.import_legacy_shared_draft(uuid,uuid,text,text,jsonb,jsonb,uuid),public.review_shared_location_draft(uuid,uuid,uuid),public.finalize_shared_location_draft(uuid,uuid,uuid,bigint,jsonb),public.abandon_shared_location_draft(uuid,uuid,uuid),public.heartbeat_shared_draft(uuid,uuid,uuid,uuid),public.list_shared_draft_presence(uuid,uuid,uuid) from public,anon;
grant execute on function public.open_shared_location_draft(uuid,uuid,text,jsonb),public.read_shared_location_draft(uuid,uuid,text),public.update_shared_draft_field(uuid,uuid,uuid,text,text,jsonb,bigint,uuid),public.import_legacy_shared_draft(uuid,uuid,text,text,jsonb,jsonb,uuid),public.review_shared_location_draft(uuid,uuid,uuid),public.finalize_shared_location_draft(uuid,uuid,uuid,bigint,jsonb),public.abandon_shared_location_draft(uuid,uuid,uuid),public.heartbeat_shared_draft(uuid,uuid,uuid,uuid),public.list_shared_draft_presence(uuid,uuid,uuid) to authenticated;
alter table public.shared_location_drafts replica identity full;
alter table public.shared_draft_fields replica identity full;
do $$begin alter publication supabase_realtime add table public.shared_location_drafts;exception when duplicate_object then null;when undefined_object then null;end$$;
do $$begin alter publication supabase_realtime add table public.shared_draft_fields;exception when duplicate_object then null;when undefined_object then null;end$$;
