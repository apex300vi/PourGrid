const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const connectivity=html.slice(html.indexOf('var PG_CONNECTIVITY_PROBE'),html.indexOf('function rSplash'));

test('connectivity is independent from history synchronization state',()=>{
  assert.match(html,/sync:"loading",connectivity:"checking"/);
  assert.match(html,/S\.connectivity==="online"\?"Online"/);
  assert.doesNotMatch(html,/S\.sync==="ok"\?"Synced":"Offline"/);
  assert.match(html,/var patch=\{sync:histResult===null\?"error":"ok"\}/);
});

test('probe bypasses caches and sends no credentials or authentication data',()=>{
  assert.match(connectivity,/PG_CONNECTIVITY_PROBE="\/runtime-config\.js"/);
  assert.match(connectivity,/method:"HEAD",cache:"no-store",credentials:"omit"/);
  assert.match(connectivity,/\?connectivity="\+Date\.now\(\)/);
  assert.doesNotMatch(connectivity,/Authorization|apikey|SB_KEY|access_token/i);
});

test('reachable origin wins over navigator online hints',()=>{
  assert.doesNotMatch(connectivity,/navigator\.onLine/);
  assert.match(connectivity,/response\.ok/);
  assert.match(connectivity,/pgSetConnectivity\("online"\)/);
  assert.match(connectivity,/pgSetConnectivity\("offline"\)/);
  assert.match(connectivity,/AbortController/);
});

test('connectivity recovers across launch, network, wake, visibility, and service-worker changes',()=>{
  for(const hook of ['online','offline','pageshow','focus','visibilitychange','controllerchange'])assert.match(html,new RegExp('"'+hook+'"'));
  assert.match(html,/navigator\.serviceWorker\.ready\.then\(pgProbeConnectivity\)/);
  assert.match(html,/setInterval\(pgProbeConnectivity,30000\)/);
  assert.match(html,/pgProbeConnectivity\(\);/);
});

test('offline banner follows verified connectivity instead of navigator onLine',()=>{
  assert.match(html,/classList\.toggle\('show',S\.connectivity==='offline'\)/);
  assert.doesNotMatch(html,/classList\.toggle\('show',!navigator\.onLine\)/);
});
