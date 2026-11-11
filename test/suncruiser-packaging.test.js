'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');

function packagingTable(){
  const start=html.indexOf('var PG_PACKAGING={');
  const end=html.indexOf('\n};',start)+3;
  const context={};
  vm.runInNewContext(html.slice(start,end)+';this.table=PG_PACKAGING;',context);
  return context.table;
}
function products(){
  const m=html.match(/var PG_V12_PRODUCTS=(\[.*?\]);\s*\n/s);
  return JSON.parse(m[1]);
}

// Josh, 2026-11-11: Suncruiser is 6 four-packs to a case, 24 cans total.
test('Suncruiser cases are 6 four-packs = 24 cans, using the same nested-case setup as Bubly',()=>{
  const table=packagingTable();
  ['Suncruiser Ice Tea','Suncruiser Half & Half'].forEach(name=>{
    const cfg=table[name];
    assert.ok(cfg,name+' needs a packaging entry');
    assert.equal(cfg.mode,'nestedCase');
    assert.equal(cfg.innerPacksPerCase,6);
    assert.equal(cfg.unitsPerInner,4);
    assert.equal(cfg.innerPacksPerCase*cfg.unitsPerInner,24);
    assert.equal(cfg.unitLabel,'cans');
  });
});

test('Suncruiser catalog rows follow the plain beer convention, with no free-text pack note',()=>{
  const rows=products().filter(p=>/^Suncruiser /.test(p.name));
  assert.equal(rows.length,2);
  rows.forEach(p=>{
    assert.equal(p.cat,'Beer');
    assert.equal(p.dist,'Bellows/WI');
    assert.equal(p.unit,'Case');
    assert.equal(p.pack,1);
    assert.equal(p.note,'');
  });
});
