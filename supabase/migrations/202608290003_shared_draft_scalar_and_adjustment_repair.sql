begin;

-- Browser form values are stored as strings while another client may submit the
-- same count as a JSON number. They are the same operational value and must not
-- require a person to choose between visually identical counts.
create or replace function public.shared_draft_values_equal(
  p_field_key text,
  p_left jsonb,
  p_right jsonb
) returns boolean
language sql
immutable
set search_path=pg_catalog,public,pg_temp
as $$
  select case
    when p_left=p_right then true
    when p_field_key in('count','cases','halves','loose','adjustment')
      and jsonb_typeof(p_left) in('number','string')
      and jsonb_typeof(p_right) in('number','string')
      and (p_left #>> '{}') ~ '^[-+]?[0-9]+([.][0-9]+)?$'
      and (p_right #>> '{}') ~ '^[-+]?[0-9]+([.][0-9]+)?$'
      then (p_left #>> '{}')::numeric=(p_right #>> '{}')::numeric
    else false
  end
$$;

revoke all on function public.shared_draft_values_equal(text,jsonb,jsonb) from public,anon,authenticated;

-- These rows preserve two representations of one value, not two decisions.
-- Resolving them changes no field, count, revision, adjustment, or order.
update public.shared_draft_conflicts
set resolved_at=now(),resolved_by=created_by
where resolved_at is null
  and public.shared_draft_values_equal(field_key,server_value,incoming_value);

create or replace function public.update_shared_draft_field(
  p_organization uuid,
  p_location uuid,
  p_draft uuid,
  p_product_key text,
  p_field_key text,
  p_value jsonb,
  p_expected_field_revision bigint,
  p_idempotency_key uuid
) returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,pg_temp
as $$
declare
  actor uuid;
  draft public.shared_location_drafts;
  field public.shared_draft_fields;
  prior_conflict public.shared_draft_conflicts;
  prior bigint;
  next_revision bigint;
  conflict_id uuid;
  field_exists boolean:=false;
begin
  actor:=public.require_shared_draft_access(p_organization,p_location,true);
  if nullif(btrim(p_product_key),'') is null
    or p_field_key not in('count','cases','halves','loose','adjustment','adjustment_meta','note','touched','review_state')
    or p_value is null
    or p_idempotency_key is null then
    raise exception using errcode='22023',message='Complete atomic draft mutation required';
  end if;

  select d.* into draft
  from public.shared_location_drafts d
  where d.id=p_draft and d.organization_id=p_organization and d.location_id=p_location
  for update;
  if draft.id is null or draft.state<>'active' then
    raise exception using errcode='23514',message='Active shared draft unavailable';
  end if;

  select m.resulting_revision into prior
  from public.shared_draft_mutations m
  where m.draft_id=p_draft and m.idempotency_key=p_idempotency_key;
  if prior is not null then
    return jsonb_build_object('status','acknowledged','revision',prior,'idempotent',true);
  end if;

  select f.* into field
  from public.shared_draft_fields f
  where f.draft_id=p_draft and f.product_key=p_product_key and f.field_key=p_field_key
  for update;
  field_exists:=found;

  select c.* into prior_conflict
  from public.shared_draft_conflicts c
  where c.draft_id=p_draft and c.idempotency_key=p_idempotency_key;

  if prior_conflict.id is not null then
    if prior_conflict.resolved_at is not null then
      return jsonb_build_object('status','acknowledged','revision',draft.revision,'fieldRevision',case when field_exists then field.revision else null end,'idempotent',true,'noChange',true);
    end if;
    if field_exists and public.shared_draft_values_equal(p_field_key,field.value,p_value) then
      update public.shared_draft_conflicts
      set resolved_at=now(),resolved_by=actor
      where id=prior_conflict.id;
      insert into public.shared_draft_mutations(draft_id,idempotency_key,product_key,field_key,expected_field_revision,resulting_revision,actor_id)
      values(p_draft,p_idempotency_key,p_product_key,p_field_key,p_expected_field_revision,draft.revision,actor)
      on conflict(draft_id,idempotency_key) do nothing;
      return jsonb_build_object('status','acknowledged','revision',draft.revision,'fieldRevision',field.revision,'idempotent',true,'noChange',true);
    end if;
    return jsonb_build_object('status','conflict','conflictId',prior_conflict.id,'revision',draft.revision,'fieldRevision',case when field_exists then field.revision else null end,'serverValue',case when field_exists then field.value else 'null'::jsonb end,'incomingValue',p_value,'idempotent',true);
  end if;

  if field_exists and public.shared_draft_values_equal(p_field_key,field.value,p_value) then
    update public.shared_draft_conflicts
    set resolved_at=now(),resolved_by=actor
    where draft_id=p_draft
      and product_key=p_product_key
      and field_key=p_field_key
      and resolved_at is null
      and public.shared_draft_values_equal(field_key,server_value,incoming_value)
      and public.shared_draft_values_equal(field_key,server_value,p_value);
    insert into public.shared_draft_mutations(draft_id,idempotency_key,product_key,field_key,expected_field_revision,resulting_revision,actor_id)
    values(p_draft,p_idempotency_key,p_product_key,p_field_key,p_expected_field_revision,draft.revision,actor)
    on conflict(draft_id,idempotency_key) do nothing;
    return jsonb_build_object('status','acknowledged','revision',draft.revision,'fieldRevision',field.revision,'idempotent',false,'noChange',true);
  end if;

  if field_exists and field.revision is distinct from p_expected_field_revision then
    insert into public.shared_draft_conflicts(draft_id,product_key,field_key,server_value,incoming_value,server_revision,expected_revision,created_by,idempotency_key)
    values(p_draft,p_product_key,p_field_key,field.value,p_value,field.revision,p_expected_field_revision,actor,p_idempotency_key)
    on conflict(draft_id,idempotency_key) where idempotency_key is not null do nothing
    returning id into conflict_id;
    if conflict_id is null then
      select c.id into conflict_id from public.shared_draft_conflicts c where c.draft_id=p_draft and c.idempotency_key=p_idempotency_key;
    end if;
    insert into public.shared_draft_audit(draft_id,actor_id,product_key,field_key,revision,event)
    values(p_draft,actor,p_product_key,p_field_key,field.revision,'conflict');
    return jsonb_build_object('status','conflict','conflictId',conflict_id,'revision',draft.revision,'fieldRevision',field.revision,'serverValue',field.value,'incomingValue',p_value);
  end if;

  if not field_exists and p_expected_field_revision is not null then
    insert into public.shared_draft_conflicts(draft_id,product_key,field_key,server_value,incoming_value,server_revision,expected_revision,created_by,idempotency_key)
    values(p_draft,p_product_key,p_field_key,'null'::jsonb,p_value,draft.revision,p_expected_field_revision,actor,p_idempotency_key)
    on conflict(draft_id,idempotency_key) where idempotency_key is not null do nothing
    returning id into conflict_id;
    if conflict_id is null then
      select c.id into conflict_id from public.shared_draft_conflicts c where c.draft_id=p_draft and c.idempotency_key=p_idempotency_key;
    end if;
    insert into public.shared_draft_audit(draft_id,actor_id,product_key,field_key,revision,event)
    values(p_draft,actor,p_product_key,p_field_key,draft.revision,'conflict');
    return jsonb_build_object('status','conflict','conflictId',conflict_id,'revision',draft.revision,'fieldRevision',null,'serverValue',null,'incomingValue',p_value);
  end if;

  next_revision:=draft.revision+1;
  insert into public.shared_draft_fields(draft_id,product_key,field_key,value,revision,updated_by)
  values(p_draft,p_product_key,p_field_key,p_value,next_revision,actor)
  on conflict(draft_id,product_key,field_key) do update
    set value=excluded.value,revision=excluded.revision,updated_by=excluded.updated_by,updated_at=now();
  update public.shared_location_drafts
  set revision=next_revision,reviewed_revision=null,updated_by=actor,updated_at=now()
  where id=p_draft;
  insert into public.shared_draft_mutations(draft_id,idempotency_key,product_key,field_key,expected_field_revision,resulting_revision,actor_id)
  values(p_draft,p_idempotency_key,p_product_key,p_field_key,p_expected_field_revision,next_revision,actor);
  insert into public.shared_draft_audit(draft_id,actor_id,product_key,field_key,revision,event)
  values(p_draft,actor,p_product_key,p_field_key,next_revision,'updated');
  return jsonb_build_object('status','acknowledged','revision',next_revision,'fieldRevision',next_revision,'idempotent',false,'noChange',false,'updatedAt',now(),'updatedBy',actor);
end$$;

revoke all on function public.update_shared_draft_field(uuid,uuid,uuid,text,text,jsonb,bigint,uuid) from public,anon;
grant execute on function public.update_shared_draft_field(uuid,uuid,uuid,text,text,jsonb,bigint,uuid) to authenticated;

commit;
