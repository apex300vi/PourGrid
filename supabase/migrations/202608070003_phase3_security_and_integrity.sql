-- Executable-verification corrections: tenant integrity, write RLS, and complete RPC surface.
begin;

create function public.has_org_role(p_org uuid,p_roles public.app_role[]) returns boolean
language sql stable security definer set search_path=pg_catalog,public,pg_temp as $$
  select exists(select 1 from public.memberships m where m.organization_id=p_org and m.user_id=auth.uid() and m.role=any(p_roles))
$$;
revoke all on function public.has_org_role(uuid,public.app_role[]) from public,anon;
grant execute on function public.has_org_role(uuid,public.app_role[]) to authenticated;

create or replace function public.has_location_role(p_org uuid,p_location uuid,p_roles public.app_role[]) returns boolean
language sql stable security definer set search_path=pg_catalog,public,pg_temp as $$
  select exists(
    select 1 from public.memberships m
    join public.location_memberships lm on lm.membership_id=m.id
    join public.locations l on l.id=lm.location_id and l.organization_id=m.organization_id
    where m.organization_id=p_org and m.user_id=auth.uid() and l.id=p_location and m.role=any(p_roles)
  )
$$;

drop policy org_read on public.organizations;
create policy org_read on public.organizations for select to authenticated
using(exists(select 1 from public.memberships m where m.organization_id=organizations.id and m.user_id=auth.uid()));

alter table public.locations add constraint locations_id_org_unique unique(id,organization_id);
alter table public.memberships add constraint memberships_id_org_unique unique(id,organization_id);
alter table public.vendors add constraint vendors_id_org_unique unique(id,organization_id);
alter table public.inventory_items add constraint inventory_items_id_org_unique unique(id,organization_id);
alter table public.location_memberships add column organization_id uuid;
alter table public.location_memberships alter column organization_id set not null;
alter table public.location_memberships add constraint location_membership_member_org_fk foreign key(membership_id,organization_id) references public.memberships(id,organization_id);
alter table public.location_memberships add constraint location_membership_location_org_fk foreign key(location_id,organization_id) references public.locations(id,organization_id);

alter table public.structured_orders add constraint order_location_org_fk foreign key(location_id,organization_id) references public.locations(id,organization_id);
alter table public.structured_orders add constraint order_vendor_org_fk foreign key(vendor_id,organization_id) references public.vendors(id,organization_id);
alter table public.structured_orders add constraint orders_id_scope_unique unique(id,organization_id,location_id);
alter table public.order_lines add column organization_id uuid not null;
alter table public.order_lines add column location_id uuid not null;
alter table public.order_lines add constraint order_line_order_scope_fk foreign key(order_id,organization_id,location_id) references public.structured_orders(id,organization_id,location_id);
alter table public.order_lines add constraint order_line_item_org_fk foreign key(item_id,organization_id) references public.inventory_items(id,organization_id);
alter table public.order_lines add constraint order_lines_id_scope_unique unique(id,organization_id,location_id,order_id);

alter table public.receiving_sessions add constraint session_location_org_fk foreign key(location_id,organization_id) references public.locations(id,organization_id);
alter table public.receiving_sessions add constraint session_order_scope_fk foreign key(order_id,organization_id,location_id) references public.structured_orders(id,organization_id,location_id);
alter table public.receiving_sessions add constraint sessions_id_scope_unique unique(id,organization_id,location_id,order_id);
alter table public.receiving_lines add column organization_id uuid not null;
alter table public.receiving_lines add column location_id uuid not null;
alter table public.receiving_lines add column order_id uuid not null;
alter table public.receiving_lines add column units_per_package integer not null check(units_per_package>0);
alter table public.receiving_lines drop column received_units;
alter table public.receiving_lines add column received_units integer generated always as (received_packages*units_per_package+received_loose_units) stored;
alter table public.receiving_lines add constraint receiving_line_session_scope_fk foreign key(session_id,organization_id,location_id,order_id) references public.receiving_sessions(id,organization_id,location_id,order_id);
alter table public.receiving_lines add constraint receiving_line_order_scope_fk foreign key(order_line_id,organization_id,location_id,order_id) references public.order_lines(id,organization_id,location_id,order_id);
alter table public.receiving_lines add constraint receiving_line_substitution_org_fk foreign key(substitution_item_id,organization_id) references public.inventory_items(id,organization_id);
alter table public.receiving_lines add constraint receiving_lines_id_scope_unique unique(id,organization_id,location_id);

alter table public.approved_exceptions add constraint exception_location_org_fk foreign key(location_id,organization_id) references public.locations(id,organization_id);
alter table public.approved_exceptions add constraint exception_line_scope_fk foreign key(receiving_line_id,organization_id,location_id) references public.receiving_lines(id,organization_id,location_id);
alter table public.approved_exceptions add constraint exception_line_type_unique unique(receiving_line_id,exception_type);
alter table public.inventory_baselines add constraint baseline_location_org_fk foreign key(location_id,organization_id) references public.locations(id,organization_id);
alter table public.inventory_baselines add constraint baselines_id_scope_unique unique(id,organization_id,location_id);
alter table public.inventory_baseline_lines add column organization_id uuid not null;
alter table public.inventory_baseline_lines add column location_id uuid not null;
alter table public.inventory_baseline_lines add constraint baseline_line_scope_fk foreign key(baseline_id,organization_id,location_id) references public.inventory_baselines(id,organization_id,location_id);
alter table public.inventory_baseline_lines add constraint baseline_line_item_org_fk foreign key(item_id,organization_id) references public.inventory_items(id,organization_id);
alter table public.location_inventory_balances add constraint balance_location_org_fk foreign key(location_id,organization_id) references public.locations(id,organization_id);
alter table public.location_inventory_balances add constraint balance_item_org_fk foreign key(item_id,organization_id) references public.inventory_items(id,organization_id);
alter table public.inventory_movements drop constraint inventory_movements_quantity_units_check;
alter table public.inventory_movements add constraint movement_quantity_valid check((kind='baseline' and quantity_units>=0) or (kind<>'baseline' and quantity_units<>0));
alter table public.inventory_movements add constraint movement_location_org_fk foreign key(location_id,organization_id) references public.locations(id,organization_id);
alter table public.inventory_movements add constraint movement_item_org_fk foreign key(item_id,organization_id) references public.inventory_items(id,organization_id);
alter table public.reconciliation_requests add constraint reconciliation_location_org_fk foreign key(location_id,organization_id) references public.locations(id,organization_id);
alter table public.reconciliation_requests add constraint reconciliation_item_org_fk foreign key(item_id,organization_id) references public.inventory_items(id,organization_id);
alter table public.audit_events add constraint audit_location_org_fk foreign key(location_id,organization_id) references public.locations(id,organization_id);

revoke all on function public.block_immutable_change() from public,anon,authenticated;
revoke all on function public.apply_movement_balance() from public,anon,authenticated;
alter function public.apply_movement_balance() set search_path=pg_catalog,public,pg_temp;
alter function public.block_immutable_change() set search_path=pg_catalog,public,pg_temp;

create function public.guard_phase3_changes() returns trigger language plpgsql set search_path=pg_catalog,public,pg_temp as $$
begin
  if tg_table_name='order_lines' and exists(select 1 from public.structured_orders o where o.id=old.order_id and o.status<>'draft') then
    if tg_op='DELETE' or (new.order_id,new.organization_id,new.location_id,new.item_id,new.draft_units,new.submitted_units,new.expected_units,new.units_per_package) is distinct from (old.order_id,old.organization_id,old.location_id,old.item_id,old.draft_units,old.submitted_units,old.expected_units,old.units_per_package) then raise exception 'Submitted order facts are immutable'; end if;
  end if;
  if tg_table_name='inventory_baseline_lines' then
    if exists(select 1 from public.inventory_baselines b where b.id=old.baseline_id and b.status='finalized') then raise exception 'Finalized baseline is immutable'; end if;
  end if;
  return new;
end$$;
revoke all on function public.guard_phase3_changes() from public,anon,authenticated;
create trigger guard_submitted_order_lines before update or delete on public.order_lines for each row execute function public.guard_phase3_changes();
create trigger guard_finalized_baseline_lines before update or delete on public.inventory_baseline_lines for each row execute function public.guard_phase3_changes();

grant insert,update on public.structured_orders,public.order_lines,public.receiving_sessions,public.receiving_lines,public.inventory_baselines,public.inventory_baseline_lines,public.approved_exceptions,public.reconciliation_requests to authenticated;
grant update on public.organizations to authenticated;
grant insert,update on public.locations,public.vendors,public.inventory_items to authenticated;
create policy org_admin_update on public.organizations for update to authenticated
using(public.has_org_role(id,array['administrator']::public.app_role[]))
with check(public.has_org_role(id,array['administrator']::public.app_role[]));
create policy location_admin_insert on public.locations for insert to authenticated with check(public.has_org_role(organization_id,array['administrator']::public.app_role[]));
create policy location_admin_update on public.locations for update to authenticated using(public.has_org_role(organization_id,array['administrator']::public.app_role[])) with check(public.has_org_role(organization_id,array['administrator']::public.app_role[]));
do $$declare t text; begin foreach t in array array['vendors','inventory_items'] loop execute format('create policy manager_write on public.%I for all to authenticated using(public.has_org_role(organization_id,array[''administrator'',''manager'']::public.app_role[])) with check(public.has_org_role(organization_id,array[''administrator'',''manager'']::public.app_role[]))',t); end loop; end$$;
create policy order_insert on public.structured_orders for insert to authenticated with check(created_by=auth.uid() and public.has_location_role(organization_id,location_id,array['administrator','manager','inventory_staff']::public.app_role[]));
create policy order_update on public.structured_orders for update to authenticated using(public.has_location_role(organization_id,location_id,array['administrator','manager','inventory_staff']::public.app_role[])) with check(created_by=auth.uid() and public.has_location_role(organization_id,location_id,array['administrator','manager','inventory_staff']::public.app_role[]));
create policy order_line_insert on public.order_lines for insert to authenticated with check(exists(select 1 from public.structured_orders o where o.id=order_id and o.status='draft' and public.has_location_role(o.organization_id,o.location_id,array['administrator','manager','inventory_staff']::public.app_role[])));
create policy order_line_update on public.order_lines for update to authenticated using(exists(select 1 from public.structured_orders o where o.id=order_id and o.status='draft' and public.has_location_role(o.organization_id,o.location_id,array['administrator','manager','inventory_staff']::public.app_role[]))) with check(exists(select 1 from public.structured_orders o where o.id=order_id and o.status='draft' and public.has_location_role(o.organization_id,o.location_id,array['administrator','manager','inventory_staff']::public.app_role[])));
create policy session_insert on public.receiving_sessions for insert to authenticated with check(created_by=auth.uid() and status='in_progress' and public.has_location_role(organization_id,location_id,array['administrator','manager','inventory_staff']::public.app_role[]));
create policy session_update on public.receiving_sessions for update to authenticated using(status='in_progress' and public.has_location_role(organization_id,location_id,array['administrator','manager','inventory_staff']::public.app_role[])) with check(status='in_progress' and created_by=auth.uid() and public.has_location_role(organization_id,location_id,array['administrator','manager','inventory_staff']::public.app_role[]));
create policy receiving_line_insert on public.receiving_lines for insert to authenticated with check(exists(select 1 from public.receiving_sessions s where s.id=session_id and s.status='in_progress' and public.has_location_role(s.organization_id,s.location_id,array['administrator','manager','inventory_staff']::public.app_role[])));
create policy receiving_line_update on public.receiving_lines for update to authenticated using(exists(select 1 from public.receiving_sessions s where s.id=session_id and s.status='in_progress' and public.has_location_role(s.organization_id,s.location_id,array['administrator','manager','inventory_staff']::public.app_role[]))) with check(exists(select 1 from public.receiving_sessions s where s.id=session_id and s.status='in_progress' and public.has_location_role(s.organization_id,s.location_id,array['administrator','manager','inventory_staff']::public.app_role[])));
create policy exception_request on public.approved_exceptions for insert to authenticated with check(status='pending' and requested_by=auth.uid() and public.has_location_role(organization_id,location_id,array['administrator','manager','inventory_staff']::public.app_role[]));
create policy baseline_insert on public.inventory_baselines for insert to authenticated with check(status='in_progress' and created_by=auth.uid() and public.has_location_role(organization_id,location_id,array['administrator','manager','inventory_staff']::public.app_role[]));
create policy baseline_line_insert on public.inventory_baseline_lines for insert to authenticated with check(exists(select 1 from public.inventory_baselines b where b.id=baseline_id and b.status='in_progress' and public.has_location_role(b.organization_id,b.location_id,array['administrator','manager','inventory_staff']::public.app_role[])));
create policy baseline_line_update on public.inventory_baseline_lines for update to authenticated using(exists(select 1 from public.inventory_baselines b where b.id=baseline_id and b.status='in_progress' and public.has_location_role(b.organization_id,b.location_id,array['administrator','manager','inventory_staff']::public.app_role[]))) with check(exists(select 1 from public.inventory_baselines b where b.id=baseline_id and b.status='in_progress' and public.has_location_role(b.organization_id,b.location_id,array['administrator','manager','inventory_staff']::public.app_role[])));
create policy reconciliation_request on public.reconciliation_requests for insert to authenticated with check(status='pending' and requested_by=auth.uid() and public.has_location_role(organization_id,location_id,array['administrator','manager','inventory_staff']::public.app_role[]));

create function public.admin_upsert_membership(p_org uuid,p_user uuid,p_role public.app_role,p_location uuid) returns uuid
language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare membership_id uuid;
begin
 if not public.has_org_role(p_org,array['administrator']::public.app_role[]) then raise exception 'Administrator required'; end if;
 if not exists(select 1 from public.profiles where id=p_user) then raise exception 'Unknown profile'; end if;
 if not exists(select 1 from public.locations where id=p_location and organization_id=p_org) then raise exception 'Location is outside organization'; end if;
 insert into public.memberships(organization_id,user_id,role) values(p_org,p_user,p_role)
 on conflict(organization_id,user_id) do update set role=excluded.role returning id into membership_id;
 insert into public.location_memberships(membership_id,location_id,organization_id) values(membership_id,p_location,p_org)
 on conflict(membership_id,location_id) do update set organization_id=excluded.organization_id;
 insert into public.audit_events(organization_id,location_id,actor_id,event_type,entity_table,entity_id,detail)
 values(p_org,p_location,auth.uid(),'membership.upserted','memberships',membership_id,jsonb_build_object('user_id',p_user,'role',p_role));
 return membership_id;
end$$;
revoke all on function public.admin_upsert_membership(uuid,uuid,public.app_role,uuid) from public,anon;
grant execute on function public.admin_upsert_membership(uuid,uuid,public.app_role,uuid) to authenticated;

create or replace function public.approve_receiving_exception(p_exception uuid,p_approved boolean) returns void language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare e public.approved_exceptions;
begin
 select * into e from public.approved_exceptions where id=p_exception for update;
 if not found or e.status<>'pending' then raise exception 'Exception is not pending'; end if;
 if not public.has_location_role(e.organization_id,e.location_id,array['administrator','manager']::public.app_role[]) then raise exception 'Manager approval required'; end if;
 update public.approved_exceptions set status=case when p_approved then 'approved'::public.approval_status else 'rejected'::public.approval_status end,decided_by=auth.uid(),decided_at=now() where id=e.id;
 insert into public.audit_events(organization_id,location_id,actor_id,event_type,entity_table,entity_id) values(e.organization_id,e.location_id,auth.uid(),case when p_approved then 'exception.approved' else 'exception.rejected' end,'approved_exceptions',e.id);
end$$;
revoke all on function public.approve_receiving_exception(uuid,boolean) from public,anon;
grant execute on function public.approve_receiving_exception(uuid,boolean) to authenticated;

create function public.finalize_baseline(p_baseline uuid) returns void language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare b public.inventory_baselines; l record; current_units bigint; movement_kind public.movement_kind;
begin
 select * into b from public.inventory_baselines where id=p_baseline for update;
 if not found then raise exception 'Unknown baseline'; end if;
 if b.status='finalized' then return; end if;
 if not public.has_location_role(b.organization_id,b.location_id,array['administrator','manager']::public.app_role[]) then raise exception 'Manager approval required'; end if;
 perform pg_advisory_xact_lock(hashtextextended(b.location_id::text,0));
 movement_kind:=case when exists(select 1 from public.inventory_baselines prior where prior.location_id=b.location_id and prior.status='finalized') then 'correction'::public.movement_kind else 'baseline'::public.movement_kind end;
 for l in select bl.*,i.workflow from public.inventory_baseline_lines bl join public.inventory_items i on i.id=bl.item_id where bl.baseline_id=b.id order by bl.id for update of bl loop
   select coalesce(quantity_units,0) into current_units from public.location_inventory_balances where location_id=b.location_id and item_id=l.item_id for update;
   if movement_kind='baseline' or l.counted_units<>current_units then
     insert into public.inventory_movements(organization_id,location_id,item_id,workflow,kind,quantity_units,source_table,source_id,created_by) values(b.organization_id,b.location_id,l.item_id,l.workflow,movement_kind,case when movement_kind='baseline' then l.counted_units else l.counted_units-current_units end,'inventory_baseline_lines',l.id,auth.uid()) on conflict do nothing;
   end if;
 end loop;
 update public.inventory_baselines set status='finalized',finalized_by=auth.uid(),finalized_at=now() where id=b.id;
 insert into public.audit_events(organization_id,location_id,actor_id,event_type,entity_table,entity_id,detail) values(b.organization_id,b.location_id,auth.uid(),'baseline.finalized','inventory_baselines',b.id,jsonb_build_object('version',b.version,'replacement',movement_kind='correction'));
end$$;
revoke all on function public.finalize_baseline(uuid) from public,anon;
grant execute on function public.finalize_baseline(uuid) to authenticated;

create or replace function public.finalize_receiving(p_session uuid) returns void language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare s public.receiving_sessions; l record; movement_id uuid;
begin
 select * into s from public.receiving_sessions where id=p_session for update;
 if not found then raise exception 'Unknown session'; end if;
 if s.status='finalized' then return; end if;
 if s.status<>'in_progress' then raise exception 'Session is not open'; end if;
 if not public.has_location_role(s.organization_id,s.location_id,array['administrator','manager','inventory_staff']::public.app_role[]) then raise exception 'Forbidden'; end if;
 perform 1 from public.structured_orders where id=s.order_id for update;
 perform 1 from public.order_lines where order_id=s.order_id order by id for update;
 if not exists(select 1 from public.inventory_baselines b where b.location_id=s.location_id and b.status='finalized') then raise exception 'Baseline not finalized'; end if;
 if exists(select 1 from public.receiving_lines rl where rl.session_id=s.id and rl.substitution_item_id is not null and not exists(select 1 from public.approved_exceptions e where e.receiving_line_id=rl.id and e.exception_type='substitution' and e.status='approved')) then raise exception 'Unapproved substitution'; end if;
 if exists(select 1 from public.receiving_lines rl join public.order_lines ol on ol.id=rl.order_line_id where rl.session_id=s.id and rl.received_units>greatest(0,ol.expected_units-ol.received_units) and not exists(select 1 from public.approved_exceptions e where e.receiving_line_id=rl.id and e.exception_type='over_receipt' and e.status='approved')) then raise exception 'Unapproved over-receipt'; end if;
 for l in select rl.*,ol.item_id from public.receiving_lines rl join public.order_lines ol on ol.id=rl.order_line_id where rl.session_id=s.id and rl.received_units>0 order by rl.id loop
   movement_id:=null;
   insert into public.inventory_movements(organization_id,location_id,item_id,workflow,kind,quantity_units,source_table,source_id,created_by) values(s.organization_id,s.location_id,coalesce(l.substitution_item_id,l.item_id),s.workflow,'receipt',l.received_units,'receiving_lines',l.id,auth.uid()) on conflict do nothing returning id into movement_id;
   if movement_id is not null then update public.order_lines set received_units=received_units+l.received_units where id=l.order_line_id; end if;
 end loop;
 update public.receiving_sessions set status='finalized',finalized_at=now() where id=s.id;
 update public.structured_orders o set status=case when exists(select 1 from public.order_lines ol where ol.order_id=o.id and ol.received_units<ol.expected_units) then 'partially_received'::public.order_status else 'received'::public.order_status end where o.id=s.order_id;
 insert into public.audit_events(organization_id,location_id,actor_id,event_type,entity_table,entity_id) values(s.organization_id,s.location_id,auth.uid(),'receiving.finalized','receiving_sessions',s.id);
end$$;

create or replace function public.approve_reconciliation(p_request uuid,p_approved boolean) returns void language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare r public.reconciliation_requests;
begin
 select * into r from public.reconciliation_requests where id=p_request for update;
 if not found or r.status<>'pending' then raise exception 'Request is not pending'; end if;
 if not public.has_location_role(r.organization_id,r.location_id,array['administrator','manager']::public.app_role[]) then raise exception 'Manager approval required'; end if;
 update public.reconciliation_requests set status=case when p_approved then 'approved'::public.approval_status else 'rejected'::public.approval_status end,decided_by=auth.uid(),decided_at=now() where id=r.id;
 if p_approved then insert into public.inventory_movements(organization_id,location_id,item_id,workflow,kind,quantity_units,source_table,source_id,created_by) values(r.organization_id,r.location_id,r.item_id,r.workflow,'reconciliation',r.requested_adjustment_units,'reconciliation_requests',r.id,auth.uid()) on conflict do nothing; end if;
 insert into public.audit_events(organization_id,location_id,actor_id,event_type,entity_table,entity_id) values(r.organization_id,r.location_id,auth.uid(),case when p_approved then 'reconciliation.approved' else 'reconciliation.rejected' end,'reconciliation_requests',r.id);
end$$;

revoke all on function public.finalize_receiving(uuid) from public,anon;
revoke all on function public.approve_reconciliation(uuid,boolean) from public,anon;
grant execute on function public.finalize_receiving(uuid) to authenticated;
grant execute on function public.approve_reconciliation(uuid,boolean) to authenticated;

commit;
