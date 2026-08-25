export const WATER_PARTS_PER_ONE_SYRUP='water_parts_per_one_syrup';

export function finishedYieldOz(syrupOz,waterParts,basis=WATER_PARTS_PER_ONE_SYRUP){
  const syrup=Number(syrupOz),water=Number(waterParts);
  if(basis!==WATER_PARTS_PER_ONE_SYRUP||!Number.isFinite(syrup)||syrup<=0||!Number.isFinite(water)||water<=0)return null;
  return syrup*(1+water);
}

export function finishedCostPerOz(price,syrupOz,waterParts,basis=WATER_PARTS_PER_ONE_SYRUP){
  const purchasePrice=price==null||price===''?null:Number(price),yieldOz=finishedYieldOz(syrupOz,waterParts,basis);
  return Number.isFinite(purchasePrice)&&purchasePrice>=0&&yieldOz?purchasePrice/yieldOz:null;
}

export const BIB_PRODUCTS=Object.freeze([
  {key:'coke-bib',name:'BIB Coke',packageOz:640,purchasePrice:77.40,waterParts:5,basis:WATER_PARTS_PER_ONE_SYRUP,source:'Coca-Cola HVT dispenser manual: 5:1 for most carbonated products; BIB label governs exceptions.',sourceUrl:'https://www.coca-colaparts.com/?fid=648&mod=parts&op=dwnattach'},
  {key:'diet-coke-bib',name:'BIB Diet Coke',packageOz:640,purchasePrice:77.40,waterParts:5,basis:WATER_PARTS_PER_ONE_SYRUP,source:'Coca-Cola HVT dispenser manual: 5:1 for most carbonated products; BIB label governs exceptions.',sourceUrl:'https://www.coca-colaparts.com/?fid=648&mod=parts&op=dwnattach'},
  {key:'fanta-orange-bib',name:'Fanta Orange BIB',packageOz:640,purchasePrice:77.40,waterParts:5,basis:WATER_PARTS_PER_ONE_SYRUP,source:'Coca-Cola HVT dispenser manual: 5:1 for most carbonated products; BIB label governs exceptions.',sourceUrl:'https://www.coca-colaparts.com/?fid=648&mod=parts&op=dwnattach'},
  {key:'sprite-bib',name:'BIB Sprite',packageOz:640,purchasePrice:77.40,waterParts:5,basis:WATER_PARTS_PER_ONE_SYRUP,source:'Coca-Cola HVT dispenser manual: 5:1 for most carbonated products; BIB label governs exceptions.',sourceUrl:'https://www.coca-colaparts.com/?fid=648&mod=parts&op=dwnattach'},
  {key:'cranberry-bib',name:'BIB Cranberry',packageOz:384,purchasePrice:57.80,waterParts:null,basis:null,source:'Unresolved: official Coca-Cola manual says uncarbonated juices/mixers can be 1:1–2:1 and requires the BIB label ratio.',sourceUrl:'https://www.coca-colaparts.com/?fid=648&mod=parts&op=dwnattach'},
  {key:'lemonade-bib',name:'BIB Lemonade',packageOz:null,purchasePrice:77.40,waterParts:null,basis:null,source:'Unresolved: repository verifies price only; official product page confirms fountain BIB but not package yield or ratio.',sourceUrl:'https://www.cokesolutions.com/products/brands/minute-maid/minute-maid--lemonade'},
  {key:'club-soda-gun',name:'BIB Club Soda',packageOz:null,purchasePrice:0,waterParts:null,basis:null,source:'Virtual gun ingredient: tap water plus CO2; no syrup BIB and no inventory demand.',sourceUrl:null,virtualNonOrderable:true,fixedFinishedCostPerOz:0}
]);
