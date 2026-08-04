const test=require('node:test');
const assert=require('node:assert/strict');
const BI=require('../bottle-intelligence.js');

const result=(id,cases,loose,signature)=>({productId:'Pineapple Juice',packagingType:'sealed-case',detectedCases:cases,detectedLooseUnits:loose,confidence:'high',sourcePhotoIds:[id],shortEvidenceCode:signature});

test('three photos are processed concurrently within the performance budget',async()=>{
  let active=0,peak=0;
  const start=Date.now();
  const out=await BI.run({photos:[{id:'a'},{id:'b'},{id:'c'}],concurrency:3,analyze:async(_,id)=>{active++;peak=Math.max(peak,active);await new Promise(r=>setTimeout(r,35));active--;return result(id,1,0,id);}});
  assert.equal(peak,3);assert.equal(out.completedPhotoCount,3);assert.ok(Date.now()-start<100);
});

test('one timeout preserves two successful, reviewable partial results',async()=>{
  const out=await BI.run({photos:[{id:'a'},{id:'slow'},{id:'c'}],perPhotoTimeoutMs:30,batchTimeoutMs:100,analyze:(_,id)=>id==='slow'?new Promise(()=>{}):Promise.resolve(result(id,1,0,id))});
  assert.equal(out.completedPhotoCount,2);assert.equal(out.partial,true);assert.equal(out.unfinishedPhotos[0].photoId,'slow');assert.ok(out.results.length);
});

test('overlapping packaging signatures are deduplicated rather than summed',()=>{
  const out=BI.merge([result('a',1,2,'LOTUS-A1'),result('b',1,2,'LOTUS-A1')]);
  assert.equal(out.results[0].detectedCases,1);assert.equal(out.results[0].detectedLooseUnits,2);assert.equal(out.results[0].mergeStatus,'deduplicated');assert.equal(out.deduplicationDecisions.length,1);
});

test('known eight-unit case remains one case, not eight loose bottles',()=>{
  const value=BI.validate(result('a',1,0,'SEALED-8'),'a');
  assert.equal(value.detectedCases,1);assert.equal(value.detectedLooseUnits,0);
});

test('compact request permits only required fields and requests no prose',()=>{
  const req=BI.request({base64:'x',mediaType:'image/jpeg'},'a',[]);
  assert.deepEqual(req.responseFormat.fields,BI.RESPONSE_FIELDS);
  assert.equal(JSON.stringify(req).includes('explanation'),false);
  assert.equal(JSON.stringify(req).includes('paragraph'),false);
});

test('candidate catalog is scoped and Merchants mixers are prioritized',()=>{
  const list=BI.candidates([{name:'Vodka',dist:'Other',cat:'Vodka',pack:12},{name:'Fruit Punch',dist:'Merchants',cat:'Mixer',pack:8},{name:'Limes',dist:'Merchants',cat:'Fruit',pack:1}],{vendor:'Merchants'});
  assert.deepEqual(list.map(x=>x.productId),['Fruit Punch','Limes']);
});
