'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');

function slice(from,to){return html.slice(html.indexOf(from),html.indexOf(to));}

test('only explicitly configured bulk citrus inherits half-case counting',()=>{
  const source=slice('var PG_BULK_FRUIT','function pgCountKey');
  const context={PG_PACKAGING:{},PourGridProductPersistence:{resolve:()=>null},pgCatalogPackagingEdits:()=>({}),pgIsMerchantProduct:product=>product&&product.dist==='Merchants',Number};
  vm.runInNewContext(source+';this.pack=pgPack;this.bulk=pgIsBulkFruit;',context);
  ['Limes','Lemons','Oranges','Grapefruits'].forEach(name=>assert.equal(context.pack({name,cat:'Fruit',dist:'Merchants',unit:'Case',pack:1}).mode,'halfCase'));
  assert.equal(context.pack({name:'Maraschino Cherries',cat:'Fruit',dist:'Merchants',unit:'Case',pack:4}).mode,'caseLoose');
  assert.equal(context.pack({name:'Pineapple Juice',cat:'Mixer',dist:'Merchants',unit:'Case',pack:8}).mode,'caseLoose');
  assert.equal(context.pack({name:'Unknown Mixer',cat:'Mixer',dist:'Merchants',unit:'Case'}).mode,'invalid');
  assert.equal(context.bulk({name:'Fruit Punch',cat:'Mixer'}),false);
});

test('Merchants exact counts convert cases plus loose units at multiple pack sizes',()=>{
  const source=slice('function pgCountKey','function pgFmtFraction');
  const context={S:{counts:{}},pgPack:p=>p.packaging,Number,Math,isNaN,isFinite};
  vm.runInNewContext(source+';this.physical=pgPhysicalCountFrom;',context);
  [1,4,8,12,24].forEach(per=>{
    const p={name:'P'+per,packaging:{mode:'caseLoose',unitsPerCase:per,countBasis:'units'}};
    const counts={[p.name+'::cases']:'1',[p.name+'::loose']:'5'};
    assert.equal(context.physical(counts,p),per+5);
    assert.equal(context.physical({[p.name+'::cases']:'0',[p.name+'::loose']:'0'},p),0);
  });
});

test('invalid order math remains null and cannot render Order null CASE',()=>{
  const calculation=slice('function cq','// Computes the FINAL order quantity');
  const context={S:{},pgHasPhysicalCount:()=>true,pgPack:()=>({mode:'caseLoose'}),pgVisionProducts:()=>[{buildTo:12}],PourGridVision:{orderQuantity:()=>NaN},Number};
  vm.runInNewContext(calculation+';this.calculate=cq;',context);
  assert.equal(context.calculate({name:'Broken'},'4'),null);
  assert.match(html,/if\(has&&qty!==null\)/);
});

test('Bottle Intelligence validates required configuration before storage and preserves entered form',()=>{
  const editor=slice('function pgCommitProductEdit','function pgResetProductEdit');
  ['Build-to quantity','Pack or case size','Loose units per large unit','Nested-case counting','Half-case estimation','Case or package cost','Menu or selling price'].forEach(message=>assert.match(editor,new RegExp(message)));
  assert.ok(editor.indexOf('var all=pgCatalogEdits()')>editor.indexOf('if(!Number.isFinite(build)'));
  assert.match(editor,/pgPersistDraft\(pgDraftTypeForProduct\(product\)\)/);
  assert.match(html,/caseCost/);assert.match(html,/sellPrice/);assert.match(html,/pge-bulk-fruit/);
});

test('quick adjustments are present, accessible, persistent, and removable at the calculated quantity',()=>{
  const order=slice('function rOrderTab','function calcSuggestedBuildTos');
  const step=slice('function pgStepManualAdjustment','function pgDraftWorkState');
  assert.match(order,/ap\(qtyWrap,qm,qb,qp,adjust\)/);
  assert.match(order,/pg-order-step/);assert.match(order,/aria-label/);assert.match(order,/qm\.disabled=Number\(p\.adjQty\)<=0/);
  assert.match(step,/if\(base\+next<0\)return false/);assert.match(step,/if\(next===0\)\{delete adjustments/);assert.match(step,/pgPersistDraft\(type,next===0\?\[product\.name\]:\[\]\)/);
  const setter=slice('function pgAdjustmentForFinalQuantity','function pgPurchasePartsText'),sheet=slice('function pgOpenManualAdjustment','function pgOpenAdjustmentPicker');
  assert.match(setter,/desired-\(Number\(baseQty\)\|\|0\)/);assert.match(sheet,/Save quantity/);assert.match(sheet,/Use calculated order/);assert.match(order,/pg-order-value/);assert.match(order,/Set final order quantity for/);
});

test('detailed Add Item picker contains only products missing from the calculated order',()=>{
  const picker=slice('function pgOpenAdjustmentPicker','function pgCountTypeForProduct');
  assert.match(picker,/filter\(function\(product\)\{return !pgOrderItemVisible\(pgOrderItem\(product\)\)/);
  assert.match(picker,/Add missing product/);assert.match(picker,/Use the − and \+ controls/);
});

test('vendor-facing formatters use Bottle and Bottles without the banned phrase',()=>{
  const output=slice('function pgPurchasePartsText','function pgSetManualAdjustment');
  assert.doesNotMatch(output,/individual/i);
  assert.doesNotMatch(html,/Individual bottle/i);
  assert.match(output,/pgPlural\(loose,looseUnit/);
});

test('mobile clearance is measured from sticky action, navigation and visual viewport',()=>{
  assert.match(html,/--pg-bottom-nav-clearance:calc\(var\(--pg-nav-height\) \+ var\(--pg-action-height\) \+ 20px\)/);
  assert.match(html,/getBoundingClientRect\(\)\.height/);assert.match(html,/window\.visualViewport/);
  assert.match(html,/pg-keyboard-open/);assert.match(html,/closest\("\.pg-count-card"\)/);assert.match(html,/scrollIntoView\(\{block:"start"/);
  assert.match(html,/safe-area-inset-bottom/);assert.match(html,/\.ilist\.pg-count-list\{padding-bottom:calc\(var\(--pg-nav-height\) \+ var\(--pg-action-height\)/);
  assert.doesNotMatch(html,/new ResizeObserver\(pgSyncViewportClearance\)/);
  assert.doesNotMatch(html,/new MutationObserver\(\(\)=>requestAnimationFrame\(s4AttachSearch\)\)/);
  assert.match(html,/typeof s4AttachSearch==="function"/);
  assert.doesNotMatch(html,/visualViewport\.addEventListener\("resize",pgSyncViewportClearance/);
  assert.doesNotMatch(html,/visualViewport\.addEventListener\("scroll",pgSyncViewportClearance/);
  assert.doesNotMatch(html,/venueImg=mk\("img","",\{src:"data:image\/png;base64/);
});

test('Bar and Merchants routing keeps workspace, category, and active navigation isolated',()=>{
  const routing=slice('function pgRouteSnapshot','var pgSheetGestures');
  const nav=slice('function rNav','function rSplash');
  assert.match(routing,/destination==="bar"[\s\S]*tab:"bar"/);assert.match(routing,/destination==="merchants"[\s\S]*tab:"merchants"/);
  assert.match(routing,/destination==="mixers"[\s\S]*tab:"merchants"/);assert.match(routing,/destination==="fruit"[\s\S]*tab:"merchants"/);
  assert.match(nav,/S\.screen==="app"&&S\.tab===t\.id/);
});

test('legacy half-case drafts are converted only when exact and otherwise retained with a warning',()=>{
  const migration=slice('function pgMigrateMerchantPackaging','pgMigrateMerchantPackaging();');
  assert.match(migration,/Number\.isInteger\(exactUnits\)/);assert.match(migration,/delete nc\[halfKey\]/);
  assert.match(migration,/cannot be converted to exact units/);assert.match(migration,/nc\[compatKey\]/);
});
