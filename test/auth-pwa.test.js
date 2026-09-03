'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');

test('PourGrid has no user-facing login gate',()=>{
  const html=read('index.html'),gate=read('auth-gate.js');
  assert.doesNotMatch(html,/id="pgAuthEmail"|id="pgAuthPassword"|>Sign in<|Forgot password/);
  assert.doesNotMatch(gate,/signInWithPassword|signInWithOtp|requestPassword|signedOut|lockApp|Sign out safely/);
  assert.match(html,/Opening PourGrid/);
});

test('dashboard starts before optional cloud session attachment',()=>{
  const gate=read('auth-gate.js');
  assert.match(gate,/startApp\(\)\.then\(\(\)=>attachExistingSession\(\)\)/);
  assert.match(gate,/app\.hidden=false;root\.hidden=true/);
  assert.match(gate,/boot\.settle\('dashboard-visible'\)/);
});

test('an existing session is background-only and remains refreshable',()=>{
  const gate=read('auth-gate.js');
  assert.match(gate,/persistSession:true,autoRefreshToken:true/);
  assert.match(gate,/storage:window\.localStorage/);
  assert.match(gate,/const noBlockingLock=async\(_name,_timeout,fn\)=>fn\(\)/);
  assert.match(gate,/client\.auth\.getSession\(\)/);
  assert.doesNotMatch(gate,/getUser\(\)|auth\.signOut/);
});

test('cloud failure can never hide the operational app',()=>{
  const gate=read('auth-gate.js');
  const optional=gate.slice(gate.indexOf('async function attachExistingSession'));
  assert.match(optional,/catch\(error\)\{console\.warn\('\[PourGrid cloud optional\]'/);
  assert.doesNotMatch(optional,/app\.hidden=true|root\.hidden=false/);
});

test('local Sapphire context works without credentials or a database response',()=>{
  const gate=read('auth-gate.js');
  assert.match(gate,/organizationId:'local-sapphire'/);
  assert.match(gate,/locationId:'local-sapphire'/);
  assert.match(gate,/organizationName:'Sapphire Beach Bar'/);
  assert.match(gate,/capabilities\(\)/);
});

test('existing property context is reused for optional scoped cloud APIs',()=>{
  const gate=read('auth-gate.js');
  assert.match(gate,/pourgrid-property-registry-v1/);
  assert.match(gate,/pourgrid-selected-location/);
  assert.match(gate,/POURGRID_ORDER_API=Object\.freeze/);
  assert.match(gate,/save_location_order/);
  assert.match(gate,/p_organization:context\.organizationId,p_location:context\.locationId/);
});

test('client contains no embedded Supabase credential',()=>{
  assert.doesNotMatch(read('index.html'),/eyJ[a-zA-Z0-9_-]{20,}/);
  assert.match(read('index.html'),/POURGRID_CONFIG/);
});

test('manifest and icons remain installable',()=>{
  const manifest=JSON.parse(read('manifest.webmanifest'));
  assert.equal(manifest.scope,'/');assert.equal(manifest.start_url,'/');assert.equal(manifest.display,'standalone');
  for(const [file,size] of [['icon-180.png',180],['icon-192.png',192],['icon-512.png',512],['icon-maskable-512.png',512]]){const png=fs.readFileSync(path.join(__dirname,'..','icons',file));assert.equal(png.toString('ascii',1,4),'PNG');assert.equal(png.readUInt32BE(16),size);assert.equal(png.readUInt32BE(20),size)}
});

test('worker never caches database or authorization traffic',()=>{
  const sw=read('sw.js');new Function(sw);
  assert.match(sw,/request\.headers\.has\('authorization'\)/);
  assert.match(sw,/rest\\\/v1/);
  assert.doesNotMatch(sw,/orders|inventory|receiving|reconciliation|audit/);
});

test('Netlify publishes the built app',()=>{
  const config=read('netlify.toml');assert.match(config,/publish = "dist"/);assert.match(config,/from = "\/\*"/);
});
