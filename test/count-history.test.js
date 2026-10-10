const test=require('node:test');
const assert=require('node:assert/strict');
const H=require('../count-history.js');
const stoli={name:'Stoli Vodka',pack:12,unit:'Case',bottleMl:1000,dist:'Bellows/WI'};
const cfg=p=>p.packaging||{};
const t=Date.parse('2026-10-01T12:00:00Z'),end=t+7*86400000;
function order(id,at,counts,items){return {id:at,draftId:id,orderType:'bar',counts,items,inventorySnapshot:H.capture([stoli],counts,cfg,at)};}
function compare(rows,journal=[],now=70,product=stoli){return H.compare(rows,product,cfg(product),journal,H.timeline(rows,product,cfg(product),journal)[0],H.value(product,{[product.name]:now},cfg(product)),end,[stoli],cfg);}
function receipt(q,at=t+86400000,extra={}){return {id:'r',kind:'receipt',batchId:'batch1',orderKey:'one',vendor:'Bellows/WI',receivedAt:new Date(at).toISOString(),savedAt:new Date(at).toISOString(),lines:[{...H.value(stoli,{'Stoli Vodka':q},{}),sourceProductId:H.id(stoli)}],...extra};}
const one=()=>order('one',t,{'Stoli Vodka':96},[{...stoli,finalOrderQty:2}]);
test('prepared history preserves estimates, receipts, corrections, and delivery date boundaries',()=>{
  for(const journal of [[],[receipt(24)],[receipt(12)],[receipt(0)],[receipt(24,end+86400000)],[receipt(24),receipt(12,t+86400000,{id:'new',savedAt:new Date(t+2*86400000).toISOString()})]]){
    const history=[one()],args=[history,stoli,{},journal,H.timeline(history,stoli,{},journal)[0],H.value(stoli,{'Stoli Vodka':70},{}),end,[stoli],cfg];
    assert.deepEqual(H.compare(...args,H.prepare(history,journal,[stoli],cfg)),H.compare(...args));
  }
});
test('96 bottles + 2 twelve-bottle cases - 70 = estimated 50, then confirmed 50',()=>{
  let r=compare([one()]);assert.equal(r.used,50);assert.equal(r.assumed,24);assert.equal(r.estimated,true);assert.equal(r.perDay,50/7);
  r=compare([one()],[receipt(24)]);assert.equal(r.used,50);assert.equal(r.received,24);assert.equal(r.assumed,0);assert.equal(r.estimated,false);
});
test('blank is missing; an explicit zero is saved and compared',()=>{
  assert.equal(H.value(stoli,{'Stoli Vodka':''},{}),null);assert.equal(H.value(stoli,{},{}),null);
  assert.equal(H.value(stoli,{'Stoli Vodka':0},{}).quantity,0);assert.equal(compare([one()],[],0).used,120);
});
test('snapshots preserve counts even when the item needs no order',()=>{
  let o=order('one',t,{'Stoli Vodka':96},[]);assert.equal(H.timeline([o],stoli,{},[])[0].quantity,96);assert.equal(compare([o]).used,26);
});
test('an intervening Merchants order never breaks a Bar count comparison',()=>{
  const other={draftId:'merchants',id:t+86400000,counts:{Limes:30},items:[{name:'Limes',qty:2,unit:'Case',pack:1}]};
  assert.equal(H.timeline([one(),other],stoli,{},[]).length,1);assert.equal(compare([one(),other]).used,50);
});
test('all orders between counts are included once, with stable draft deduplication',()=>{
  const second={...one(),draftId:'two',id:t+86400000,inventorySnapshot:undefined,counts:{}};
  assert.equal(compare([one(),second,one()]).used,74);
});
test('late delivery from an earlier order belongs to the actual receiving period',()=>{
  let old={...one(),id:t-86400000,draftId:'old',inventorySnapshot:undefined,counts:{}};
  const recent=order('count',t,{'Stoli Vodka':96},[]),r=receipt(24,t+86400000,{orderKey:'old'});
  assert.equal(compare([old,recent],[r]).used,50);
});
test('delivery after ending count is excluded without assuming it arrived earlier',()=>{
  const r=compare([one()],[receipt(24,end+86400000)]);assert.equal(r.received,0);assert.equal(r.assumed,0);assert.equal(r.used,26);
});
test('short delivery, confirmed zero, and edited receipt do not double count',()=>{
  assert.equal(compare([one()],[receipt(12)]).used,38);
  assert.equal(compare([one()],[receipt(0)]).used,26);
  const edited=receipt(12,t+86400000,{id:'r2',savedAt:new Date(t+2*86400000).toISOString()});
  assert.equal(compare([one()],[receipt(24),edited]).received,12);
});
test('separate partial deliveries retain their own timestamps',()=>{
  const first=receipt(12),second=receipt(12,end+86400000,{id:'r2',batchId:'batch2'});
  assert.equal(compare([one()],[first,second]).received,12);
});
test('substitutions count toward the product received, not the product ordered',()=>{
  const rum={name:'Rum',unit:'Bottle',pack:12,bottleMl:1000};
  const r=receipt(24);r.lines=[{...H.value(rum,{Rum:12},{}),sourceProductId:H.id(stoli)}];
  assert.equal(compare([one()],[r]).received,0);
  const previous={at:t,quantity:20,metric:H.metric(rum,{})};
  assert.equal(H.compare([one()],rum,{},[r],previous,H.value(rum,{Rum:10},{}),end,[stoli,rum],cfg).used,22);
});
test('free Stoli flavored bottles are credited to the chosen flavor only',()=>{
  const flavor={...stoli,name:'Stoli Blu'},o={...one(),stoliFreeFlavor:'Stoli Blu'};
  const lines=H.vendorLines(o,'Bellows/WI',[stoli,flavor],cfg);assert.equal(lines.length,2);assert.equal(lines[0].quantity,24);assert.equal(lines[1].quantity,6);assert.equal(lines[1].bonus,true);
});
test('case and loose, nested cases, and half cases use a consistent quantity',()=>{
  const beer={name:'Beer',unit:'Case',pack:1,packaging:{mode:'caseLoose',unitsPerCase:24,countBasis:'units',unitLabel:'cans'}};
  assert.equal(H.value(beer,{'Beer::cases':1.5,'Beer::loose':3},cfg(beer)).quantity,39);
  assert.equal(H.ordered({...beer,finalOrderQty:2},beer,cfg(beer)).quantity,48);
  const soda={...beer,name:'Soda',packaging:{mode:'nestedCase',innerPacksPerCase:2,unitsPerInner:12,unitLabel:'cans'}};
  assert.equal(H.value(soda,{'Soda::cases':3,'Soda::inner':1,'Soda::loose':6},cfg(soda)).quantity,90);
  const lime={name:'Limes',pack:1,unit:'Case',packaging:{mode:'halfCase'}};
  assert.equal(H.value(lime,{'Limes::cases':2,'Limes::halves':1},cfg(lime)).quantity,2.5);
});
test('alternate bottle sizes are normalized and changed standard sizes block comparison',()=>{
  assert.equal(H.value(stoli,{'Stoli Vodka':96,'Stoli Vodka::alt750':4},{}).quantity,99);
  const smaller={...stoli,bottleMl:750};assert.match(compare([one()],[],70,smaller).unavailable,/size changed/);
});
test('negative usage remains an actionable mismatch, never hidden or clamped',()=>{assert.equal(compare([one()],[],150).negative,true);assert.equal(compare([one()],[],150).used,-30);});
test('count-only journal records survive independently of order history',()=>{
  const event={id:'standalone',kind:'count',snapshot:H.capture([stoli],{'Stoli Vodka':96},cfg,t)};
  assert.equal(H.timeline([],stoli,{},[event])[0].quantity,96);
});
test('receipt rejects blank, negative, invalid, and future amounts/dates',()=>{
  for(const quantity of [null,-1,NaN])assert.throws(()=>H.validateReceipt({...receipt(1),lines:[{...receipt(1).lines[0],quantity}]}));
  assert.throws(()=>H.validateReceipt(receipt(1,Date.now()+86400000)));
});
test('legacy counts with absent products stay absent and legacy units stay labeled estimates',()=>{
  const o={...one(),inventorySnapshot:undefined};assert.equal(H.timeline([o],stoli,{},[])[0].legacy,true);assert.equal(compare([o],[receipt(24)]).estimated,true);
});
test('count journal uses the existing tenant-scoped storage adapter',()=>{
  const P=require('../property-context.js'),data=new Map(),storage={getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v)};
  const a=P.scopedStorage(storage,'sapphire','sapphire'),b=P.scopedStorage(storage,'other','sapphire');
  a.setItem('pourgrid-count-journal-v1','sapphire counts');assert.equal(b.getItem('pourgrid-count-journal-v1'),null);b.setItem('pourgrid-count-journal-v1','other counts');assert.equal(a.getItem('pourgrid-count-journal-v1'),'sapphire counts');
});
test('new order snapshots are captured before completion clears a workspace',()=>{
  const html=require('node:fs').readFileSync('index.html','utf8');
  assert.ok(html.indexOf('inventorySnapshot:pgCountHistorySnapshot(activeType)')<html.indexOf('pgSubmitOrderSave(entry,activeType,isG).catch'));
});
