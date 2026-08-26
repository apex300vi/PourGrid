'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const Context=require('../property-context.js');
const Catalog=require('../property-catalog.js');

const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const gate=fs.readFileSync(path.join(__dirname,'..','auth-gate.js'),'utf8');
const build=fs.readFileSync(path.join(__dirname,'..','scripts','build-static.mjs'),'utf8');

function memory(seed){
  const values=new Map(Object.entries(seed||{}));
  return {
    values,
    getItem:key=>values.has(key)?values.get(key):null,
    setItem:(key,value)=>{values.set(key,String(value));},
    removeItem:key=>{values.delete(key);}
  };
}
const SAPPHIRE={organizationId:'org-sapphire',organizationName:'Sapphire Beach Bar',locationId:'loc-sapphire',locationName:'St. Thomas'};
const SEASALT={organizationId:'org-strg',organizationName:'St. Thomas Restaurant Group',locationId:'loc-seasalt',locationName:'SeaSalt'};

test('the live Sapphire property keeps its original unprefixed local keys',()=>{
  const storage=memory();
  const state=Context.boot(storage,SAPPHIRE);
  assert.equal(state.isHome,true);
  assert.equal(state.property.seedCatalog,'sapphire-v12');
  assert.equal(state.needsOnboarding,false);
  state.store.setItem('sbb-counts','{"Stoli Vodka":"4"}');
  assert.equal(storage.getItem('sbb-counts'),'{"Stoli Vodka":"4"}');
  assert.equal(state.store.key('pourgrid-session'),'pourgrid-session');
});

test('a pilot property is namespaced and never reads Sapphire local data',()=>{
  const storage=memory();
  Context.boot(storage,SAPPHIRE).store.setItem('sbb-counts','{"Stoli Vodka":"4"}');
  const pilot=Context.boot(storage,SEASALT);
  assert.equal(pilot.isHome,false);
  assert.equal(pilot.store.getItem('sbb-counts'),null);
  pilot.store.setItem('sbb-counts','{"House Red":"2"}');
  assert.equal(storage.getItem('sbb-counts'),'{"Stoli Vodka":"4"}');
  assert.equal(storage.getItem('pg:loc-seasalt:sbb-counts'),'{"House Red":"2"}');
  assert.equal(Context.boot(storage,SAPPHIRE).store.getItem('sbb-counts'),'{"Stoli Vodka":"4"}');
});

test('every operating key that holds property data is scoped and every account key is not',()=>{
  ['sbb-counts','sbb-ordered','sbb-notes','sbb-adjustments','sbb-adjustment-meta','sbb-count-photos',
   'pourgrid-session','pourgrid-order-drafts-v2','pourgrid-drafts-v1','pourgrid-product-edits',
   'pourgrid-email-status','pourgrid-scan-history','pourgrid-pour-oz','pourgrid-property-catalog-v1',
   'pourgrid-property-vendors-v1','pourgrid-local-draft-backup-v1','pourgrid-shared-draft-queue-v1',
   'pourgrid-profit-lab-working-estimate-v2','pourgrid-migration-anything-v1'
  ].forEach(key=>assert.equal(Context.isScopedKey(key),true,key));
  ['pourgrid-auth-context-v1','pourgrid-selected-location','pourgrid-authorized-contexts-v1',
   'pourgrid-property-registry-v1','pourgrid-release','pourgrid-invitations','pourgrid-protected'
  ].forEach(key=>assert.equal(Context.isScopedKey(key),false,key));
  assert.equal(Context.scopeKey('pourgrid-selected-location','loc-seasalt','loc-sapphire'),'pourgrid-selected-location');
  assert.equal(Context.scopeKey('sbb-counts','loc-seasalt','loc-sapphire'),'pg:loc-seasalt:sbb-counts');
});

test('a device that already ran single-tenant PourGrid keeps its data as the home property',()=>{
  const storage=memory({'sbb-counts':'{"Cruzan Dark":"9"}'});
  const state=Context.boot(storage,{organizationId:'org-x',organizationName:'Legacy Org',locationId:'loc-x',locationName:'Main'});
  assert.equal(state.isHome,true);
  assert.equal(state.store.getItem('sbb-counts'),'{"Cruzan Dark":"9"}');
});

test('a pilot property starts empty, needs onboarding, and runs a 60-day trial',()=>{
  const storage=memory();
  Context.boot(storage,SAPPHIRE);
  const pilot=Context.boot(storage,SEASALT,{now:'2026-08-26T12:00:00.000Z'});
  assert.equal(pilot.property.seedCatalog,'none');
  assert.equal(pilot.property.displayName,'SeaSalt');
  assert.equal(pilot.needsOnboarding,true);
  assert.equal(pilot.property.trial.days,60);
  assert.equal(Context.trialDaysRemaining(pilot.property,Date.parse('2026-08-26T12:00:00.000Z')),60);
  assert.equal(Context.trialDaysRemaining(pilot.property,Date.parse('2026-10-01T12:00:00.000Z')),24);
  assert.equal(Context.trialDaysRemaining(pilot.property,Date.parse('2027-01-01T12:00:00.000Z')),0);
  assert.equal(Context.trialDaysRemaining(Context.boot(storage,SAPPHIRE).property),null);
});

test('onboarding completes once and survives the next boot',()=>{
  const storage=memory();
  Context.boot(storage,SAPPHIRE);
  const pilot=Context.boot(storage,SEASALT);
  Context.writeRegistry(storage,Context.markOnboarded(pilot.registry,SEASALT.locationId,'2026-08-26T12:00:00.000Z'));
  const reopened=Context.boot(storage,SEASALT);
  assert.equal(reopened.needsOnboarding,false);
  assert.equal(reopened.property.onboardedAt,'2026-08-26T12:00:00.000Z');
  assert.equal(reopened.property.seedCatalog,'none');
});

test('a property can be renamed without touching the other property',()=>{
  const storage=memory();
  const home=Context.boot(storage,SAPPHIRE);
  const pilot=Context.boot(storage,SEASALT);
  Context.writeRegistry(storage,Context.renameProperty(pilot.registry,SEASALT.locationId,'SeaSalt at Sapphire Village'));
  assert.equal(Context.boot(storage,SEASALT).property.displayName,'SeaSalt at Sapphire Village');
  assert.equal(Context.boot(storage,SAPPHIRE).property.displayName,home.property.displayName);
  assert.equal(Context.label(Context.boot(storage,SEASALT).property),'SeaSalt at Sapphire Village · St. Thomas Restaurant Group');
});

test('no authorized context falls back to the original single-tenant behaviour',()=>{
  const storage=memory({'sbb-counts':'{"Limes":"1"}'});
  const state=Context.boot(storage,null);
  assert.equal(state.needsOnboarding,false);
  assert.equal(state.property.seedCatalog,'sapphire-v12');
  assert.equal(state.store.getItem('sbb-counts'),'{"Limes":"1"}');
});

test('Sapphire vendor defaults are unchanged and a new property starts with none',()=>{
  assert.deepEqual(Catalog.vendorNames(Catalog.seedVendorsFor({seedCatalog:'sapphire-v12'})),['Bellows/WI','CC1','Merchants']);
  assert.deepEqual(Catalog.barVendorNames(Catalog.seedVendorsFor({seedCatalog:'sapphire-v12'})),['Bellows/WI','CC1']);
  assert.deepEqual(Catalog.merchantVendorNames(Catalog.seedVendorsFor({seedCatalog:'sapphire-v12'})),['Merchants']);
  assert.deepEqual(Catalog.seedVendorsFor({seedCatalog:'none'}),[]);
  const colors=Catalog.vendorColors(Catalog.seedVendorsFor({seedCatalog:'sapphire-v12'}));
  assert.deepEqual(colors['Bellows/WI'],{bg:'rgba(52,104,216,0.18)',text:'#8FB2FF',dot:'#4FA8FF'});
  assert.deepEqual(colors['CC1'],{bg:'rgba(231,76,60,0.18)',text:'#FF8F85',dot:'#E10A17'});
  assert.deepEqual(colors['Merchants'],{bg:'rgba(30,145,85,0.18)',text:'#5FE0A0',dot:'#00B893'});
  assert.ok(Catalog.colorFor(colors,'Vendor With No Colour').dot);
});

test('vendors can be added, routed to a workspace, and removed only when unused',()=>{
  let vendors=[];
  const blank=Catalog.addVendor(vendors,{name:'  '});
  assert.equal(blank.ok,false);
  const bad=Catalog.addVendor(vendors,{name:'Vino',email:'not-an-email'});
  assert.equal(bad.ok,false);
  vendors=Catalog.addVendor(vendors,{name:'Vino',workspace:'bar',email:'orders@vino.example'}).vendors;
  vendors=Catalog.addVendor(vendors,{name:'Island Produce',workspace:'merchants'}).vendors;
  assert.deepEqual(Catalog.vendorNames(vendors),['Vino','Island Produce']);
  assert.deepEqual(Catalog.barVendorNames(vendors),['Vino']);
  assert.equal(Catalog.isMerchantVendor(vendors,'Island Produce'),true);
  assert.equal(Catalog.addVendor(vendors,{name:'vino'}).ok,false,'duplicate names are rejected case-insensitively');
  const items=[Catalog.normalizeItem({name:'House Red',dist:'Vino',pack:12})];
  assert.equal(Catalog.removeVendor(vendors,'Vino',items).ok,false);
  assert.deepEqual(Catalog.vendorNames(Catalog.removeVendor(vendors,'Vino',[]).vendors),['Island Produce']);
});

test('a brand-new property builds its own catalog from scratch',()=>{
  const vendors=Catalog.addVendor([],{name:'Vino'}).vendors;
  let items=[];
  assert.equal(Catalog.addItem(items,{name:'House Red',dist:'Ghost Vendor'},vendors).ok,false,'unknown vendors are rejected');
  assert.equal(Catalog.addItem(items,{name:'',dist:'Vino'},vendors).ok,false);
  const added=Catalog.addItem(items,{name:'House Red',dist:'Vino',cat:'Wine',pack:'12',unit:'Case',buildTo:'6'},vendors);
  assert.equal(added.ok,true);
  items=added.items;
  assert.deepEqual(items[0],{id:'custom:house-red',name:'House Red',dist:'Vino',cat:'Wine',buildTo:6,pack:12,unit:'Case',note:'',custom:true});
  assert.equal(Catalog.addItem(items,{name:'house red',dist:'Vino'},vendors).ok,false,'duplicate item names are rejected');
  assert.equal(Catalog.addItem(items,{name:'Stoli Vodka',dist:'Vino'},vendors,['Stoli Vodka']).ok,false,'seed catalog names stay reserved');
  const catalog=Catalog.buildCatalog([],items);
  assert.deepEqual(catalog.map(x=>x.name),['House Red']);
  assert.deepEqual(Catalog.removeItem(items,'custom:house-red'),[]);
});

test('a seeded property keeps its published guide and appends its own items',()=>{
  const seed=[{name:'Stoli Vodka',dist:'Bellows/WI'}];
  const custom=[Catalog.normalizeItem({name:'Stoli Vodka',dist:'Bellows/WI'}),Catalog.normalizeItem({name:'House Rum Punch',dist:'CC1'})];
  const catalog=Catalog.buildCatalog(seed,custom);
  assert.deepEqual(catalog.map(x=>x.name),['Stoli Vodka','House Rum Punch'],'the published guide always wins a name collision');
});

test('catalog and vendor stores round-trip through property-scoped storage',()=>{
  const storage=memory();
  Context.boot(storage,SAPPHIRE);
  const pilot=Context.boot(storage,SEASALT);
  const vendors=Catalog.addVendor([],{name:'Vino'}).vendors;
  Catalog.saveVendors(pilot.store,vendors);
  Catalog.saveItems(pilot.store,Catalog.addItem([],{name:'House Red',dist:'Vino'},vendors).items);
  assert.deepEqual(Catalog.vendorNames(Catalog.readVendors(pilot.store,pilot.property)),['Vino']);
  assert.deepEqual(Catalog.readItems(pilot.store).map(x=>x.name),['House Red']);
  const home=Context.boot(storage,SAPPHIRE);
  assert.deepEqual(Catalog.vendorNames(Catalog.readVendors(home.store,home.property)),['Bellows/WI','CC1','Merchants']);
  assert.deepEqual(Catalog.readItems(home.store),[],'the pilot catalog is invisible to Sapphire');
});

test('an explicitly emptied vendor list is not re-seeded',()=>{
  const storage=memory();
  const home=Context.boot(storage,SAPPHIRE);
  Catalog.saveVendors(home.store,[]);
  assert.deepEqual(Catalog.readVendors(home.store,home.property),[]);
});

test('the dashboard reads and writes every local value through the property store',()=>{
  assert.match(html,/var PG_PROPERTY_STATE=PourGridPropertyContext\.boot\(localStorage,window\.POURGRID_AUTH_CONTEXT\|\|null\)/);
  assert.match(html,/function lsGet\(k\)\{try\{var v=PG_STORE\.getItem\(k\)/);
  assert.match(html,/function lsSet\(k,v\)\{try\{PG_STORE\.setItem\(k,JSON\.stringify\(v\)\)/);
  assert.match(html,/PourGridProductPersistence\.read\(PG_STORE\)/);
  assert.match(html,/PourGridProductPersistence\.saveVerified\(PG_STORE,v\|\|\{\}\)/);
  assert.match(html,/PG_STORE\.getItem\("pourgrid-session"\)/);
  assert.match(html,/PG_STORE\.setItem\("pourgrid-session"/);
  assert.match(html,/PG_STORE\.getItem\("pourgrid-pour-oz"\)/);
  assert.match(html,/PG_STORE\.getItem\(migrationKey\)/);
  // The only unscoped write left is the device-wide selected location the switcher sets.
  const raw=html.match(/localStorage\.[a-zA-Z]+\([^)]*\)/g)||[];
  assert.deepEqual(raw,['localStorage.setItem("pourgrid-selected-location",id)']);
  assert.equal((html.match(/PourGridPropertyContext\.(boot|writeRegistry)\(localStorage/g)||[]).length,2);
});

test('shared drafts and Profit Lab drafts follow the active property',()=>{
  const drafts=fs.readFileSync(path.join(__dirname,'..','shared-drafts.js'),'utf8');
  const estimator=fs.readFileSync(path.join(__dirname,'..','drink-price-estimator.js'),'utf8');
  [drafts,estimator].forEach(source=>{
    assert.match(source,/window\.PG_STORE\|\|localStorage/);
    assert.doesNotMatch(source,/localStorage\.(get|set|remove)Item\(/);
  });
});

test('the catalog, vendors, and workspaces are derived from the active property',()=>{
  assert.match(html,/var PG_SEED_PRODUCTS=PG_PROPERTY\.seedCatalog==="sapphire-v12"\?PG_V12_PRODUCTS:\[\]/);
  assert.match(html,/var PG_CUSTOM_ITEMS=PourGridPropertyCatalog\.readItems\(PG_STORE\)/);
  assert.match(html,/var PG_VENDORS=PourGridPropertyCatalog\.readVendors\(PG_STORE,PG_PROPERTY\)/);
  assert.match(html,/var BAR=PRODUCTS\.filter\(function\(p\)\{return !pgIsMerchantProduct\(p\);\}\)/);
  assert.match(html,/var MER=PRODUCTS\.filter\(function\(p\)\{return pgIsMerchantProduct\(p\);\}\)/);
  assert.match(html,/function pgEditorVendors\(\)\{return pgVendorNames\(\);\}/);
  assert.match(html,/rOrderTab\(BAR,pgBarVendorNames\(\),"bar",false\)/);
  assert.match(html,/rOrderTab\(MER,pgMerchantVendorNames\(\),"mer",true\)/);
  assert.match(html,/tab\.id!=="merchants"\|\|pgMerchantVendorNames\(\)\.length>0/);
  assert.doesNotMatch(html.slice(html.indexOf('function rHdr')),/"Bellows\/WI","CC1","Merchants"/);
});

test('the property switcher, pilot banner, and onboarding screen are wired into the dashboard',()=>{
  assert.match(html,/property-context\.js\?v=1/);
  assert.match(html,/property-catalog\.js\?v=1/);
  assert.match(html,/function rPropertySwitcher/);
  assert.match(html,/function pgOpenPropertySwitcher/);
  assert.match(html,/Counts, vendors, and order history stay separate for each property\./);
  assert.match(html,/function pgSwitchProperty/);
  assert.match(html,/window\.POURGRID_SWITCH_PROPERTY/);
  assert.match(html,/screen:PG_PROPERTY_STATE\.needsOnboarding\?"setup":"home"/);
  assert.match(html,/if\(S\.screen==="setup"\)\{\s*app\.appendChild\(rSetup\(\)\)/);
  assert.match(html,/function pgFinishOnboarding/);
  assert.match(html,/Add at least one vendor and one item before finishing setup\./);
  assert.match(html,/function pgAddItemFromForm/);
  assert.match(html,/function pgAddVendorFromForm/);
  assert.match(html,/function rPilotBanner/);
  assert.match(build,/'property-context\.js','property-catalog\.js'/);
});

test('auth publishes every authorized location so the switcher can move between them',()=>{
  assert.match(gate,/publishAuthorizedContexts\(result\.contexts\)/);
  assert.match(gate,/window\.POURGRID_AUTH_CONTEXTS=rows/);
  assert.match(gate,/window\.POURGRID_SWITCH_PROPERTY=function\(locationId\)/);
  assert.match(gate,/const allowed=restorePublishedContexts\(\)\.some\(x=>x\.locationId===id\)/);
  assert.match(gate,/if\(!allowed\)return false/);
  assert.match(gate,/localStorage\.removeItem\(AUTHORIZED_CONTEXTS_KEY\)/);
});

test('operational APIs stay scoped to one organization and location per session',()=>{
  ['get_location_order_history_v2','save_location_order','list_seasonal_profiles','list_profit_lab_recipes'].forEach(rpcName=>{
    const call=gate.slice(gate.indexOf(rpcName));
    assert.match(call.slice(0,200),/p_organization:context\.organizationId,p_location:context\.locationId/,rpcName);
  });
  assert.match(gate,/const scope=\{p_organization:context\.organizationId,p_location:context\.locationId\}/);
  assert.match(gate,/open_shared_location_draft',\{\.\.\.scope/);
});

test('order email signatures follow the property that sent them',()=>{
  assert.match(html,/function pgOrderSignature\(\)\{return PG_PROPERTY\.seedCatalog==="sapphire-v12"\?PG_SAPPHIRE_SIGNATURE:pgPropertyName\(\);\}/);
  assert.equal((html.match(/\+pgOrderSignature\(\)/g)||[]).length,4);
  assert.equal((html.match(/Thank you,\\nJosh\\nSapphire Beach Bar/g)||[]).length,0);
});
