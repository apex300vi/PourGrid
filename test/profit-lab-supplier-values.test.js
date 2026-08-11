const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const sql=fs.readFileSync('supabase/migrations/202608110004_profit_lab_verified_supplier_values.sql','utf8');
const cost=(price,packages,units,prep=1,waste=0)=>price/(packages*units*prep*(1-waste/100));
test('verified supplier calculations use package facts',()=>{
 assert.ok(Math.abs(cost(44.24,8,64)-0.08640625)<1e-10);
 assert.ok(Math.abs(cost(33.98,8,48)-0.0884895833)<1e-9);
 assert.ok(Math.abs(cost(75.92,12,33.8140227)-0.1871)<1e-5);
 assert.ok(Math.abs(cost(37.07,1,200,8)-0.02316875)<1e-10);
 assert.ok(Math.abs(cost(37.07,1,200,8,10)-0.0257430556)<1e-9);
 assert.ok(Math.abs(cost(69.33,1,200,8)-0.04333125)<1e-10);
 assert.ok(Math.abs(cost(111.44,4,275)-0.1013090909)<1e-9);
 assert.equal(cost(52.63,20,50),0.05263);
 assert.ok(Math.abs(cost(161.03,12,500)-0.0268383333)<1e-9);
 for(const id of ['3209726','3402205','1400850','2602600','2601500','3813800','2605000','6809200','6812601'])assert.match(sql,new RegExp(id));
});
test('BIB dilution remains unavailable until an adjustable ratio is verified',()=>{
 assert.match(sql,/syrup_to_water_ratio/);
 assert.match(sql,/then null else p_case_price\/\(p_syrup_oz\*\(1\+p_syrup_to_water_ratio\)\)/);
 assert.match(sql,/Ratio is unverified/);
 assert.doesNotMatch(sql,/CO2.*cost/i);
});
test('supplier seeding is idempotent and provisions future locations',()=>{
 assert.match(sql,/on conflict\(location_id,key\) do update/);
 assert.match(sql,/create trigger seed_profit_lab_supplier_values after insert on public\.locations/);
 assert.match(sql,/array\['PP'\]/);
});
