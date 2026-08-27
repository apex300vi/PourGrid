const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const sql=fs.readFileSync(path.join(root,'supabase/migrations/202608230004_shared_location_drafts.sql'),'utf8');
const client=fs.readFileSync(path.join(root,'shared-drafts.js'),'utf8');
const auth=fs.readFileSync(path.join(root,'auth-gate.js'),'utf8');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const resolution=fs.readFileSync(path.join(root,'supabase/migrations/202608270001_resolve_shared_draft_conflicts.sql'),'utf8');

test('shared drafts are tenant scoped and direct writes remain closed',()=>{
  assert.match(sql,/require_shared_draft_access\(p_organization,p_location,true\)/);
  assert.match(sql,/enable row level security/g);
  assert.match(sql,/revoke all on public\.shared_location_drafts/);
  assert.match(sql,/d\.organization_id=p_organization and d\.location_id=p_location/);
});

test('atomic revisions preserve conflicts and idempotent retries',()=>{
  assert.match(sql,/primary key\(draft_id,idempotency_key\)/);
  assert.match(sql,/p_expected_field_revision/);
  assert.match(sql,/shared_draft_conflicts/);
  assert.match(sql,/return jsonb_build_object\('status','conflict'/);
  assert.match(client,/crypto\.randomUUID\(\)/);
  assert.match(client,/s\.queue\.shift\(\)/);
});

test('legacy recovery is write once and completed submissions are excluded',()=>{
  assert.match(client,/if\(store\(\)\.getItem\(BACKUP\)\)return/);
  assert.match(client,/function store\(\)\{return window\.PG_STORE\|\|localStorage\}/);
  assert.doesNotMatch(client,/localStorage\.(get|set|remove)Item\(/);
  assert.match(client,/downloadBackup/);
  assert.match(sql,/legacy_order_submissions[\s\S]*completed_excluded/);
  assert.match(sql,/server_preserved/);
});

test('review and finalize share an exact immutable revision',()=>{
  assert.match(sql,/reviewed_revision=draft\.revision/);
  assert.match(sql,/draft\.revision<>p_reviewed_revision/);
  assert.match(sql,/save_location_order/);
  assert.match(sql,/state='closed'/);
  assert.match(html,/finalizeShared:window\.PourGridSharedDraft\?function\(order\)\{return window\.PourGridSharedDraft\.finalize\(activeType,order\);\}:null/);
});

test('authorized realtime API and honest sync states are wired',()=>{
  assert.match(auth,/POURGRID_SHARED_DRAFT_API/);
  assert.match(auth,/postgres_changes/);
  assert.match(fs.readFileSync(path.join(root,'supabase/migrations/202608230006_shared_draft_realtime_read_policy.sql'),'utf8'),/has_location_role/);
  assert.match(client,/offline-saved/);
  assert.match(client,/syncing/);
  assert.match(client,/conflict/);
  assert.match(html,/Offline — saved on this device/);
});

test('conflicts have an explicit tenant-safe resolution path without silent data loss',()=>{
  assert.match(resolution,/require_shared_draft_access\(p_organization,p_location,true\)/);
  assert.match(resolution,/d\.organization_id=p_organization/);
  assert.match(resolution,/d\.location_id=p_location/);
  assert.match(resolution,/p_resolution not in\('server','incoming'\)/);
  assert.match(resolution,/for update/);
  assert.match(resolution,/resolved_at=now\(\),resolved_by=actor/);
  assert.match(resolution,/reviewed_revision=null/);
  assert.match(resolution,/returning id into conflict_id/);
  assert.match(resolution,/not found and p_expected_field_revision is not null[\s\S]*insert into public\.shared_draft_conflicts/);
  assert.match(resolution,/'conflictId',conflict_id/);
  assert.match(resolution,/grant execute on function public\.resolve_shared_draft_conflict[\s\S]*to authenticated/);
  assert.doesNotMatch(resolution,/delete from public\.shared_draft/);
});

test('resolved fields clear their queued retry and refresh the authoritative draft',()=>{
  assert.match(auth,/resolve_shared_draft_conflict/);
  assert.match(client,/async function resolveConflict/);
  assert.match(client,/item\.product!==conflict\.productKey\|\|item\.field!==conflict\.fieldKey/);
  assert.match(client,/await refresh\(type\)/);
  assert.match(client,/resolveConflict:resolveConflict/);
  assert.match(client,/id:r\.conflictId\|\|null/);
});
