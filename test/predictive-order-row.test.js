'use strict';
// Renders the order-screen suggestion block against a minimal DOM shim, so a
// missing reference in the weekly order row fails here instead of on a phone
// behind the auth gate.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const Predictive=require('../predictive-ordering.js');
const HistoryAnalytics={adjustedBuildTo(base,multiplier){return Math.ceil(Number(base)*Number(multiplier)/100);}};

const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
function slice(from,to){
  const start=html.indexOf(from),end=html.indexOf(to);
  assert.notEqual(start,-1,from);assert.notEqual(end,-1,to);assert.ok(end>start,from+' before '+to);
  return html.slice(start,end);
}

function element(tag){
  const node={
    tagName:String(tag).toUpperCase(),className:'',id:'',style:{cssText:''},childNodes:[],attributes:{},
    _text:'',value:'',disabled:false,
    get textContent(){return node._text||node.childNodes.map(c=>c.textContent||'').join(' ');},
    set textContent(value){node._text=String(value);node.childNodes.length=0;},
    set innerHTML(value){node._html=String(value);},
    get innerHTML(){return node._html||'';},
    appendChild(child){assert.ok(child&&child.tagName,'appendChild received '+child);node.childNodes.push(child);return child;},
    setAttribute(name,value){node.attributes[name]=String(value);},
    getAttribute(name){return node.attributes[name];},
    querySelector(){return null;},querySelectorAll(){return [];},
    classList:{add(){},remove(){},contains(){return false;},toggle(){}}
  };
  return node;
}
function textOf(node){
  if(!node)return '';
  return [node._text||'',node._html||''].concat(node.childNodes.map(textOf)).join(' ');
}
function classesOf(node,found){
  found=found||[];
  if(!node)return found;
  if(node.className)found.push(node.className);
  node.childNodes.forEach(child=>classesOf(child,found));
  return found;
}

const DAY=86400000;
const AUGUST=Date.parse('2026-08-24T16:00:00Z');
const PRODUCT={name:'Cruzan Dark',dist:'CC1',cat:'Rum',unit:'Case',pack:12,buildTo:50};
const PACKAGING={mode:'caseLoose',unitsPerCase:12,countBasis:'units',buildToBasis:'units',
  largeUnit:'Case',looseUnit:'Bottle',unitLabel:'bottles'};

function weeklyHistory(weeks){
  return weeks.map((week,index)=>{
    const at=AUGUST-(weeks.length-index)*7*DAY;
    return {id:at,orderType:'bar',counts:{[PRODUCT.name]:String(week.count)},
      items:[{name:PRODUCT.name,unit:'Case',pack:12,orderQty:week.ordered,finalOrderQty:week.ordered,packaging:PACKAGING}]};
  }).reverse();
}

function harness(options){
  options=options||{};
  const context={
    Object,Array,String,Number,Math,JSON,Date,console:{warn(){},error(){}},
    document:{createElement:element,createTextNode:value=>{const node=element('#text');node.textContent=value;return node;}},
    window:{
      PourGridPredictiveOrdering:Predictive,
      PourGridHistory:HistoryAnalytics,
      POURGRID_AUTH_CONTEXT:{locationId:options.locationId||'loc-sapphire'}
    },
    S:{history:options.history||[],adjustments:{},adjustmentMeta:{}},
    pgEffectiveCount:()=>options.onHand===undefined?26:options.onHand,
    pgSeasonalProfileForProduct:()=>options.seasonalProfile||null,
    pgPack:()=>PACKAGING,
    pgPlural:(n,one,many)=>Math.abs(Number(n))===1?one:many,
    pgAdjustmentCapability:()=>({allowLoose:true,unitsPerCase:12,canonicalUnit:'case',rule:'caseLoose'}),
    pgPurchasePartsText:(product,cases,loose,sign)=>{
      const parts=[];
      if(cases)parts.push(cases+' '+(cases===1?'Case':'Cases'));
      if(loose)parts.push(loose+' '+(loose===1?'Bottle':'Bottles'));
      return parts.length?(sign||'')+parts.join(' + '):'0';
    }
  };
  const source=slice('function mk(tag,cls,attrs)','// Custom brand mark')
    +slice('function pgFinalPurchaseBreakdown(product,baseQty,manual)','function pgManualPurchaseText(product,manual,adjustment)')
    +slice('var PG_PREDICTIVE_CACHE=','function pgHalfCaseCountDetails(type)');
  vm.runInNewContext(source
    +';this.pgPredictiveSuggestion=pgPredictiveSuggestion;this.rPredictiveSuggestion=rPredictiveSuggestion;'
    +'this.pgPredictiveConfidenceLabel=pgPredictiveConfidenceLabel;this.PG_PREDICTIVE_CACHE=PG_PREDICTIVE_CACHE;',context);
  return context;
}

test('a sparse SKU renders a labelled build-to fallback with its reasoning',()=>{
  const app=harness({history:[],onHand:26});
  const suggestion=app.pgPredictiveSuggestion(PRODUCT);
  assert.equal(suggestion.basis,'par');
  const block=app.rPredictiveSuggestion(PRODUCT,suggestion);
  const text=textOf(block);
  assert.match(text,/Suggestion/);
  assert.match(text,/Build-to fallback/);
  assert.match(text,/2 Cases/);
  assert.match(text,/No comparable usage cycles yet/);
  assert.match(text,/nothing is filled in or sent until you set the quantity yourself/);
  assert.ok(classesOf(block).includes('pg-order-suggestion'));
  assert.match(block.getAttribute('aria-label'),/Suggestion only, not applied/);
  assert.equal(block.getAttribute('role'),'note');
});

test('a SKU with real history renders a projection, a trend, and the season',()=>{
  // Usage climbs from 12 to 24 bottles a week across eight counted cycles.
  const history=weeklyHistory([
    {count:60,ordered:1},{count:60,ordered:1},{count:60,ordered:1},{count:60,ordered:1},
    {count:60,ordered:2},{count:48,ordered:2},{count:36,ordered:2},{count:24,ordered:2},{count:12,ordered:2}
  ]);
  const app=harness({history,onHand:12});
  const suggestion=app.pgPredictiveSuggestion(PRODUCT);
  assert.equal(suggestion.basis,'history');
  assert.ok(suggestion.observations>=6);
  const text=textOf(app.rPredictiveSuggestion(PRODUCT,suggestion));
  assert.match(text,/Suggestion/);
  assert.match(text,/confidence/i);
  assert.match(text,/bottles a week over \d+ counted cycles/);
  assert.match(text,/August is historically a slower month in the USVI/);
  assert.match(text,/You order this about every 7 days/);
  assert.doesNotMatch(text,/undefined|NaN/);
});

test('the fallback quantity matches the build-to the order screen already shows',()=>{
  const app=harness({history:[],onHand:26});
  const suggestion=app.pgPredictiveSuggestion(PRODUCT);
  // 50 bottle build-to minus 26 on hand is 24 bottles: two 12-bottle cases.
  assert.equal(suggestion.suggestedPurchaseUnits,2);
});

test('an active manager seasonal profile moves the fallback build-to with it',()=>{
  const app=harness({history:[],onHand:26,seasonalProfile:{name:'Offseason',profileType:'Offseason',percentageMultiplier:60}});
  const suggestion=app.pgPredictiveSuggestion(PRODUCT);
  // 60% of a 50 bottle build-to is 30 bottles; 30 - 26 = 4 bottles => 1 case.
  assert.equal(suggestion.buildToSpace,30);
  assert.equal(suggestion.suggestedPurchaseUnits,1);
});

test('the suggestion is cached per count so a re-render does not recompute it',()=>{
  const history=weeklyHistory([{count:60,ordered:1},{count:48,ordered:1},{count:36,ordered:1},{count:24,ordered:1}]);
  const app=harness({history,onHand:24});
  const first=app.pgPredictiveSuggestion(PRODUCT);
  const second=app.pgPredictiveSuggestion(PRODUCT);
  assert.equal(first,second);
});

test('a suggestion that cannot be produced renders nothing at all',()=>{
  const app=harness({history:[],onHand:''});
  const suggestion=app.pgPredictiveSuggestion(PRODUCT);
  assert.equal(suggestion.suggestedPurchaseUnits,null);
  assert.equal(app.rPredictiveSuggestion(PRODUCT,suggestion),null);
  assert.equal(app.rPredictiveSuggestion(PRODUCT,null),null);
});

test('an engine failure degrades to no suggestion instead of breaking the order screen',()=>{
  const app=harness({history:[],onHand:26});
  app.window.PourGridPredictiveOrdering={suggest(){throw new Error('boom');}};
  app.PG_PREDICTIVE_CACHE.entries={};
  assert.equal(app.pgPredictiveSuggestion(PRODUCT),null);
});

test('the order row asks for a suggestion and renders it beside the count',()=>{
  // The suggestion is assembled into the row immediately after the line that
  // prints the count and the build-to, and before the quantity stepper.
  const assembly=/ap\(info,nm2,metaDiv,rPredictiveSuggestion\(p,pgPredictiveSuggestion\(p\)\),disclosure\);/;
  assert.match(html,assembly);
  const at=html.search(assembly),
        meta=html.indexOf('metaDiv.textContent="On hand: "+p.onHand+" \\u00b7 Build to: "+p.buildTo;'),
        stepper=html.indexOf('var qtyWrap=mk("div","pg-order-quantity");',at);
  assert.notEqual(meta,-1);
  assert.ok(meta<at&&at<stepper,`meta ${meta} < call ${at} < stepper ${stepper}`);
});

test('the Insights panel runs the same engine as the order row',()=>{
  const body=slice('function calcPredictiveOrder(history,products){','// \u2500\u2500 VENUE CORRECTION FACTORS');
  assert.match(body,/pgPredictiveSuggestion\(p\)/,'Insights delegates to the shared engine');
  assert.doesNotMatch(body,/avgWeekly|fullMoon/,'the old ad-hoc predictor is gone');
});

test('no surface writes a predicted quantity into the order',()=>{
  const panel=slice('function rPredictiveBody(result,barOrdersCount,products){','function rBuildToBody(suggestions){');
  assert.doesNotMatch(panel,/adjustments:/,'the panel no longer bulk-fills adjustments');
  assert.doesNotMatch(panel,/pgSetManualAdjustment|newAdj/,'the panel sets no quantities');
  assert.match(panel,/These are suggestions only/,'the panel says it is advice');
  assert.match(panel,/Review on the Order Tab/,'the button only navigates');
});
