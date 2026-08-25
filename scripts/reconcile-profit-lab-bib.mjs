import {BIB_PRODUCTS,finishedCostPerOz,finishedYieldOz} from './bib-costing-model.mjs';

const rows=BIB_PRODUCTS.map(product=>{
  const finishedYield=product.virtualNonOrderable?null:finishedYieldOz(product.packageOz,product.waterParts,product.basis);
  const corrected=product.fixedFinishedCostPerOz??finishedCostPerOz(product.purchasePrice,product.packageOz,product.waterParts,product.basis);
  const previous=product.purchasePrice!=null&&product.packageOz?product.purchasePrice/product.packageOz:null;
  return {product:product.name,key:product.key,packageSizeOz:product.packageOz,purchasePrice:product.purchasePrice,mixRatio:product.waterParts==null?null:`${product.waterParts} water : 1 syrup`,ratioBasis:product.basis,finishedYieldOz:finishedYield,previousCostPerOz:previous,correctedCostPerOz:corrected,metadataSource:product.source,sourceUrl:product.sourceUrl,virtualNonOrderable:!!product.virtualNonOrderable,unresolved:corrected==null};
});
const invalidReady=BIB_PRODUCTS.filter(product=>!product.virtualNonOrderable&&product.waterParts!=null&&finishedCostPerOz(product.purchasePrice,product.packageOz,product.waterParts,product.basis)==null);
const report={generatedAt:new Date().toISOString(),products:rows,resolved:rows.filter(row=>!row.unresolved).length,unresolved:rows.filter(row=>row.unresolved).map(row=>row.product),invalidReady:invalidReady.map(product=>product.name)};
process.stdout.write(`${JSON.stringify(report,null,2)}\n`);
if(invalidReady.length)process.exitCode=1;
