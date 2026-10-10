const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const H=require('../count-history.js');

function harness(){
  const products=['Stoli','Rum'].map(name=>({name,pack:12,unit:'Case',bottleMl:1000,dist:'Bellows/WI'}));
  const at=Date.now()-7*86400000;
  const history=[{draftId:'one',id:at,counts:{Stoli:96,Rum:24},items:products.map(p=>({...p,orderQty:2}))}];
  let prepared=0,timelines=0;const timers=new Map(),nodes=[];let timerId=0;
  function node(){return {dataset:{},children:[],classList:{add(){}},appendChild(x){this.children.push(x);return x;},replaceChildren(){this.children=[];},setAttribute(){}};}
  const store=new Map();
  const window={PourGridCountHistory:{...H,prepare(...args){prepared++;return H.prepare(...args);},timeline(...args){timelines++;return H.timeline(...args);}},PG_STORE:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v)},S:{history,counts:{Stoli:70,Rum:20}},PRODUCTS:products,pgPack:()=>null,pgHasPhysicalCount:p=>window.S.counts[p.name]!==undefined,addEventListener(){}};
  const document={createElement:node,head:node(),getElementById:()=>({}),querySelectorAll:()=>nodes};
  vm.runInNewContext(fs.readFileSync(require.resolve('../count-history-ui.js'),'utf8'),{window,document,crypto:{},setTimeout:fn=>{timers.set(++timerId,fn);return timerId;},clearTimeout:id=>timers.delete(id)});
  products.forEach(p=>nodes.push(window.pgCountHistorySummary(p)));
  const text=n=>[n.textContent||'',...n.children.map(text)].join(' ');
  return {window,nodes,store,text,stats:()=>({prepared,timelines}),flush(){const callbacks=[...timers.values()];timers.clear();callbacks.forEach(fn=>fn());},pending:()=>timers.size};
}
test('typing does no synchronous history work and refreshes only edited products once',()=>{
  const h=harness(),before=h.stats(),other=h.nodes[1].children[0];
  h.window.S.counts.Stoli=69;
  for(let i=0;i<20;i++)h.window.pgRefreshCountHistory('Stoli');
  assert.deepEqual(h.stats(),before);assert.equal(h.pending(),1);
  h.flush();assert.deepEqual(h.stats(),before);
  assert.equal(h.nodes[1].children[0],other);assert.match(h.text(h.nodes[0]),/51 bottles/);
});
test('rapid edits to different products are retained in one deferred refresh',()=>{
  const h=harness();h.window.S.counts.Stoli=60;h.window.S.counts.Rum=10;
  h.window.pgRefreshCountHistory('Stoli');h.window.pgRefreshCountHistory('Rum');h.flush();
  assert.match(h.text(h.nodes[0]),/60 bottles/);assert.match(h.text(h.nodes[1]),/38 bottles/);
});
test('history, packaging, journal and property changes invalidate the cache',()=>{
  const h=harness();assert.equal(h.stats().prepared,1);
  h.window.S.history=[...h.window.S.history];h.window.pgRefreshCountHistory();h.flush();assert.equal(h.stats().prepared,2);
  h.store.set('pourgrid-product-edits','{}');h.window.pgRefreshCountHistory();h.flush();assert.equal(h.stats().prepared,3);
  h.window.PG_STORE={getItem:()=>null};h.window.S.history=[];h.window.pgRefreshCountHistory();h.flush();assert.equal(h.stats().prepared,4);assert.match(h.text(h.nodes[0]),/No previous count/);
});
test('both vendor email builders end without an automatic signature or thank-you footer',()=>{
  const html=fs.readFileSync(require.resolve('../index.html'),'utf8');
  for(const [start,end] of [['function rEmailPanel','function rTabs'],['function rOrderTab','function calcSuggestedBuildTos']]){
    const body=html.slice(html.indexOf(start),html.indexOf(end));
    assert.doesNotMatch(body,/pgOrderSignature\(|Thank you,/);
  }
});
test('all four physical count entry paths pass their edited product to the deferred updater',()=>{
  const html=fs.readFileSync(require.resolve('../index.html'),'utf8');
  for(const call of ['pgRefreshCountClearContext(type,name)','pgRefreshCountClearContext("bar",name)','pgRefreshCountClearContext(type,pn)','pgRefreshCountClearContext("bar",pn)'])assert.ok(html.includes(call),call);
});

test('count blur preserves the next field and refreshes only after editing ends in the same view',()=>{
  const html=fs.readFileSync(require.resolve('../index.html'),'utf8'),callbacks=[];
  let renders=0;const context={S:{tab:'bar',bSub:'count',countCat:'Vodka'},document:{activeElement:{tagName:'INPUT'}},setTimeout:fn=>callbacks.push(fn),render:()=>renders++};
  vm.runInNewContext(html.slice(html.indexOf('function pgCountInputBlur'),html.indexOf('function pgOpenManualAdjustment'))+';this.blur=pgCountInputBlur;',context);
  context.blur();assert.equal(renders,0);callbacks.shift()();assert.equal(renders,0);
  context.document.activeElement={tagName:'BODY'};context.blur();callbacks.shift()();assert.equal(renders,1);
  context.blur();context.S.countCat='Rum';callbacks.shift()();assert.equal(renders,1);
  const countUi=html.slice(html.indexOf('function rCatCount'),html.indexOf('function pgOrderLine'));
  assert.equal((countUi.match(/onblur:pgCountInputBlur/g)||[]).length,4);assert.doesNotMatch(countUi,/onblur:function\(\)\{render/);
});
