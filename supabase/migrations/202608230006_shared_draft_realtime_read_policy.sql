grant select on public.shared_location_drafts,public.shared_draft_fields to authenticated;
create policy shared_location_drafts_authorized_read on public.shared_location_drafts for select to authenticated using (
 public.has_location_role(organization_id,location_id,array['administrator','manager','bar_lead','inventory_staff','read_only_viewer']::public.app_role[])
);
create policy shared_draft_fields_authorized_read on public.shared_draft_fields for select to authenticated using (
 exists(select 1 from public.shared_location_drafts d where d.id=draft_id and public.has_location_role(d.organization_id,d.location_id,array['administrator','manager','bar_lead','inventory_staff','read_only_viewer']::public.app_role[]))
);
