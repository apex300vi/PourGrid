'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const Vision=require('../pourgrid-vision.js');
const Persistence=require('../product-persistence.js');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const catalogSource=html.slice(html.indexOf('var PG_V12_PRODUCTS='),html.indexOf('// Explicit beer eligibility'));
const Catalog=require('../property-catalog.js');
function memoryStore(){const values=new Map();return {getItem:key=>values.has(key)?values.get(key):null,setItem:(key,value)=>values.set(key,String(value)),removeItem:key=>values.delete(key)};}
const catalogContext={PourGridProductPersistence:{stableId:product=>product.name},PourGridPropertyCatalog:Catalog,PG_PROPERTY:{seedCatalog:'sapphire-v12'},PG_STORE:memoryStore(),Object,Array,String,Number,JSON};
vm.runInNewContext(catalogSource+';this.catalog=PRODUCTS;',catalogContext);
const catalog=Array.from(catalogContext.catalog,product=>JSON.parse(JSON.stringify(product)));
const florida=catalog.filter(p=>p.name.startsWith("Florida's Natural "));
const finest=catalog.filter(p=>p.name.startsWith('Finest Call '));

function functionSource(name){
  const start=html.indexOf(`function ${name}(`);assert.notEqual(start,-1,name);
  const brace=html.indexOf('{',start);let depth=0,quote=null,escape=false;
  for(let i=brace;i<html.length;i++){
    const ch=html[i];if(quote){if(escape)escape=false;else if(ch==='\\')escape=true;else if(ch===quote)quote=null;continue;}
    if(ch==='"'||ch==="'"||ch==='`'){quote=ch;continue;}if(ch==='{')depth++;if(ch==='}'&&--depth===0)return html.slice(start,i+1);
  }
  throw new Error(`Unclosed function ${name}`);
}
function physical(product,cases,loose){return cases*product.packaging.unitsPerCase+loose;}

test('authoritative V12 catalog explicitly configures every corrected product family',()=>{
  assert.deepEqual(florida.map(p=>p.name),["Florida's Natural OJ","Florida's Natural Fruit Splash","Florida's Natural Cranberry","Florida's Natural Kiwi"]);
  assert.deepEqual(finest.map(p=>p.name),['Finest Call Grenadine','Finest Call Margarita Mix','Finest Call Sweet & Sour']);
  for(const p of florida){assert.equal(p.pack,12);assert.equal(p.bottleSizeLabel,'12 fl oz');assert.equal(p.bottleMl,354.882);assert.equal(p.purchaseRule,'caseOnly');assert.deepEqual({...p.packaging},{mode:'caseLoose',unitsPerCase:12,largeUnit:'Case',largeUnitLabel:'cases',looseUnit:'Bottle',unitLabel:'bottles',countBasis:'units',buildToBasis:'cases',legacyCountBasis:'ambiguous'});}
  for(const p of finest){assert.equal(p.pack,12);assert.equal(p.bottleSizeLabel,'1 L');assert.equal(p.bottleMl,1000);assert.equal(p.purchaseRule,'caseOnly');assert.equal(p.packaging.mode,'caseLoose');assert.equal(p.packaging.unitsPerCase,12);assert.equal(p.packaging.countBasis,'units');assert.equal(p.packaging.buildToBasis,'units');assert.equal(p.packaging.legacyCountBasis,'units');}
  assert.equal([...florida,...finest].filter(p=>p.pack===1).length,0);
  assert.equal(finest.some(p=>/12\s*fl?\s*oz/i.test(p.bottleSizeLabel)),false);
  assert.equal(florida.some(p=>/^1\s*l$/i.test(p.bottleSizeLabel)),false);
  const unrelated=catalog.find(p=>p.name==='Zing Zang');
  const {_catalogName,catalogId,...unrelatedData}=unrelated;
  assert.deepEqual(unrelatedData,{name:'Zing Zang',dist:'Bellows/WI',cat:'Mixer',buildTo:10,pack:12,unit:'Case',note:''});
});

test('Florida price metadata preserves case cost and derives the correct bottle value',()=>{
  const prices=JSON.parse(html.match(/var PRICES=(\{.*?\});\r?\nfunction/s)[1]);
  for(const p of florida)assert.deepEqual(prices[p.name],{case:21.75,pack:12,bottle:1.8125});
});

test('cases plus loose bottles preserve exact inventory including loose values above eleven',()=>{
  for(const p of [...florida,...finest]){
    assert.equal(physical(p,0,5),5,p.name);assert.equal(physical(p,1,0),12,p.name);assert.equal(physical(p,1,5),17,p.name);assert.equal(physical(p,2,3),27,p.name);
    assert.equal(physical(p,1,15),27,p.name);
  }
});

test('Florida build-tos are cases while exact case-plus-bottle inventory still drives whole-case orders',()=>{
  const expectedTargets={"Florida's Natural OJ":3,"Florida's Natural Fruit Splash":2,"Florida's Natural Cranberry":2,"Florida's Natural Kiwi":2};
  for(const p of florida){
    const targetCases=expectedTargets[p.name],targetBottles=targetCases*12;
    assert.equal(p.buildTo,targetCases,p.name);assert.equal(p.packaging.buildToBasis,'cases',p.name);assert.equal(p.packaging.countBasis,'units',p.name);
    assert.equal(Vision.orderQuantity(p,0,p.packaging),targetCases,p.name+' empty');
    assert.equal(Vision.orderQuantity(p,targetBottles-1,p.packaging),1,p.name+' one bottle short');
    assert.equal(Vision.orderQuantity(p,targetBottles,p.packaging),0,p.name+' at target');
    assert.equal(Vision.orderQuantity(p,targetBottles+5,p.packaging),0,p.name+' above target');
  }
});

test('unit-basis case-only products still round bottle shortages to whole cases',()=>{
  for(const original of finest)for(const [shortage,expected] of [[0,0],[1,1],[11,1],[12,1],[13,2],[24,2]]){
    const p={...original,buildTo:30};const onHand=30-shortage;
    assert.equal(Vision.orderQuantity(p,onHand,p.packaging),expected,`${p.name}: shortage ${shortage}`);
    assert.equal(Object.is(Vision.orderQuantity(p,onHand,p.packaging),-0),false,`${p.name}: no negative zero`);
  }
  const context={pgPack:p=>p.packaging,pgIsMerchantProduct:p=>p.dist==='Merchants',Number,Math};
  vm.runInNewContext(functionSource('pgAdjustmentCapability')+';this.capability=pgAdjustmentCapability;',context);
  for(const p of [...florida,...finest]){const cap=context.capability(p);assert.equal(cap.rule,'caseOnly');assert.equal(cap.allowCases,true);assert.equal(cap.allowLoose,false);assert.equal(cap.unitsPerCase,12);assert.equal(cap.canonicalUnit,'case');}
});

test('stale device-specific Florida packaging edits are upgraded without changing counts or build-to values',()=>{
  const storage=new Map();
  const localStorage={getItem:key=>storage.has(key)?storage.get(key):null,setItem:(key,value)=>storage.set(key,String(value))};
  const stale={catalogId:'floridas-natural-oj',originalName:"Florida's Natural OJ",name:"Florida's Natural OJ",buildTo:3,pack:12,packaging:{mode:'caseLoose',unitsPerCase:12,countBasis:'units',buildToBasis:'units'}};
  const edits={[Persistence.stableId(florida[0])]:stale};
  Persistence.saveVerified(localStorage,edits);
  const context={PRODUCTS:[florida[0]],localStorage,PG_STORE:localStorage,PourGridProductPersistence:Persistence,pgCatalogEdits:()=>Persistence.read(localStorage),pgSaveCatalogEdits:value=>Persistence.saveVerified(localStorage,value),pgRequiresCaseBuildTo:product=>product.name.startsWith("Florida's Natural "),pgEnforceBuildToBasis:(product,packaging)=>({...packaging,buildToBasis:'cases'})};
  vm.runInNewContext(functionSource('pgMigrateFloridaCaseBuildTos')+';this.migrate=pgMigrateFloridaCaseBuildTos;',context);
  context.migrate();
  const upgraded=Persistence.resolve(Persistence.read(localStorage),florida[0]);
  assert.equal(upgraded.buildTo,3);assert.equal(upgraded.pack,12);assert.equal(upgraded.packaging.countBasis,'units');assert.equal(upgraded.packaging.buildToBasis,'cases');
  assert.equal(localStorage.getItem('pourgrid-migration-floridas-natural-case-build-to-v1'),'complete');
});

test('stale bottle case-basis edits are upgraded without changing counts, build-tos, or package sizes',()=>{
  const storage=new Map(),localStorage={getItem:key=>storage.has(key)?storage.get(key):null,setItem:(key,value)=>storage.set(key,String(value))};
  const bottle=catalog.find(p=>p.name==='Bombay Sapphire Gin'),stale={catalogId:Persistence.stableId(bottle),name:bottle.name,buildTo:4,pack:12,packaging:{mode:'standard',unitsPerCase:12,countBasis:'units',buildToBasis:'cases'}};
  Persistence.saveVerified(localStorage,{[Persistence.stableId(bottle)]:stale});
  const context={PRODUCTS:[bottle],PG_STORE:localStorage,PourGridProductPersistence:Persistence,pgCatalogEdits:()=>Persistence.read(localStorage),pgSaveCatalogEdits:value=>Persistence.saveVerified(localStorage,value),pgEnforceBuildToBasis:(product,packaging)=>product.unit!=='Case'?({...packaging,buildToBasis:'units'}):packaging};
  vm.runInNewContext(functionSource('pgMigrateBottleBuildToUnits')+';this.migrate=pgMigrateBottleBuildToUnits;',context);context.migrate();
  const upgraded=Persistence.resolve(Persistence.read(localStorage),bottle);
  assert.equal(upgraded.buildTo,4);assert.equal(upgraded.pack,12);assert.equal(upgraded.packaging.countBasis,'units');assert.equal(upgraded.packaging.buildToBasis,'units');
  assert.equal(localStorage.getItem('pourgrid-migration-bottle-build-to-units-v2'),'complete');
});

test('legacy exact Finest Call counts convert without loss while ambiguous Florida counts are retained for confirmation',()=>{
  const context={PRODUCTS:[finest[0],florida[0]],pgPack:p=>p.packaging,pgCountKey:(n,s)=>n+'::'+s,pgWholeQuantity(raw){const text=String(raw??'').trim();return /^\d+$/.test(text)?{valid:true,blank:false,value:Number(text)}:{valid:false,blank:text==='',value:0};}};
  vm.runInNewContext(functionSource('pgCorrectedPackagingCounts')+';this.convert=pgCorrectedPackagingCounts;',context);
  const source={[finest[0].name]:'17',[florida[0].name]:'2'},result=context.convert(source).counts;
  assert.equal(result[finest[0].name],'17');assert.equal(result[finest[0].name+'::cases'],'1');assert.equal(result[finest[0].name+'::loose'],'5');
  assert.equal(result[florida[0].name],'2');assert.match(result[florida[0].name+'::compatibility'],/preserved.*ambiguous/i);
  const restored=context.convert(result).counts;assert.deepEqual({...restored},{...result});
  const excess={[finest[0].name]:'27',[finest[0].name+'::cases']:'1',[finest[0].name+'::loose']:'15'};
  const excessRestored=context.convert(excess).counts;assert.deepEqual({...excessRestored},excess);assert.equal(Number(excessRestored[finest[0].name+'::cases'])*12+Number(excessRestored[finest[0].name+'::loose']),27);
});

test('Bottle Intelligence exposes size, count method, and locked case-only purchasing',()=>{
  assert.match(html,/pgBottleSizeLabel\(p\).*bottle/);assert.match(html,/Count method/);assert.match(html,/Purchasing/);assert.match(html,/Bottles \(inventory only\)/);
  assert.match(html,/product\.purchaseRule==="caseOnly"/);assert.doesNotMatch(functionSource('pgAdjustmentCapability'),/startsWith\(['"]Finest|startsWith\(['"]Florida/);
});

test('Bud Light Cans keeps the stable catalog identity and current live-state associations',()=>{
  const bud=catalog.filter(p=>p.id==='catalog:bud-light');assert.equal(bud.length,1);assert.equal(bud[0].name,'Bud Light Cans');assert.equal(catalog.filter(p=>p.name==='Bud Light').length,0);
  assert.equal(bud[0].dist,'CC1');assert.equal(bud[0].cat,'Beer');assert.equal(bud[0].pack,1);assert.equal(bud[0].buildTo,2);
  assert.equal(Persistence.stableId({_catalogName:'Bud Light',name:'Bud Light'}),Persistence.stableId(bud[0]));
  const context={Object};vm.runInNewContext(functionSource('pgRenameSavedProductKeys')+';this.rename=pgRenameSavedProductKeys;',context);
  const migrated=context.rename({'Bud Light':'4','Bud Light::cases':'1','Bud Light::loose':'2','Other':'9'},'Bud Light','Bud Light Cans').value;
  assert.deepEqual({...migrated},{'Bud Light Cans':'4','Bud Light Cans::cases':'1','Bud Light Cans::loose':'2','Other':'9'});
  assert.match(functionSource('pgMigrateCurrentProductName'),/adjustments/);assert.match(functionSource('pgMigrateCurrentProductName'),/adjustmentMeta/);assert.match(functionSource('pgMigrateCurrentProductName'),/pourgrid-session/);
  assert.doesNotMatch(functionSource('pgRenameProductData'),/history|sbb-history/);
  assert.ok(html.includes('"Bud Light Cans":6.0'));assert.ok(html.includes('"Bud Light Cans":{"case":30.0'));
});

test('current output and search are safe from invalid quantities and obsolete product names',()=>{
  assert.doesNotMatch(html,/Order null CASE|Order undefined|Order NaN/);
  assert.doesNotMatch(html,/"Bud Light"\s*:/);
  assert.match(html,/textContent\.toLowerCase\(\)\.includes\(q\)/);
  assert.match(html,/querySelectorAll\('\.crow,\.orow,\.photo-item-row,\.icard'\)/);
  assert.ok('Bud Light Cans'.toLowerCase().includes('Bud Light'.toLowerCase()));
  for(const p of [...florida,...finest])assert.equal(p.unit,'Case');
});
