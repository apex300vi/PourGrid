export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];
export type AppRole = 'administrator' | 'manager' | 'inventory_staff' | 'read_only_viewer';
export type WorkflowKind = 'bar' | 'merchants';
export interface Database { public: { Tables: {
  organizations: { Row: { id:string; name:string; created_at:string } };
  locations: { Row: { id:string; organization_id:string; name:string; created_at:string } };
  memberships: { Row: { id:string; organization_id:string; user_id:string; role:AppRole; created_at:string } };
  structured_orders: { Row: { id:string; organization_id:string; location_id:string; vendor_id:string; workflow:WorkflowKind; status:'draft'|'submitted'|'partially_received'|'received'|'cancelled'; submitted_at:string|null; created_by:string; created_at:string } };
  order_lines: { Row: { id:string; organization_id:string; location_id:string; order_id:string; item_id:string; draft_units:number; submitted_units:number|null; expected_units:number|null; received_units:number; units_per_package:number } };
  receiving_sessions: { Row: { id:string; organization_id:string; location_id:string; order_id:string; workflow:WorkflowKind; status:'in_progress'|'finalized'|'cancelled'; idempotency_key:string; notes:string|null; evidence:Json; created_by:string; created_at:string; finalized_at:string|null } };
  inventory_movements: { Row: { id:string; organization_id:string; location_id:string; item_id:string; workflow:WorkflowKind; kind:'baseline'|'receipt'|'reconciliation'|'correction'; quantity_units:number; source_table:string; source_id:string; reverses_movement_id:string|null; created_by:string; created_at:string } };
  audit_events: { Row: { id:string; organization_id:string; location_id:string|null; actor_id:string|null; event_type:string; entity_table:string; entity_id:string|null; detail:Json; occurred_at:string } };
  legacy_order_references: { Row: { legacy_order_id:number; classification:'legacy_unassigned'; organization_id:string|null; assigned_by:string|null; assigned_at:string|null } };
}; Functions: { admin_upsert_membership:{Args:{p_org:string;p_user:string;p_role:AppRole;p_location:string};Returns:string}; finalize_receiving:{ Args:{p_session:string}; Returns:undefined }; finalize_baseline:{Args:{p_baseline:string};Returns:undefined}; approve_receiving_exception:{Args:{p_exception:string;p_approved:boolean};Returns:undefined}; approve_reconciliation:{Args:{p_request:string;p_approved:boolean};Returns:undefined} }; Enums:{app_role:AppRole;workflow_kind:WorkflowKind} } }
