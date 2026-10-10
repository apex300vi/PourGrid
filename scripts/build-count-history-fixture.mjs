// Isolated, synthetic mobile QA surface. Only included in deploy previews.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
if(process.env.CONTEXT==='deploy-preview'||process.env.PG_BUILD_FIXTURE==='1'){
let html=await readFile('dist/index.html','utf8');
html=html.replace(/<script>\(function\(\)\{'use strict';window\.POURGRID_BOOT=[\s\S]*?<\/script>/,'');
html=html.replace(/<script src="\/runtime-config\.js"><\/script><script src="\/auth-gate\.js" defer><\/script>/,'');
html=html.replaceAll('type="text/pourgrid-protected" data-pg-protected','');
html=html.replace('<head>','<head><base href="/">');
html=html.replace('<body class="pg-auth-pending">',`<body><script>
const fixtureStorage=new Map();Object.defineProperty(window,'localStorage',{value:{getItem:k=>fixtureStorage.get(k)||null,setItem:(k,v)=>fixtureStorage.set(k,String(v)),removeItem:k=>fixtureStorage.delete(k)}});
window.POURGRID_CONFIG={supabaseUrl:'https://invalid.example',supabaseAnonKey:''};
window.POURGRID_AUTH_CONTEXT={organizationId:'qa-org',organizationName:'Sapphire QA',locationId:'qa-count-history',locationName:'Sapphire QA',capabilities:{approve:true}};
window.fetch=()=>Promise.reject(new Error('Isolated QA: network disabled'));window.setInterval=()=>0;
</script>`);
html=html.replace('</body>',`<script>
var qaAt=Date.now()-7*86400000,qaStoli=PRODUCTS.find(p=>p.name==='Stoli Vodka');
var qaHistory=[{id:qaAt,draftId:'qa-order-1',orderType:'bar',date:new Date(qaAt).toLocaleDateString('en-US'),time:'12:00 PM',counts:{'Stoli Vodka':96,'Stoli Blu':12},inventorySnapshot:PourGridCountHistory.capture(PRODUCTS.filter(p=>p.name==='Stoli Vodka'||p.name==='Stoli Blu'),{'Stoli Vodka':96,'Stoli Blu':12},p=>pgPack(p),qaAt),items:[{...qaStoli,finalOrderQty:2,orderQty:2,inventoryMetric:PourGridCountHistory.metric(qaStoli,pgPack(qaStoli))}],stoliFreeFlavor:'Stoli Blu'}];
loadHist=async()=>qaHistory;
S.history=qaHistory;S.counts={'Stoli Vodka':'70','Stoli Blu':'10'};S.sync='ok';S.screen='app';S.tab='bar';S.countCat='Vodka';S.bSub='count';
document.getElementById('pgAuthRoot').hidden=true;document.getElementById('app').hidden=false;render();
</script></body>`);
await mkdir('dist/__checks',{recursive:true});await writeFile('dist/__checks/count-history-app.html',html);
await writeFile('dist/__checks/count-history.html',`<!doctype html><meta charset="utf-8"><title>PourGrid count history — isolated mobile QA</title><style>body{margin:0;background:#172b38;color:white;font:15px system-ui}nav{padding:8px}button{min-height:40px;margin:4px}iframe{display:block;border:0;width:390px;height:844px;margin:auto;background:#04111f}</style><nav>Isolated sample data · No live requests <button onclick="document.querySelector('iframe').style.width='320px'">320 px</button><button onclick="document.querySelector('iframe').style.width='390px'">390 px</button></nav><iframe title="PourGrid mobile preview" src="count-history-app.html"></iframe>`);
}
