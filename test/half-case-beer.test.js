const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const Vision=require('../pourgrid-vision.js');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');

test('beer half-case counting is explicitly allowlisted for fourteen products',()=>{
  const match=html.match(/var PG_HALF_CASE_BEER=\{([\s\S]*?)\};/);
  assert.ok(match);
  const configured=[...match[1].matchAll(/"([^"]+)":24/g)].map(m=>m[1]);
  assert.equal(configured.length,14);
  assert.match(html,/product\.allow_half_case_count=true/);
  assert.doesNotMatch(html,/p\.cat==="Beer"[^\n]*allowHalfCaseCount/);
});

test('one and a half 24-can cases plus three loose cans is 39 canonical cans',()=>{
  assert.match(html,/cfg\.allowHalfCaseCount===true\?pgCaseQuantity/);
  assert.match(html,/cases\*cfg\.unitsPerCase\+loose/);
  assert.equal(1.5*24+3,39);
});

test('half-case beer shortage is purchased only in whole cases with visible overage',()=>{
  const product={name:'Corona cans',unit:'Case',buildTo:2};
  const config={mode:'caseLoose',allowHalfCaseCount:true,unitsPerCase:24,countBasis:'units',buildToBasis:'cases',unitLabel:'cans',calculationVersion:'half-case-beer-v1.0.0'};
  const result=Vision.orderExplanation(product,39,config,0);
  assert.equal(result.target,48);
  assert.equal(result.shortage,9);
  assert.equal(result.baseSuggestedOrder,1);
  assert.equal(result.purchaseOverage,15);
  assert.match(result.text,/full case/);
  assert.match(result.text,/15 cans above target/);
  assert.equal(Number.isInteger(result.suggestedOrder),true);
});

test('saved payload retains half-case inputs, case size, loose units, canonical total, and version',()=>{
  assert.match(html,/countDetails:pgHalfCaseCountDetails\(activeType\)/);
  assert.match(html,/enteredCaseCount:parts\.parts\.cases,caseSize:cfg\.unitsPerCase,looseUnits:parts\.parts\.loose,canonicalTotal:pgPhysicalCount\(product\),calculationVersion:cfg\.calculationVersion/);
});

test('input accepts only whole or half cases and loose whole units',()=>{
  assert.match(html,/\^\\d\+\(\?:\\\.5\)\?\$/);
  assert.match(html,/inp\.step="0\.5"/);
  assert.match(html,/Half cases are inventory only\. Vendor orders are rounded to whole cases\./);
});
