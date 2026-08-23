const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

const gate=fs.readFileSync('auth-gate.js','utf8');
const html=fs.readFileSync('index.html','utf8');
const originalSql=fs.readFileSync('supabase/migrations/202608180001_transactional_order_save.sql','utf8');
const sql=fs.readFileSync('supabase/migrations/202608230003_transactional_history_attribution_repair.sql','utf8');
const workflow=fs.readFileSync('.github/workflows/phase3-database-verification.yml','utf8');
const executable=fs.readFileSync('supabase/tests/phase3_executable.sql','utf8');

test('order saves use the authenticated location-scoped RPC',()=>{
  assert.match(gate,/POURGRID_ORDER_API=Object\.freeze/);
  assert.match(gate,/save_location_order/);
  assert.match(gate,/p_organization:context\.organizationId,p_location:context\.locationId/);
  const save=html.slice(html.indexOf('async function saveDB'),html.indexOf('async function delDB'));
  assert.match(save,/POURGRID_ORDER_API\.save\(entry\)/);
  assert.doesNotMatch(save,/dbFetch|Bearer "\+SB_KEY/);
});

test('save RPC validates tenant membership, location, workflow, draft, counts, and items',()=>{
  assert.match(sql,/auth\.uid\(\)/);
  assert.match(sql,/has_location_role/);
  assert.match(sql,/bar_lead/);
  assert.match(sql,/Location is outside organization/);
  assert.match(sql,/matching draft identity/);
  assert.match(sql,/not in \('bar','merchants'\)/);
  assert.match(sql,/jsonb_typeof\(p_order->'counts'\)/);
  assert.match(sql,/jsonb_typeof\(p_order->'items'\)/);
  assert.match(sql,/revoke all on function[\s\S]*from public,anon/);
  assert.match(sql,/grant execute[\s\S]*to authenticated/);
});

test('save RPC is transactional and duplicate retries return the original order',()=>{
  assert.match(sql,/pg_advisory_xact_lock/);
  assert.match(originalSql,/unique\(organization_id,location_id,draft_id\)/);
  assert.match(sql,/if found then[\s\S]*return v_existing\.order_id/);
  assert.match(sql,/already saved with different contents/);
  assert.match(sql,/insert into public\.orders[\s\S]*insert into public\.legacy_order_references[\s\S]*insert into public\.legacy_order_submissions/);
});

test('repaired save writes and verifies consistent organization and location attribution',()=>{
  assert.match(sql,/legacy_order_references\([\s\S]*location_id[\s\S]*p_organization,p_location,v_user/);
  assert.match(sql,/legacy_order_submissions\([\s\S]*organization_id,location_id[\s\S]*p_organization,p_location,p_draft_id/);
  assert.match(sql,/Saved order attribution is invalid/);
  assert.match(sql,/Saved order attribution could not be established/);
  assert.doesNotMatch(sql,/update\s+public\.legacy_order_references/i);
});

test('database CI applies and executes the save migration',()=>{
  assert.match(workflow,/202608180001_transactional_order_save\.sql/);
  assert.match(workflow,/202608230003_transactional_history_attribution_repair\.sql/);
  assert.match(executable,/duplicate order save returns original id/);
  assert.match(executable,/saved order appears immediately in History/);
  assert.match(executable,/cross-tenant order save unexpectedly succeeded/);
});

test('network and session failures retain the draft and expose actionable feedback',()=>{
  const submission=html.slice(html.indexOf('function rOrderTab'),html.indexOf('function calcSuggestedBuildTos'));
  assert.match(submission,/\.catch\(function\(error\)/);
  assert.match(submission,/this draft is still saved on this device/i);
  const clearIndex=submission.indexOf('pgClearWorkflowDraft(activeType');
  const successIndex=submission.indexOf('if(dbId)');
  const catchIndex=submission.indexOf('.catch(function(error)');
  assert.ok(clearIndex>successIndex&&clearIndex<catchIndex);
  assert.doesNotMatch(submission.slice(catchIndex),/pgClearWorkflowDraft/);
});

test('saveDB returns the server order id and propagates failures',async()=>{
  const source=html.slice(html.indexOf('async function saveDB'),html.indexOf('async function delDB'));
  const context={window:{POURGRID_ORDER_API:{save:async entry=>entry.result}}};
  vm.runInNewContext(source+';this.saveDB=saveDB;',context);
  assert.equal(await context.saveDB({draftId:'bar-1',result:42}),42);
  context.window.POURGRID_ORDER_API.save=async()=>{throw new Error('offline')};
  await assert.rejects(()=>context.saveDB({draftId:'bar-1'}),/offline/);
});
