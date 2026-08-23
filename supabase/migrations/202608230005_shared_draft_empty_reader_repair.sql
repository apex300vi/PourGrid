create or replace function public.read_shared_location_draft(p_organization uuid,p_location uuid,p_workspace text) returns jsonb language plpgsql security definer stable set search_path=pg_catalog,public,pg_temp as $$
declare draft public.shared_location_drafts;result jsonb;
begin
 perform public.require_shared_draft_access(p_organization,p_location,false);
 select * into draft from public.shared_location_drafts d where d.organization_id=p_organization and d.location_id=p_location and d.workspace=p_workspace and d.state in('active','finalizing');
 if draft.id is null then return null;end if;
 select jsonb_build_object('id',draft.id,'workspace',draft.workspace,'state',draft.state,'revision',draft.revision,'reviewedRevision',draft.reviewed_revision,'seasonalProfile',draft.seasonal_snapshot,'workflowState',draft.workflow_state,'updatedAt',draft.updated_at,'updatedBy',draft.updated_by,'fields',coalesce((select jsonb_agg(jsonb_build_object('productKey',f.product_key,'fieldKey',f.field_key,'value',f.value,'revision',f.revision,'updatedAt',f.updated_at,'updatedBy',f.updated_by) order by f.revision) from public.shared_draft_fields f where f.draft_id=draft.id),'[]'::jsonb),'conflicts',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'productKey',c.product_key,'fieldKey',c.field_key,'serverValue',c.server_value,'incomingValue',c.incoming_value,'serverRevision',c.server_revision,'expectedRevision',c.expected_revision,'createdAt',c.created_at) order by c.created_at) from public.shared_draft_conflicts c where c.draft_id=draft.id and c.resolved_at is null),'[]'::jsonb)) into result;
 return result;
end$$;
revoke all on function public.read_shared_location_draft(uuid,uuid,text) from public,anon;
grant execute on function public.read_shared_location_draft(uuid,uuid,text) to authenticated;
