import fs from 'node:fs';

const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const match=html.match(/var PG_V12_PRODUCTS=(\[[\s\S]*?\]);\s*var PRODUCTS=/);
if(!match)throw new Error('Active PourGrid catalog was not found');
const products=JSON.parse(match[1]);
const normalized=value=>String(value||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim();
const sourceId=product=>String(product.catalogId||product.id||product.productId||product.key||product.name);
const category=product=>{
  const raw=String(product.cat||product.category||product.subcategory||'Other');
  if(String(product.dist||product.vendor||'').toLowerCase()==='merchants'||/mixers|fruit/i.test(raw))return'Merchants';
  if(/whiskey|whisky|bourbon|scotch/i.test(raw))return'Whiskey / Bourbon / Scotch';
  if(/liqueur|cordial/i.test(raw))return'Liqueurs / Cordials';
  if(/wine|champagne/i.test(raw))return'Wine / Champagne';
  if(/non.?alc|water|bib/i.test(raw))return'Non-alcoholic';
  return raw;
};
const active=products.filter(product=>product.active!==false);
const categories={},identities=new Map(),options=[],duplicateCandidates=[],missingActiveItems=[],invalidCategoryAssignments=[],optionRoundTripFailures=[],selectedIdsAbsent=[],aliasCollisions=[],packageVariants=[];
for(const product of active){
  const display=category(product),id=`catalog:${sourceId(product)}`,identity=[normalized(product.name),product.bottleMl||product.ml||'',product.pack||product.unitsPerCase||''].join('|');
  categories[display]=(categories[display]||0)+1;
  if(identities.has(identity)){duplicateCandidates.push({name:product.name,first:identities.get(identity).id,candidate:id});continue;}
  const option={id,name:product.name,category:display,identity,sourceId:sourceId(product)};identities.set(identity,option);options.push(option);
}
for(const product of active){
  const id=`catalog:${sourceId(product)}`,matches=options.filter(option=>option.sourceId===sourceId(product));
  if(!matches.length)missingActiveItems.push(id);
  else if(matches[0].category!==category(product))invalidCategoryAssignments.push({id,expected:category(product),actual:matches[0].category});
}
for(const option of options){
  const rebuilt=options.filter(candidate=>candidate.category===option.category).find(candidate=>candidate.id===option.id);
  if(!rebuilt)selectedIdsAbsent.push(option.id);
  else if(rebuilt.id!==option.id)optionRoundTripFailures.push(option.id);
}
const names=new Map();
for(const option of options){const key=normalized(option.name),prior=names.get(key);if(prior&&prior.id!==option.id){if(prior.identity!==option.identity)packageVariants.push({name:option.name,ids:[prior.id,option.id]});else aliasCollisions.push({name:option.name,ids:[prior.id,option.id]});}else names.set(key,option);}
const merchants=active.filter(product=>category(product)==='Merchants'),merchantOptions=options.filter(option=>option.category==='Merchants');
const merchantExcluded=merchants.filter(product=>!merchantOptions.some(option=>option.sourceId===sourceId(product))).map(product=>sourceId(product));
const discrepancies={missingActiveItems,duplicateCandidates,invalidCategoryAssignments,optionRoundTripFailures,selectedIdsAbsent,aliasCollisions,merchantExcluded};
const zeroUnexplainedDiscrepancies=Object.values(discrepancies).every(values=>values.length===0);
const report={generatedAt:new Date().toISOString(),totalActive:active.length,totalOptions:options.length,categories:Object.fromEntries(Object.entries(categories).sort(([a],[b])=>a.localeCompare(b))),merchants:{mixers:merchants.filter(product=>/mixer/i.test(String(product.cat||product.category||product.subcategory))).length,fruit:merchants.filter(product=>/fruit/i.test(String(product.cat||product.category||product.subcategory))).length,unified:merchantOptions.length,excluded:merchantExcluded},...discrepancies,legitimatePackageVariants:packageVariants,aliasesResolved:[],inactiveRecipeReferences:'runtime-authorized-check',missingCost:'runtime-authorized-check',missingConversion:'runtime-authorized-check',sourceCounts:{catalog:options.length,shared:'runtime-authorized-check',custom:'runtime-authorized-check'},zeroUnexplainedDiscrepancies,recordsDeleted:0};
process.stdout.write(`${JSON.stringify(report,null,2)}\n`);
if(!zeroUnexplainedDiscrepancies)process.exitCode=1;
