const {chromium}=require('playwright');
const assert=require('node:assert/strict');

(async()=>{
  const base=process.env.PG_E2E_URL,email=process.env.PG_E2E_EMAIL,password=process.env.PG_E2E_PASSWORD;
  if(!base||!email||!password)throw Error('isolated E2E configuration unavailable');
  const browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:390,height:844}}),failures=[];
  page.on('console',m=>{if(m.type()==='error')failures.push(m.text().slice(0,300));});
  await page.goto(base,{waitUntil:'domcontentloaded'});
  await page.locator('#pgAuthEmail').fill(email);await page.locator('#pgAuthPassword').fill(password);await page.locator('#pgAuthSubmit').click();
  try{await page.locator('#app:not([hidden])').waitFor({timeout:20000});}catch(error){throw Error('dashboard unavailable: '+(await page.locator('body').innerText()).replace(email,'[isolated-email]').slice(0,1200));}
  await page.getByText('Sapphire Beach Bar').waitFor({state:'detached',timeout:1000}).catch(()=>{});
  assert.match(await page.locator('body').innerText(),/Full Count|Dashboard/i);

  const result=await page.evaluate(async()=>{
    const family=p=>/^Gatorade|^Florida's Natural/.test(p.name);
    const genericNames=['Amaretto','Blue Curacao','Creme de Cacao','Irish Cream','Peach Schnapps','Triple Sec'];
    const priorCounts=JSON.parse(JSON.stringify(S.counts)),priorAdjustments=JSON.parse(JSON.stringify(S.adjustments)),priorMeta=JSON.parse(JSON.stringify(S.adjustmentMeta));
    PRODUCTS.forEach(p=>{S.adjustments[p.name]=1;S.adjustmentMeta[p.name]={direction:'add',orderUnits:1,reason:'isolated reconciliation'};});
    PRODUCTS.filter(family).forEach(p=>{S.counts[p.name]='0';S.counts[p.name+'::cases']='0';S.counts[p.name+'::loose']='0';});
    lsSet('sbb-counts',S.counts);pgPersistDraft('bar');pgPersistDraft('merchants');
    const items=PRODUCTS.map(pgOrderItem).filter(pgOrderItemVisible),audit=PourGridOrderPipeline.audit(PRODUCTS,p=>{const i=items.find(x=>x.catalogId===p.catalogId);return i?i.adjQty:0;});
    const familyRows=items.filter(family).map(p=>({name:p.name,quantity:p.adjQty,section:PourGridOrderPipeline.emailSection(p)}));
    const genericRows=items.filter(p=>genericNames.includes(p._catalogName)).map(p=>({name:p.name,section:PourGridOrderPipeline.emailSection(p)}));
    const entry={id:Date.now(),draftId:'pr56-e2e-'+Date.now(),orderType:'bar',date:new Date().toISOString(),time:new Date().toISOString(),note:'PR56 isolated verification',counts:{},items:items.filter(p=>p.dist!=='Merchants').map(p=>Object.assign({},p,{productId:PourGridOrderPipeline.id(p),calculatedOrderQty:p.orderQty||0,manualAdjustment:p.adj,finalOrderQty:p.adjQty,orderQty:p.adjQty})),emails:{preview:'generated without sending'},emailStatus:{}};
    const first=await window.POURGRID_ORDER_API.save(entry),second=await window.POURGRID_ORDER_API.save(entry);
    return {audit,familyRows,genericRows,first,second,count:items.length,priorCounts,priorAdjustments,priorMeta,draftId:entry.draftId};
  });
  assert.equal(result.audit.activeProducts,145);assert.equal(result.audit.successfullyRouted,145);assert.deepEqual(result.audit.dropped,[]);assert.deepEqual(result.audit.duplicates,[]);
  assert.equal(result.familyRows.length,9);assert.ok(result.familyRows.every(x=>x.quantity>0&&x.section==='West Indies'));
  assert.equal(result.genericRows.length,6);assert.ok(result.genericRows.every(x=>x.section==='Shared / Not specified'));assert.ok(!result.genericRows.some(x=>x.section==='West Indies'));
  assert.equal(result.first,result.second,'isolated transactional retry is idempotent');

  await page.evaluate(()=>ss({screen:'app',tab:'bar',bSub:'order',countFilter:'all'}));
  await page.getByText('Gatorade Fruit Punch 20oz',{exact:true}).waitFor();
  for(const name of ["Florida's Natural OJ","Florida's Natural Fruit Splash","Florida's Natural Cranberry","Florida's Natural Kiwi"])await page.getByText(name,{exact:true}).waitFor();
  const text=await page.locator('body').innerText();assert.match(text,/SHARED \/ BRAND NOT SPECIFIED/);assert.match(text,/Blue Curacao/);
  const west=(text.split('-- WEST INDIES --')[1]||'');assert.doesNotMatch(west,/Blue Cura(?:c|ç)ao/);
  await page.reload({waitUntil:'domcontentloaded'});await page.locator('#app:not([hidden])').waitFor({timeout:20000});
  const persisted=await page.evaluate(()=>({fruit:S.counts['Gatorade Fruit Punch 20oz'],draft:pgDraftRecord('bar')}));assert.equal(persisted.fruit,'0');assert.ok(persisted.draft&&persisted.draft.id);
  assert.ok(!failures.some(x=>/uncaught|exception/i.test(x)),failures.join('\n'));
  await browser.close();console.log(JSON.stringify({ok:true,active:145,routed:145,dropped:0,duplicates:0,families:9,shared:6,idempotent:true,emailSent:false}));
})().catch(e=>{console.error('E2E_FAILED',e.message);process.exit(1)});
