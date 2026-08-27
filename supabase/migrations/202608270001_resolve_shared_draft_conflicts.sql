create or replace function public.update_shared_draft_field(p_organization uuid,p_location uuid,p_draft uuid,p_product_key text,p_field_key text,p_value jsonb,p_expected_field_revision bigint,p_idempotency_key uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare actor uuid;draft public.shared_location_drafts;field public.shared_draft_fields;prior bigint;next_revision bigint;conflict_id uuid;
begin
 actor:=public.require_shared_draft_access(p_organization,p_location,true);
 if nullif(btrim(p_product_key),'') is null or p_field_key not in('count','cases','halves','loose','adjustment','adjustment_meta','note','touched','review_state') or p_value is null or p_idempotency_key is null then raise exception using errcode='22023',message='Complete atomic draft mutation required';end if;
 select d.* into draft from public.shared_location_drafts d where d.id=p_draft and d.organization_id=p_organization and d.location_id=p_location for update;
 if draft.id is null or draft.state<>'active' then raise exception using errcode='23514',message='Active shared draft unavailable';end if;
 select m.resulting_revision into prior from public.shared_draft_mutations m where m.draft_id=p_draft and m.idempotency_key=p_idempotency_key;
 if prior is not null then return jsonb_build_object('status','acknowledged','revision',prior,'idempotent',true);end if;
 select f.* into field from public.shared_draft_fields f where f.draft_id=p_draft and f.product_key=p_product_key and f.field_key=p_field_key for update;
 if found and field.revision is distinct from p_expected_field_revision then
  insert into public.shared_draft_conflicts(draft_id,product_key,field_key,server_value,incoming_value,server_revision,expected_revision,created_by) values(p_draft,p_product_key,p_field_key,field.value,p_value,field.revision,p_expected_field_revision,actor) returning id into conflict_id;
  insert into public.shared_draft_audit(draft_id,actor_id,product_key,field_key,revision,event) values(p_draft,actor,p_product_key,p_field_key,field.revision,'conflict');
  return jsonb_build_object('status','conflict','conflictId',conflict_id,'revision',draft.revision,'fieldRevision',field.revision,'serverValue',field.value,'incomingValue',p_value);
 end if;
 if not found and p_expected_field_revision is not null then
  insert into public.shared_draft_conflicts(draft_id,product_key,field_key,server_value,incoming_value,server_revision,expected_revision,created_by) values(p_draft,p_product_key,p_field_key,'null'::jsonb,p_value,draft.revision,p_expected_field_revision,actor) returning id into conflict_id;
  insert into public.shared_draft_audit(draft_id,actor_id,product_key,field_key,revision,event) values(p_draft,actor,p_product_key,p_field_key,draft.revision,'conflict');
  return jsonb_build_object('status','conflict','conflictId',conflict_id,'revision',draft.revision,'fieldRevision',null,'serverValue',null,'incomingValue',p_value);
 end if;
 next_revision:=draft.revision+1;
 insert into public.shared_draft_fields(draft_id,product_key,field_key,value,revision,updated_by) values(p_draft,p_product_key,p_field_key,p_value,next_revision,actor) on conflict(draft_id,product_key,field_key) do update set value=excluded.value,revision=excluded.revision,updated_by=excluded.updated_by,updated_at=now();
 update public.shared_location_drafts set revision=next_revision,reviewed_revision=null,updated_by=actor,updated_at=now() where id=p_draft;
 insert into public.shared_draft_mutations(draft_id,idempotency_key,product_key,field_key,expected_field_revision,resulting_revision,actor_id) values(p_draft,p_idempotency_key,p_product_key,p_field_key,p_expected_field_revision,next_revision,actor);
 insert into public.shared_draft_audit(draft_id,actor_id,product_key,field_key,revision,event) values(p_draft,actor,p_product_key,p_field_key,next_revision,'updated');
 return jsonb_build_object('status','acknowledged','revision',next_revision,'fieldRevision',next_revision,'idempotent',false,'updatedAt',now(),'updatedBy',actor);
end$$;

revoke all on function public.update_shared_draft_field(uuid,uuid,uuid,text,text,jsonb,bigint,uuid) from public,anon;
grant execute on function public.update_shared_draft_field(uuid,uuid,uuid,text,text,jsonb,bigint,uuid) to authenticated;

create or replace function public.resolve_shared_draft_conflict(
  p_organization uuid,
  p_location uuid,
  p_conflict uuid,
  p_resolution text,
  p_draft uuid,
  p_product_key text,
  p_field_key text
) returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,pg_temp
as $$
declare
  actor uuid;
  conflict public.shared_draft_conflicts;
  draft public.shared_location_drafts;
  current_field public.shared_draft_fields;
  selected_conflict uuid;
  next_revision bigint;
  remaining integer;
begin
  actor:=public.require_shared_draft_access(p_organization,p_location,true);
  if p_resolution not in('server','incoming') or (p_conflict is null and (p_draft is null or nullif(p_product_key,'') is null or nullif(p_field_key,'') is null)) then
    raise exception using errcode='22023',message='Valid shared draft conflict resolution required';
  end if;

  select c.* into conflict
  from public.shared_draft_conflicts c
  join public.shared_location_drafts d on d.id=c.draft_id
  where c.resolved_at is null
    and d.organization_id=p_organization
    and d.location_id=p_location
    and d.state='active'
    and ((p_conflict is not null and c.id=p_conflict) or
      (p_conflict is null and c.draft_id=p_draft and c.product_key=p_product_key and c.field_key=p_field_key and c.created_by=actor))
  order by c.created_at desc limit 1;
  if conflict.id is null then
    raise exception using errcode='23514',message='Active shared draft conflict unavailable';
  end if;
  selected_conflict:=conflict.id;

  select d.* into draft from public.shared_location_drafts d where d.id=conflict.draft_id for update;
  select c.* into conflict from public.shared_draft_conflicts c where c.id=selected_conflict and c.resolved_at is null for update;
  if conflict.id is null then
    raise exception using errcode='23514',message='Shared draft conflict was already resolved';
  end if;

  if p_resolution='incoming' then
    select f.* into current_field from public.shared_draft_fields f where f.draft_id=draft.id and f.product_key=conflict.product_key and f.field_key=conflict.field_key for update;
    if found and current_field.revision is distinct from conflict.server_revision then
      raise exception using errcode='40001',message='Shared draft changed again; refresh before resolving';
    end if;
    next_revision:=draft.revision+1;
    insert into public.shared_draft_fields(draft_id,product_key,field_key,value,revision,updated_by)
    values(draft.id,conflict.product_key,conflict.field_key,conflict.incoming_value,next_revision,actor)
    on conflict(draft_id,product_key,field_key) do update
      set value=excluded.value,revision=excluded.revision,updated_by=excluded.updated_by,updated_at=now();
    update public.shared_location_drafts
      set revision=next_revision,reviewed_revision=null,updated_by=actor,updated_at=now()
      where id=draft.id;
    insert into public.shared_draft_audit(draft_id,actor_id,product_key,field_key,revision,event)
      values(draft.id,actor,conflict.product_key,conflict.field_key,next_revision,'updated');
  else
    next_revision:=draft.revision;
  end if;

  update public.shared_draft_conflicts set resolved_at=now(),resolved_by=actor where id=conflict.id;
  select count(*) into remaining from public.shared_draft_conflicts where draft_id=draft.id and resolved_at is null;
  return jsonb_build_object('status','resolved','resolution',p_resolution,'revision',next_revision,'remaining',remaining);
end$$;

revoke all on function public.resolve_shared_draft_conflict(uuid,uuid,uuid,text,uuid,text,text) from public,anon;
grant execute on function public.resolve_shared_draft_conflict(uuid,uuid,uuid,text,uuid,text,text) to authenticated;