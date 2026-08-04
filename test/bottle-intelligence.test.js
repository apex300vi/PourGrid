const test=require('node:test');
const assert=require('node:assert/strict');
const BI=require('../bottle-intelligence.js');

const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const result=(id,cases,loose,signature,overrides={})=>Object.assign({productId:'juice-pineapple',packagingType:'sealed-case',detectedCases:cases,detectedLooseUnits:loose,confidence:'high',sourcePhotoIds:[id],shortEvidenceCode:signature},overrides);
const located=(value,photoId,locationId)=>Object.assign(value,{_photoContext:{photoId,locationId,overlapGroup:''}});

test('three photos are processed concurrently within the performance budget',async()=>{
  let active=0,peak=0;const start=Date.now(),progress=[];
  const out=await BI.run({photos:[{id:'a'},{id:'b'},{id:'c'}],concurrency:3,onProgress:event=>progress.push(event),analyze:async(_,id)=>{active++;peak=Math.max(peak,active);await delay(35);active--;return result(id,1,0,id);}});
  assert.equal(peak,3);assert.equal(out.completedPhotoCount,3);assert.ok(Date.now()-start<150);assert.deepEqual(progress.filter(x=>x.stage==='merging').map(x=>x.status),['started','complete']);
});

test('one timeout preserves two successful, reviewable partial results',async()=>{
  const out=await BI.run({photos:[{id:'a'},{id:'slow'},{id:'c'}],perPhotoTimeoutMs:30,batchTimeoutMs:100,analyze:(_,id)=>id==='slow'?new Promise(()=>{}):Promise.resolve(result(id,1,0,id))});
  assert.equal(out.completedPhotoCount,2);assert.equal(out.partial,true);assert.deepEqual(out.unfinishedPhotos.map(x=>x.photoId),['slow']);assert.ok(out.results.length);
});

test('all active photos become one timeout each when the batch ceiling expires',async()=>{
  const out=await BI.run({photos:[{id:'a'},{id:'b'},{id:'c'}],concurrency:3,perPhotoTimeoutMs:500,batchTimeoutMs:20,analyze:()=>new Promise(()=>{})});
  assert.equal(out.completedPhotoCount,0);assert.equal(out.partial,true);assert.deepEqual(out.unfinishedPhotos.map(x=>[x.photoId,x.status]),[['a','timeout'],['b','timeout'],['c','timeout']]);assert.equal(new Set(out.unfinishedPhotos.map(x=>x.photoId)).size,3);
});

test('late AI responses and progress are ignored after finalization',async()=>{
  const progress=[];let release;
  const late=new Promise(resolve=>{release=resolve;});
  const out=await BI.run({photos:[{id:'late'}],batchTimeoutMs:15,perPhotoTimeoutMs:500,onProgress:event=>progress.push(event),analyze:()=>late});
  const countAtReturn=progress.length;release(result('late',9,0,'LATE'));await delay(20);
  assert.equal(out.completedPhotoCount,0);assert.equal(out.results.length,0);assert.equal(out.unfinishedPhotos.length,1);assert.equal(progress.length,countAtReturn);
});

test('A/B/B signatures compare against all prior observations',()=>{
  const out=BI.merge([result('a',1,0,'A'),result('b1',2,0,'B'),result('b2',2,0,'B')]);
  assert.equal(out.results[0].detectedCases,3);assert.deepEqual(out.results[0].evidenceSignatures,['A','B']);assert.equal(out.deduplicationDecisions.length,1);assert.deepEqual(out.deduplicationDecisions[0].photos,['b1','b2']);
});

test('deduplication compares converted units using editable unitsPerCase',()=>{
  const caseView=Object.assign(result('case',1,0,'PACK'),{_unitsPerCase:8}),looseView=Object.assign(result('loose',0,6,'PACK'),{_unitsPerCase:8});
  const out=BI.merge([caseView,looseView]);assert.equal(out.results[0].detectedCases,1);assert.equal(out.results[0].detectedLooseUnits,0);
});

test('weak evidence signatures never prove duplication',()=>{
  for(const signature of ['', 'UNSPECIFIED','UNKNOWN','unreadable','blank']){
    const out=BI.merge([result('a',1,0,signature),result('b',1,0,signature)]);assert.equal(out.results[0].detectedCases,2,signature);
  }
});

test('same product in distinct shelf locations is summed',()=>{
  const out=BI.merge([located(result('a',1,0,'SAME'),'a','shelf-1'),located(result('b',1,0,'SAME'),'b','shelf-2')]);
  assert.equal(out.results[0].detectedCases,2);assert.equal(out.deduplicationDecisions.length,0);assert.deepEqual(out.results[0].sourcePhotoIds,['a','b']);
});

test('separate packaging variants remain distinct',()=>{
  const out=BI.merge([result('a',1,0,'CASE',{packagingType:'sealed-case'}),result('b',0,6,'BOTTLES',{packagingType:'loose-bottle'})]);
  assert.equal(out.results.length,2);assert.deepEqual(out.results.map(x=>x.packagingType).sort(),['loose-bottle','sealed-case']);
});

test('stable catalog IDs survive candidate creation and merge',()=>{
  const list=BI.candidates([{id:'sku-123',name:'Editable display name',dist:'Merchants',cat:'Mixer',pack:8}],{vendor:'Merchants'});
  assert.equal(list[0].productId,'sku-123');assert.equal(list[0].displayName,'Editable display name');assert.equal(BI.merge([result('a',1,0,'A',{productId:list[0].productId})]).results[0].productId,'sku-123');
});

test('catalog entries without IDs retain name fallback compatibility',()=>{
  assert.equal(BI.candidates([{name:'Fruit Punch',dist:'Merchants',cat:'Mixer',pack:8}],{vendor:'Merchants'})[0].productId,'Fruit Punch');
});

test('known eight-unit case remains one case, not eight loose bottles',()=>{
  const value=BI.validate(result('a',1,0,'SEALED-8'),'a');assert.equal(value.detectedCases,1);assert.equal(value.detectedLooseUnits,0);
});

test('compact request permits only required fields and requests no prose',()=>{
  const req=BI.request({base64:'x',mediaType:'image/jpeg'},'a',[]);assert.deepEqual(req.responseFormat.fields,BI.RESPONSE_FIELDS);assert.equal(JSON.stringify(req).includes('explanation'),false);assert.equal(JSON.stringify(req).includes('paragraph'),false);
});

test('one category photo can return multiple compact product detections',async()=>{
  const out=await BI.run({photos:[{id:'category-a'}],unitsPerCaseByProduct:{pine:8,orange:8},analyze:()=>({results:[result('category-a',1,2,'PINE',{productId:'pine'}),result('category-a',2,0,'ORANGE',{productId:'orange'})]})});
  assert.equal(out.completedPhotoCount,1);assert.equal(out.results.length,2);assert.deepEqual(out.results.map(x=>x.productId).sort(),['orange','pine']);
});
