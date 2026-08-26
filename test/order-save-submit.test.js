'use strict';
// The bug this covers: an order save that never reached the database was reported to Josh in
// the green success card as "still saved on this device", so the order silently never entered
// order history — the table build-to tracking and predictive ordering read from.
//
// These tests pin the contract both ways: a reachable backend must produce a confirmed
// server-side write before anything is called saved, and a local-only outcome must surface a
// visible failure with a retry while the payload stays recoverable.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const OrderSave=require('../order-save.js');

const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
function slice(from,to){
  const start=html.indexOf(from),end=html.indexOf(to);
  assert.notEqual(start,-1,from);assert.notEqual(end,-1,to);assert.ok(end>start,from+' before '+to);
  return html.slice(start,end);
}

function memoryStore(){
  const values=new Map();
  return {
    getItem:k=>values.has(k)?values.get(k):null,
    setItem:(k,v)=>{values.set(k,String(v));},
    removeItem:k=>{values.delete(k);},
    size:()=>values.size
  };
}

function order(overrides){
  return Object.assign({
    id:1756200000000,
    draftId:'bar-1756200000000-a1b2c3',
    orderType:'bar',
    date:'Wed, Aug 26, 2026',
    time:'04:15 PM',
    note:'',
    counts:{'Cruzan Dark':'18'},
    items:[{name:'Cruzan Dark',dist:'CC1',orderQty:2,finalOrderQty:2}]
  },overrides||{});
}

// ── The module contract ─────────────────────────────────────────────────────

test('a reachable backend must confirm a server-side write before the save resolves',async()=>{
  const sent=[];
  const result=await OrderSave.submit(order(),{
    finalizeShared:async entry=>{sent.push(entry);return 4211;},
    saveDirect:async()=>{throw new Error('the direct route must not run when the shared route confirms');}
  });
  assert.equal(result.orderId,4211);
  assert.equal(result.route,'shared-draft');
  assert.equal(sent.length,1);
  assert.equal(sent[0].draftId,'bar-1756200000000-a1b2c3');
});

test('a backend that accepts the call but returns no order id is not a save',async()=>{
  for(const empty of [null,undefined,0,'',false,'0',NaN,{}]){
    await assert.rejects(
      ()=>OrderSave.submit(order(),{finalizeShared:async()=>empty,saveDirect:async()=>9}),
      /could not confirm a server-side save/,
      'returned '+JSON.stringify(empty)
    );
  }
});

test('a server id survives whichever transport shape Postgres returns it in',()=>{
  assert.equal(OrderSave.serverOrderId(42),42);
  assert.equal(OrderSave.serverOrderId('42'),'42');
  assert.equal(OrderSave.serverOrderId([42]),42);
  assert.equal(OrderSave.serverOrderId({order_id:42}),42);
  assert.equal(OrderSave.serverOrderId({orderId:'42'}),'42');
  assert.equal(OrderSave.serverOrderId(0),null);
  assert.equal(OrderSave.serverOrderId([]),null);
  assert.equal(OrderSave.serverOrderId(Infinity),null);
});

test('a shared draft that never reached the server falls back to the direct location save',async()=>{
  const unsynced=new Error('Shared draft is not fully synced');
  const result=await OrderSave.submit(order(),{
    finalizeShared:async()=>{throw unsynced;},
    saveDirect:async entry=>{assert.equal(entry.draftId,'bar-1756200000000-a1b2c3');return 77;}
  });
  assert.equal(result.orderId,77);
  assert.equal(result.route,'direct');
  assert.deepEqual(result.routes,['shared-draft','direct']);
});

test('a failure that may already have written a row is never re-routed',async()=>{
  let direct=0;
  const rejected=new Error('This draft was already saved with different contents');
  await assert.rejects(
    ()=>OrderSave.submit(order(),{finalizeShared:async()=>{throw rejected;},saveDirect:async()=>{direct++;return 5;}}),
    /already saved with different contents/
  );
  assert.equal(direct,0,'a server-side rejection must not become a second order');

  let afterNetwork=0;
  await assert.rejects(
    ()=>OrderSave.submit(order(),{finalizeShared:async()=>{throw new Error('Failed to fetch');},saveDirect:async()=>{afterNetwork++;return 5;}}),
    /Failed to fetch/
  );
  assert.equal(afterNetwork,0,'a dropped connection has an unknown outcome and must not re-route');
});

test('an unconfirmed shared save does not fall through to a second write',async()=>{
  let direct=0;
  await assert.rejects(
    ()=>OrderSave.submit(order(),{finalizeShared:async()=>null,saveDirect:async()=>{direct++;return 5;}}),
    /could not confirm a server-side save/
  );
  assert.equal(direct,0);
});

test('an unsavable payload is rejected before any request is made',async()=>{
  let calls=0;
  const deps={finalizeShared:async()=>{calls++;return 1;},saveDirect:async()=>{calls++;return 1;}};
  await assert.rejects(()=>OrderSave.submit(order({draftId:null}),deps),/draft identity is required/);
  await assert.rejects(()=>OrderSave.submit(order({items:[]}),deps),/At least one order item/);
  await assert.rejects(()=>OrderSave.submit(order({counts:null}),deps),/count snapshot is required/);
  await assert.rejects(()=>OrderSave.submit(order({orderType:'counts'}),deps),/workflow is invalid/);
  assert.equal(calls,0);
});

// ── The on-device recovery record ───────────────────────────────────────────

test('an order is staged before the request so a lost session still recovers it',()=>{
  const store=memoryStore();
  OrderSave.stage(store,order(),{orderType:'bar',label:'Bar order'});
  const pending=OrderSave.list(store);
  assert.equal(pending.length,1);
  assert.equal(pending[0].draftId,'bar-1756200000000-a1b2c3');
  assert.equal(pending[0].label,'Bar order');
  assert.equal(pending[0].attempts,0);
  assert.equal(pending[0].entry.items.length,1);
});

test('a failed attempt is counted and the payload is kept byte for byte',()=>{
  const store=memoryStore();
  const staged=order();
  OrderSave.stage(store,staged,{orderType:'bar'});
  OrderSave.fail(store,staged.draftId,new Error('Shared draft is not fully synced'));
  OrderSave.fail(store,staged.draftId,new Error('Failed to fetch'));
  const [row]=OrderSave.list(store);
  assert.equal(row.attempts,2);
  assert.match(row.lastError,/Failed to fetch/);
  // Byte-identical replay is what makes the idempotent retry safe.
  assert.deepEqual(row.entry,staged);
});

test('re-staging the same draft keeps one recoverable order, not a pile of attempts',()=>{
  const store=memoryStore();
  OrderSave.stage(store,order(),{orderType:'bar'});
  OrderSave.fail(store,order().draftId,new Error('offline'));
  const again=OrderSave.stage(store,order({note:'second try'}),{orderType:'bar'});
  assert.equal(OrderSave.list(store).length,1);
  assert.equal(again.attempts,1,'the attempt history survives a re-stage');
  assert.equal(OrderSave.list(store)[0].entry.note,'second try');
});

test('a confirmed save clears the recovery record',()=>{
  const store=memoryStore();
  OrderSave.stage(store,order(),{orderType:'bar'});
  const cleared=OrderSave.resolve(store,order().draftId,4211);
  assert.equal(cleared.orderId,4211);
  assert.deepEqual(OrderSave.list(store),[]);
});

// ── The app wiring ──────────────────────────────────────────────────────────
// Runs the real orchestration out of index.html against stubs, so "shows saved only after a
// server-side write" is enforced on the shipped code path rather than on a copy of it.

function element(tag){
  const node={
    tagName:String(tag).toUpperCase(),className:'',style:{cssText:''},childNodes:[],attributes:{},_text:'',
    get textContent(){return node._text||node.childNodes.map(c=>c.textContent||'').join(' ');},
    set textContent(value){node._text=String(value);node.childNodes.length=0;},
    appendChild(child){node.childNodes.push(child);return child;},
    setAttribute(name,value){node.attributes[name]=String(value);},
    getAttribute(name){return node.attributes[name];},
    querySelector(){return null;},querySelectorAll(){return [];},
    classList:{add(){},remove(){},toggle(){}}
  };
  return node;
}
function textOf(node){return [node._text||''].concat((node.childNodes||[]).map(textOf)).join(' ');}

function app(options){
  options=options||{};
  const store=options.store||memoryStore(),toasts=[],successes=[],failures=[],cleared=[],saved=[];
  const context={
    window:{PourGridOrderSave:OrderSave,POURGRID_ORDER_API:{save:()=>{}}},
    document:{createElement:tag=>element(tag),createTextNode:value=>{const n=element('#text');n.textContent=value;return n;}},
    PG_STORE:store,
    PourGridOrderSave:OrderSave,
    S:{history:[],ordered:{},notes:{},adjustments:{},adjustmentMeta:{},counts:{},connectivity:'online'},
    toasts,successes,failures,cleared,saved,renders:0,
    toast:m=>{toasts.push(m);},
    render:()=>{context.renders++;},
    ss:patch=>{Object.assign(context.S,patch);context.renders++;},
    lsSet:()=>{},
    saveDeadlines:o=>o,
    pushCounts:()=>{},
    getDeadlines:()=>[{key:'merchants-wed',deadline:1},{key:'merchants-sun',deadline:2}],
    pgClearWorkflowDraft:type=>{cleared.push(type);},
    pgSession:()=>({bar:{id:'bar-1756200000000-a1b2c3'},merchants:{}}),
    pgDraftRecord:()=>({id:'bar-1756200000000-a1b2c3'}),
    s5ShowSuccess:(title,text)=>{successes.push({title,text});},
    s5ShowFailure:(title,text,label,onRetry)=>{failures.push({title,text,label,onRetry});},
    s5HideSuccess:()=>{},
    saveDB:async entry=>{saved.push(entry);return options.saveDirect?options.saveDirect(entry):null;},
    console:{error:()=>{},warn:()=>{}},
    Promise,Object,Array,String,Number,Boolean,Math,JSON,Date,isNaN,isFinite
  };
  if(options.shared)context.window.PourGridSharedDraft={finalize:(type,entry)=>options.shared(type,entry)};
  const source=slice('function mk(tag,cls,attrs)','// Custom brand mark')
    +slice('// ── Order save orchestration','function rOrderTab(prods,dists,dk,isG)');
  vm.runInNewContext(source
    +';this.pgSubmitOrderSave=pgSubmitOrderSave;this.pgRetryPendingOrderSave=pgRetryPendingOrderSave;'
    +'this.pgRetryAllPendingOrderSaves=pgRetryAllPendingOrderSaves;this.rPendingOrderSaves=rPendingOrderSaves;'
    +'this.pgPendingOrderSaves=pgPendingOrderSaves;this.pgCompleteOrderSave=pgCompleteOrderSave;',context);
  context.store=store;
  return context;
}

test('submitting while the backend is reachable confirms a server-side write before showing saved',async()=>{
  const shared=[];
  const pg=app({shared:(type,entry)=>{shared.push({type,entry});return Promise.resolve(4211);}});
  const result=await pg.pgSubmitOrderSave(order(),'bar',false);

  assert.equal(result.orderId,4211);
  assert.equal(shared.length,1,'the order went to the server');
  assert.equal(pg.successes.length,1);
  assert.equal(pg.successes[0].title,'Order saved');
  assert.match(pg.successes[0].text,/order history/i);
  assert.match(pg.successes[0].text,/4211/,'the confirmed order id is shown, not a local id');
  assert.equal(pg.failures.length,0);
  assert.equal(pg.S.history.length,1,'History only grows on a confirmed write');
  assert.equal(pg.S.history[0]._dbId,4211);
  assert.deepEqual(pg.cleared,['bar'],'the count clears only once the order is really saved');
  assert.deepEqual(pg.pgPendingOrderSaves(),[],'nothing is left to recover');
});

test('a save that only succeeds locally reports a failure with a retry, never a success',async()=>{
  const pg=app({shared:()=>Promise.reject(new Error('Failed to fetch'))});
  await assert.rejects(()=>pg.pgSubmitOrderSave(order(),'bar',false),/Failed to fetch/);

  assert.equal(pg.successes.length,0,'a local-only save must never render the success card');
  assert.equal(pg.failures.length,1);
  assert.equal(pg.failures[0].title,'Order NOT saved');
  assert.match(pg.failures[0].text,/NOT (?:in|reached) order history|order history/i);
  assert.equal(typeof pg.failures[0].onRetry,'function','the failure offers a retry');
  assert.equal(pg.S.history.length,0,'nothing enters History without a server id');
  assert.deepEqual(pg.cleared,[],'the draft and the count survive a failed save');

  const pending=pg.pgPendingOrderSaves();
  assert.equal(pending.length,1,'the order is staged for recovery');
  assert.equal(pending[0].attempts,1);
  assert.match(textOf(pg.rPendingOrderSaves()),/not in order history yet/i);
  assert.match(textOf(pg.rPendingOrderSaves()),/Save to order history now/);
});

test('a backend that accepts the order but confirms nothing is treated as not saved',async()=>{
  const pg=app({shared:()=>Promise.resolve(null),saveDirect:()=>1});
  await assert.rejects(()=>pg.pgSubmitOrderSave(order(),'bar',false),/could not confirm a server-side save/);
  assert.equal(pg.successes.length,0);
  assert.equal(pg.failures.length,1);
  assert.equal(pg.saved.length,0,'an unconfirmed shared save must not be re-sent down the direct route');
  assert.equal(pg.pgPendingOrderSaves().length,1);
});

test('an unreachable shared draft still lands the order in history through the direct save',async()=>{
  const pg=app({shared:()=>Promise.reject(new Error('Shared draft service unavailable')),saveDirect:()=>8801});
  const result=await pg.pgSubmitOrderSave(order(),'bar',false);
  assert.equal(result.route,'direct');
  assert.equal(pg.saved.length,1);
  assert.equal(pg.successes.length,1);
  assert.match(pg.successes[0].text,/8801/);
  assert.deepEqual(pg.pgPendingOrderSaves(),[]);
});

test('recovering a staged order writes it to history and clears the banner',async()=>{
  const pg=app({shared:()=>Promise.reject(new Error('Failed to fetch'))});
  await assert.rejects(()=>pg.pgSubmitOrderSave(order(),'bar',false),/Failed to fetch/);
  assert.equal(pg.pgPendingOrderSaves().length,1);

  // Snapshotted at send time: save_location_order hashes what it receives, so a replayed
  // payload has to be byte-identical for the idempotent retry to return the original id.
  pg.saveDB=async entry=>{pg.saved.push(JSON.parse(JSON.stringify(entry)));return 9302;};
  const recovered=await pg.pgRetryAllPendingOrderSaves();
  assert.equal(recovered,true);
  assert.equal(pg.saved.length,1,'recovery replays the staged payload down the direct route');
  assert.deepEqual(pg.saved[0],order(),'the payload is replayed unchanged so the save stays idempotent');
  assert.equal(pg.S.history.length,1);
  assert.equal(pg.S.history[0]._dbId,9302);
  assert.deepEqual(pg.pgPendingOrderSaves(),[]);
  assert.equal(pg.rPendingOrderSaves(),null);
});

test('a recovery that lands after the next count has started does not wipe it',async()=>{
  const pg=app({shared:()=>Promise.reject(new Error('Failed to fetch'))});
  await assert.rejects(()=>pg.pgSubmitOrderSave(order(),'bar',false),/Failed to fetch/);
  // Josh moved on: a new session and a new draft own the workspace now.
  pg.pgSession=()=>({bar:{id:'bar-later'},merchants:{}});
  pg.pgDraftRecord=()=>({id:'bar-later'});
  pg.saveDB=async()=>9303;
  assert.equal(await pg.pgRetryAllPendingOrderSaves(),true);
  assert.equal(pg.S.history.length,1,'the recovered order still reaches History');
  assert.deepEqual(pg.cleared,[],'but it does not clear the count that replaced it');
});

test('a device with no storage headroom is told the order could not be held',async()=>{
  const full={getItem:()=>null,setItem:()=>{const e=new Error('QuotaExceededError');e.name='QuotaExceededError';throw e;},removeItem:()=>{}};
  const pg=app({store:full,shared:()=>Promise.reject(new Error('Failed to fetch'))});
  await assert.rejects(()=>pg.pgSubmitOrderSave(order(),'bar',false),/Failed to fetch/);
  assert.equal(pg.successes.length,0);
  assert.equal(pg.failures.length,1);
  assert.match(pg.failures[0].text,/out of storage/);
  assert.equal(pg.failures[0].onRetry,null,'no retry button when there is nothing staged to retry from');
});

test('a background sweep records the attempt without hijacking the screen',async()=>{
  const pg=app({shared:()=>Promise.reject(new Error('Failed to fetch'))});
  await assert.rejects(()=>pg.pgSubmitOrderSave(order(),'bar',false),/Failed to fetch/);
  pg.failures.length=0;
  pg.saveDB=async()=>{throw new Error('Failed to fetch');};
  assert.equal(await pg.pgRetryAllPendingOrderSaves({silent:true}),false);
  assert.equal(pg.failures.length,0,'a silent sweep does not raise a modal');
  assert.equal(pg.pgPendingOrderSaves()[0].attempts,2,'but the attempt is still counted');
});
