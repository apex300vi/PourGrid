begin;
create function public.finalize_receiving(p_session uuid) returns void language plpgsql security definer set search_path=public,pg_temp as $$declare s receiving_sessions; l record; ex_count int; movement_id uuid; begin
 select * into s from receiving_sessions where id=p_session for update; if not found then raise exception 'Unknown session'; end if;
 if s.status='finalized' then return; end if; if s.status<>'in_progress' then raise exception 'Session is not open'; end if;
 if not has_location_role(s.organization_id,s.location_id,array['administrator','manager','inventory_staff']::app_role[]) then raise exception 'Forbidden'; end if;
 if not exists(select 1 from inventory_baselines b where b.location_id=s.location_id and b.status='finalized') then raise exception 'Baseline not finalized'; end if;
 select count(*) into ex_count from receiving_lines rl left join approved_exceptions e on e.receiving_line_id=rl.id and e.status='approved' where rl.session_id=s.id and ((rl.substitution_item_id is not null or rl.received_units>(select greatest(0,ol.expected_units-ol.received_units) from order_lines ol where ol.id=rl.order_line_id)) and e.id is null); if ex_count>0 then raise exception 'Unapproved receiving exception'; end if;
 for l in select rl.*,ol.item_id,ol.order_id from receiving_lines rl join order_lines ol on ol.id=rl.order_line_id where rl.session_id=s.id and rl.received_units>0 loop
   movement_id:=null;
   insert into inventory_movements(organization_id,location_id,item_id,workflow,kind,quantity_units,source_table,source_id,created_by) values(s.organization_id,s.location_id,coalesce(l.substitution_item_id,l.item_id),s.workflow,'receipt',l.received_units,'receiving_lines',l.id,auth.uid()) on conflict do nothing returning id into movement_id;
   if movement_id is not null then update order_lines set received_units=received_units+l.received_units where id=l.order_line_id; end if;
 end loop;
 update receiving_sessions set status='finalized',finalized_at=now() where id=s.id;
 update structured_orders o set status=case when exists(select 1 from order_lines ol where ol.order_id=o.id and ol.received_units<ol.expected_units) then 'partially_received'::order_status else 'received'::order_status end where o.id=s.order_id;
 insert into audit_events(organization_id,location_id,actor_id,event_type,entity_table,entity_id) values(s.organization_id,s.location_id,auth.uid(),'receiving.finalized','receiving_sessions',s.id);
end$$;
revoke all on function public.finalize_receiving(uuid) from public,anon; grant execute on function public.finalize_receiving(uuid) to authenticated;

create function public.approve_reconciliation(p_request uuid,p_approved boolean) returns void language plpgsql security definer set search_path=public,pg_temp as $$declare r reconciliation_requests; begin select * into r from reconciliation_requests where id=p_request for update; if not found or r.status<>'pending' then raise exception 'Request is not pending'; end if; if not has_location_role(r.organization_id,r.location_id,array['administrator','manager']::app_role[]) then raise exception 'Manager approval required'; end if; update reconciliation_requests set status=case when p_approved then 'approved'::approval_status else 'rejected'::approval_status end,decided_by=auth.uid(),decided_at=now() where id=r.id; if p_approved then insert into inventory_movements(organization_id,location_id,item_id,workflow,kind,quantity_units,source_table,source_id,created_by) values(r.organization_id,r.location_id,r.item_id,r.workflow,'reconciliation',r.requested_adjustment_units,'reconciliation_requests',r.id,auth.uid()) on conflict do nothing; end if; insert into audit_events(organization_id,location_id,actor_id,event_type,entity_table,entity_id) values(r.organization_id,r.location_id,auth.uid(),case when p_approved then 'reconciliation.approved' else 'reconciliation.rejected' end,'reconciliation_requests',r.id); end$$;
revoke all on function public.approve_reconciliation(uuid,boolean) from public,anon; grant execute on function public.approve_reconciliation(uuid,boolean) to authenticated;
commit;
