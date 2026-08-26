'use strict';
// Renders the new property switcher and onboarding screens against a minimal DOM shim so a
// missing reference in the pilot flow fails here instead of on a phone behind the auth gate.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const Catalog=require('../property-catalog.js');
const Context=require('../property-context.js');

const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
function slice(from,to){
  const start=html.indexOf(from),end=html.indexOf(to);
  assert.notEqual(start,-1,from);assert.notEqual(end,-1,to);assert.ok(end>start,from+' before '+to);
  return html.slice(start,end);
}

function element(tag){
  const node={
    tagName:String(tag).toUpperCase(),className:'',id:'',style:{cssText:''},childNodes:[],attributes:{},
    _text:'',value:'',disabled:false,
    get textContent(){return node._text||node.childNodes.map(c=>c.textContent||'').join('');},
    set textContent(value){node._text=String(value);node.childNodes.length=0;},
    set innerHTML(value){node._html=String(value);},
    get innerHTML(){return node._html||'';},
    appendChild(child){assert.ok(child&&child.tagName,'appendChild received '+child);node.childNodes.push(child);return child;},
    insertAdjacentElement(){},
    setAttribute(name,value){node.attributes[name]=String(value);},
    getAttribute(name){return node.attributes[name];},
    querySelector(){return null;},
    querySelectorAll(){return [];},
    classList:{add(){},remove(){},contains(){return false;},toggle(){}}
  };
  return node;
}
function textOf(node){
  const own=node._text||'';
  const html=node._html||'';
  return [own,html].concat(node.childNodes.map(textOf)).join(' ');
}

function harness(property,options){
  options=options||{};
  const store=(()=>{const values=new Map();return {getItem:k=>values.has(k)?values.get(k):null,setItem:(k,v)=>values.set(k,String(v)),removeItem:k=>values.delete(k)};})();
  Catalog.saveVendors(store,options.vendors||[]);
  Catalog.saveItems(store,options.items||[]);
  const vendors=Catalog.readVendors(store,property),items=Catalog.readItems(store);
  const context={
    document:{createElement:element,createTextNode:value=>{const node=element('#text');node.textContent=value;return node;},getElementById:()=>null,body:{style:{}}},
    window:{},
    PourGridPropertyCatalog:Catalog,PourGridPropertyContext:Context,
    PG_PROPERTY:property,PG_STORE:store,
    PG_PROPERTY_STATE:{registry:{version:1,homePropertyId:'loc-sapphire',properties:{}},needsOnboarding:!property.onboardedAt,isHome:property.seedCatalog==='sapphire-v12'},
    PG_VENDORS:vendors,PG_CUSTOM_ITEMS:items,
    PG_SEED_PRODUCTS:options.seed||[],
    PRODUCTS:Catalog.buildCatalog(options.seed||[],items),
    S:{screen:'setup',toast:null},
    pgVendors:()=>vendors,
    pgVendorNames:()=>Catalog.vendorNames(vendors),
    pgBarVendorNames:()=>Catalog.barVendorNames(vendors),
    pgMerchantVendorNames:()=>Catalog.merchantVendorNames(vendors),
    pgIsMerchantProduct:p=>Catalog.isMerchantVendor(vendors,p&&p.dist),
    pgVendorColor:name=>Catalog.colorFor(Catalog.vendorColors(vendors),name),
    pgPropertyName:()=>property.displayName,
    pgPropertyLabel:()=>Context.label(property),
    pgPropertyTrialDays:()=>Context.trialDaysRemaining(property,options.now),
    pgAuthorizedProperties:()=>options.properties||[{id:property.id,name:property.displayName,organizationName:property.organizationName,locationName:property.locationName,current:true}],
    pgEditorCategories:()=>['Wine','Beer'],
    pgApplyCatalogEdits:()=>{},pgRefreshWorkspaces:()=>{},
    pgSwitchProperty:()=>true,ss:()=>{},render:()=>{},toast:()=>{},s4Sheet:()=>{},s4CloseSheet:()=>{},
    setTimeout:()=>0,Object,Array,String,Number,Math,JSON,Date,console
  };
  Object.assign(context,{
    LOGO_DATA_URI:'data:image/png;base64,stub',
    pgCountFilterLabel:key=>key==='all'?'Full count':key,
    pgOpenFullCount:()=>{},
    pgEsc:value=>String(value==null?'':value)
  });
  const source=slice('function mk(tag,cls,attrs)','// Custom brand mark')
    +slice('function pgUsesSapphireBranding()','function rHome()')
    +slice('function rHome()','window.addEventListener("pourgrid:shared-draft"')
    +slice('function rHdr()','function rNav()')
    +slice('function rSplash()','var SELL_PRICES=');
  vm.runInNewContext(source+';this.rSetup=rSetup;this.rPropertySwitcher=rPropertySwitcher;this.rPilotBanner=rPilotBanner;this.rSetupEntry=rSetupEntry;this.pgPropertyInitials=pgPropertyInitials;this.pgSetupComplete=pgSetupComplete;this.rHome=rHome;this.rHdr=rHdr;this.rSplash=rSplash;',context);
  return context;
}

const PILOT={id:'loc-seasalt',organizationId:'org-strg',organizationName:'St. Thomas Restaurant Group',locationName:'SeaSalt',displayName:'SeaSalt',seedCatalog:'none',onboardedAt:null,trial:{startedAt:'2026-08-26T12:00:00.000Z',days:60}};
const HOME={id:'loc-sapphire',organizationId:'org-sapphire',organizationName:'Sapphire Beach Bar',locationName:'St. Thomas',displayName:'Sapphire Beach Bar',seedCatalog:'sapphire-v12',onboardedAt:'2026-01-01T00:00:00.000Z',trial:null};

test('a brand-new property renders an onboarding screen with an empty catalog',()=>{
  const app=harness(PILOT,{now:Date.parse('2026-08-26T12:00:00.000Z')});
  const screen=textOf(app.rSetup());
  assert.match(screen,/NEW PROPERTY/);
  assert.match(screen,/Welcome to PourGrid/);
  assert.match(screen,/Set up SeaSalt from scratch/);
  assert.match(screen,/No vendors yet/);
  assert.match(screen,/Add a vendor first/);
  assert.match(screen,/Finish setup/);
  assert.match(screen,/0 vendors · 0 items/);
  assert.equal(app.pgSetupComplete(),false);
});

test('onboarding unlocks once the property has its own vendor and item',()=>{
  const vendors=Catalog.addVendor([],{name:'Vino',workspace:'bar'}).vendors;
  const items=Catalog.addItem([],{name:'House Red',dist:'Vino',cat:'Wine',pack:12,unit:'Case',buildTo:6},vendors).items;
  const app=harness(PILOT,{vendors,items});
  const screen=textOf(app.rSetup());
  assert.match(screen,/Vino/);
  assert.match(screen,/Bar workspace/);
  assert.match(screen,/House Red/);
  assert.match(screen,/Vino · Wine · 12 per case · build-to 6/);
  assert.match(screen,/1 vendor · 1 item/);
  assert.doesNotMatch(screen,/No vendors yet/);
  assert.equal(app.pgSetupComplete(),true);
});

test('an onboarded property gets the ongoing items and vendors screen instead',()=>{
  const vendors=Catalog.SAPPHIRE_VENDORS;
  const app=harness(HOME,{vendors,seed:[{name:'Stoli Vodka',dist:'Bellows/WI',cat:'Vodka',pack:12,unit:'Case',buildTo:125}]});
  const screen=textOf(app.rSetup());
  assert.match(screen,/Items & vendors/);
  assert.match(screen,/Everything here belongs to Sapphire Beach Bar only/);
  assert.match(screen,/Bellows\/WI/);assert.match(screen,/Merchants workspace/);
  assert.match(screen,/1 items come from the published order guide/);
  assert.match(screen,/Done/);
  assert.doesNotMatch(screen,/Finish setup/);
});

test('the switcher names the active property and only offers a change when there is one',()=>{
  const single=harness(HOME,{vendors:Catalog.SAPPHIRE_VENDORS});
  const solo=single.rPropertySwitcher('hdr');
  assert.match(textOf(solo),/Sapphire Beach Bar/);
  assert.equal(solo.disabled,true);
  const both=harness(PILOT,{properties:[
    {id:'loc-sapphire',name:'Sapphire Beach Bar',organizationName:'Sapphire Beach Bar',locationName:'St. Thomas',current:false},
    {id:'loc-seasalt',name:'SeaSalt',organizationName:'St. Thomas Restaurant Group',locationName:'SeaSalt',current:true}
  ]});
  const dual=both.rPropertySwitcher('home');
  assert.equal(dual.disabled,false);
  assert.match(textOf(dual),/SeaSalt/);
  assert.match(dual.attributes['aria-label'],/Switch property/);
});

test('the pilot banner counts down the free trial and never appears for Sapphire',()=>{
  assert.match(textOf(harness(PILOT,{now:Date.parse('2026-09-01T12:00:00.000Z')}).rPilotBanner()),/Pilot · 54 days left/);
  assert.match(textOf(harness(PILOT,{now:Date.parse('2027-01-01T12:00:00.000Z')}).rPilotBanner()),/Pilot period complete/);
  assert.equal(harness(HOME,{vendors:Catalog.SAPPHIRE_VENDORS}).rPilotBanner(),null);
});

test('property initials fall back safely for the header monogram',()=>{
  assert.equal(harness(PILOT,{}).pgPropertyInitials(),'S');
  assert.equal(harness(HOME,{}).pgPropertyInitials(),'SB');
});

test('the setup entry point is reachable from Home',()=>{
  assert.match(harness(HOME,{vendors:Catalog.SAPPHIRE_VENDORS}).rSetupEntry().innerHTML,/Items &amp; vendors/);
});

test('Home, header, and splash carry the active property, not hard-coded Sapphire branding',()=>{
  const pilot=harness(PILOT,{vendors:Catalog.addVendor([],{name:'Vino'}).vendors,now:Date.parse('2026-08-26T12:00:00.000Z')});
  pilot.S.connectivity='online';pilot.S.tab='bar';pilot.S.bSub='count';pilot.S.countFilter='all';
  const home=textOf(pilot.rHome());
  assert.match(home,/SeaSalt/);
  assert.match(home,/Powered by PourGrid · St\. Thomas Restaurant Group/);
  assert.match(home,/Pilot · 60 days left/);
  assert.doesNotMatch(home,/Sapphire/);
  const header=textOf(pilot.rHdr());
  assert.match(header,/SeaSalt/);assert.match(header,/Online/);
  assert.doesNotMatch(header,/Sapphire/);
  const splash=textOf(pilot.rSplash());
  assert.match(splash,/SEASALT/);
  assert.doesNotMatch(splash,/SAPPHIRE/);

  const sapphire=harness(HOME,{vendors:Catalog.SAPPHIRE_VENDORS});
  sapphire.S.connectivity='online';sapphire.S.tab='bar';sapphire.S.bSub='count';sapphire.S.countFilter='all';
  assert.match(textOf(sapphire.rHome()),/Sapphire Beach Bar/);
  assert.match(textOf(sapphire.rSplash()),/SAPPHIRE/);
  assert.equal(textOf(sapphire.rHome()).includes('Pilot ·'),false);
});
