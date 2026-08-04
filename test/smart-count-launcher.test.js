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

test('primary Smart Count button opens the modal',()=>{const h=harness(),b=button();h.launcher.bind(b,()=>({products:[],isG:true,onDone(){}}));b.fire('click');assert.equal(h.opens,1);assert.equal(h.modal,true);});

test('Smart Count opens after navigating away and back with a re-rendered button',()=>{const h=harness(),first=button();h.launcher.bind(first,()=>({}));first.fire('click');h.close();const rerendered=button();h.launcher.bind(rerendered,()=>({}));rerendered.fire('click');assert.equal(h.opens,2);});

test('repeated taps do not create duplicate modals',()=>{const h=harness(),b=button();h.launcher.bind(b,()=>({}));b.fire('click');b.fire('click');assert.equal(h.opens,1);});

test('mobile touch activation opens once and suppresses its synthetic click',()=>{const h=harness(),b=button();h.launcher.bind(b,()=>({}));const touch=b.fire('touchend');b.fire('click');assert.equal(touch.prevented,true);assert.equal(h.opens,1);});

test('missing recognition module shows a safe message instead of doing nothing',()=>{const h=harness(false),b=button();h.launcher.bind(b,()=>({}));b.fire('click');assert.equal(h.opens,0);assert.match(h.error,/recognition is unavailable/i);});

test('index wires the primary button through the guarded launcher and current packaging helper',()=>{
  const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
  assert.ok(html.indexOf('bottle-intelligence.js')<html.indexOf('smart-count-launcher.js'));
  assert.match(html,/pgSmartCountLauncher\.bind\(pbtn,args\)/);
  assert.match(html,/data-pg-smart-count-modal/);
  assert.doesNotMatch(html,/pgPackaging\s*\(/);
  assert.match(html,/cfg=pgPack\(product\)\|\|\{\}/);
});
