const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('Drink Price Estimator ships as a protected production feature',()=>{
  const html=read('index.html'),build=read('scripts/build-static.mjs');
  assert.match(html,/text\/pourgrid-protected[^>]+drink-price-estimator\.js/);
  assert.match(html,/id:"pgEstimatorHomeTrigger"/);
  assert.match(html,/Drink Price Estimator/);
  assert.match(build,/drink-price-estimator\.js/);
});

test('estimator supports multi-ingredient recipe costing and target pricing',()=>{
  const source=read('drink-price-estimator.js');
  new Function(source);
  assert.match(source,/ingredients\.forEach/);
  assert.match(source,/total\+=oz\*unit/);
  assert.match(source,/total\/\(target\/100\)/);
  assert.match(source,/total\/menu\*100/);
  assert.match(source,/Target pour cost/);
  assert.match(source,/Suggested price/);
  assert.match(source,/Actual cost %/);
});

test('estimator derives catalog cost per ounce and permits explicit recipe costs',()=>{
  const source=read('drink-price-estimator.js');
  assert.match(source,/getBottleCost/);
  assert.match(source,/pgNormalMl/);
  assert.match(source,/29\.5735/);
  assert.match(source,/data-field="costPerOz"/);
  assert.match(source,/min="0"/);
});

test('saved recipes are editable, deletable, and local to the authorized device',()=>{
  const source=read('drink-price-estimator.js');
  assert.match(source,/pourgrid-drink-recipes-v1/);
  assert.match(source,/localStorage\.setItem/);
  assert.match(source,/data-edit/);
  assert.match(source,/data-delete/);
  assert.doesNotMatch(source,/fetch\(|service_role|access_token|refresh_token/);
});

test('estimator exposes mobile-safe controls and an accessible modal',()=>{
  const source=read('drink-price-estimator.js');
  assert.match(source,/role="dialog" aria-modal="true"/);
  assert.match(source,/aria-labelledby="pgEstimatorTitle"/);
  assert.match(source,/min-width:44px;min-height:44px/);
  assert.match(source,/@media\(max-width:390px\)/);
});
