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
const noopRepair=fs.readFileSync(path.join(root,'supabase/migrations/202608290001_shared_draft_noop_conflict_repair.sql'),'utf8');
const scalarRepair=fs.readFileSync(path.join(root,'supabase/migrations/202608290003_shared_draft_scalar_and_adjustment_repair.sql'),'utf8');

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

test('shared review stays immutable while local-first orders use idempotent direct backup',()=>{
  assert.match(sql,/reviewed_revision=draft\.revision/);
  assert.match(sql,/draft\.revision<>p_reviewed_revision/);
  assert.match(sql,/save_location_order/);
  assert.match(sql,/state='closed'/);
  assert.match(html,/PourGridOrderSave\.submit\(record\.entry,\{saveDirect:saveDB\}\)/);
  assert.match(html,/route:"local"/);
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

test('identical stale updates acknowledge automatically and clean existing no-op conflicts',()=>{
  assert.match(noopRepair,/server_value=incoming_value/);
  assert.match(noopRepair,/field_exists and field\.value=p_value/);
  assert.match(noopRepair,/'status','acknowledged'[\s\S]*'noChange',true/);
  assert.match(noopRepair,/shared_draft_mutations[\s\S]*on conflict\(draft_id,idempotency_key\) do nothing/);
  assert.doesNotMatch(noopRepair,/delete from public\.shared_draft/);
});

test('one mutation can create at most one active conflict across retries',()=>{
  assert.match(noopRepair,/add column if not exists idempotency_key uuid/);
  assert.match(noopRepair,/shared_draft_conflicts_mutation_once/);
  assert.match(noopRepair,/where c\.draft_id=p_draft and c\.idempotency_key=p_idempotency_key/);
  assert.match(noopRepair,/'conflictId',prior_conflict\.id/);
});

test('one conflicted item cannot block the rest of a device count',()=>{
  const flush=client.slice(client.indexOf('async function flush'),client.indexOf('function queue'));
  assert.match(flush,/if\(s\.queue\[0\]&&s\.queue\[0\]\.key===sentKey\)s\.queue\.shift\(\)/);
  assert.match(flush,/set\(type,\{status:"conflict"\}\);continue/);
  assert.doesNotMatch(flush,/status:"conflict"\}\);break/);
});

test('repeated unsent edits keep only the latest value for each field',()=>{
  const queue=client.slice(client.indexOf('function queue'),client.indexOf('function syncCounts'));
  assert.match(queue,/existing=\(s\.queue\|\|\[\]\)\.find/);
  assert.match(queue,/existing\.value=value;existing\.key=key/);
});

test('numeric strings and numbers do not create visible or server conflicts',()=>{
  assert.match(client,/function sameValue\(field,a,b\)/);
  assert.match(client,/\["count","cases","halves","loose","adjustment"\]/);
  assert.match(client,/visibleConflicts\(snap\.conflicts\)/);
  assert.match(scalarRepair,/create or replace function public\.shared_draft_values_equal/);
  assert.match(scalarRepair,/p_left #>> '\{\}'/);
  assert.match(scalarRepair,/public\.shared_draft_values_equal\(field_key,server_value,incoming_value\)/);
});

test('count sync is confined to its actual workspace',()=>{
  assert.match(client,/function productNames\(type\)/);
  assert.match(client,/if\(!owns\(type,p\)\|\|!isCountField\(f\)/);
  assert.match(client,/if\(owns\(type,k\)\)fields\.push\(\{productKey:k,fieldKey:"adjustment"/);
});

test('untouched device cache defers to the shared team count without asking the user',()=>{
  assert.match(client,/activeTouches=\{bar:new Set\(\),merchants:new Set\(\)\}/);
  assert.match(client,/pourgrid:count-touched/);
  assert.match(client,/!isActiveTouch\(type,p\)/);
  assert.match(client,/f==="count"&&hasStructuredCount\(counts,p\)/);
  assert.match(client,/window\.pgPhysicalCountFrom\(counts,product\)/);
  assert.match(client,/function isAutomaticField\(field\)\{return isCountField\(field\)\|\|isAdjustmentField\(field\)\}/);
  assert.match(client,/automatic=all\.filter\(function\(conflict\)\{return isAutomaticField\(conflict\.fieldKey\)\}/);
  assert.match(client,/resolution=isAdjustmentField\(conflict\.fieldKey\)\|\|isActiveTouch\(type,conflict\.productKey\)\?"incoming":"server"/);
  assert.match(client,/passiveConflicts/);
  assert.match(client,/if\(isCountField\(m\.field\)\)activeTouches\[type\]\.add\(m\.product\)/);
  assert.match(html,/new CustomEvent\("pourgrid:count-touched"/);
  assert.match(html,/shared-drafts\.js\?v=8/);
});

test('a deliberate count cannot be overwritten before its debounced retry',()=>{
  const apply=client.slice(client.indexOf('function apply('),client.indexOf('async function settleAutomaticConflicts'));
  assert.match(apply,/isCountField\(f\.fieldKey\)&&isActiveTouch\(type,f\.productKey\)/);
  assert.match(apply,/Object\.prototype\.hasOwnProperty\.call\(counts,k\)\)return/);
  const schedule=html.slice(html.indexOf('function schedulePush'),html.indexOf('async function syncCounts'));
  assert.ok(schedule.indexOf('pushCounts(counts)')<schedule.indexOf('setTimeout'),'the shared mutation is queued before the retry timer');
});

test('real count conflicts use readable package quantities instead of float artifacts',()=>{
  assert.match(html,/function pgConflictValue\(value,conflict\)/);
  assert.match(html,/cfg\.mode==="caseLoose"/);
  assert.match(html,/Math\.round\(\(number-cases\)\*Number\(cfg\.unitsPerCase\)\)/);
  assert.match(html,/maximumFractionDigits:2/);
  assert.doesNotMatch(html,/These items were changed differently on two devices/);
});

test('cleared manual order quantities persist and stale refreshes cannot restore them',()=>{
  assert.match(client,/function clearAdjustment\(type,product\)\{queue\(type,product,"adjustment",0\);queue\(type,product,"adjustment_meta",\{\}\)\}/);
  assert.match(client,/pending\.forEach\(function\(item\)\{applyField/);
  assert.match(client,/if\(!Number\(f\.value\)\)delete adjs\[f\.productKey\]/);
  assert.match(html,/pgPersistDraft\(type,\[product\.name\]\)/);
  assert.match(html,/pgPersistDraft\(type,next===0\?\[product\.name\]:\[\]\)/);
  assert.doesNotMatch(html,/PourGridSharedDraft\.review\(sharedType\)/);
});

test('an explicit order adjustment wins a stale revision without reverting on refresh',()=>{
  const flush=client.slice(client.indexOf('async function flush'),client.indexOf('function queue'));
  assert.match(client,/function isAdjustmentField\(field\)/);
  assert.match(flush,/if\(isAdjustmentField\(m\.field\)\|\|isCountField\(m\.field\)\)/);
  assert.match(flush,/api\(\)\.resolve\(r\.conflictId\|\|null,"incoming",s\.id,m\.product,m\.field\)/);
  assert.ok(flush.indexOf('api().resolve(r.conflictId||null,"incoming"')<flush.indexOf('s.queue[0].key===sentKey)s.queue.shift()'));
  assert.match(flush,/await refresh\(type\);continue/);
});

test('count and adjustment conflicts merge automatically instead of becoming a review checklist',()=>{
  const flush=client.slice(client.indexOf('async function flush'),client.indexOf('function queue'));
  assert.match(flush,/isAdjustmentField\(m\.field\)\|\|isCountField\(m\.field\)/);
  assert.match(flush,/api\(\)\.resolve\(r\.conflictId\|\|null,"incoming"/);
  assert.match(client,/function settleAutomaticConflicts/);
  assert.match(client,/isAdjustmentField\(conflict\.fieldKey\)\|\|isActiveTouch\(type,conflict\.productKey\)\?"incoming":"server"/);
  assert.match(client,/conflicts=all\.filter\(function\(conflict\)\{return !isAutomaticField\(conflict\.fieldKey\)\}/);
  assert.match(client,/setTimeout\(function\(\)\{refresh\(type\)/);
  assert.match(html,/cfg\.countBasis==="units"/);
});

test('a finalized workflow opens a genuinely empty shared draft',()=>{
  assert.match(client,/async function startFresh\(type\)/);
  assert.match(client,/function clearLocalWorkspace\(type\)/);
  assert.match(client,/delete notes\[type\]/);
  assert.match(client,/clearLocalWorkspace\(type\)/);
  assert.match(client,/filter\(function\(item\)\{return item\.type!==type\}\)/);
  assert.match(client,/activeTouches\[type\]\.clear\(\)/);
  assert.match(client,/s\.discarding=true/);
  assert.match(client,/if\(!discardId&&!s\.closed\)\{var existing=await api\(\)\.read\(type\)/);
  assert.match(client,/if\(discardId&&!s\.closed\)await api\(\)\.abandon\(discardId\)/);
  assert.match(client,/states\[type\]!==expected/);
  assert.match(client,/open\(type,\{skipLegacyImport:true\}\)/);
  assert.match(client,/!options\.skipLegacyImport&&!\(snap\.fields\|\|\[\]\)\.length/);
  assert.match(client,/startFresh:startFresh/);
  assert.match(html,/PourGridSharedDraft\.startFresh\(type\)/);
});

test('one order edit queues only fields that actually changed',()=>{
  const persistence=html.slice(html.indexOf('function pgPersistDraft'),html.indexOf('function pgHydrateDrafts'));
  assert.match(persistence,/previousAdjustments/);
  assert.match(persistence,/JSON\.stringify\(previousAdjustments\[name\]\)!==JSON\.stringify\(adjustments\[name\]\)/);
  assert.match(persistence,/JSON\.stringify\(previousMeta\[name\]\)!==JSON\.stringify\(meta\[name\]\)/);
  assert.match(persistence,/if\(previousNote!==record\.note\)/);
});
