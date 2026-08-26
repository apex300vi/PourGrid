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
const Template=require('../order-guide-template.js');

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
    appendChild(child){assert.ok(child&&child.tagName,'appendChild received '+child);node.childNodes.push(child);child.parentNode=node;return child;},
    removeChild(child){node.childNodes=node.childNodes.filter(x=>x!==child);child.parentNode=null;return child;},
    click(){node._clicked=(node._clicked||0)+1;},
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
  let vendors=Catalog.readVendors(store,property);
  const items=Catalog.readItems(store);
  const created=[],downloads=[],toasts=[];
  const body=element('body');
  const context={
    document:{createElement:tag=>{const node=element(tag);created.push(node);return node;},createTextNode:value=>{const node=element('#text');node.textContent=value;return node;},getElementById:()=>null,body:body},
    window:{},
    created:created,downloads:downloads,toasts:toasts,renders:0,
    Blob:function(parts,opts){this.parts=parts;this.type=opts&&opts.type;downloads.push(this);},
    URL:{createObjectURL:()=>'blob:stub',revokeObjectURL:()=>{}},
    PourGridProductPersistence:{stableId:product=>'id:'+product.name},
    PourGridOrderGuideTemplate:Template,
    PG_HALF_CASE_BEER:{},PG_CANONICAL_ORDER_ROUTES:{},
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
    pgSetVendors:list=>{vendors=Catalog.normalizeVendors(list);Catalog.saveVendors(store,vendors);context.PG_VENDORS=vendors;return vendors;},
    pgSwitchProperty:()=>true,ss:()=>{},render:()=>{context.renders++;},toast:message=>{toasts.push(message);},s4Sheet:()=>{},s4CloseSheet:()=>{},
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
  vm.runInNewContext(source+';this.rSetup=rSetup;this.rPropertySwitcher=rPropertySwitcher;this.rPilotBanner=rPilotBanner;this.rSetupEntry=rSetupEntry;this.pgPropertyInitials=pgPropertyInitials;this.pgSetupComplete=pgSetupComplete;this.rHome=rHome;this.rHdr=rHdr;this.rSplash=rSplash;'
    +'this.rGuideSheetCard=rGuideSheetCard;this.pgDownloadGuideTemplate=pgDownloadGuideTemplate;this.pgReviewGuideSheet=pgReviewGuideSheet;this.pgApplyGuideSheet=pgApplyGuideSheet;this.pgClearGuideImport=pgClearGuideImport;this.pgGuideFailure=pgGuideFailure;',context);
  context.store=store;
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

// --- Order guide spreadsheet onboarding -------------------------------------

const GUIDE_HEADER='Section,Category,Item Name,Vendor,Vendor Workspace,Vendor Email,Order Unit,Units Per Case,Bottle Size (mL),Build-To (Par),Notes';
function guideSheet(rows){return [GUIDE_HEADER].concat(rows).join('\r\n')+'\r\n';}

test('the setup screen offers the order guide sheet before the one-at-a-time forms',()=>{
  const screen=textOf(harness(PILOT,{}).rSetup());
  assert.match(screen,/2 · Order guide sheet/);
  assert.match(screen,/3 · Vendors/);
  assert.match(screen,/4 · Items/);
  assert.match(screen,/beer, liquor, wine, and N\/A/);
  assert.match(screen,/no other property's items are merged in/);
  assert.match(screen,/Download template/);
  assert.match(screen,/Upload filled sheet/);
});

test('downloading the template hands back a CSV named for this property',()=>{
  const app=harness(PILOT,{vendors:Catalog.addVendor([],{name:'Island Beverage'}).vendors});
  app.pgDownloadGuideTemplate();
  assert.equal(app.downloads.length,1);
  assert.match(app.downloads[0].type,/text\/csv/);
  const link=app.created.filter(node=>node.tagName==='A').pop();
  assert.equal(link.download,'PourGrid-Order-Guide-Template-SeaSalt.csv');
  assert.equal(link._clicked,1);
  assert.equal(link.parentNode,null,'the anchor is cleaned up again');
  const csv=String(app.downloads[0].parts[0]);
  assert.equal(csv.charCodeAt(0),0xFEFF,'Excel gets a byte order mark');
  const parsed=Template.parseTemplate(csv);
  assert.equal(parsed.skippedExamples,8);
  assert.match(csv,/Island Beverage/);
  assert.deepEqual(app.toasts,['Template downloaded']);
});

test('uploading a filled sheet previews it and then builds the property’s own guide',()=>{
  const app=harness(PILOT,{});
  app.pgReviewGuideSheet(guideSheet([
    'BEER,Beer,Carib Cans,Island Beverage,Bar,orders@island.example,Case,1,,20,',
    'LIQUOR,Vodka,House Vodka,Island Beverage,Bar,,Case,12,1000,36,',
    'WINE,Wine,House Chardonnay,Vintners,Bar,,Case,12,750,24,',
    'NA,Mixer,Lime Juice,Produce Co,Food & produce,,Case,12,1000,8,'
  ]),'seasalt-guide.csv');
  const preview=textOf(app.rSetup());
  assert.match(preview,/seasalt-guide\.csv/);
  assert.match(preview,/4 items · 3 vendors · 1 beer, 1 liquor, 1 wine, 1 n\/a/);
  assert.match(preview,/Import 4 items/);
  assert.equal(app.pgSetupComplete(),false,'nothing is saved until the import is confirmed');

  app.pgApplyGuideSheet('replace');
  assert.deepEqual(Catalog.readItems(app.store).map(item=>item.name),['Carib Cans','House Vodka','House Chardonnay','Lime Juice']);
  assert.deepEqual(Catalog.vendorNames(Catalog.readVendors(app.store,PILOT)),['Island Beverage','Vintners','Produce Co']);
  assert.deepEqual(app.PRODUCTS.map(product=>product.name),['Carib Cans','House Vodka','House Chardonnay','Lime Juice']);
  assert.equal(app.PG_GUIDE_IMPORT,null);
  assert.equal(app.pgSetupComplete(),true,'Finish setup is now unlocked');
  assert.deepEqual(app.toasts,['4 items imported for SeaSalt']);

  const after=textOf(app.rSetup());
  assert.match(after,/House Chardonnay/);
  assert.match(after,/Vintners · Wine · 12 per case · build-to 24/);
  assert.match(after,/Produce Co/);
  assert.match(after,/Food & produce workspace/);
});

test('a sheet with bad rows shows every problem and saves nothing',()=>{
  const app=harness(PILOT,{});
  app.pgReviewGuideSheet(guideSheet([
    'BEER,Beer,Carib Cans,,Bar,,Case,1,,20,',
    'SNACKS,Chips,Plantain Chips,Produce Co,,,Case,1,,4,'
  ]),'broken.csv');
  const screen=textOf(app.rSetup());
  assert.match(screen,/Fix these rows in the sheet and upload it again/);
  assert.match(screen,/Row 2 \(Carib Cans\): add the vendor/);
  assert.match(screen,/Row 3 \(Plantain Chips\): Section must be BEER, LIQUOR, WINE, or N\/A/);
  assert.doesNotMatch(screen,/Import 2 items/);
  app.pgApplyGuideSheet('replace');
  assert.deepEqual(Catalog.readItems(app.store),[]);
  assert.deepEqual(app.toasts,[]);

  app.pgClearGuideImport();
  assert.equal(app.PG_GUIDE_IMPORT,null);
  assert.doesNotMatch(textOf(app.rSetup()),/broken\.csv/);
});

test('a file that is not the template is refused with an explanation',()=>{
  const app=harness(PILOT,{});
  app.pgReviewGuideSheet('sales,covers\n1200,88\n','last-week.csv');
  const screen=textOf(app.rSetup());
  assert.match(screen,/Nothing imported/);
  assert.match(screen,/needs a header row with an "Item Name" column/);
  assert.match(screen,/Close/);
});

test('a re-upload can replace or extend a property’s existing items',()=>{
  const vendors=Catalog.addVendor([],{name:'Island Beverage',workspace:'bar'}).vendors;
  const items=Catalog.addItem([],{name:'Hand Added Rum',dist:'Island Beverage',cat:'Rum',pack:12,unit:'Case',buildTo:6},vendors).items;
  const app=harness(PILOT,{vendors,items});
  app.pgReviewGuideSheet(guideSheet(['BEER,Beer,Carib Cans,Island Beverage,Bar,,Case,1,,20,']),'more.csv');
  const screen=textOf(app.rSetup());
  assert.match(screen,/This property already has 1 item of its own/);
  assert.match(screen,/Replace with sheet/);
  assert.match(screen,/Add to current list/);

  app.pgApplyGuideSheet('append');
  assert.deepEqual(Catalog.readItems(app.store).map(item=>item.name),['Hand Added Rum','Carib Cans']);

  app.pgReviewGuideSheet(guideSheet(['WINE,Wine,House Chardonnay,Island Beverage,Bar,,Case,12,750,24,']),'fresh.csv');
  app.pgApplyGuideSheet('replace');
  assert.deepEqual(Catalog.readItems(app.store).map(item=>item.name),['House Chardonnay']);
});

test('an uploaded sheet can never overwrite a published guide product',()=>{
  const app=harness(HOME,{vendors:Catalog.SAPPHIRE_VENDORS,seed:[{name:'Stoli Vodka',dist:'Bellows/WI',cat:'Vodka',pack:12,unit:'Case',buildTo:125}]});
  app.pgReviewGuideSheet(guideSheet([
    'LIQUOR,Vodka,Stoli Vodka,Bellows/WI,Bar,,Case,12,1000,1,',
    'LIQUOR,Vodka,New House Vodka,Bellows/WI,Bar,,Case,12,1000,24,'
  ]),'sapphire-extras.csv');
  // The collision is named in the preview, before the import button, rather than reported
  // once half the sheet has already been written.
  const preview=textOf(app.rSetup());
  assert.match(preview,/Row 2 \(Stoli Vodka\): the published order guide already has this item/);
  assert.doesNotMatch(preview,/Import 1 item/);

  app.pgApplyGuideSheet('replace');
  assert.deepEqual(Catalog.readItems(app.store),[],'a sheet with a reserved row imports nothing');
  assert.equal(app.PRODUCTS.filter(product=>product.name==='Stoli Vodka')[0].buildTo,125);
  assert.deepEqual(app.toasts,[]);

  // Renaming the offending row is all it takes.
  app.pgReviewGuideSheet(guideSheet(['LIQUOR,Vodka,New House Vodka,Bellows/WI,Bar,,Case,12,1000,24,']),'fixed.csv');
  app.pgApplyGuideSheet('replace');
  assert.deepEqual(Catalog.readItems(app.store).map(item=>item.name),['New House Vodka']);
  assert.deepEqual(app.toasts,['1 item imported for Sapphire Beach Bar']);
});

test('a workbook, a PDF, and an empty file each say what to do about it',()=>{
  const app=harness(PILOT,{});
  app.pgReviewGuideSheet('PK'+String.fromCharCode(3,4)+' [Content_Types].xml','guide.xlsx');
  assert.match(textOf(app.rSetup()),/Excel workbook \(\.xlsx\) or a Numbers file.*Save As in Excel/s);

  app.pgReviewGuideSheet(String.fromCharCode(0xFFFD,0xFFFD,0x11,0xFFFD)+' ole','guide.xls');
  assert.match(textOf(app.rSetup()),/older Excel workbook \(\.xls\)/);

  app.pgReviewGuideSheet('%PDF-1.4\n1 0 obj','guide.pdf');
  assert.match(textOf(app.rSetup()),/That is a PDF/);

  app.pgReviewGuideSheet('   \r\n','empty.csv');
  assert.match(textOf(app.rSetup()),/That file is empty/);
});

test('a sheet saved with semicolons or tabs reads the same as one saved with commas',()=>{
  [';','\t'].forEach(sep=>{
    const app=harness(PILOT,{});
    app.pgReviewGuideSheet([
      GUIDE_HEADER.split(',').join(sep),
      ['BEER','Beer','Carib Cans','Island Beverage','Bar','','Case','1','','20',''].join(sep)
    ].join('\r\n')+'\r\n','guide.csv');
    assert.match(textOf(app.rSetup()),/1 item · 1 vendor · 1 beer/,'delimiter '+JSON.stringify(sep));
    app.pgApplyGuideSheet('replace');
    assert.deepEqual(Catalog.readItems(app.store).map(item=>item.name),['Carib Cans']);
  });
});

test('a vendor the catalog would refuse is caught in the preview, not after the save',()=>{
  const vendors=Catalog.addVendor([],{name:'Island Beverage',workspace:'bar'}).vendors;
  const items=Catalog.addItem([],{name:'Hand Added Rum',dist:'Island Beverage',cat:'Rum',pack:12,unit:'Case',buildTo:6},vendors).items;
  const app=harness(PILOT,{vendors,items});
  app.pgReviewGuideSheet(guideSheet([
    'BEER,Beer,Carib Cans,Island Beverage,Bar,orders@island,Case,1,,20,'
  ]),'bad-email.csv');
  const screen=textOf(app.rSetup());
  assert.match(screen,/"orders@island" is not a valid vendor email/);
  assert.doesNotMatch(screen,/Replace with sheet/);

  // The property's own guide is the thing being protected: a replace that could not add a
  // single row must not leave it holding nothing.
  app.pgApplyGuideSheet('replace');
  assert.deepEqual(Catalog.readItems(app.store).map(item=>item.name),['Hand Added Rum']);
  assert.deepEqual(app.toasts,[]);
});

test('a file that cannot be read at all still says so after the screen re-renders',()=>{
  const app=harness(PILOT,{});
  // rSetup rebuilds the validation box, so a message written into it before render() is
  // gone by the time the uploader looks. These have to survive that.
  app.pgGuideFailure('That file could not be read. Open it, save it as CSV, and upload that copy.');
  assert.match(textOf(app.rSetup()),/That file could not be read/);
  app.pgGuideFailure('That file is 12MB. An order guide sheet is a few hundred kilobytes at most — check you picked the right file.');
  const screen=textOf(app.rSetup());
  assert.match(screen,/That file is 12MB/);
  assert.match(screen,/Dismiss/);
  app.pgClearGuideImport();
  assert.doesNotMatch(textOf(app.rSetup()),/That file is 12MB/);
});

test('a re-upload of names the property already has warns first and leaves the guide alone',()=>{
  const vendors=Catalog.addVendor([],{name:'Island Beverage',workspace:'bar'}).vendors;
  const items=Catalog.addItem([],{name:'Carib Cans',dist:'Island Beverage',cat:'Beer',pack:1,unit:'Case',buildTo:20},vendors).items;
  const app=harness(PILOT,{vendors,items});
  app.pgReviewGuideSheet(guideSheet(['BEER,Beer,Carib Cans,Island Beverage,Bar,,Case,1,,30,']),'again.csv');
  assert.match(textOf(app.rSetup()),/already has an item with this name, so adding to the current list will skip it/);

  app.pgApplyGuideSheet('append');
  assert.deepEqual(Catalog.readItems(app.store).map(item=>item.name),['Carib Cans']);
  assert.equal(Catalog.readItems(app.store)[0].buildTo,20,'the existing build-to stands');
  assert.match(textOf(app.rSetup()),/guide is unchanged/);
});
