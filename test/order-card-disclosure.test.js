const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const root=path.join(__dirname,'..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const visionSource=fs.readFileSync(path.join(root,'pourgrid-vision.js'),'utf8');
const orderRenderer=html.slice(html.indexOf('function rOrderTab'),html.indexOf('function calcSuggestedBuildTos'));

test('ordering explanations are collapsed by default behind contextual disclosure',()=>{
  assert.match(orderRenderer,/pg-order-disclosure-toggle/);
  assert.match(orderRenderer,/setAttribute\("aria-expanded","false"\)/);
  assert.match(orderRenderer,/setAttribute\("aria-hidden","true"\)/);
  assert.doesNotMatch(orderRenderer,/ap\(info,nm2,metaDiv,explanation\)/);
  assert.match(orderRenderer,/Why .+\?"/);
  assert.match(orderRenderer,/How this was calculated/);
});

test('disclosure exposes complete calculation content while warnings and routing stay visible',()=>{
  for(const label of ['On hand','Build-to target','Shortfall','Bottles per case','Final calculated recommendation'])assert.match(orderRenderer,new RegExp(label));
  assert.match(orderRenderer,/rounding\.textContent=calculation\.text/);
  assert.match(orderRenderer,/Assigned vendor:/);
  assert.match(orderRenderer,/pg-adjust-summary/);
  assert.match(orderRenderer,/pgManualPurchaseText/);
});

test('each product owns an independent accessible disclosure state',()=>{
  assert.match(orderRenderer,/disclosureId="pg-order-why-"/);
  assert.match(orderRenderer,/aria-controls/);
  assert.match(orderRenderer,/Show order calculation for/);
  assert.match(orderRenderer,/Hide.*order calculation for/);
  assert.match(orderRenderer,/disclosurePanel\.classList\.toggle\("open",!expanded\)/);
  assert.doesNotMatch(orderRenderer,/querySelectorAll\([^)]*pg-order-disclosure-panel/);
});

test('minus plus and Adjust controls remain outside the disclosure',()=>{
  const disclosureEnd=orderRenderer.indexOf('ap(disclosure,disclosureToggle,disclosurePanel)');
  const controlsStart=orderRenderer.indexOf('var qtyWrap=mk("div","pg-order-quantity")');
  assert.ok(disclosureEnd>0&&controlsStart>disclosureEnd);
  assert.match(orderRenderer,/Decrease .* by one/);
  assert.match(orderRenderer,/Increase .* by one/);
  assert.match(orderRenderer,/adjust\.textContent=isAdj\?"Edit":"Adjust"/);
});

test('canonical order calculations remain unchanged',()=>{
  const sandbox={module:{exports:{}},exports:{}};
  vm.runInNewContext(visionSource,sandbox);
  const Vision=sandbox.module.exports;
  const product={name:"Tito's",unit:'Case',pack:12,buildTo:72};
  const config={mode:'standard',buildToBasis:'units',countBasis:'units',unitsPerCase:12,unitLabel:'bottles'};
  const before=[0,12,55,71,72,80].map(onHand=>Vision.orderQuantity(product,onHand,config));
  assert.deepEqual(before,[6,5,2,1,0,0]);
  const explanation=Vision.orderExplanation(product,55,config,0);
  assert.equal(explanation.baseSuggestedOrder,2);
  assert.equal(explanation.shortage,17);
  assert.equal(explanation.unitsPerCase,12);
  assert.match(explanation.text,/rounds up to 2 cases/);
  assert.doesNotMatch(orderRenderer,/function orderQuantity|function orderExplanation/);
});

test('disclosure styling is mobile-tappable, restrained, and reduced-motion safe',()=>{
  assert.match(html,/\.pg-order-disclosure-toggle\{[^}]*min-height:44px/);
  assert.match(html,/\.pg-order-disclosure-panel\{[^}]*grid-template-rows:0fr/);
  assert.match(html,/\.pg-order-disclosure-panel\.open\{grid-template-rows:1fr/);
  assert.match(html,/@media\(prefers-reduced-motion:reduce\)/);
});
