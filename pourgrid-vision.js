(function(root,factory){
  var api=factory();
  if(typeof module==="object"&&module.exports)module.exports=api;
  else root.PourGridVision=api;
})(typeof self!=="undefined"?self:this,function(){
  "use strict";
  var WORKFLOW_STATES={PREPARING:"Preparing Photos",UPLOADING:"Uploading Photos",ANALYZING:"Analyzing Inventory",COMBINING:"Combining Results",REVIEW:"Ready For Review",UPDATED:"Inventory Updated",FAILED:"Some photos could not be analyzed"};
  function createWorkflow(){
    var state=WORKFLOW_STATES.PREPARING,completed=false;
    return {state:function(){return state;},set:function(next){state=next;if(next===WORKFLOW_STATES.REVIEW)completed=true;return state;},canReview:function(){return completed&&state===WORKFLOW_STATES.REVIEW;},canConfirm:function(rows){return completed&&state===WORKFLOW_STATES.REVIEW&&(rows||[]).some(function(row){return !row.removed&&!row.unknown&&row.productId!=="Unknown";});}};
  }
  function idOf(p){return String(p&& (p.id||p.productId||p.catalogId||p.sku||p.name)||"Unknown");}
  function context(products){var first=(products||[])[0]||{};return {vendor:first.dist||"",category:first.cat||""};}
  function byId(products,id){return (products||[]).find(function(p){return idOf(p)===String(id)||p.name===String(id);});}
  function unitInfo(product){
    var cfg=product&&product.visionPackaging||{},unitsPerCase=Number(cfg.unitsPerCase||product&&product.unitsPerCase||product&&product.pack)||1;
    var mode=cfg.mode||"standard",defaultBasis=mode==="standard"&&product&&product.unit==="Case"&&Number(product.pack)>1?"units":"cases";
    return {mode:mode,unitsPerCase:Math.max(1,unitsPerCase),unitLabel:cfg.unitLabel||product&&product.unitLabel||"units",innerPacksPerCase:Number(cfg.innerPacksPerCase)||0,unitsPerInner:Number(cfg.unitsPerInner)||0,buildToBasis:cfg.buildToBasis||defaultBasis,countBasis:cfg.countBasis||(mode==="standard"?"units":"cases")};
  }
  function effectiveInfo(product,config){var info=Object.assign(unitInfo(product),config||{});info.unitsPerCase=Math.max(1,Number(info.unitsPerCase)||1);if(!info.countBasis)info.countBasis=info.mode==="standard"?"units":"cases";return info;}
  function reviewRows(results,products){
    var rows={};(results||[]).forEach(function(result){
      var product=byId(products,result.productId),id=product?idOf(product):"Unknown",key=id==="Unknown"?"Unknown":id,row=rows[key];
      if(!row)row=rows[key]={productId:id,productName:product?product.name:"Unknown",detectedCases:0,detectedLooseUnits:0,confidence:"high",sourcePhotoIds:[],unknown:!product,removed:false};
      row.detectedCases+=Math.max(0,Number(result.detectedCases)||0);row.detectedLooseUnits+=Math.max(0,Number(result.detectedLooseUnits)||0);
      row.sourcePhotoIds=row.sourcePhotoIds.concat(result.sourcePhotoIds||[]).filter(function(v,i,a){return a.indexOf(v)===i;});
      if(result.confidence==="low"||row.confidence==="low")row.confidence="low";else if(result.confidence==="medium")row.confidence="medium";
    });return Object.keys(rows).map(function(k){return rows[k];});
  }
  function reviewSummary(rows,photoCount,unfinishedCount){
    var active=(rows||[]).filter(function(row){return !row.removed;}),known=active.filter(function(row){return !row.unknown&&row.productId!=="Unknown";});
    return {productsDetected:known.length,highConfidence:known.filter(function(row){return row.confidence==="high";}).length,needsReview:known.filter(function(row){return row.confidence!=="high";}).length,unknownProducts:active.filter(function(row){return row.unknown||row.productId==="Unknown";}).length,photosProcessed:Math.max(0,Number(photoCount)||0)-Math.max(0,Number(unfinishedCount)||0),photosUnfinished:Math.max(0,Number(unfinishedCount)||0)};
  }
  function resultStatus(row){return row.unknown||row.productId==="Unknown"?"Unknown":row.confidence==="high"?"Counted":"Needs Review";}
  function inventoryLines(row,product){
    var info=unitInfo(product||{}),cases=Math.max(0,Number(row&&row.detectedCases)||0),loose=Math.max(0,Number(row&&row.detectedLooseUnits)||0),label=words(product||{},info),total=cases*info.unitsPerCase+loose;
    return {cases:cases+" "+plural(cases,"case","cases"),loose:loose+" "+label,total:total+" total "+label};
  }
  function createPhotoSession(){
    var photos=[],started=false;
    return {add:function(photo){if(!started&&photo)photos.push(photo);return photos.slice();},remove:function(index){if(!started&&index>=0&&index<photos.length)photos.splice(index,1);return photos.slice();},process:function(){if(!photos.length||started)return false;started=true;return true;},resume:function(){started=false;return photos.slice();},failed:function(ids){var wanted=ids||[];return photos.filter(function(photo){return wanted.indexOf(photo.id)>=0;});},photos:function(){return photos.slice();},isProcessing:function(){return started;}};
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
    if(info.buildToBasis!=="units"&&product.unit==="Case")return "cases";
    if(raw==="units"&&/can/i.test(String(product.name||"")))return "cans";
    if(raw==="units"&&product.unit==="Case"&&Number(product.pack)>1)return "bottles";
    return raw;
  }
  function orderQuantity(product,onHand,config){
    var info=effectiveInfo(product,config),counted=Number(onHand)||0,target=Number(product.buildTo)||0,unitBasis=info.buildToBasis==="units",countedForTarget=unitBasis&&info.countBasis==="cases"?counted*info.unitsPerCase:counted,shortage=Math.max(target-countedForTarget,0);if(shortage===0)return 0;if(product.unit!=="Case")return shortage;return unitBasis?Math.ceil(shortage/info.unitsPerCase):Math.ceil(shortage);
  }
  function orderExplanation(product,onHand,config,adjustment){
    var info=effectiveInfo(product,config),counted=Number(onHand)||0,target=Number(product.buildTo)||0,unitBasis=info.buildToBasis==="units",countedForTarget=unitBasis&&info.countBasis==="cases"?counted*info.unitsPerCase:counted;
    var shortage=Math.max(target-countedForTarget,0),orderedByCase=product.unit==="Case",divisor=unitBasis&&orderedByCase?info.unitsPerCase:1,base=orderQuantity(product,onHand,info),manualAdjustment=Number(adjustment)||0,suggested=Math.max(0,base+manualAdjustment),itemWords=words(product,info);
    var text="You currently have "+countedForTarget+" "+itemWords+". Your target is "+target+" "+itemWords+". You are short "+shortage+" "+itemWords+". ";
    if(orderedByCase&&divisor>1){text+="At "+divisor+" "+itemWords+" per case, order "+base+" "+plural(base,"case","cases")+"."+(shortage&&shortage%divisor!==0?" Full-case ordering rounds the shortage up.":"");}
    else text+=(orderedByCase?"This item is ordered by the case. ":"")+"Order "+base+" "+plural(base,String(product.unit||"unit").toLowerCase(),String(product.unit||"unit").toLowerCase()+"s")+".";
    if(manualAdjustment){text+=" Manual adjustment: "+(manualAdjustment>0?"+":"")+manualAdjustment+" "+plural(Math.abs(manualAdjustment),"case","cases")+". Final suggested order: "+suggested+" "+plural(suggested,"case","cases")+".";}
    return {target:target,counted:countedForTarget,shortage:shortage,unitsPerCase:divisor,baseSuggestedOrder:base,manualAdjustment:manualAdjustment,suggestedOrder:suggested,text:text};
  }
  return {WORKFLOW_STATES:WORKFLOW_STATES,createWorkflow:createWorkflow,idOf:idOf,context:context,unitInfo:unitInfo,reviewRows:reviewRows,reviewSummary:reviewSummary,resultStatus:resultStatus,inventoryLines:inventoryLines,createPhotoSession:createPhotoSession,applyReviewedCounts:applyReviewedCounts,orderQuantity:orderQuantity,orderExplanation:orderExplanation};
});
