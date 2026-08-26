const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const Launcher=require('../smart-count-launcher.js');
const vm=require('node:vm');

function cycleStateHarness(){
  const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
  const source=html.slice(html.indexOf('function pgLocalCalendarOffset'),html.indexOf('function pgFmtAgo'));
  const context={Date};vm.createContext(context);vm.runInContext(source,context);return context.pgCycleState;
}
function localDate(year,month,day,hour,minute=0){return new Date(year,month-1,day,hour,minute,0,0);}
function deadline(at,overdue=false){return {deadline:at,fmt:{done:false,overdue}};}

function button(){
  const handlers={};return {dataset:{},type:'',addEventListener(type,fn){(handlers[type]||(handlers[type]=[])).push(fn);},fire(type){const event={type,prevented:false,preventDefault(){this.prevented=true;}};(handlers[type]||[]).forEach(fn=>fn(event));return event;}};
}
function harness(ready=true){
  let modal=false,opens=0,error='';const launcher=Launcher.create({isReady:()=>ready,findModal:()=>modal?{}:null,openModal(){modal=true;opens++;},showError(message){error=message;}});return {launcher,get modal(){return modal;},close(){modal=false;},get opens(){return opens;},get error(){return error;}};
}

test('primary PourGrid Vision button opens the modal',()=>{const h=harness(),b=button();h.launcher.bind(b,()=>({products:[],isG:true,onDone(){}}));b.fire('click');assert.equal(h.opens,1);assert.equal(h.modal,true);});

test('PourGrid Vision opens after navigating away and back with a re-rendered button',()=>{const h=harness(),first=button();h.launcher.bind(first,()=>({}));first.fire('click');h.close();const rerendered=button();h.launcher.bind(rerendered,()=>({}));rerendered.fire('click');assert.equal(h.opens,2);});

test('repeated taps do not create duplicate modals',()=>{const h=harness(),b=button();h.launcher.bind(b,()=>({}));b.fire('click');b.fire('click');assert.equal(h.opens,1);});

test('mobile touch activation opens once and suppresses its synthetic click',()=>{const h=harness(),b=button();h.launcher.bind(b,()=>({}));const touch=b.fire('touchend');b.fire('click');assert.equal(touch.prevented,true);assert.equal(h.opens,1);});

test('missing recognition module shows a safe message instead of doing nothing',()=>{const h=harness(false),b=button();h.launcher.bind(b,()=>({}));b.fire('click');assert.equal(h.opens,0);assert.match(h.error,/PourGrid Vision recognition is unavailable/i);});

test('index wires the primary button through the guarded launcher and current packaging helper',()=>{
  const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
  assert.ok(html.indexOf('bottle-intelligence.js')<html.indexOf('smart-count-launcher.js'));
  assert.ok(html.indexOf('smart-count-launcher.js')<html.indexOf('pourgrid-vision.js'));
  assert.ok(html.indexOf('pourgrid-vision.js')<html.indexOf('product-persistence.js'));
  assert.match(html,/pgSmartCountLauncher\.bind\(pbtn,args\)/);
  assert.match(html,/data-pg-smart-count-modal/);
  assert.doesNotMatch(html,/pgPackaging\s*\(/);
  assert.match(html,/cfg=pgPack\(product\)\|\|\{\}/);
});

test('category screen retains manual controls without per-product photo buttons',()=>{
  const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8'),section=html.slice(html.indexOf('function rCatCount'),html.indexOf('function pgPlural'));
  assert.match(section,/PourGrid Vision/);assert.match(section,/Manual Count/);assert.doesNotMatch(section,/photobtn-sm/);assert.match(section,/className|pg-pack-field|cinput/);
});

test('no user-facing legacy count name remains and one category action is rendered',()=>{
  const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
  const visible=html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ').replace(/<!--([\s\S]*?)-->/g,' ').replace(/<[^>]+>/g,' ');
  assert.doesNotMatch(visible,/Smart Count|AI Count|Bottle Intelligence scan/i);
  const section=html.slice(html.indexOf('function rCatCount'),html.indexOf('function pgPlural'));
  assert.equal((section.match(/rPhotoBtn\(items/g)||[]).length,1);
});

test('capture UI supports camera, library, removal, explicit processing, and review stages',()=>{
  const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8'),section=html.slice(html.indexOf('function showPhotoCountModal'),html.indexOf('// Calls the Supabase Edge Function'));
  ['Take Photo','Add from Library','Remove photo','Process Photos','Preparing photo','Analyzing photo','Comparing duplicate bottles','Grouping products','Review Results'].forEach(text=>assert.match(section,new RegExp(text)));
  assert.match(section,/process\.onclick=function/);
  assert.doesNotMatch(section,/onchange[\s\S]{0,250}countCategoryViaAI/);
});

test('Bottle Intelligence editor persists all editable configuration with verified read-back',()=>{
  const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8'),section=html.slice(html.indexOf('function pgOpenProductEditor'),html.indexOf('function s71Close'));
  ['pge-name','pge-dist','pge-cat','pge-build','pge-pack','pge-unit','pge-mode','pge-count-basis','pge-build-basis','pge-ml','pge-loose','pge-loose-label','pge-large-label','pge-inner','pge-alternate','pge-recognition','pge-note','pge-recognition-images'].forEach(id=>assert.match(section,new RegExp(id)));
  assert.match(section,/saveVerified|pgSaveCatalogEdits/);assert.match(section,/persistenceVerificationResult/);assert.match(section,/storageWriteDurationMs/);assert.match(section,/storageReadDurationMs/);assert.match(section,/Bottle Intelligence saved and verified/);assert.match(section,/Save failed/);
});

test('Lime Juice ships with the required persisted-compatible defaults',()=>{
  const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
  assert.match(html,/"Lime Juice":\{mode:"caseLoose",unitsPerCase:12,largeUnit:"Case",largeUnitLabel:"cases",looseUnit:"Bottle",unitLabel:"bottles",countBasis:"units",buildToBasis:"units"/);
  assert.match(html,/pourgrid-migration-rc1\.7\.1-lime-units-v1/);
  assert.match(html,/V1 RC1\.7\.1 STAGING/);
  assert.match(html,/cfg\.mode==="caseLoose"&&cfg\.countBasis==="units"/);
});

test('manual count clearly separates on-hand inventory from the order recommendation',()=>{
  const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
  assert.match(html,/function pgInventorySummary/);
  assert.match(html,/\+total\+" "\+pgPlural\(total,one,many\)\+" on hand"/);
  assert.match(html,/"Order "\+String\(qty\)/);
  assert.match(html,/Bottle Intelligence saved and verified/);
  const commitSection=html.slice(html.indexOf('function pgCommitProductEdit'),html.indexOf('function pgResetProductEdit'));
  assert.doesNotMatch(commitSection,/location\.reload/);
});

test('packaged-item order accepts any valid entered component and blocks invalid input',()=>{
  const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
  const presenceSection=html.slice(html.indexOf('function pgHasPhysicalCount'),html.indexOf('function pgSavePart'));
  assert.match(presenceSection,/pgPackParts\(S\.counts,p\)/);
  assert.match(presenceSection,/normalized&&normalized\.valid&&normalized\.entered/);
  assert.doesNotMatch(presenceSection,/entered\("cases"\)&&entered\("loose"\)/);
  const calculationSection=html.slice(html.indexOf('function cq'),html.indexOf('function finalOrderQty'));
  assert.match(calculationSection,/if\(!pgHasPhysicalCount\(p\)\)return null/);
  const cardSection=html.slice(html.indexOf('function rCatCount'),html.indexOf('function pgPlural'));
  assert.match(cardSection,/var has=pgHasPhysicalCount\(p\)/);
});

test('bounded home exposes Dashboard, History, Full Count, and Profit Lab without deadline boot work',()=>{
  const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8'),home=html.slice(html.indexOf('function rHome'),html.indexOf('function rStabs'));
  assert.match(home,/pgPropertyName\(\)/);assert.match(home,/rPropertySwitcher\("home"\)/);assert.match(home,/Full Count/);assert.match(home,/tab:"history"/);assert.match(home,/pgEstimatorHomeTrigger/);
  assert.doesNotMatch(home,/Sapphire Beach Bar/);
  assert.doesNotMatch(home,/pgHomeBriefing|rDeadlines|pgNextMerchantsCycle/);
});

test('document shell is complete and cannot publish as a black screen',()=>{
  const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
  assert.equal((html.match(/<style(?:\s|>)/g)||[]).length,(html.match(/<\/style>/g)||[]).length);
  assert.match(html,/<\/head>\s*<body[^>]*>/);assert.match(html,/<\/body>\s*<\/html>\s*$/);
});

test('PourGrid Vision uses compact premium workspace classes without inline modal sizing',()=>{
  const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8'),section=html.slice(html.indexOf('function showPhotoCountModal'),html.indexOf('// Calls the Supabase Edge Function'));
  ['pg-vision-overlay','pg-vision-modal','pg-vision-head','pg-vision-instruction','pg-vision-actions','pg-vision-process'].forEach(name=>assert.match(section,new RegExp(name)));
  assert.match(section,/01 · FRAME/);assert.match(section,/02 · COVER/);assert.match(section,/03 · REVIEW/);
  assert.doesNotMatch(section,/max-height:94vh/);
});

test('reliability UI never labels unfinished processing complete and gates confirmation',()=>{
  const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8'),section=html.slice(html.indexOf('function showPhotoCountModal'),html.indexOf('// Calls the Supabase Edge Function'));
  assert.doesNotMatch(section,/Vision Complete/);assert.match(section,/WORKFLOW_STATES\.REVIEW/);assert.match(section,/workflow\.canConfirm\(reviewed\)/);assert.match(section,/Photos need another look/);assert.match(section,/Retry Failed Photos/);assert.match(section,/Add More Photos/);
});

test('zero recognized products shows clearer-photo guidance instead of a zero completion',()=>{
  const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
  assert.match(html,/No products from this category were recognized\. Try adding clearer photos\./);assert.doesNotMatch(html,/Products detected: 0[\s\S]{0,80}Photos processed: 0/);
});

test('offline and mobile Safari recovery paths stay wired',()=>{
  const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
  assert.match(html,/navigator\.onLine===false\?"OFFLINE"/);assert.match(html,/cameraInput\.capture="environment"/);assert.match(html,/Retry Failed Photos/);
});

test('single-product recount remains available only inside Bottle Intelligence',()=>{
  const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
  assert.match(html,/pgVisionRecountButton">PourGrid Vision recount/);
  const section=html.slice(html.indexOf('function rCatCount'),html.indexOf('function pgPlural'));
  assert.doesNotMatch(section,/pgOpenProductVision/);
});

test('Bottle Intelligence remains wired for both Bar and Merchants product cards',()=>{
  const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8'),section=html.slice(html.indexOf('function rCatCount'),html.indexOf('function pgPlural'));
  assert.match(section,/var top=d\("itop"\);top\.onclick=/);assert.doesNotMatch(section,/if\(!isG\).*top\.onclick/);assert.match(section,/Bottle Intelligence/);
});

test('Bar and Merchants render separate workspaces while each keeps its shared draft views',()=>{
  const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
  assert.match(html,/countFilter:"all",merchantView:"Mixer",countCat:null,counts:lsGet\("sbb-counts"\)/);
  const filters=html.slice(html.indexOf('function pgCountTypeForProduct'),html.indexOf('function rHome'));
  assert.match(filters,/filter==="all"\?BAR:BAR\.filter/);
  assert.match(filters,/pgHasPhysicalCount\(p\)/);
  const bar=html.slice(html.indexOf('function rBarCountWorkspace'),html.indexOf('function rMerchantsCountWorkspace'));
  assert.match(bar,/var filterKeys=pgBarFilterKeys\(\)/);assert.match(bar,/filterKeys\.forEach/);
  assert.doesNotMatch(bar,/Merchants|Mixer|Fruit/);
  // Sapphire's own vendor list still resolves to the original three bar views.
  const Catalog=require('../property-catalog.js');
  assert.deepEqual(['all'].concat(Catalog.barVendorNames(Catalog.seedVendorsFor({seedCatalog:'sapphire-v12'}))),['all','Bellows/WI','CC1']);
  const merchants=html.slice(html.indexOf('function rMerchantsCountWorkspace'),html.indexOf('function rCatGrid'));
  assert.match(merchants,/\["Mixer","Fruit"\]/);assert.doesNotMatch(merchants,/Bellows\/WI|CC1|Full Count/);
  const routing=html.slice(html.indexOf('function rContent'),html.indexOf('function rTabs2'));
  assert.match(routing,/rBarCountWorkspace\(\)/);assert.match(routing,/rMerchantsCountWorkspace\(\)/);
  assert.match(routing,/pgStartSession\("bar"\)/);assert.match(routing,/pgStartSession\("merchants"\)/);
});

test('home vendor orders enter filtered count while Dashboard retains Full Count',()=>{
  const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
  const home=html.slice(html.indexOf('function rHome'),html.indexOf('function rStabs'));
  assert.match(home,/pg-full-count-launcher/);assert.match(home,/pgOpenFullCount/);
  const upcoming=html.slice(html.indexOf('function pgOpenUpcomingCycle'),html.indexOf('function pgCycleActionLabel'));
  assert.match(upcoming,/merchantView:"Mixer"/);assert.match(upcoming,/countFilter:filter,countCat:null/);assert.match(upcoming,/mSub:"count"/);assert.match(upcoming,/bSub:"count"/);
  assert.doesNotMatch(upcoming,/complete\?"order":"count"/);
});

test('shared count preserves vendor assignment and previous-order Home navigation',()=>{
  const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
  const category=html.slice(html.indexOf('function rCatCount'),html.indexOf('function pgPlural'));
  assert.match(category,/pgTouch\(pgCountTypeForProduct\(product\),pn\)/);
  const history=html.slice(html.indexOf('function rHistDet'),html.indexOf('function rContent'));
  assert.match(history,/← History/);assert.match(history,/"Home"/);assert.match(history,/screen:"home"/);
  const order=html.slice(html.indexOf('function rOrderTab'),html.indexOf('function rEmailTab'));
  assert.match(order,/p\.dist===dist/);
});

test('Dashboard navigation centrally maps every count destination without replacing draft data',()=>{
  const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
  const routes=html.slice(html.indexOf('function pgRouteSnapshot'),html.indexOf('var pgSheetGestures'));
  assert.match(routes,/destination==="bar"\|\|destination==="full"/);assert.match(routes,/countFilter:"all"/);
  assert.match(routes,/destination==="merchants"/);assert.match(routes,/merchantView:"Mixer"/);
  assert.match(routes,/destination==="fruit"/);assert.match(routes,/merchantView:"Fruit"/);
  assert.match(routes,/destination\.indexOf\("vendor:"\)===0/);assert.match(routes,/pgHasVendor\(vendor\)/);assert.match(routes,/countFilter:vendor/);
  assert.match(routes,/pgOpenBarView\(filter\)\{pgApplyRoute\(filter&&filter!=="all"\?"vendor:"\+filter:"full"\)/);
  assert.doesNotMatch(routes,/"Bellows\/WI"|"CC1"/);
  assert.match(routes,/function pgSafeRouteState/);assert.match(routes,/next\.tab==="merchants"/);
  assert.doesNotMatch(routes,/counts\s*:/);assert.doesNotMatch(routes,/adjustments\s*:/);assert.doesNotMatch(routes,/pgStartSession/);
  const nav=html.slice(html.indexOf('function rNav'),html.indexOf('function rSplash'));
  assert.match(nav,/pgApplyRoute\(tid\)/);
});

test('active shared-count screens expose a compact draft-preserving Home route',()=>{
  const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
  const workspace=html.slice(html.indexOf('function rBarCountWorkspace'),html.indexOf('function rCatGrid'));
  assert.match(workspace,/pg-count-home/);assert.match(workspace,/pgApplyRoute\("home"\)/);
  assert.doesNotMatch(workspace,/counts\s*:/);assert.doesNotMatch(workspace,/adjustments\s*:/);
});

test('packaged quantities accept either field, normalize blanks, and reject unsafe values',()=>{
  const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
  const source=html.slice(html.indexOf('function pgWholeQuantity'),html.indexOf('function pgPackParts'));
  const vm=require('node:vm'),context={};vm.runInNewContext(source+';this.parse=pgQuantityPair;',context);
  assert.deepEqual({...context.parse('2','',{unitsPerCase:12})},{valid:true,entered:true,cases:2,loose:0,total:24,message:''});
  assert.equal(context.parse('','5',{unitsPerCase:12}).total,5);
  assert.equal(context.parse('1','4',{unitsPerCase:12}).total,16);
  assert.equal(context.parse('0','5',{unitsPerCase:12}).valid,true);
  assert.equal(context.parse('2','0',{unitsPerCase:12}).valid,true);
  assert.equal(context.parse('','',{unitsPerCase:12}).entered,false);
  assert.equal(context.parse('0','0',{unitsPerCase:12}).total,0);
  ['-1','1.5','nope','NaN','Infinity'].forEach(v=>assert.equal(context.parse(v,'',{unitsPerCase:12}).valid,false));
  assert.equal(context.parse('2','',{unitsPerCase:12,allowLoose:false}).valid,true);
  assert.equal(context.parse('2','1',{unitsPerCase:12,allowLoose:false}).valid,false);
  assert.equal(context.parse('','4',{unitsPerCase:12,allowCases:false}).valid,true);
  const field=html.slice(html.indexOf('function pgField'),html.indexOf('grid.appendChild(pgField'));
  assert.match(field,/inputMode:"numeric"/);assert.match(field,/min:"0"/);assert.match(field,/step:"1"/);
});

test('one reusable sheet gesture enforces direction, distance, velocity, scroll, and listener cleanup',()=>{
  const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
  const gesture=html.slice(html.indexOf('var pgSheetGestures'),html.indexOf('// DOM helpers'));
  assert.match(gesture,/options\.direction==="up"\?-1:1/);assert.match(gesture,/distance>=72\|\|velocity>=\.55/);
  assert.match(gesture,/Math\.abs\(dx\)>Math\.abs\(dy\)\*1\.15/);assert.match(gesture,/scroll\.scrollTop<=0/);
  assert.match(gesture,/previous\)previous\.destroy\(\)/);assert.match(gesture,/removeEventListener\("pointerdown"/);
  assert.match(gesture,/restoreFocus\.focus/);assert.match(gesture,/pointercancel/);
});

test('handled sheets use the reusable safe dismissal controller',()=>{
  const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
  assert.match(html,/sheet:overlay\.querySelector\("\.s71-sheet"\)[\s\S]*onDismiss:s71Close/);
  assert.match(html,/sheet:panel[\s\S]*onDismiss:s4CloseSheet[\s\S]*canDismiss:/);
  assert.match(html,/sheet:modal,handle:visionHandle,direction:"down"[\s\S]*canDismiss:function\(\)\{var safe=/);
});

test('Vision has a reliable top-handle target, safe swipe close, and deterministic listener cleanup',()=>{
  const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
  assert.match(html,/\.pg-sheet-handle\{[^}]*width:100%[^}]*height:32px[^}]*touch-action:none/);
  assert.match(html,/\.pg-sheet-handle:before\{[^}]*width:42px[^}]*height:5px/);
  const vision=html.slice(html.indexOf('function showPhotoCountModal'),html.indexOf('// Calls the Supabase Edge Function'));
  assert.match(vision,/visionGesture=pgAttachSheetGesture\(\{sheet:modal,handle:visionHandle,direction:"down"/);
  assert.match(vision,/if\(visionGesture\)\{visionGesture\.destroy\(\);visionGesture=null;\}/);
  assert.match(vision,/safe=!processing&&!session\.photos\(\)\.length&&!successfulPhotoIds\.length&&!accumulatedResults\.length&&!reviewed\.length/);
  assert.match(vision,/Use Cancel to close without saving/);
  assert.match(vision,/overlay\.onclick=function\(\)\{\}/);
  assert.match(vision,/cancel\.onclick=function\(\)\{if\(processing\)return;cleanup\(\);onDone\(null\);\}/);
  assert.doesNotMatch(vision,/pg-vision-close|aria-label="Close"/);
});

test('failed-photo sheet is compact, non-repetitive, and preserves successful work',()=>{
  const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
  const failed=html.slice(html.indexOf('function showFailures'),html.indexOf('async function processPhotos'));
  assert.match(failed,/pg-vision-failures/);assert.match(failed,/Retry Failed Photos/);assert.match(failed,/Add More Photos/);assert.match(failed,/Successful photos and results are preserved/);
  assert.equal((failed.match(/couldn't analyze/g)||[]).length,1);assert.match(failed,/session\.failed\(failedPhotoIds\)/);
  assert.match(html,/\.pg-vision-failure-actions\{display:grid;grid-template-columns:1fr/);
  assert.match(html,/\.pg-vision-failure-actions button\{width:100%/);
});

test('manual adjustment parser supports cases, bottles, conversion, direction, and safe validation',()=>{
  const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8'),vm=require('node:vm'),context={};
  const quantities=html.slice(html.indexOf('function pgWholeQuantity'),html.indexOf('function pgPackParts'));
  const adjustments=html.slice(html.indexOf('function pgAdjustmentCapability'),html.indexOf('function pgSetManualAdjustment'));
  context.pgPack=()=>null;context.pgIsMerchantProduct=product=>product&&product.dist==='Merchants';vm.runInNewContext(quantities+adjustments+';this.adjust=pgManualAdjustment;',context);
  const casesOnly=context.adjust({dist:'Merchants',unit:'Case',pack:12},'2','','add');assert.equal(casesOnly.valid,true);assert.equal(casesOnly.orderUnits,2);assert.equal(casesOnly.cases,2);assert.equal(casesOnly.loose,0);assert.equal(casesOnly.capability.allowLoose,false);
  assert.equal(context.adjust({dist:'Merchants',unit:'Case',pack:12},'2','1','add').valid,false);
  assert.equal(context.adjust({dist:'Merchants',unit:'Bottle',pack:12},'','','add').valid,false);
  assert.equal(context.adjust({dist:'Merchants',unit:'Bottle',pack:12},'0','5','add').orderUnits,5);
  assert.equal(context.adjust({dist:'Merchants',unit:'Bottle',pack:12},'1','4','add').orderUnits,16);
  assert.equal(context.adjust({dist:'Merchants',unit:'Bottle',pack:12},'1','4','reduce').orderUnits,-16);
  ['-1','1.5','nope','NaN','Infinity'].forEach(value=>assert.equal(context.adjust({dist:'Merchants',unit:'Bottle',pack:12},value,'','add').valid,false));
  const zero=context.adjust({dist:'Merchants',unit:'Bottle',pack:12},'0','0','add');assert.equal(zero.valid,true);assert.equal(zero.zero,true);assert.equal(zero.orderUnits,0);
});

test('every injected search has explicit execute and reset controls',()=>{
  const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8'),search=html.slice(html.indexOf('function s4AttachSearch'),html.indexOf('</script><div id="s5Offline"'));
  assert.match(search,/role','search/);assert.match(search,/type="submit">Search/);assert.match(search,/type="reset">Reset/);assert.match(search,/addEventListener\('submit'/);assert.match(search,/addEventListener\('reset'/);
});

test('cycle labels use the device calendar day while urgency uses remaining time',()=>{
  const state=cycleStateHarness(),bellows=localDate(2026,8,8,15);
  assert.deepEqual({...state(deadline(bellows),localDate(2026,8,7,14))},{key:'watch',label:'Due tomorrow',tone:'watch'});
  assert.deepEqual({...state(deadline(bellows),localDate(2026,8,7,16))},{key:'soon',label:'Due tomorrow',tone:'soon'});
  assert.deepEqual({...state(deadline(bellows),localDate(2026,8,8,8))},{key:'soon',label:'Due today',tone:'soon'});
  assert.deepEqual({...state(deadline(bellows),localDate(2026,8,8,10))},{key:'urgent',label:'Due very soon',tone:'urgent'});
  assert.deepEqual({...state(deadline(bellows,true),localDate(2026,8,8,16))},{key:'urgent',label:'Overdue',tone:'urgent'});
});

test('cycle labels remain correct across week rollover and every vendor deadline',()=>{
  const state=cycleStateHarness();
  assert.equal(state(deadline(localDate(2026,8,15,15)),localDate(2026,8,8,16)).label,'Plenty of time');
  assert.equal(state(deadline(localDate(2026,8,9,23,59)),localDate(2026,8,8,23)).label,'Due tomorrow','CC1 Sunday deadline');
  assert.equal(state(deadline(localDate(2026,8,12,20)),localDate(2026,8,11,21)).label,'Due tomorrow','Merchants Wednesday deadline');
  assert.equal(state(deadline(localDate(2026,8,9,20)),localDate(2026,8,8,21)).label,'Due tomorrow','Merchants Sunday deadline');
});

test('Bar workflow permits cases and loose units except explicitly case-only products while Merchants retains configured rules',()=>{
  const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8'),vm=require('node:vm');
  const quantities=html.slice(html.indexOf('function pgWholeQuantity'),html.indexOf('function pgPackParts'));
  const purchasing=html.slice(html.indexOf('function pgAdjustmentCapability'),html.indexOf('function pgSetManualAdjustment'));
  const context={pgPack:()=>null,pgIsMerchantProduct:product=>product&&product.dist==='Merchants',pgPlural:(n,one,many)=>Number(n)===1?one:many};
  vm.runInNewContext(quantities+purchasing+';this.adjust=pgManualAdjustment;this.capability=pgAdjustmentCapability;this.breakdown=pgFinalPurchaseBreakdown;this.manualText=pgManualPurchaseText;this.finalText=pgFinalPurchaseText;',context);
  const stoli={name:'Stoli Raz',dist:'Bellows/WI',cat:'Vodka',pack:12,unit:'Case',bottleMl:1000,buildTo:12};
  const deep={name:'Deep Eddy Grapefruit',dist:'Bellows/WI',cat:'Vodka',pack:12,unit:'Case',bottleMl:1000,buildTo:6};
  const tito={name:"Tito's Handmade Vodka",dist:'CC1',cat:'Vodka',pack:12,unit:'Case',bottleMl:1000};
  [stoli,deep,tito].forEach(product=>{assert.equal(context.capability(product).rule,'barCaseAndLoose');assert.equal(context.capability(product).allowCases,true);assert.equal(context.capability(product).allowLoose,true);});
  const twoCases=context.adjust(stoli,'2','','add');assert.equal(twoCases.orderUnits,2);assert.equal(twoCases.cases,2);assert.equal(twoCases.loose,0);
  const bottles=context.adjust(stoli,'0','3','add');assert.equal(bottles.orderUnits,.25);assert.equal(context.manualText(stoli,{cases:0,loose:3,direction:'add'},.25),'+3 Bottles');
  const combined=context.adjust(stoli,'1','2','add');assert.equal(combined.orderUnits,14/12);assert.equal(context.manualText(stoli,{cases:1,loose:2,direction:'add'},14/12),'+1 Case + 2 Bottles');
  assert.equal(context.adjust(stoli,'','','add').valid,false);
  const enteredZero=context.adjust(stoli,'0','0','add');assert.equal(enteredZero.valid,true);assert.equal(enteredZero.zero,true);assert.equal(enteredZero.orderUnits,0);
  const finalBottles=context.breakdown(stoli,0,{cases:0,loose:3,direction:'add'});assert.deepEqual({...finalBottles},{cases:0,loose:3,totalBottles:3,unitsPerCase:12,rule:'barCaseAndLoose'});assert.equal(context.finalText(stoli,.25,finalBottles),'3 Bottles');
  const finalCombined=context.breakdown(stoli,0,{cases:1,loose:2,direction:'add'});assert.equal(context.finalText(stoli,14/12,finalCombined),'1 Case + 2 Bottles');
  const reduced=context.adjust(stoli,'0','1','reduce');assert.ok(0+reduced.orderUnits<0);assert.equal(1+reduced.orderUnits,11/12);
  ['-1','1.5','nope','NaN','Infinity'].forEach(value=>{assert.equal(context.adjust(stoli,value,'','add').valid,false);assert.equal(context.adjust(stoli,'',value,'add').valid,false);});
  const future={name:'Future Bar Product',dist:'New Bar Vendor',unit:'Case',pack:6};assert.equal(context.adjust(future,'1','2','add').orderUnits,8/6);assert.equal(context.capability(future).rule,'barCaseAndLoose');
  const missing={name:'Future Missing Pack',dist:'New Bar Vendor',unit:'Case',pack:null};assert.equal(context.capability(missing).allowCases,false);assert.equal(context.capability(missing).allowLoose,true);assert.equal(context.capability(missing).missingCaseConfig,true);assert.equal(context.adjust(missing,'1','0','add').valid,false);assert.equal(context.adjust(missing,'0','3','add').orderUnits,3);
  const lime={name:'Lime Juice',dist:'Merchants',unit:'Case',pack:12};assert.equal(context.adjust(lime,'0','3','add').valid,false);assert.equal(context.capability(lime).rule,'caseOnly');
  const merchantBottle={name:'Configured Merchant Bottle',dist:'Merchants',unit:'Bottle',pack:12,purchaseRule:'bottleOnly'};assert.equal(context.capability(merchantBottle).allowCases,false);assert.equal(context.adjust(merchantBottle,'1','0','add').valid,false);
  const catalog=JSON.parse(html.match(/var PG_V12_PRODUCTS=(\[.*?\]);\r?\n\/\//s)[1]),bar=catalog.filter(product=>product.dist!=='Merchants');assert.ok(bar.length>0);assert.equal(bar.filter(product=>!Number.isInteger(Number(product.pack))||Number(product.pack)<=0).length,0);bar.forEach(product=>{const capability=context.capability(product);assert.equal(capability.rule,product.purchaseRule==='caseOnly'?'caseOnly':'barCaseAndLoose',product.name);assert.equal(capability.allowCases,true,product.name);assert.equal(capability.allowLoose,product.purchaseRule!=='caseOnly',product.name);});
  assert.doesNotMatch(html,/PG_PURCHASE_RULES/);
  assert.match(html,/"Deep Eddy Grapefruit"[\s\S]*?"pack":12[\s\S]*?"unit":"Case"[\s\S]*?"bottleMl":1000/);
  assert.match(html,/"Stoli Raz"[\s\S]*?"pack":12[\s\S]*?"unit":"Case"[\s\S]*?"bottleMl":1000/);
});

test('Stoli Raz exact units persist in the Bar draft and remain in Bellows submission and History paths',()=>{
  const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8'),vm=require('node:vm'),stored={};
  const stoli={name:'Stoli Raz',dist:'Bellows/WI',cat:'Vodka',pack:12,unit:'Case',bottleMl:1000,buildTo:12};
  const context={BAR:[stoli],MER:[],S:{adjustments:{'Stoli Raz':14/12},adjustmentMeta:{'Stoli Raz':{cases:1,loose:2,direction:'add',orderUnits:14/12}},notes:{bar:'',mer:''}},lsGet:key=>stored[key],lsSet:(key,value)=>{stored[key]=JSON.parse(JSON.stringify(value));},Date,Math,Object};
  const persistence=html.slice(html.indexOf('var PG_DRAFT_KEY'),html.indexOf('var PG_BOOT_DRAFTS'));
  vm.runInNewContext(persistence+';this.persist=pgPersistDraft;this.hydrate=pgHydrateDrafts;',context);context.persist('bar');
  let hydrated=context.hydrate();assert.equal(hydrated.adjustments['Stoli Raz'],14/12);assert.equal(hydrated.adjustmentMeta['Stoli Raz'].cases,1);assert.equal(hydrated.adjustmentMeta['Stoli Raz'].loose,2);
  context.S.adjustments['Stoli Raz']=.25;context.S.adjustmentMeta['Stoli Raz']={cases:0,loose:3,direction:'add',orderUnits:.25};context.persist('bar');hydrated=context.hydrate();assert.equal(hydrated.adjustmentMeta['Stoli Raz'].cases,0);assert.equal(hydrated.adjustmentMeta['Stoli Raz'].loose,3);
  const order=html.slice(html.indexOf('function rOrderTab'),html.indexOf('function calcSuggestedBuildTos'));assert.match(order,/manualAdjustmentDetails:manual/);assert.match(order,/finalPurchaseBreakdown:pgFinalPurchaseBreakdown\(p,base,manual\)/);assert.match(order,/pgOrderLine\(p,p\.adjQty\)/);assert.match(order,/pgBellowsWiEmailGroup\(p,WI_PRODS2\)/);
  assert.doesNotMatch(order,/orderExplanation\([^;]*,p\.adj\)/);assert.match(order,/adjTag\.textContent=pgManualPurchaseText/);
  const history=html.slice(html.indexOf('function rHistDet'),html.indexOf('function rEmpty'));assert.match(history,/pgManualPurchaseText/);assert.match(history,/pgFinalPurchaseText/);assert.match(order,/calculatedOrderQty:base===null\?0:base/);assert.match(order,/manualAdjustment:adj/);assert.match(order,/finalOrderQty:final/);
  const setter=html.slice(html.indexOf('function pgSetManualAdjustment'),html.indexOf('function pgDraftHasMeaningfulWork'));assert.doesNotMatch(setter,/S\.counts\s*=|buildTo\s*=|pgSaveCatalogEdits/);
});

test('unbranded Bellows/WI liquor is shown once in a shared section above both rep sections',()=>{
  const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8'),vm=require('node:vm'),Pipeline=require('../order-pipeline.js'),context={PourGridOrderPipeline:Pipeline};
  const helpers=html.slice(html.indexOf('var PG_BELLOWS_WI_SHARED_ITEMS'),html.indexOf('function rEmailPanel'));
  vm.runInNewContext(helpers+';this.group=pgBellowsWiEmailGroup;this.sections=pgAppendBellowsWiSections;',context);
  ['Peach Schnapps','Amaretto','Irish Cream','Creme de Cacao','Triple Sec','Blue Curacao'].forEach(name=>assert.equal(context.group({name,emailRoute:'shared'},[]),'shared',name));
  assert.equal(context.group({name:'Future generic cordial',emailRoute:'shared'},[]),'shared');
  assert.equal(context.group({name:'Stoli Vodka',emailRoute:'westIndies'},['Stoli Vodka']),'westIndies');
  assert.equal(context.group({name:'Bellows brand',dist:'Bellows/WI'},[]),'bellows');
  const body=context.sections('INTRO\n',['1 case - Peach Schnapps'],['2 cases - Bellows Brand'],['3 cases - Stoli Vodka']);
  assert.ok(body.indexOf('-- SHARED / BRAND NOT SPECIFIED --')<body.indexOf('-- BELLOWS --'));
  assert.ok(body.indexOf('-- BELLOWS --')<body.indexOf('-- WEST INDIES --'));
  assert.equal((body.match(/Peach Schnapps/g)||[]).length,1);
  const legacy=html.slice(html.indexOf('function rEmailPanel'),html.indexOf('function rTabs'));
  const current=html.slice(html.indexOf('function rOrderTab'),html.indexOf('function calcSuggestedBuildTos'));
  assert.match(legacy,/pgAppendBellowsWiSections\(body,sharedLines,bellowsLines,wiLines\)/);
  assert.match(current,/pgAppendBellowsWiSections\(body,sharedLines,bLines,wLines\)/);
});

test('manual adjustments persist per workflow without mutating inventory or build-to',()=>{
  const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
  const persistence=html.slice(html.indexOf('var PG_DRAFT_KEY'),html.indexOf('function pgMigrateMerchantPackaging'));
  assert.match(persistence,/pourgrid-order-drafts-v2/);assert.match(persistence,/record\.adjustments=adjustments/);assert.match(persistence,/record\.adjustmentMeta=meta/);assert.match(persistence,/record\.note=S\.notes/);
  assert.match(persistence,/pgHydrateDrafts/);assert.match(persistence,/adjustmentMeta:PG_BOOT_DRAFTS\.adjustmentMeta/);
  const set=html.slice(html.indexOf('function pgSetManualAdjustment'),html.indexOf('function pgDraftWorkState'));
  assert.match(set,/pgStartSession\(type\)/);assert.match(set,/pgPersistDraft\(type\)/);assert.match(set,/reason:reason\|\|""/);assert.match(set,/note:note\|\|""/);
  assert.doesNotMatch(set,/counts\[|buildTo\s*=|pgSaveCatalogEdits/);
});

test('manual additions with zero calculated demand reach vendor output and submitted History',()=>{
  const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
  const vm=require('node:vm'),context={S:{adjustments:{'Deep Eddy Grapefruit':2},adjustmentMeta:{}},cq:()=>null,pgEffectiveCount:()=>'',pgFinalPurchaseBreakdown:()=>null,Object};
  const lifecycle=html.slice(html.indexOf('function pgOrderItem'),html.indexOf('var PG_DRAFT_KEY'));
  vm.runInNewContext(lifecycle+';this.build=pgOrderItem;this.visible=pgOrderItemVisible;',context);
  const grapefruit={name:'Deep Eddy Grapefruit',dist:'Bellows/WI',cat:'Vodka',pack:12,unit:'Case',buildTo:6};
  const line=context.build(grapefruit);
  assert.equal(line.orderQty,null);assert.equal(line.adj,2);assert.equal(line.adjQty,2);assert.equal(context.visible(line),true);
  context.S.adjustments={'Any Adjusted Product':3};
  const generic=context.build({name:'Any Adjusted Product',dist:'CC1',cat:'Other',pack:1,unit:'Case',buildTo:0});
  assert.equal(generic.adjQty,3);assert.equal(context.visible(generic),true);
  const order=html.slice(html.indexOf('function rOrderTab'),html.indexOf('function calcSuggestedBuildTos'));
  assert.match(order,/prods\.map\(pgOrderItem\)\.filter\(pgOrderItemVisible\)/);assert.match(order,/Add missing product/);assert.match(order,/pgOpenAdjustmentPicker/);
  assert.match(order,/calculatedOrderQty:base===null\?0:base/);assert.match(order,/manualAdjustment:adj/);assert.match(order,/manualAdjustmentDetails:manual/);assert.match(order,/finalOrderQty:final/);
  assert.match(order,/items\.filter\(function\(p\)\{return p\.dist===dist&&p\.adjQty>0;/);
  assert.match(order,/Saved manual adjustments/);assert.match(order,/Assigned vendor:/);assert.match(order,/Use the vendor tabs above to review them/);
  const history=html.slice(html.indexOf('function rHistDet'),html.indexOf('function rEmpty'));
  assert.match(history,/Manual addition/);assert.match(history,/Calculated .*Manual .*Final/);
});

test('Deep Eddy Grapefruit adjustment persists under the active Bar draft and remains observable until removed or submitted',()=>{
  const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8'),vm=require('node:vm');
  const stored={},deep={name:'Deep Eddy Grapefruit',dist:'Bellows/WI',cat:'Vodka',pack:12,unit:'Case',buildTo:6};
  const context={BAR:[deep],MER:[],S:{adjustments:{deep:99,'Deep Eddy Grapefruit':2},adjustmentMeta:{'Deep Eddy Grapefruit':{cases:2,loose:0,direction:'add',orderUnits:2}},notes:{bar:'',mer:''}},lsGet:key=>stored[key],lsSet:(key,value)=>{stored[key]=JSON.parse(JSON.stringify(value));},Date,Math,Object};
  const persistence=html.slice(html.indexOf('var PG_DRAFT_KEY'),html.indexOf('var PG_BOOT_DRAFTS'));
  vm.runInNewContext(persistence+';this.persist=pgPersistDraft;this.hydrate=pgHydrateDrafts;this.record=pgDraftRecord;',context);
  const record=context.persist('bar');
  assert.match(record.id,/^bar-/);assert.equal(record.adjustments['Deep Eddy Grapefruit'],2);assert.equal(record.adjustments.deep,undefined);
  const hydrated=context.hydrate();assert.equal(hydrated.adjustments['Deep Eddy Grapefruit'],2);assert.equal(hydrated.adjustmentMeta['Deep Eddy Grapefruit'].cases,2);
  const setter=html.slice(html.indexOf('function pgSetManualAdjustment'),html.indexOf('function pgDraftHasMeaningfulWork'));
  assert.match(setter,/product\.name/);assert.match(setter,/pgPersistDraft\(type\)/);assert.match(setter,/product:product\.name/);assert.match(setter,/vendor:product\.dist/);assert.match(setter,/final:finalOrderQty\(product\)/);
  assert.match(html,/Saved order adjustment/);assert.match(html,/Review on Order & Send/);assert.match(html,/saved · Final/);
  const routes=html.slice(html.indexOf('function pgRouteSnapshot'),html.indexOf('var pgSheetGestures'));
  assert.doesNotMatch(routes,/adjustments\s*:/);assert.doesNotMatch(routes,/adjustmentMeta\s*:/);
  const remove=html.slice(html.indexOf('function pgRemoveManualAdjustment'),html.indexOf('function pgDraftHasMeaningfulWork'));
  assert.match(remove,/delete adjustments\[product\.name\]/);assert.match(remove,/delete meta\[product\.name\]/);assert.match(remove,/pgPersistDraft\(type\)/);
  assert.match(remove,/function pgStepManualAdjustment/);assert.match(remove,/pgStartSession\(type\)/);
  const submission=html.slice(html.indexOf('var saveBtn=mk'),html.indexOf('function calcSuggestedBuildTos'));
  assert.match(submission,/calculatedOrderQty:base===null\?0:base/);assert.match(submission,/manualAdjustment:adj/);assert.match(submission,/finalOrderQty:final/);
  assert.match(submission,/draftIdentity=activeSession\.id\|\|\(pgDraftRecord\(activeType,true\)\|\|\{\}\)\.id\|\|null/);assert.match(submission,/draftId:draftIdentity/);
  assert.doesNotMatch(setter,/S\.counts\s*=|buildTo\s*=|pgSaveCatalogEdits/);
});

test('Deep Eddy case and bottle components edit, persist, route to Bellows, submit, render in History, and remove cleanly',()=>{
  const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8'),vm=require('node:vm');
  const stored={},deep={name:'Deep Eddy Grapefruit',dist:'Bellows/WI',cat:'Vodka',pack:12,unit:'Case',bottleMl:1000,buildTo:6};
  const context={BAR:[deep],MER:[],S:{adjustments:{'Deep Eddy Grapefruit':14/12},adjustmentMeta:{'Deep Eddy Grapefruit':{cases:1,loose:2,direction:'add',orderUnits:14/12}},notes:{bar:'',mer:''}},lsGet:key=>stored[key],lsSet:(key,value)=>{stored[key]=JSON.parse(JSON.stringify(value));},Date,Math,Object};
  const persistence=html.slice(html.indexOf('var PG_DRAFT_KEY'),html.indexOf('var PG_BOOT_DRAFTS'));
  vm.runInNewContext(persistence+';this.persist=pgPersistDraft;this.hydrate=pgHydrateDrafts;',context);
  context.persist('bar');let hydrated=context.hydrate();assert.equal(hydrated.adjustments['Deep Eddy Grapefruit'],14/12);assert.equal(hydrated.adjustmentMeta['Deep Eddy Grapefruit'].cases,1);assert.equal(hydrated.adjustmentMeta['Deep Eddy Grapefruit'].loose,2);
  context.S.adjustments['Deep Eddy Grapefruit']=.25;context.S.adjustmentMeta['Deep Eddy Grapefruit']={cases:0,loose:3,direction:'add',orderUnits:.25};context.persist('bar');hydrated=context.hydrate();assert.equal(hydrated.adjustmentMeta['Deep Eddy Grapefruit'].cases,0);assert.equal(hydrated.adjustmentMeta['Deep Eddy Grapefruit'].loose,3);
  context.S.adjustments['Deep Eddy Grapefruit']=2;context.S.adjustmentMeta['Deep Eddy Grapefruit']={cases:2,loose:0,direction:'add',orderUnits:2};context.persist('bar');hydrated=context.hydrate();assert.equal(hydrated.adjustmentMeta['Deep Eddy Grapefruit'].cases,2);assert.equal(hydrated.adjustmentMeta['Deep Eddy Grapefruit'].loose,0);
  const order=html.slice(html.indexOf('function rOrderTab'),html.indexOf('function calcSuggestedBuildTos'));
  assert.match(order,/pgOrderLine\(p,p\.adjQty\)/);assert.match(order,/finalPurchaseBreakdown:pgFinalPurchaseBreakdown\(p,base,manual\)/);assert.match(order,/pgManualPurchaseText/);assert.match(order,/pgFinalPurchaseText/);
  assert.match(order,/pgBellowsWiEmailGroup\(p,WI_PRODS2\)/);assert.doesNotMatch(order,/WI_PRODS2=\[[^\]]*Deep Eddy Grapefruit/);
  const sheet=html.slice(html.indexOf('function pgOpenManualAdjustment'),html.indexOf('function pgOpenAdjustmentPicker'));assert.match(sheet,/base\+result\.orderUnits<0/);assert.match(sheet,/The final order cannot be negative/);
  const formatter=html.slice(html.indexOf('function pgPlural'),html.indexOf('function pgStoliFlavor'));
  const formatContext={pgFinalPurchaseText:(p,q,b)=>b.loose&&!b.cases?b.loose+' individual bottles':b.cases+' case'+(b.cases===1?'':'s')+(b.loose?' + '+b.loose+' individual bottles':''),pgPlural:(n,o,m)=>Number(n)===1?o:m};
  vm.runInNewContext(formatter+';this.line=pgOrderLine;',formatContext);
  assert.equal(formatContext.line(Object.assign({},deep,{finalPurchaseBreakdown:{cases:0,loose:3}}),.25),'3 individual bottles - Deep Eddy Grapefruit');
  assert.equal(formatContext.line(Object.assign({},deep,{finalPurchaseBreakdown:{cases:1,loose:2}}),14/12),'1 case + 2 individual bottles - Deep Eddy Grapefruit');
  const history=html.slice(html.indexOf('function rHistDet'),html.indexOf('function rEmpty'));assert.match(history,/pgManualPurchaseText/);assert.match(history,/pgFinalPurchaseText/);
  const remove=html.slice(html.indexOf('function pgRemoveManualAdjustment'),html.indexOf('function pgDraftHasMeaningfulWork'));assert.match(remove,/delete adjustments\[product\.name\]/);assert.match(remove,/delete meta\[product\.name\]/);assert.match(remove,/pgPersistDraft\(type\)/);
  const routes=html.slice(html.indexOf('function pgRouteSnapshot'),html.indexOf('var pgSheetGestures'));assert.doesNotMatch(routes,/adjustments\s*:/);assert.doesNotMatch(routes,/adjustmentMeta\s*:/);
  const setter=html.slice(html.indexOf('function pgSetManualAdjustment'),html.indexOf('function pgDraftHasMeaningfulWork'));assert.doesNotMatch(setter,/S\.counts\s*=|buildTo\s*=|pgSaveCatalogEdits/);
});

test('Bar and Merchants share the canonical compact contextual immediate Clear interaction',()=>{
  const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
  const clear=html.slice(html.indexOf('function pgDraftHasMeaningfulWork'),html.indexOf('function pgOpenManualAdjustment'));
  assert.match(clear,/function pgClearActiveOrder/);assert.match(clear,/function pgCountClearContext/);assert.match(clear,/btn\("clrbtn","Clear"/);assert.match(clear,/pgClearActiveOrder\(type\)/);assert.match(clear,/clear\.disabled=!hasWork/);
  assert.doesNotMatch(clear,/pgOpenClearOrder|Clear Merchants Order\?|Clear Bar Order\?|pg-clear-order-actions|pgClearOrderConfirm|s4Sheet|s4CloseSheet|s5ShowSuccess|toast\(/);
  assert.match(clear,/pgPruneWorkflowDraftState\(type,S,products\)/);assert.match(clear,/delete drafts\[type\]/);assert.match(clear,/delete sessions\[type\]/);
  assert.match(clear,/merchantView="Mixer"/);assert.match(clear,/pushCounts\(S\.counts\)/);assert.match(clear,/sbb-counts-cleared/);
  assert.doesNotMatch(clear,/S\.history|saveDB|delDB|buildTo|pgSaveCatalogEdits|pourgrid-scan-history/);
  const workspaces=html.slice(html.indexOf('function rBarCountWorkspace'),html.indexOf('function rCatGrid')),grid=html.slice(html.indexOf('function rCatGrid'),html.indexOf('function pgRenderNextAction')),category=html.slice(html.indexOf('function rCatCount'),html.indexOf('function pgPlural'));
  assert.doesNotMatch(workspaces,/pg-clear-order|pgClearOrderControls/);assert.match(grid,/pgCountClearContext\("bar",prods\)/);assert.match(category,/if\(unified==="merchants"\)pad\.appendChild\(pgCountClearContext\("merchants",prods\)\)/);
  const order=html.slice(html.indexOf('function rOrderTab'),html.indexOf('function calcSuggestedBuildTos'));assert.match(order,/activeType=isG\?"merchants":"bar"/);assert.doesNotMatch(order,/pg-clear-order|Clear Order|pgCountClearContext/);
});

test('Clear Order visibility detects every persisted workflow work surface without cross-contamination',()=>{
  const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8'),vm=require('node:vm');
  const bar={name:'BarA'},mixer={name:'MixerA'},fruit={name:'FruitA'};
  function evaluate(overrides,type){
    const base={counts:{},adjustments:{},adjustmentMeta:{},notes:{bar:'',mer:''}},context={S:null,Object,String,Number,Array};context.S=Object.assign(base,overrides.S||{});
    context.pgProductSet=t=>t==='merchants'?[mixer,fruit]:[bar];context.pgSession=()=>overrides.session||{};context.pgDraftNoteKey=t=>t==='merchants'?'mer':'bar';context.pgDraftRecord=(t)=>((overrides.drafts||{})[t]||null);context.pgEmailStatus=()=>overrides.email||{};
    const source=html.slice(html.indexOf('function pgDraftWorkState'),html.indexOf('function pgWorkflowCountSnapshot'));vm.runInNewContext(source+';this.has=pgDraftHasMeaningfulWork;this.state=pgDraftWorkState;',context);return {has:context.has(type),state:context.state(type)};
  }
  assert.equal(evaluate({},'bar').has,false);
  assert.equal(evaluate({S:{counts:{BarA:'0'}}},'bar').has,true);
  assert.equal(evaluate({S:{counts:{'MixerA::cases':'2'}}},'merchants').has,true);
  assert.equal(evaluate({S:{adjustments:{BarA:2}}},'bar').has,true);
  assert.equal(evaluate({S:{adjustmentMeta:{MixerA:{reason:'event'}}}},'merchants').has,true);
  assert.equal(evaluate({S:{notes:{bar:'order note',mer:''}}},'bar').has,true);
  assert.equal(evaluate({email:{mer:{Merchants:{copiedAt:1}}}},'merchants').has,true);
  assert.equal(evaluate({session:{merchants:{touched:['FruitA']}}},'merchants').has,true);
  assert.equal(evaluate({drafts:{bar:{adjustments:{BarA:1}}}},'bar').has,true);
  assert.equal(evaluate({S:{counts:{MixerA:'3'}}},'bar').has,false);
});

test('shared renderer produces the same compact contextual Clear button for Bar and Merchants',()=>{
  const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8'),vm=require('node:vm');
  function element(tag,cls){return {tag,className:cls||'',children:[],attributes:{},style:{},appendChild(child){child.parentNode=this;this.children.push(child);},setAttribute(key,value){this.attributes[key]=String(value);}};}
  const cleared=[];const context={d:cls=>element('div',cls),sp:(cls,text)=>Object.assign(element('span',cls),{textContent:text}),btn:(cls,text,fn)=>Object.assign(element('button',cls),{textContent:text,onclick:fn}),ap:(parent,...children)=>{children.forEach(child=>parent.appendChild(child));return parent;},pgDraftHasMeaningfulWork:()=>true,pgHasPhysicalCount:()=>false,pgClearOrderName:type=>type==='merchants'?'Merchants':'Bar',pgClearActiveOrder:type=>cleared.push(type)};
  const source=html.slice(html.indexOf('function pgCountClearContext'),html.indexOf('function pgRefreshCountClearContext'));vm.runInNewContext(source+';this.contextRow=pgCountClearContext;',context);
  const rows=['bar','merchants'].map(type=>context.contextRow(type,[{name:'A'}]));rows.forEach((row,index)=>{const clear=row.children[1];assert.equal(row.className,'ch');assert.equal(row.children[0].className,'cc');assert.equal(row.children[0].textContent,'Keep counting');assert.equal(clear.className,'clrbtn');assert.equal(clear.textContent,'Clear');assert.equal(clear.hidden,false);assert.equal(clear.disabled,false);assert.equal(clear.attributes['data-workflow'],index?'merchants':'bar');clear.onclick();});assert.deepEqual(cleared,['bar','merchants']);
  assert.match(html,/\.clrbtn\{min-height:36px!important;border-radius:12px!important\}/);assert.doesNotMatch(html,/\.pg-clear-order\{/);
});

test('rendered Merchants Clear performs one immediate reset and cannot render any dialog, sheet, modal, toast, or acknowledgment',()=>{
  const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8'),vm=require('node:vm');let clears=0,feedback=0;
  function element(tag,cls){return {tag,className:cls||'',children:[],attributes:{},appendChild(child){child.parentNode=this;this.children.push(child);},setAttribute(key,value){this.attributes[key]=String(value);}};}
  const context={d:cls=>element('div',cls),sp:(cls,text)=>Object.assign(element('span',cls),{textContent:text}),btn:(cls,text,fn)=>Object.assign(element('button',cls),{textContent:text,onclick:fn}),ap:(parent,...children)=>{children.forEach(child=>parent.appendChild(child));return parent;},pgDraftHasMeaningfulWork:()=>true,pgHasPhysicalCount:()=>false,pgClearOrderName:()=>"Merchants",pgClearWorkflowDraft:type=>{assert.equal(type,'merchants');clears++;},s4Sheet:()=>feedback++,s5ShowSuccess:()=>feedback++,toast:()=>feedback++};
  const active=html.slice(html.indexOf('function pgClearActiveOrder'),html.indexOf('function pgCountClearContext')),renderer=html.slice(html.indexOf('function pgCountClearContext'),html.indexOf('function pgRefreshCountClearContext'));vm.runInNewContext(active+renderer+';this.contextRow=pgCountClearContext;',context);
  const row=context.contextRow('merchants',[{name:'MixerA'},{name:'FruitA'}]);row.children[1].onclick();assert.equal(clears,1);assert.equal(feedback,0);assert.equal(row.children.some(child=>child.attributes.role==='dialog'||/sheet|modal|ack/i.test(child.className)),false);
});

test('Clear Order buttons enable immediately as counts, notes, and email state are entered',()=>{
  const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
  const refresh=html.slice(html.indexOf('function pgRefreshCountClearContext'),html.indexOf('function pgOpenManualAdjustment'));
  assert.match(refresh,/querySelectorAll\('\.clrbtn\[data-workflow=/);assert.match(refresh,/button\.disabled=!hasWork/);assert.match(refresh,/button\.hidden=!hasWork/);assert.match(refresh,/"Keep counting"/);
  const countWrites=html.slice(html.indexOf('function pgSavePart'),html.indexOf('function cq'));
  assert.match(countWrites,/pgRefreshCountClearContext\(type\)/);assert.match(countWrites,/pgRefreshCountClearContext\("bar"\)/);
  const countUi=html.slice(html.indexOf('function rCatCount'),html.indexOf('function pgOrderLine'));
  assert.match(countUi,/pgRefreshCountClearContext\(type\)/);assert.match(countUi,/pgRefreshCountClearContext\("bar"\)/);
  const email=html.slice(html.indexOf('function pgMarkEmailCopied'),html.indexOf('function pgCloseSession'));assert.match(email,/pgRefreshCountClearContext\(key==="mer"\?"merchants":"bar"\)/);
  const order=html.slice(html.indexOf('function rOrderTab'),html.indexOf('function calcSuggestedBuildTos'));assert.match(order,/pgPersistDraft\(type\);pgRefreshCountClearContext\(type\)/);
});

test('Merchants clear executes across Mixers and Fruit while preserving Bar state',()=>{
  const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8'),vm=require('node:vm'),context={pgDraftNoteKey:type=>type==='merchants'?'mer':'bar'};
  const source=html.slice(html.indexOf('function pgPruneWorkflowDraftState'),html.indexOf('function pgClearWorkflowDraft'));
  vm.runInNewContext(source+';this.prune=pgPruneWorkflowDraftState;',context);
  const state={counts:{MixerA:'2','MixerA::loose':'4',FruitA:'1',BarA:'9'},adjustments:{MixerA:2,FruitA:1,BarA:3},adjustmentMeta:{MixerA:{reason:'event'},FruitA:{reason:'manager'},BarA:{reason:'bar'}},notes:{mer:'merchant note',bar:'bar note'}};
  const result=context.prune('merchants',state,[{name:'MixerA'},{name:'FruitA'}]);
  assert.equal(result.counts.MixerA,undefined);assert.equal(result.counts['MixerA::loose'],undefined);assert.equal(result.counts.FruitA,undefined);assert.equal(result.counts.BarA,'9');
  assert.equal(result.adjustments.MixerA,undefined);assert.equal(result.adjustments.FruitA,undefined);assert.equal(result.adjustments.BarA,3);
  assert.equal(result.adjustmentMeta.MixerA,undefined);assert.equal(result.adjustmentMeta.FruitA,undefined);assert.equal(result.adjustmentMeta.BarA.reason,'bar');
  assert.equal(result.notes.mer,'');assert.equal(result.notes.bar,'bar note');assert.equal(state.notes.mer,'merchant note');
});

test('confirmed Merchants clear removes every draft surface persistently and is idempotent without touching Bar or History',()=>{
  const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8'),vm=require('node:vm');
  const mixer={name:'MixerA'},fruit={name:'FruitA'},bar={name:'BarA'},writes={},pushes=[];
  const context={PG_DRAFT_KEY:'drafts',MER:[mixer,fruit],BAR:[bar],S:{counts:{MixerA:'2','MixerA::loose':'4',FruitA:'1',BarA:'9'},adjustments:{MixerA:2,FruitA:1,BarA:3},adjustmentMeta:{MixerA:{reason:'event'},FruitA:{reason:'manager'},BarA:{reason:'bar'}},notes:{mer:'merchant note',bar:'bar note'},history:[{id:7}],tab:'merchants',mSub:'order',merchantView:'Fruit',mCat:'Fruit'},Object,Date,Math};
  context.pgDraftNoteKey=type=>type==='merchants'?'mer':'bar';context.pgProductSet=type=>type==='merchants'?context.MER:context.BAR;context.pgDrafts=()=>({merchants:{id:'mer-draft'},bar:{id:'bar-draft'}});context.pgSession=()=>({merchants:{id:'mer-session'},bar:{id:'bar-session'}});context.pgEmailStatus=()=>({mer:{Merchants:{copiedAt:1}},bar:{Bellows:{copiedAt:2}}});context.lsSet=(key,value)=>{writes[key]=JSON.parse(JSON.stringify(value));};context.pgSaveSession=value=>{writes.session=JSON.parse(JSON.stringify(value));};context.schedulePush=value=>pushes.push(JSON.parse(JSON.stringify(value)));context.pushCounts=value=>pushes.push(JSON.parse(JSON.stringify(value)));context.render=()=>{};
  const source=html.slice(html.indexOf('function pgPruneWorkflowDraftState'),html.indexOf('function pgClearOrderName'));vm.runInNewContext(source+';this.clear=pgClearWorkflowDraft;',context);
  const historyBefore=JSON.stringify(context.S.history);context.clear('merchants');context.clear('merchants');
  assert.deepEqual({...context.S.counts},{BarA:'9'});assert.deepEqual({...context.S.adjustments},{BarA:3});assert.equal(context.S.adjustmentMeta.BarA.reason,'bar');assert.equal(context.S.notes.mer,'');assert.equal(context.S.notes.bar,'bar note');
  assert.equal(writes.drafts.merchants,undefined);assert.equal(writes.drafts.bar.id,'bar-draft');assert.equal(writes.session.merchants,undefined);assert.equal(writes.session.bar.id,'bar-session');assert.equal(writes['pourgrid-email-status'].mer,undefined);assert.equal(writes['pourgrid-email-status'].bar.Bellows.copiedAt,2);
  assert.equal(context.S.tab,'merchants');assert.equal(context.S.mSub,'count');assert.equal(context.S.merchantView,'Mixer');assert.equal(context.S.mCat,null);assert.equal(JSON.stringify(context.S.history),historyBefore);assert.ok(pushes.length>=2);
});

test('workflow submission clears only its own draft and preserves draft identity in History',()=>{
  const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
  // The submission composes the payload; pgCompleteOrderSave clears the draft, and only
  // once the server has confirmed the order id.
  const order=html.slice(html.indexOf('// ── Order save orchestration'),html.indexOf('function calcSuggestedBuildTos'));
  assert.match(order,/activeType=isG\?"merchants":"bar"/);assert.match(order,/draftId:draftIdentity/);assert.match(order,/orderType:activeType/);
  assert.match(order,/counts:pgWorkflowCountSnapshot\(activeType\)/);
  assert.match(order,/pgClearWorkflowDraft\(activeType,\{render:false\}\)/);
  assert.doesNotMatch(order,/var clearedCounts=\{\}/);assert.doesNotMatch(order,/adjustments:\{\}/);
  const sessions=html.slice(html.indexOf('function pgStartSession'),html.indexOf('function pgCountTypeForProduct'));
  assert.match(sessions,/id:pgDraftRecord\(type,true\)\.id/);
});

test('destructive sheets lock background dismissal and restore focus',()=>{
  const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
  const sheet=html.slice(html.indexOf('var pgSheetReturnFocus'),html.indexOf('function pgTodayKey'));
  assert.match(sheet,/options\.locked/);assert.match(sheet,/wrap\.dataset\.locked/);assert.match(sheet,/options\.returnFocus\|\|document\.activeElement/);
  assert.match(sheet,/role","dialog/);assert.match(sheet,/aria-modal/);assert.match(sheet,/aria-labelledby/);assert.match(sheet,/event\.key==="Escape"/);assert.match(sheet,/canDismiss:function\(\)\{return wrap\.dataset\.locked!=="true"/);
  assert.match(html,/\.s4-sheet\{[^}]*max-height:min\(88dvh,760px\)[^}]*overflow-y:auto[^}]*safe-area-inset-bottom/);
  assert.match(html,/window\.s4CloseSheet=function\(\)[\s\S]*pgSheetReturnFocus\.focus/);
});
