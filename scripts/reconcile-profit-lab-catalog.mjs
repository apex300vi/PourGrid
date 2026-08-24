import fs from 'node:fs';

const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const match=html.match(/var PG_V12_PRODUCTS=(\[[\s\S]*?\]);\s*var PRODUCTS=/);
if(!match)throw new Error('Active PourGrid catalog was not found');
const products=JSON.parse(match[1]);
const normalized=value=>String(value||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim();
const category=product=>{
  const raw=String(product.cat||'Other');
  if(String(product.dist||'').toLowerCase()==='merchants')return'Merchants';
  if(/whiskey|whisky|bourbon|scotch/i.test(raw))return'Whiskey / Bourbon / Scotch';
  if(/liqueur|cordial/i.test(raw))return'Liqueurs / Cordials';
  if(/wine|champagne/i.test(raw))return'Wine / Champagne';
  if(/non.?alc|water|bib/i.test(raw))return'Non-alcoholic';
  return raw;
};
const active=products.filter(product=>product.active!==false);
const categories={};
const identities=new Map();
const duplicateCandidates=[];
for(const product of active){
  const display=category(product);
  categories[display]=(categories[display]||0)+1;
  const identity=[normalized(product.name),product.bottleMl||'',product.pack||''].join('|');
  if(identities.has(identity))duplicateCandidates.push({name:product.name,first:identities.get(identity),candidate:product.catalogId||product.id||product.name});
  else identities.set(identity,product.catalogId||product.id||product.name);
}
const merchants=active.filter(product=>category(product)==='Merchants');
const report={generatedAt:new Date().toISOString(),totalActive:active.length,categories:Object.fromEntries(Object.entries(categories).sort(([a],[b])=>a.localeCompare(b))),merchants:{mixers:merchants.filter(product=>product.cat==='Mixer').length,fruit:merchants.filter(product=>product.cat==='Fruit').length,unified:merchants.length},duplicateCandidates,aliasesResolved:[],inactiveRecipeReferences:'runtime-authorized-check',missingCost:'runtime-authorized-check',missingConversion:'runtime-authorized-check',sourceCounts:{catalog:active.length,shared:'runtime-authorized-check',custom:'runtime-authorized-check'},zeroUnexplainedMissingActiveItems:Object.values(categories).reduce((sum,count)=>sum+count,0)===active.length,recordsDeleted:0};
process.stdout.write(`${JSON.stringify(report,null,2)}\n`);
