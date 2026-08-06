const test=require('node:test');
const assert=require('node:assert/strict');
const Persistence=require('../product-persistence.js');

function storage(initial={}){let value=JSON.stringify(initial);return {getItem(){return value;},setItem(_,next){value=next;}};}
const lime={name:'Lime Juice',_catalogName:'Lime Juice',dist:'Merchants',cat:'Mixer',buildTo:8,pack:12,unit:'Case'};
const limeEdit={name:'Lime Juice',dist:'Merchants',cat:'Mixer',buildTo:8,pack:12,unit:'Case',bottleMl:1000,note:'',packaging:{mode:'standard',unitsPerCase:12,largeUnit:'Case',looseUnit:'Bottle',unitLabel:'bottles',countBasis:'units',buildToBasis:'units',innerPacksPerCase:0,alternatePackaging:'',recognitionSettings:'',recognitionImages:[]}};

test('Bottle Intelligence saves and reads back every Lime Juice override',()=>{const s=storage(),all=Persistence.withEdit({},lime,limeEdit),saved=Persistence.saveVerified(s,all);assert.equal(saved.ok,true);assert.deepEqual(Persistence.resolve(Persistence.read(s),lime).packaging,limeEdit.packaging);});
test('user overrides survive refresh and catalog reconstruction',()=>{const s=storage(),all=Persistence.withEdit({},lime,limeEdit);Persistence.saveVerified(s,all);const rebuilt={name:'Lime Juice',_catalogName:'Lime Juice',buildTo:99,pack:1};Persistence.apply(rebuilt,Persistence.resolve(Persistence.read(s),rebuilt));assert.equal(rebuilt.buildTo,8);assert.equal(rebuilt.pack,12);});
test('stable identity survives an editable display-name change',()=>{const s=storage(),renamed=Object.assign({},limeEdit,{name:'Fresh Lime Juice'}),all=Persistence.withEdit({},lime,renamed);Persistence.saveVerified(s,all);const rebuilt={name:'Lime Juice',_catalogName:'Lime Juice'};const edit=Persistence.resolve(Persistence.read(s),rebuilt);assert.equal(edit.name,'Fresh Lime Juice');});
test('storage verification detects a failed or altered write',()=>{const bad={setItem(){},getItem(){return '{}';}},result=Persistence.saveVerified(bad,Persistence.withEdit({},lime,limeEdit));assert.equal(result.ok,false);assert.match(result.error,/did not match/);});
