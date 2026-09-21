begin;

-- Conflict readers and fallback resolution lookups use the same field-scoped
-- access pattern. Keep the unresolved working set small and directly ordered.
create index if not exists shared_draft_conflicts_field_open
  on public.shared_draft_conflicts(draft_id,product_key,field_key,created_at desc)
  where resolved_at is null;

-- A conflict is a snapshot. If the field changed after that snapshot, the
-- current field is authoritative and the old conflict is obsolete. The prior
-- implementation raised SQLSTATE 40001 for that normal state. Automatic
-- clients retried it, producing an unbounded error/CPU loop. Resolution is now
-- idempotent, stale-safe, and coalesces older conflicts for the same field.
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
  effective_resolution text:=p_resolution;
  stale boolean:=false;
begin
  actor:=public.require_shared_draft_access(p_organization,p_location,true);
  if p_resolution not in('server','incoming')
    or (p_conflict is null and (p_draft is null or nullif(p_product_key,'') is null or nullif(p_field_key,'') is null)) then
    raise exception using errcode='22023',message='Valid shared draft conflict resolution required';
  end if;

  if p_conflict is not null then
    select c.* into conflict
    from public.shared_draft_conflicts c
    join public.shared_location_drafts d on d.id=c.draft_id
    where c.id=p_conflict
      and d.organization_id=p_organization
      and d.location_id=p_location;
  else
    select c.* into conflict
    from public.shared_draft_conflicts c
    join public.shared_location_drafts d on d.id=c.draft_id
    where c.draft_id=p_draft
      and c.product_key=p_product_key
      and c.field_key=p_field_key
      and c.created_by=actor
      and d.organization_id=p_organization
      and d.location_id=p_location
    order by (c.resolved_at is null) desc,c.created_at desc
    limit 1;
  end if;

  if conflict.id is null then
    select d.* into draft
    from public.shared_location_drafts d
    where d.id=p_draft
      and d.organization_id=p_organization
      and d.location_id=p_location;
    return jsonb_build_object(
      'status','resolved','resolution','server','revision',draft.revision,
      'remaining',0,'idempotent',true,'stale',true
    );
  end if;
  selected_conflict:=conflict.id;

  select d.* into draft
  from public.shared_location_drafts d
  where d.id=conflict.draft_id
    and d.organization_id=p_organization
    and d.location_id=p_location
  for update;

  select c.* into conflict
  from public.shared_draft_conflicts c
  where c.id=selected_conflict
  for update;

  if conflict.resolved_at is not null then
    select count(*) into remaining
    from public.shared_draft_conflicts c
    where c.draft_id=draft.id and c.resolved_at is null;
    return jsonb_build_object(
      'status','resolved','resolution','server','revision',draft.revision,
      'remaining',remaining,'idempotent',true,'stale',true
    );
  end if;

  if draft.state<>'active' then
    effective_resolution:='server';
    stale:=true;
  elsif p_resolution='incoming' then
    select f.* into current_field
    from public.shared_draft_fields f
    where f.draft_id=draft.id
      and f.product_key=conflict.product_key
      and f.field_key=conflict.field_key
    for update;

    if found and current_field.revision is distinct from conflict.server_revision then
      effective_resolution:='server';
      stale:=true;
    else
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
    end if;
  end if;

  if next_revision is null then
    next_revision:=draft.revision;
  end if;

  update public.shared_draft_conflicts c
  set resolved_at=now(),resolved_by=actor
  where c.draft_id=draft.id
    and c.product_key=conflict.product_key
    and c.field_key=conflict.field_key
    and c.resolved_at is null
    and c.created_at<=conflict.created_at;

  select count(*) into remaining
  from public.shared_draft_conflicts c
  where c.draft_id=draft.id and c.resolved_at is null;

  return jsonb_build_object(
    'status','resolved','resolution',effective_resolution,'revision',next_revision,
    'remaining',remaining,'idempotent',false,'stale',stale
  );
end$$;

revoke all on function public.resolve_shared_draft_conflict(uuid,uuid,uuid,text,uuid,text,text) from public,anon;
grant execute on function public.resolve_shared_draft_conflict(uuid,uuid,uuid,text,uuid,text,text) to authenticated;

commit;
