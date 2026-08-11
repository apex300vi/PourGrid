const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const source=read('drink-price-estimator.js'),html=read('index.html'),gate=read('auth-gate.js'),sql=read('supabase/migrations/202608110002_profit_lab.sql');

test('Profit Lab ships as a protected first-class Home workspace',()=>{
  new Function(source);
  assert.match(html,/text\/pourgrid-protected[^>]+drink-price-estimator\.js/);
  assert.match(html,/id:"pgEstimatorHomeTrigger"/);
  assert.match(source,/<strong>Profit Lab<\/strong>/);
  assert.match(source,/Build drinks\. Understand cost\. Price with confidence\./);
  assert.match(source,/button\.innerHTML='<div><strong>Profit Lab/);
});

test('Profit Lab combines catalog and custom ingredients at their proportions',()=>{
  assert.match(source,/source:name\?'catalog':'custom'/);
  assert.match(source,/PourGrid catalog/);
  assert.match(source,/Custom ingredient/);
  assert.match(source,/var line=amount\*unitCost/);
  assert.match(source,/total\+=line/);
  assert.match(source,/total\/\(target\/100\)/);
  assert.match(source,/total\/menu\*100/);
  assert.match(source,/option value="oz"/);
  assert.match(source,/option value="each"/);
  assert.match(source,/getBottleCost/);
  assert.match(source,/pgNormalMl/);
  assert.match(source,/29\.5735/);
});

test('target slider communicates and applies the requested price direction',()=>{
  assert.match(source,/type="range" min="5" max="40"/);
  assert.match(source,/Move left for a lower cost percentage and higher selling price/);
  assert.match(source,/Move right for a higher percentage and lower selling price/);
  assert.match(source,/Recommended price/);
  assert.match(source,/Actual cost %/);
});

test('shared recipes use authenticated location-scoped server APIs',()=>{
  assert.match(gate,/POURGRID_PROFIT_LAB_API=Object\.freeze/);
  assert.match(gate,/list_profit_lab_recipes/);
  assert.match(gate,/save_profit_lab_recipe/);
  assert.match(gate,/delete_profit_lab_recipe/);
  assert.match(gate,/p_organization:context\.organizationId,p_location:context\.locationId/);
  assert.match(source,/api\(\)\.list\(\)/);
  assert.match(source,/api\(\)\.save/);
  assert.match(source,/Shared recipes/);
  assert.doesNotMatch(source,/localStorage\.setItem\(LEGACY_KEY/);
});

test('legacy device recipes import once without replacing shared recipes',()=>{
  assert.match(source,/MIGRATED_KEY='pourgrid-profit-lab-migrated-v1'/);
  assert.match(source,/known=new Set/);
  assert.match(source,/if\(!old\.name\|\|known\.has/);
  assert.match(source,/localStorage\.setItem\(MIGRATED_KEY,'1'\)/);
});

test('Bottle Intelligence can seed a Profit Lab recipe',()=>{
  assert.match(source,/button\.id='pgProfitLabProductButton'/);
  assert.match(source,/button\.textContent='Add to Profit Lab'/);
  assert.match(source,/overlay\.querySelector\('\.s71-title'\)/);
  assert.match(source,/function open\(productName\)/);
  assert.match(source,/reset\(seedProduct\)/);
});

test('shared recipe schema preserves revisions and tenant boundaries',()=>{
  assert.match(sql,/create table public\.profit_lab_recipes/);
  assert.match(sql,/create table public\.profit_lab_recipe_revisions/);
  assert.match(sql,/constraint profit_lab_location_org_fk/);
  assert.match(sql,/enable row level security/);
  assert.match(sql,/has_location_role\(p_organization,p_location/);
  assert.match(sql,/array\['administrator','manager','bar_lead'\]/);
  assert.match(sql,/insert into public\.profit_lab_recipe_revisions/);
  assert.match(sql,/action in \('saved','deleted'\)/);
  assert.match(sql,/Manager access required to delete recipes/);
  assert.match(sql,/revoke all on function[\s\S]*from public,anon/);
  assert.match(sql,/grant execute[\s\S]*to authenticated/);
});

test('Profit Lab supports edit, duplicate, manager delete, loading, and mobile-safe controls',()=>{
  assert.match(source,/data-edit/);
  assert.match(source,/pgEstimatorDuplicate/);
  assert.match(source,/data-delete/);
  assert.match(source,/Loading Profit Lab/);
  assert.match(source,/role="dialog" aria-modal="true"/);
  assert.match(source,/min-width:44px;min-height:44px/);
  assert.match(source,/@media\(max-width:390px\)/);
});
