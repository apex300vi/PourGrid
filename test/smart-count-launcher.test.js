const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const Launcher=require('../smart-count-launcher.js');

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
  assert.match(html,/\+total\+" "\+cfg\.unitLabel\+" on hand"/);
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

test('briefing home presents one next action without rebuilding the dashboard',()=>{
  const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8'),home=html.slice(html.indexOf('function rHome'),html.indexOf('function rStabs'));
  assert.match(home,/Your next order/);assert.match(home,/pgHomeBriefing/);assert.doesNotMatch(home,/rDeadlines/);
  assert.doesNotMatch(home,/Start Bar Count|Start Merchants Count|Open History & Insights|s81-action-card/);
  const briefing=html.slice(html.indexOf('function pgHomeBriefing'),html.indexOf('function rOrderNotes'));
  assert.match(briefing,/Next action/);assert.match(briefing,/Coming up/);assert.match(briefing,/Latest submitted order/);assert.match(briefing,/pgOpenUpcomingCycle/);
  assert.match(briefing,/mk\("button","pg-week-item/);assert.match(briefing,/aria-label","Open /);
  const streamList=html.slice(html.indexOf('function pgHomeStreamList'),html.indexOf('function pgHomeBriefing'));
  assert.match(streamList,/a\.dl\.deadline-b\.dl\.deadline/);
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
  ['all','Bellows/WI','CC1'].forEach(v=>assert.match(bar,new RegExp('"'+v.replace('/','\\/')+'"')));
  assert.doesNotMatch(bar,/Merchants|Mixer|Fruit/);
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
  assert.match(routes,/destination==="bellows"/);assert.match(routes,/countFilter:"Bellows\/WI"/);
  assert.match(routes,/destination==="cc1"/);assert.match(routes,/countFilter:"CC1"/);
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
  assert.match(html,/sheet:wrap\.querySelector\("\.s4-sheet"\)[\s\S]*onDismiss:s4CloseSheet/);
  assert.match(html,/sheet:modal,handle:visionHandle[\s\S]*canDismiss:function\(\)\{return !processing;\}/);
});

test('failed-photo sheet is compact, non-repetitive, and preserves successful work',()=>{
  const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
  const failed=html.slice(html.indexOf('function showFailures'),html.indexOf('async function processPhotos'));
  assert.match(failed,/pg-vision-failures/);assert.match(failed,/Retry Failed Photos/);assert.match(failed,/Add More Photos/);assert.match(failed,/Successful photos and results are preserved/);
  assert.equal((failed.match(/couldn't analyze/g)||[]).length,1);assert.match(failed,/session\.failed\(failedPhotoIds\)/);
  assert.match(html,/\.pg-vision-failure-actions\{display:grid;grid-template-columns:1fr/);
  assert.match(html,/\.pg-vision-failure-actions button\{width:100%/);
});
