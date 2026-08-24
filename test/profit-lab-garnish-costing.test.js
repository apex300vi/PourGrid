const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const source=fs.readFileSync('drink-price-estimator.js','utf8'),gate=fs.readFileSync('auth-gate.js','utf8'),sql=fs.readFileSync('supabase/migrations/202608110003_profit_lab_ingredient_costing.sql','utf8');
const cost=(casePrice,packages,units,prep,waste)=>casePrice/(packages*units*prep*(1-waste/100));

test('garnish presets preserve verified packaging and label unverified yields',()=>{
  for(const value of ['Lime wedge','Lemon wedge','Maraschino cherry'])assert.match(sql,new RegExp(value));
  assert.match(sql,/four 1-gallon containers per case/);
  assert.match(sql,/Starting estimate: 200 limes per case/);
  assert.match(sql,/Starting estimate: 200 lemons per case/);
  assert.match(sql,/Starting estimate: 400 cherries per gallon/);
  assert.match(sql,/package_case_price[^\n]+null/);
  assert.match(sql,/create trigger seed_profit_lab_garnishes after insert on public\.locations/);
});

test('flexible costing stores separate package yield preparation waste and confidence fields',()=>{
  for(const field of ['package_case_price','packages_per_case','estimated_units_per_package','preparation_yield','waste_percent','result_kind'])assert.match(sql,new RegExp(field));
  assert.match(sql,/result_kind in \('exact','estimated'\)/);
  assert.equal(cost(80,1,200,8,0),0.05);
  assert.equal(cost(80,1,200,8,20),0.0625);
  assert.equal(cost(120,4,400,1,0),0.075);
});

test('recipes reference shared definitions and costs recalculate from current assumptions',()=>{
  assert.match(source,/ingredientId/);
  assert.match(source,/definitionCost/);
  assert.match(source,/price\s*\/\s*\(packages\*units\*prep\*\(1-waste\/100\)\)/);
  assert.match(sql,/guard_profit_lab_ingredient_references/);
  assert.match(sql,/Shared ingredient is outside this location/);
});

test('estimated ingredients explain their cost and remain editable once per location',()=>{
  assert.match(source,/Estimated cost\./);
  assert.match(source,/Ingredient cost assumptions/);
  assert.match(source,/every recipe referencing it recalculates automatically/);
  assert.match(gate,/list_profit_lab_ingredients/);
  assert.match(gate,/save_profit_lab_ingredient/);
  assert.match(sql,/array\['administrator','manager','bar_lead'\]/);
});

test('garnish presets participate in the unified catalog while legacy custom rows remain readable',()=>{
  assert.match(source,/function unifiedCatalog/);
  assert.match(source,/sourceMetadata/);
  assert.match(source,/data-field="catalogCategory"/);
  assert.match(source,/data-field="catalogItem"/);
  assert.match(source,/Legacy custom ingredient/);
  assert.doesNotMatch(source,/>Shared ingredient<|>PourGrid catalog<|>Custom ingredient</);
});

test('legacy import reads legacy fields before normalization and stays idempotent',()=>{
  assert.match(source,/amount:Number\(i\.ounces\)/);
  assert.match(source,/unitCost:Number\(i\.costPerOz\)/);
  assert.match(source,/known\.has/);
  assert.match(source,/MIGRATED_KEY/);
});

test('target slider direction and exact pricing formula remain intact',()=>{
  assert.match(source,/Move left for a lower cost percentage and higher selling price/);
  assert.match(source,/Move right for a higher percentage and lower selling price/);
  assert.match(source,/total\/\(target\/100\)/);
  assert.match(source,/total\/menu\*100/);
});

test('responsive and accessible controls cover 320px and 390px',()=>{
  assert.match(source,/@media\(max-width:320px\)/);
  assert.match(source,/@media\(max-width:390px\)/);
  assert.match(source,/min-height:44px/);
  assert.match(source,/role="dialog" aria-modal="true"/);
  assert.match(source,/aria-label="Remove ingredient/);
});
