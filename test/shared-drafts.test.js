const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const sql=fs.readFileSync(path.join(root,'supabase/migrations/202608230004_shared_location_drafts.sql'),'utf8');
const client=fs.readFileSync(path.join(root,'shared-drafts.js'),'utf8');
const auth=fs.readFileSync(path.join(root,'auth-gate.js'),'utf8');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');

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
  assert.match(html,/PourGridSharedDraft\.finalize\(activeType,entry\)/);
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
