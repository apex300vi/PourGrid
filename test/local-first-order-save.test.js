'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('index.html','utf8');
const start=html.indexOf('var PG_LOCAL_HISTORY_KEY='),end=html.indexOf('async function saveDB');
assert.ok(start>0&&end>start);
function harness(initial){
  const values=new Map(Object.entries(initial||{}).map(([key,value])=>[key,JSON.stringify(value)]));
  const context={Date,Number,String,Array,Object,JSON,console,lsGet:key=>values.has(key)?JSON.parse(values.get(key)):null,lsSet:(key,value)=>values.set(key,JSON.stringify(value)),window:{POURGRID_HISTORY_API:null}};
  vm.runInNewContext(html.slice(start,end)+';this.api={local:pgLocalHistory,save:pgSaveOrderLocally,sync:pgMarkOrderCloudSynced,merge:pgMergeHistory,load:loadHist,key:PG_LOCAL_HISTORY_KEY};',context);
  return context.api;
}
function order(id,draft){return {id,draftId:draft,date:'Sep 3, 2026',items:[{name:'Limes'}],counts:{Limes:'1'}}}
test('a completed order is persisted with a stable local History id',()=>{const api=harness(),saved=api.save(order(10,'merchants-10'));assert.equal(saved._dbId,'local:merchants-10');assert.equal(saved._localSaved,true);assert.equal(api.local().length,1)});
test('saving the same draft twice never duplicates History',()=>{const api=harness();api.save(order(10,'bar-10'));api.save(order(11,'bar-10'));assert.equal(api.local().length,1);assert.equal(api.local()[0].id,11)});
test('a cloud confirmation upgrades the local record without deleting it',()=>{const api=harness();api.save(order(10,'bar-10'));api.sync('bar-10',991);const [saved]=api.local();assert.equal(saved._dbId,991);assert.equal(saved._localSaved,false)});
test('remote and local copies of one draft merge into one record',()=>{const api=harness();const remote=Object.assign(order(10,'bar-10'),{_dbId:991}),local=Object.assign(order(10,'bar-10'),{_dbId:'local:bar-10'});const rows=api.merge([remote],[local]);assert.equal(rows.length,1);assert.equal(rows[0]._dbId,991)});
test('History loads locally when no cloud API exists',async()=>{const api=harness({'pourgrid-local-order-history-v1':[order(10,'bar-10')]});const rows=await api.load();assert.equal(rows.length,1);assert.equal(rows[0].draftId,'bar-10')});
