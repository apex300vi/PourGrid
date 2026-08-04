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
  ['Take Photo','Add from Library','Remove photo','Process Photos','Preparing photos','Analyzing photo','Combining results','Preparing review','PourGrid Vision Complete'].forEach(text=>assert.match(section,new RegExp(text)));
  assert.match(section,/process\.onclick=async function/);
  assert.doesNotMatch(section,/onchange[\s\S]{0,250}countCategoryViaAI/);
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
