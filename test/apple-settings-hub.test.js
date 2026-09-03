const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const html=fs.readFileSync('index.html','utf8');
const gate=fs.readFileSync('auth-gate.js','utf8');
const seasonal=fs.readFileSync('seasonal-profiles.js','utf8');

test('connectivity reports network health instead of draft workflow state',()=>{
  const paint=html.slice(html.indexOf('function pgPaintConnectivity'),html.indexOf('function pgDraftAttentionState'));
  assert.match(paint,/state==="online"\?"Connected"/);
  assert.doesNotMatch(paint,/Needs review|Unsynced changes|save-failed|PourGridSharedDraft/);
});

test('draft problems remain visible and route to the affected workspace',()=>{
  const attention=html.slice(html.indexOf('function pgDraftAttentionState'),html.indexOf('function pgSetConnectivity'));
  for(const status of ['conflict','save-failed','unsynced','offline-saved'])assert.match(attention,new RegExp(status));
  assert.match(attention,/Two devices entered different values/);
  assert.match(attention,/pgOpenDraftAttention\(attention\)/);
  assert.match(attention,/Saved for everyone/);
  assert.match(attention,/On this device/);
  assert.match(attention,/Keep saved/);
  assert.match(attention,/Use this device/);
  assert.match(attention,/resolveConflict/);
});

test('Settings preserves every administrative destination without floating controls',()=>{
  const settings=html.slice(html.indexOf('function pgSettingsRow'),html.indexOf('function pgSetupError'));
  for(const label of ['Items & vendors','Seasonal Profiles','Manage team'])assert.match(settings,new RegExp(label.replace('&','&')));
  assert.match(settings,/ss\(\{screen:"setup"\}\)/);
  assert.match(settings,/pgOpenPropertySwitcher/);
  assert.match(settings,/window\.pgOpenSeasonalProfiles/);
  assert.match(settings,/window\.POURGRID_MANAGE_TEAM/);
  assert.doesNotMatch(settings,/Sign out|POURGRID_SIGN_OUT/);
  assert.doesNotMatch(gate,/className='pg-auth-signout'|className='pg-team-trigger'/);
  assert.doesNotMatch(seasonal,/pgSeasonalTrigger/);
});

test('Settings contains no obsolete login or sign-out action',()=>{
  assert.doesNotMatch(html,/function pgConfirmSignOut|data-settings-action="confirm-signout"/);
});
