'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');

test('phone navigation is viewport anchored without transformed fixed positioning',()=>{
  const contract=html.slice(html.indexOf('/* iOS dock contract:'),html.indexOf('.pg-recipe-name'));
  assert.match(contract,/\.nav\{[\s\S]*position:fixed!important/);
  assert.match(contract,/inset:auto 0 0 0!important/);
  assert.match(contract,/left:0!important/);
  assert.match(contract,/right:0!important/);
  assert.match(contract,/margin:0 auto!important/);
  assert.match(contract,/transform:none!important/);
  assert.match(contract,/translate:none!important/);
  assert.match(contract,/will-change:auto!important/);
  assert.doesNotMatch(contract,/translate(?:3d|X)?\([^)]*-50%/);
});

test('keyboard dismissal moves the dock vertically without changing its horizontal anchor',()=>{
  assert.match(html,/body\.pg-keyboard-open \.nav\{transform:translate3d\(0,120%,0\)!important;pointer-events:none\}/);
  assert.doesNotMatch(html,/body\.pg-keyboard-open \.nav\{[^}]*-50%/);
});

test('every rendered application route receives exactly one shared navigation dock',()=>{
  const render=html.slice(html.indexOf('function render(){'),html.indexOf('var pgOrientationScroll='));
  assert.match(render,/if\(S\.screen==="setup"\)[\s\S]*if\(!pgNeedsOnboarding\(\)\)app\.appendChild\(rNav\(\)\)/);
  assert.match(render,/if\(S\.screen==="home"\)[\s\S]*app\.appendChild\(rNav\(\)\)/);
  assert.match(render,/else \{[\s\S]*app\.appendChild\(rNav\(\)\)/);
  assert.equal((render.match(/appendChild\(rNav\(\)\)/g)||[]).length,3);
});
