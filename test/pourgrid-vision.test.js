const test=require('node:test');
const assert=require('node:assert/strict');
const Vision=require('../pourgrid-vision.js');
const BI=require('../bottle-intelligence.js');

const products=[
  {id:'pine',name:'Pineapple Juice',dist:'Merchants',cat:'Mixer',unit:'Case',pack:8,buildTo:72,visionPackaging:{mode:'caseLoose',unitsPerCase:8,unitLabel:'bottles',buildToBasis:'units'}},
  {id:'orange',name:'Orange Juice',dist:'Merchants',cat:'Mixer',unit:'Case',pack:8,buildTo:72,visionPackaging:{mode:'caseLoose',unitsPerCase:8,unitLabel:'bottles',buildToBasis:'units'}}
];

test('category/vendor context is derived from the selected category only',()=>assert.deepEqual(Vision.context(products),{vendor:'Merchants',category:'Mixer'}));
test('recognition candidates contain only the selected category and vendor',()=>{const catalog=products.concat([{id:'lime',name:'Limes',dist:'Merchants',cat:'Fruit',pack:1},{id:'vodka',name:'Vodka',dist:'Bellows/WI',cat:'Vodka',pack:12}]);const ids=BI.candidates(catalog,Vision.context(products)).map(x=>x.productId);assert.deepEqual(ids,['pine','orange']);});
test('canceling leaves inventory unchanged because application is explicit',()=>{const before={keep:'7','Orange Juice':'4'},out=Vision.applyReviewedCounts(before,[],products);assert.deepEqual(out.counts,before);assert.deepEqual(out.updatedNames,[]);});
test('confirming updates only reviewed known products',()=>{const out=Vision.applyReviewedCounts({'Orange Juice':'4',untouched:'9'},[{productId:'pine',detectedCases:2,detectedLooseUnits:3}],products);assert.equal(out.counts['Pineapple Juice::cases'],'2');assert.equal(out.counts['Pineapple Juice::loose'],'3');assert.equal(out.counts['Orange Juice'],'4');assert.equal(out.counts.untouched,'9');assert.deepEqual(out.updatedNames,['Pineapple Juice']);});
test('unknown and removed products never update inventory',()=>{const out=Vision.applyReviewedCounts({safe:'1'},[{productId:'Unknown',unknown:true,detectedCases:5},{productId:'pine',removed:true,detectedCases:4}],products);assert.deepEqual(out.counts,{safe:'1'});});
test('review groups multiple packaging detections by catalog product',()=>{const rows=Vision.reviewRows([{productId:'pine',detectedCases:1,detectedLooseUnits:0,confidence:'high',sourcePhotoIds:['a']},{productId:'pine',detectedCases:0,detectedLooseUnits:3,confidence:'medium',sourcePhotoIds:['b']}],products);assert.equal(rows.length,1);assert.equal(rows[0].detectedCases,1);assert.equal(rows[0].detectedLooseUnits,3);assert.equal(rows[0].confidence,'medium');});
test('build-to explanation matches the actual order quantity calculation',()=>{const p={name:'Island Oasis',unit:'Case',pack:12,buildTo:72};const cfg={buildToBasis:'units',unitsPerCase:12,unitLabel:'cartons'},x=Vision.orderExplanation(p,3,cfg,0);assert.equal(x.counted,36);assert.equal(x.shortage,36);assert.equal(x.suggestedOrder,Vision.orderQuantity(p,3,cfg));assert.equal(x.suggestedOrder,3);assert.match(x.text,/At 12 cartons per case, order 3 cases/);});
test('full-case rounding is explained correctly',()=>{const p={name:'Frozen Mix',unit:'Case',pack:12,buildTo:72};const x=Vision.orderExplanation(p,55,{buildToBasis:'cases',unitLabel:'bottles'},0);assert.equal(x.shortage,17);assert.equal(x.suggestedOrder,2);assert.match(x.text,/rounds up to 2 cases/);});
