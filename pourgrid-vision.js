(function(root,factory){
  var api=factory();
  if(typeof module==="object"&&module.exports)module.exports=api;
  else root.PourGridVision=api;
})(typeof self!=="undefined"?self:this,function(){
  "use strict";
  function idOf(p){return String(p&& (p.id||p.productId||p.catalogId||p.sku||p.name)||"Unknown");}
  function context(products){var first=(products||[])[0]||{};return {vendor:first.dist||"",category:first.cat||""};}
  function byId(products,id){return (products||[]).find(function(p){return idOf(p)===String(id)||p.name===String(id);});}
  function unitInfo(product){
    var cfg=product&&product.visionPackaging||{},unitsPerCase=Number(cfg.unitsPerCase||product&&product.unitsPerCase||product&&product.pack)||1;
    return {mode:cfg.mode||"standard",unitsPerCase:Math.max(1,unitsPerCase),unitLabel:cfg.unitLabel||product&&product.unitLabel||"units",innerPacksPerCase:Number(cfg.innerPacksPerCase)||0,unitsPerInner:Number(cfg.unitsPerInner)||0,buildToBasis:cfg.buildToBasis||"cases"};
  }
  function reviewRows(results,products){
    var rows={};(results||[]).forEach(function(result){
      var product=byId(products,result.productId),id=product?idOf(product):"Unknown",key=id==="Unknown"?"Unknown":id,row=rows[key];
      if(!row)row=rows[key]={productId:id,productName:product?product.name:"Unknown",detectedCases:0,detectedLooseUnits:0,confidence:"high",sourcePhotoIds:[],unknown:!product,removed:false};
      row.detectedCases+=Math.max(0,Number(result.detectedCases)||0);row.detectedLooseUnits+=Math.max(0,Number(result.detectedLooseUnits)||0);
      row.sourcePhotoIds=row.sourcePhotoIds.concat(result.sourcePhotoIds||[]).filter(function(v,i,a){return a.indexOf(v)===i;});
      if(result.confidence==="low"||row.confidence==="low")row.confidence="low";else if(result.confidence==="medium")row.confidence="medium";
    });return Object.keys(rows).map(function(k){return rows[k];});
  }
  function applyReviewedCounts(existing,reviewed,products){
    var counts=Object.assign({},existing||{}),updated=[];
    (reviewed||[]).forEach(function(row){
      if(row.removed||row.unknown||row.productId==="Unknown")return;var product=byId(products,row.productId);if(!product)return;
      var info=unitInfo(product),cases=Math.max(0,Number(row.detectedCases)||0),loose=Math.max(0,Number(row.detectedLooseUnits)||0),name=product.name;
      if(info.mode==="caseLoose"||info.mode==="nestedCase"){
        counts[name+"::cases"]=String(cases);counts[name+"::loose"]=String(loose);
        if(info.mode==="nestedCase")counts[name+"::inner"]="0";
        counts[name]=String(cases+(loose/info.unitsPerCase));
      }else if(info.mode==="halfCase"){
        counts[name+"::cases"]=String(cases);counts[name+"::halves"]=String(loose);counts[name]=String(cases+(loose*.5));
      }else counts[name]=String(product.unit==="Case"?cases+(loose/info.unitsPerCase):cases*info.unitsPerCase+loose);
      updated.push(name);
    });return {counts:counts,updatedNames:updated};
  }
  function plural(n,one,many){return Number(n)===1?one:many;}
  function words(product,info){
    var raw=String(info.unitLabel||product.unit||"units").toLowerCase();
    if(/^bib/.test(String(product.name||"").toLowerCase()))return "BIBs";
    if(/co2|tank/.test(String(product.name||"").toLowerCase()))return "tanks";
    if(info.mode==="halfCase")return "half cases";
    if(info.buildToBasis!=="units"&&product.unit==="Case"&&Number(product.pack)===1)return "cases";
    if(raw==="units"&&/can/i.test(String(product.name||"")))return "cans";
    if(raw==="units"&&product.unit==="Case"&&Number(product.pack)>1)return "bottles";
    return raw;
  }
  function orderQuantity(product,onHand,config){
    var info=Object.assign(unitInfo(product),config||{}),counted=Number(onHand)||0,target=Number(product.buildTo)||0,countedForTarget=info.buildToBasis==="units"?counted*info.unitsPerCase:counted,shortage=Math.max(target-countedForTarget,0);if(shortage===0)return 0;return product.unit==="Case"?(Number(product.pack)>1?Math.ceil(shortage/Number(product.pack)):Math.ceil(shortage)):shortage;
  }
  function orderExplanation(product,onHand,config,adjustment){
    var info=Object.assign(unitInfo(product),config||{}),counted=Number(onHand)||0,target=Number(product.buildTo)||0,countedForTarget=info.buildToBasis==="units"?counted*info.unitsPerCase:counted;
    var shortage=Math.max(target-countedForTarget,0),orderedByCase=product.unit==="Case",divisor=orderedByCase&&Number(product.pack)>1?Number(product.pack):1,base=orderQuantity(product,onHand,info),suggested=Math.max(0,base+(Number(adjustment)||0)),itemWords=words(product,info);
    var text="You have "+countedForTarget+" "+itemWords+". Your target is "+target+". You are short "+shortage+" "+itemWords+". ";
    if(orderedByCase&&divisor>1){text+=(shortage&&shortage%divisor!==0?"This product is ordered by full case, so PourGrid rounds up to ":"At "+divisor+" "+itemWords+" per case, order ")+suggested+" "+plural(suggested,"case","cases")+".";}
    else text+=(orderedByCase?"This item is ordered by the case. ":"")+"Order "+suggested+" "+plural(suggested,String(product.unit||"unit").toLowerCase(),String(product.unit||"unit").toLowerCase()+"s")+".";
    return {target:target,counted:countedForTarget,shortage:shortage,unitsPerCase:divisor,suggestedOrder:suggested,text:text};
  }
  return {idOf:idOf,context:context,unitInfo:unitInfo,reviewRows:reviewRows,applyReviewedCounts:applyReviewedCounts,orderQuantity:orderQuantity,orderExplanation:orderExplanation};
});
