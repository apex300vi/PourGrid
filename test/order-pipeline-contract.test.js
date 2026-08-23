const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const Pipeline=require('../order-pipeline.js');

function catalog(){
  const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
  const match=html.match(/var PG_V12_PRODUCTS=(\[[^;]+\]);/);
  assert.ok(match,'catalog is parseable');
  const products=JSON.parse(match[1]);
  const routes=html.match(/var PG_CANONICAL_ORDER_ROUTES=(\{[\s\S]*?\n\});/);
  const configured=Function('return '+routes[1])();
  products.forEach(p=>{p._catalogName=p.name;const route=configured[p.name];p.catalogId=route&&route.id||p.id||'catalog:'+p.name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');if(route)Object.assign(p,route);});
  return products;
}

test('every active catalog product survives Review, email, save, and History routing exactly once',()=>{
  const products=catalog(),rows=Pipeline.reconcile(products,()=>1);
  assert.equal(rows.length,products.length);
  assert.equal(new Set(rows.map(r=>r.productId)).size,products.length);
  assert.ok(rows.every(r=>r.quantity===1&&r.workspace&&r.emailSection));
  const report=Pipeline.audit(products,()=>1);
  assert.equal(report.dropped.length,0);assert.equal(report.duplicates.length,0);assert.equal(report.missingConfiguration.length,0);
});

test('all Gatorade and Florida Natural products route once to West Indies',()=>{
  const products=catalog().filter(p=>/^Gatorade|^Florida's Natural/.test(p.name)),rows=Pipeline.reconcile(products,()=>1);
  assert.equal(rows.length,9);assert.ok(rows.every(r=>r.workspace==='bar'&&r.emailSection==='West Indies'&&r.quantity===1));
  assert.ok(rows.some(r=>r.name==='Gatorade Fruit Punch 20oz'));
});

test('six generic liqueur identities route only to Shared / Not specified',()=>{
  const names=['Amaretto','Blue Curacao','Creme de Cacao','Irish Cream','Peach Schnapps','Triple Sec'];
  const products=catalog().filter(p=>names.includes(p.name)),rows=Pipeline.reconcile(products,()=>1);
  assert.equal(rows.length,6);assert.ok(rows.every(r=>r.emailSection===Pipeline.SHARED));assert.ok(!rows.some(r=>r.emailSection==='West Indies'));
  const blue=products.find(p=>p.name==='Blue Curacao');blue.name='Blue Curaçao';assert.equal(Pipeline.emailSection(blue),Pipeline.SHARED);
});

test('missing vendor falls back visibly to Shared instead of dropping',()=>{
  const p={id:'catalog:future',name:'Future product',dist:null};
  assert.deepEqual(Pipeline.reconcile([p],()=>2),[{productId:'catalog:future',name:'Future product',workspace:'bar',vendor:null,emailSection:Pipeline.SHARED,quantity:2}]);
});

test('production build publishes the canonical order pipeline asset',()=>{
  const build=fs.readFileSync(path.join(__dirname,'..','scripts','build-static.mjs'),'utf8');
  assert.match(build,/['"]order-pipeline\.js['"]/);
});
