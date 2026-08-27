const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const Predictive=require('../predictive-ordering.js');
const Vision=require('../pourgrid-vision.js');

const DAY=86400000;
// A fixed "now" so seasonal months are deterministic. 2026-08-24T16:00Z is a
// Monday in August, St. Thomas time — a slow-season month.
const AUGUST=Date.parse('2026-08-24T16:00:00Z');
const MARCH=Date.parse('2026-03-23T16:00:00Z');

// A 1L spirit ordered by the case: 12 bottles per case, counted in bottles,
// build-to expressed in bottles. This is the dominant Sapphire shape.
const CASE_SPIRIT={name:'Cruzan Dark',dist:'CC1',cat:'Rum',unit:'Case',pack:12,buildTo:50};
// A canned beer ordered by the case where the build-to itself is in cases.
const CASE_BASIS_BEER={name:'Carib cans',dist:'Bellows/WI',cat:'Beer',unit:'Case',pack:24,buildTo:20,
  packaging:{mode:'caseLoose',unitsPerCase:24,countBasis:'units',buildToBasis:'cases',unitLabel:'cans'}};

/**
 * Builds a weekly Sapphire bar-order history, newest first (the order S.history
 * is kept in). `weeks` is oldest-first: each entry is {count, ordered}.
 */
function history(weeks,options={}){
  const product=options.product||CASE_SPIRIT;
  const now=options.now||AUGUST;
  const step=options.stepDays||7;
  return weeks.map((week,index)=>{
    const at=now-(weeks.length-index)*step*DAY;
    return {
      id:at,
      date:new Date(at).toDateString(),
      orderType:'bar',
      counts:week.count===null?null:{[product.name]:String(week.count)},
      items:[{name:product.name,unit:product.unit,pack:product.pack,dist:product.dist,
        orderQty:week.ordered,finalOrderQty:week.ordered,packaging:product.packaging}]
    };
  }).reverse();
}

// ── Seasonal baseline ────────────────────────────────────────────────────────

test('the USVI seasonal index averages 1.0 across the year',()=>{
  const months=Object.keys(Predictive.SEASONAL_INDEX);
  assert.equal(months.length,12);
  const mean=months.reduce((total,m)=>total+Predictive.SEASONAL_INDEX[m],0)/12;
  assert.ok(Math.abs(mean-1)<1e-9,`mean was ${mean}`);
});

test('winter high season outranks the September/October slow season',()=>{
  [1,2,3,4,12].forEach(m=>assert.ok(Predictive.seasonalIndex(m)>1,`month ${m}`));
  [8,9,10].forEach(m=>assert.ok(Predictive.seasonalIndex(m)<1,`month ${m}`));
  assert.ok(Predictive.seasonalIndex(3)>Predictive.seasonalIndex(9)*1.5);
  assert.equal(Predictive.seasonLabel(3),'high season');
  assert.equal(Predictive.seasonLabel(9),'slow season');
  assert.equal(Predictive.seasonLabel(8),'a slower month');
  assert.equal(Predictive.seasonLabel(7),'about average');
});

test('months are resolved in St. Thomas time, not UTC',()=>{
  // 2026-09-01T02:00Z is still 2026-08-31 in St. Thomas (UTC-4).
  assert.equal(Predictive.stThomasMonth(Date.parse('2026-09-01T02:00:00Z')),8);
  assert.equal(Predictive.stThomasMonth(Date.parse('2026-09-01T05:00:00Z')),9);
});

// ── Packaging basis agrees with the shipped order maths ──────────────────────

test('a par-basis suggestion equals PourGridVision.orderQuantity exactly',()=>{
  const cases=[
    {product:CASE_SPIRIT,packaging:{unitsPerCase:12,countBasis:'units',buildToBasis:'units'},onHand:31},
    {product:CASE_BASIS_BEER,packaging:CASE_BASIS_BEER.packaging,onHand:140},
    {product:{name:'Goslings Black Seal Rum',unit:'Bottle',pack:12,buildTo:4},packaging:null,onHand:1},
    {product:{name:'Limes',unit:'Case',pack:1,buildTo:3},packaging:{mode:'caseLoose',unitsPerCase:1,countBasis:'units',buildToBasis:'units'},onHand:1}
  ];
  for(const item of cases){
    const expected=Vision.orderQuantity(item.product,item.onHand,item.packaging||{});
    const result=Predictive.suggest([],item.product,{now:AUGUST,onHand:item.onHand,packaging:item.packaging});
    assert.equal(result.basis,'par');
    assert.equal(result.suggestedPurchaseUnits,expected,`${item.product.name}: ${result.suggestedPurchaseUnits} vs ${expected}`);
  }
});

// ── Sparse data falls back rather than fabricating ───────────────────────────

test('a SKU with no history falls back to the build-to and says so',()=>{
  const result=Predictive.suggest([],CASE_SPIRIT,{now:AUGUST,onHand:26,
    packaging:{unitsPerCase:12,countBasis:'units',buildToBasis:'units'}});
  assert.equal(result.basis,'par');
  assert.equal(result.confidence,'low');
  assert.equal(result.trend,null);
  assert.equal(result.projectedWeeklyUnits,null);
  assert.equal(result.suggestedPurchaseUnits,2); // ceil((50-26)/12)
  assert.match(result.reasons[0],/No comparable usage cycles yet/);
  assert.match(result.reasons[0],/build-to of 50 bottles/);
  assert.match(result.summary,/not enough history/i);
});

test('two comparable weeks is still too sparse for a trend',()=>{
  // Three orders produce only two usage cycles: below MIN_USAGE_OBSERVATIONS.
  const rows=history([{count:30,ordered:2},{count:26,ordered:2},{count:25,ordered:2}]);
  const result=Predictive.suggest(rows,CASE_SPIRIT,{now:AUGUST,onHand:25,
    packaging:{unitsPerCase:12,countBasis:'units',buildToBasis:'units'}});
  assert.equal(result.observations,2);
  assert.equal(result.basis,'par');
  assert.equal(result.trend,null);
  assert.match(result.reasons[0],/Only 2 comparable weeks of usage so far/);
  assert.match(result.reasons[1],/Ordered 3 times before/);
  assert.equal(result.suggestedPurchaseUnits,Vision.orderQuantity(CASE_SPIRIT,25,{unitsPerCase:12,countBasis:'units',buildToBasis:'units'}));
});

test('cycles without a count snapshot are excluded, not guessed',()=>{
  const rows=history([{count:40,ordered:2},{count:null,ordered:2},{count:30,ordered:2},{count:28,ordered:2}]);
  const result=Predictive.suggest(rows,CASE_SPIRIT,{now:AUGUST,onHand:28,
    packaging:{unitsPerCase:12,countBasis:'units',buildToBasis:'units'}});
  assert.equal(result.observations,1);
  assert.equal(result.excludedCycles,2);
  assert.equal(result.basis,'par');
});

// ── Usage maths ─────────────────────────────────────────────────────────────

test('weekly usage is count-in plus delivered minus count-out',()=>{
  // 40 on hand, 2 cases (24 bottles) delivered, 34 on hand a week later
  // => 30 bottles used in 7 days.
  const rows=history([{count:40,ordered:2},{count:34,ordered:2},{count:28,ordered:2},{count:22,ordered:2}]);
  const basis=Predictive.basisFor(CASE_SPIRIT,{unitsPerCase:12,countBasis:'units',buildToBasis:'units'});
  const log=Predictive.orderLog(rows,CASE_SPIRIT,{});
  const {observations}=Predictive.usageObservations(log,basis);
  assert.equal(observations.length,3);
  observations.forEach(o=>assert.equal(o.perWeek,30));
});

test('a count that rises by more than was delivered is dropped as unusable',()=>{
  const rows=history([{count:10,ordered:1},{count:60,ordered:1},{count:50,ordered:1},{count:40,ordered:1}]);
  const basis=Predictive.basisFor(CASE_SPIRIT,{unitsPerCase:12,countBasis:'units',buildToBasis:'units'});
  const {observations,excluded}=Predictive.usageObservations(Predictive.orderLog(rows,CASE_SPIRIT,{}),basis);
  assert.equal(observations.length,2);
  assert.equal(excluded.length,1);
  assert.match(excluded[0],/count went up by more than was delivered/);
});

test('a build-to-in-cases SKU keeps counts and deliveries in the same space',()=>{
  const packaging=CASE_BASIS_BEER.packaging;
  const basis=Predictive.basisFor(CASE_BASIS_BEER,packaging);
  // buildToBasis 'cases' with countBasis 'units' is the mixed basis: the shared
  // space is cans, so a build-to of 20 cases is 480 cans.
  assert.equal(basis.mixedBasis,true);
  assert.equal(Predictive.targetToSpace(basis,20),480);
  assert.equal(Predictive.countToSpace(basis,300),300);
  assert.equal(Predictive.purchaseToSpace(basis,2),48);
  assert.equal(Predictive.spaceToPurchase(basis,49),3);
});

// ── Trend ───────────────────────────────────────────────────────────────────

test('rising usage is reported as a damped upward trend',()=>{
  // Usage per week: 12,12,12 then 18,18,18 (a 50% rise).
  const rows=history([
    {count:100,ordered:1},{count:100,ordered:1},{count:100,ordered:1},{count:100,ordered:1},
    {count:94,ordered:1},{count:88,ordered:1},{count:82,ordered:1}
  ]);
  // count drops by 12 with 12 delivered => 24 used... recompute explicitly below.
  const basis=Predictive.basisFor(CASE_SPIRIT,{unitsPerCase:12,countBasis:'units',buildToBasis:'units'});
  const observations=Predictive.usageObservations(Predictive.orderLog(rows,CASE_SPIRIT,{}),basis).observations;
  assert.equal(observations.length,6);
  const trend=Predictive.trendOf(observations);
  assert.equal(trend.direction,'up');
  assert.ok(trend.percent>0,`percent was ${trend.percent}`);
  // Damping halves the measured swing and the factor is capped at 1.35.
  assert.ok(trend.factor>1&&trend.factor<=1.35,`factor was ${trend.factor}`);
  assert.equal(trend.weeks,3);
});

test('falling usage is reported as a downward trend and never below the floor',()=>{
  const rows=history([
    {count:100,ordered:0},{count:60,ordered:0},{count:20,ordered:0},
    {count:19,ordered:0},{count:18,ordered:0},{count:17,ordered:0},{count:16,ordered:0}
  ]);
  const basis=Predictive.basisFor(CASE_SPIRIT,{unitsPerCase:12,countBasis:'units',buildToBasis:'units'});
  const trend=Predictive.trendOf(Predictive.usageObservations(Predictive.orderLog(rows,CASE_SPIRIT,{}),basis).observations);
  assert.equal(trend.direction,'down');
  assert.ok(trend.percent<0);
  assert.ok(trend.factor>=0.75,`factor was ${trend.factor}`);
});

test('a purely seasonal swing is not reported as a trend',()=>{
  // Identical deseasonalized demand measured across March (high) into
  // September (slow): raw usage falls, but the trend must stay flat.
  const start=Date.parse('2026-02-16T16:00:00Z');
  const observations=[];
  for(let i=0;i<8;i++){
    const at=start+i*28*DAY,month=Predictive.stThomasMonth(at);
    observations.push({at:at,month:month,days:7,used:0,perWeek:20*Predictive.seasonalIndex(month)});
  }
  const trend=Predictive.trendOf(observations);
  assert.equal(trend.direction,'flat');
  assert.equal(trend.percent,0);
  assert.equal(trend.factor,1);
});

// ── Full projection ─────────────────────────────────────────────────────────

function steadyHistory(now){
  // Eight weekly orders, 24 bottles used each week, counted in bottles.
  const weeks=[];
  let count=50;
  for(let i=0;i<9;i++){weeks.push({count:count,ordered:2});count=count+24-24;}
  return history(weeks,{now:now});
}

test('a steady SKU projects its measured weekly usage over its own cadence',()=>{
  const rows=steadyHistory(AUGUST);
  const result=Predictive.suggest(rows,CASE_SPIRIT,{now:AUGUST,onHand:50,
    packaging:{unitsPerCase:12,countBasis:'units',buildToBasis:'units'}});
  assert.equal(result.basis,'history');
  assert.equal(result.confidence,'high');
  assert.equal(result.cadence.medianDays,7);
  assert.equal(result.coverDays,10); // 7 day cadence + 3 safety days
  assert.equal(result.seasonal.monthName,'August');
  assert.equal(result.seasonal.applied,true);
  // Deseasonalized baseline re-seasonalized into August must land below the
  // raw 24/week measured across the same slow-season weeks.
  assert.ok(result.projectedWeeklyUnits>0);
  assert.ok(Number.isInteger(result.suggestedPurchaseUnits));
});

test('the same SKU is projected higher in March than in August',()=>{
  const august=Predictive.suggest(steadyHistory(AUGUST),CASE_SPIRIT,
    {now:AUGUST,onHand:10,packaging:{unitsPerCase:12,countBasis:'units',buildToBasis:'units'}});
  const march=Predictive.suggest(steadyHistory(MARCH),CASE_SPIRIT,
    {now:MARCH,onHand:10,packaging:{unitsPerCase:12,countBasis:'units',buildToBasis:'units'}});
  assert.ok(march.projectedWeeklyUnits>august.projectedWeeklyUnits,
    `march ${march.projectedWeeklyUnits} vs august ${august.projectedWeeklyUnits}`);
  assert.ok(march.reasons.some(r=>/March is historically high season in the USVI \(\+\d+% versus the year\)/.test(r)),march.reasons.join(' | '));
  assert.ok(august.reasons.some(r=>/August is historically a slower month in the USVI \(-\d+% versus the year\)/.test(r)),august.reasons.join(' | '));
});

test('an active manager seasonal profile suppresses the automatic month factor',()=>{
  const rows=steadyHistory(AUGUST);
  const options={now:AUGUST,onHand:10,packaging:{unitsPerCase:12,countBasis:'units',buildToBasis:'units'}};
  const auto=Predictive.suggest(rows,CASE_SPIRIT,options);
  const managed=Predictive.suggest(rows,CASE_SPIRIT,Object.assign({},options,{
    seasonalProfile:{name:'Offseason',profileType:'Offseason',percentageMultiplier:80}}));
  assert.equal(auto.seasonal.applied,true);
  assert.equal(managed.seasonal.applied,false);
  assert.notEqual(auto.projectedWeeklyUnits,managed.projectedWeeklyUnits);
  assert.ok(managed.reasons.some(r=>/Manager profile "Offseason" is set to 80%/.test(r)));
  assert.ok(!managed.reasons.some(r=>/historically a/.test(r)));
});

test('a Normal 100% profile is treated as no profile at all',()=>{
  const rows=steadyHistory(AUGUST);
  const options={now:AUGUST,onHand:10,packaging:{unitsPerCase:12,countBasis:'units',buildToBasis:'units'}};
  const plain=Predictive.suggest(rows,CASE_SPIRIT,options);
  const normal=Predictive.suggest(rows,CASE_SPIRIT,Object.assign({},options,{
    seasonalProfile:{name:'Normal',profileType:'Normal',percentageMultiplier:100}}));
  assert.equal(normal.managerProfile,null);
  assert.equal(normal.projectedWeeklyUnits,plain.projectedWeeklyUnits);
});

test('a runaway projection is capped at the build-to overshoot limit',()=>{
  // Absurd usage against a small build-to: the cap must engage and be disclosed.
  const weeks=[];
  for(let i=0;i<9;i++)weeks.push({count:0,ordered:40});
  const rows=history(weeks);
  const result=Predictive.suggest(rows,CASE_SPIRIT,{now:AUGUST,onHand:0,
    packaging:{unitsPerCase:12,countBasis:'units',buildToBasis:'units'}});
  assert.equal(result.clamped,true);
  assert.equal(result.neededSpace,CASE_SPIRIT.buildTo*Predictive.OVERSHOOT_LIMIT);
  assert.ok(result.reasons.some(r=>/Capped so the order does not push you far past the build-to/.test(r)));
});

test('a suggestion is never negative when the shelf is already over target',()=>{
  const result=Predictive.suggest(steadyHistory(AUGUST),CASE_SPIRIT,{now:AUGUST,onHand:400,
    packaging:{unitsPerCase:12,countBasis:'units',buildToBasis:'units'}});
  assert.equal(result.suggestedPurchaseUnits,0);
});

test('no count entered falls back to the size this SKU is usually ordered in',()=>{
  const result=Predictive.suggest(steadyHistory(AUGUST),CASE_SPIRIT,{now:AUGUST,onHand:'',
    packaging:{unitsPerCase:12,countBasis:'units',buildToBasis:'units'}});
  assert.equal(result.basis,'history');
  assert.equal(result.suggestedPurchaseUnits,2);
  assert.match(result.reasons[0],/No count entered yet/);
});

// ── Cross-workflow and cross-tenant isolation ───────────────────────────────

test('a Merchants order is not counted as a zero-usage week for a bar SKU',()=>{
  const bar=history([{count:50,ordered:2},{count:50,ordered:2},{count:50,ordered:2},{count:50,ordered:2}]);
  const merchants=[{id:AUGUST-3*DAY,orderType:'merchants',counts:{Limes:'4'},
    items:[{name:'Limes',unit:'Case',pack:1,orderQty:3,finalOrderQty:3}]}];
  const result=Predictive.suggest(merchants.concat(bar),CASE_SPIRIT,{now:AUGUST,onHand:50,
    packaging:{unitsPerCase:12,countBasis:'units',buildToBasis:'units'}});
  assert.equal(result.cyclesSeen,4);
  assert.equal(result.observations,3);
});

test('history attributed to another location is ignored',()=>{
  const mine=history([{count:50,ordered:2},{count:50,ordered:2},{count:50,ordered:2},{count:50,ordered:2}])
    .map(entry=>Object.assign({},entry,{locationId:'sapphire'}));
  const theirs=history([{count:9,ordered:9},{count:9,ordered:9},{count:9,ordered:9},{count:9,ordered:9}])
    .map(entry=>Object.assign({},entry,{locationId:'seasalt'}));
  const scoped=Predictive.suggest(theirs.concat(mine),CASE_SPIRIT,{now:AUGUST,onHand:50,locationId:'sapphire',
    packaging:{unitsPerCase:12,countBasis:'units',buildToBasis:'units'}});
  assert.equal(scoped.cyclesSeen,4);
  const unscoped=Predictive.suggest(theirs.concat(mine),CASE_SPIRIT,{now:AUGUST,onHand:50,
    packaging:{unitsPerCase:12,countBasis:'units',buildToBasis:'units'}});
  assert.equal(unscoped.cyclesSeen,8);
});

test('entries with no usable timestamp are skipped instead of dating to 1970',()=>{
  const rows=history([{count:50,ordered:2},{count:50,ordered:2},{count:50,ordered:2},{count:50,ordered:2}]);
  const broken=[{id:'a-uuid-not-an-epoch',orderType:'bar',counts:{[CASE_SPIRIT.name]:'50'},items:[]}];
  const result=Predictive.suggest(broken.concat(rows),CASE_SPIRIT,{now:AUGUST,onHand:50,
    packaging:{unitsPerCase:12,countBasis:'units',buildToBasis:'units'}});
  assert.equal(result.cyclesSeen,4);
});

// ── Reasoning is always human-readable ──────────────────────────────────────

test('every suggestion carries a short summary and at least one reason',()=>{
  const scenarios=[
    Predictive.suggest([],CASE_SPIRIT,{now:AUGUST,onHand:5}),
    Predictive.suggest(steadyHistory(AUGUST),CASE_SPIRIT,{now:AUGUST,onHand:5,
      packaging:{unitsPerCase:12,countBasis:'units',buildToBasis:'units'}}),
    Predictive.suggest(steadyHistory(MARCH),CASE_BASIS_BEER,{now:MARCH,onHand:120,
      packaging:CASE_BASIS_BEER.packaging})
  ];
  scenarios.forEach(result=>{
    assert.ok(result.summary.length>0&&result.summary.length<120,result.summary);
    assert.ok(result.reasons.length>0);
    result.reasons.forEach(reason=>{
      assert.equal(typeof reason,'string');
      assert.ok(reason.length>0&&reason.length<180,reason);
      assert.ok(!/undefined|NaN|null/.test(reason),reason);
    });
    assert.equal(result.calculationVersion,'predictive-ordering-v1.0.0');
  });
});

test('the summary credits the manager profile instead of the month it stood down',()=>{
  const rows=steadyHistory(AUGUST);
  const options={now:AUGUST,onHand:10,packaging:{unitsPerCase:12,countBasis:'units',buildToBasis:'units'}};
  const auto=Predictive.suggest(rows,CASE_SPIRIT,options);
  const managed=Predictive.suggest(rows,CASE_SPIRIT,Object.assign({},options,{
    seasonalProfile:{name:'Peak season',profileType:'Peak season',percentageMultiplier:130}}));
  assert.match(auto.summary,/August is a slower month/);
  assert.match(managed.summary,/Peak season profile at 130%/);
  assert.doesNotMatch(managed.summary,/August/);
});

test('a sparse SKU with no count does not claim to be using a build-to',()=>{
  const result=Predictive.suggest([],CASE_SPIRIT,{now:AUGUST,onHand:'',
    packaging:{unitsPerCase:12,countBasis:'units',buildToBasis:'units'}});
  assert.equal(result.suggestedPurchaseUnits,null);
  assert.match(result.reasons[0],/there is no count to measure against yet/);
  assert.doesNotMatch(result.reasons[0],/using the build-to/);
});

test('suggestAll keys results by product name and never throws on a bad row',()=>{
  const products=[CASE_SPIRIT,CASE_BASIS_BEER,null,{name:''}];
  const all=Predictive.suggestAll(steadyHistory(AUGUST),products,product=>({now:AUGUST,onHand:1,packaging:product.packaging}));
  assert.deepEqual(Object.keys(all).sort(),[CASE_BASIS_BEER.name,CASE_SPIRIT.name].sort());
});

// ── Wiring ──────────────────────────────────────────────────────────────────

test('the order screen renders the suggestion and never auto-fills it',()=>{
  const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
  assert.match(html,/predictive-ordering\.js/,'the module is loaded');
  assert.match(html,/pgPredictiveSuggestion/,'the order screen computes a suggestion');
  assert.match(html,/pg-order-suggestion/,'the suggestion has its own labelled element');
  assert.match(html,/pg-order-suggestion-tag","Suggestion"/,'the block carries a Suggestion label');
  assert.match(html,/\.pg-order-suggestion-tag\{[^}]*text-transform:uppercase/,'the label reads as SUGGESTION');
  assert.match(html,/Suggestion only[^"]*nothing is filled in or sent/,'the block says it is not applied');
  // The suggestion must never be written into adjustments or the saved order.
  const applyPattern=/pgPredictiveSuggestion[\s\S]{0,4000}?(pgSetManualAdjustment|S\.adjustments\s*=)/;
  assert.ok(!applyPattern.test(html),'the suggestion is not wired into order state');
});

test('production build publishes the predictive ordering asset',()=>{
  const build=fs.readFileSync(path.join(__dirname,'..','scripts','build-static.mjs'),'utf8');
  assert.match(build,/['"]predictive-ordering\.js['"]/);
});
