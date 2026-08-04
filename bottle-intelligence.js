(function(root,factory){
  var api=factory();
  if(typeof module==="object"&&module.exports)module.exports=api;
  else root.PourGridIntelligence=api;
})(typeof self!=="undefined"?self:this,function(){
  "use strict";
  var RESPONSE_FIELDS=["productId","packagingType","detectedCases","detectedLooseUnits","confidence","sourcePhotoIds","shortEvidenceCode"];

  function now(){return typeof performance!=="undefined"&&performance.now?performance.now():Date.now();}
  function candidates(catalog,context){
    context=context||{};var pool=(catalog||[]).filter(function(p){
      return (!context.vendor||p.dist===context.vendor)&&(!context.category||p.cat===context.category);
    });
    if(context.vendor==="Merchants")pool.sort(function(a,b){
      var ap=a.cat==="Mixer"?0:1,bp=b.cat==="Mixer"?0:1;return ap-bp;
    });
    return pool.slice(0,30).map(function(p){return {productId:p.name,packagingType:p.unit||"Case",unitsPerCase:Number(p.unitsPerCase||p.pack)||1};});
  }
  function request(image,photoId,candidateSet){
    return {image:{base64:image.base64,mediaType:image.mediaType},photoId:photoId,candidates:candidateSet,
      responseFormat:{type:"json",additionalProperties:false,fields:RESPONSE_FIELDS},
      rules:["Return JSON only","Use Unknown when no candidate matches","Count a sealed known pack as one case","Count loose units separately","Do not infer hidden units","Use shortEvidenceCode for visible packaging signatures"]};
  }
  function timeout(promise,ms,label){
    var timer;return Promise.race([promise,new Promise(function(_,reject){timer=setTimeout(function(){var e=new Error(label+" timed out");e.code="PHOTO_TIMEOUT";reject(e);},ms);})]).finally(function(){clearTimeout(timer);});
  }
  function validate(raw,photoId){
    var out={};RESPONSE_FIELDS.forEach(function(k){out[k]=raw[k];});
    out.productId=out.productId||"Unknown";out.packagingType=out.packagingType||"unknown";
    out.detectedCases=Math.max(0,Number(out.detectedCases)||0);out.detectedLooseUnits=Math.max(0,Number(out.detectedLooseUnits)||0);
    out.confidence=["high","medium","low"].indexOf(out.confidence)>=0?out.confidence:"low";
    out.sourcePhotoIds=Array.isArray(out.sourcePhotoIds)?out.sourcePhotoIds:[photoId];out.shortEvidenceCode=String(out.shortEvidenceCode||"UNSPECIFIED").slice(0,80);
    return out;
  }
  function merge(results){
    var groups={},decisions=[];
    results.forEach(function(r){
      var key=r.productId||"Unknown",g=groups[key]||(groups[key]={productId:key,packagingType:r.packagingType,detectedCases:0,detectedLooseUnits:0,confidence:"high",sourcePhotoIds:[],shortEvidenceCode:"",mergeStatus:"merged"});
      var duplicate=g.shortEvidenceCode&&r.shortEvidenceCode&&g.shortEvidenceCode===r.shortEvidenceCode;
      if(duplicate){
        var old=g.detectedCases+g.detectedLooseUnits,next=r.detectedCases+r.detectedLooseUnits;
        if(next>old){g.detectedCases=r.detectedCases;g.detectedLooseUnits=r.detectedLooseUnits;g.shortEvidenceCode=r.shortEvidenceCode;}
        g.mergeStatus="deduplicated";decisions.push({productId:key,photos:g.sourcePhotoIds.concat(r.sourcePhotoIds),decision:"suspected duplicate; clearest/highest visible count retained",signature:r.shortEvidenceCode});
      }else{g.detectedCases+=r.detectedCases;g.detectedLooseUnits+=r.detectedLooseUnits;g.shortEvidenceCode=g.shortEvidenceCode||r.shortEvidenceCode;}
      g.sourcePhotoIds=g.sourcePhotoIds.concat(r.sourcePhotoIds).filter(function(v,i,a){return a.indexOf(v)===i;});
      if(r.confidence==="low"||g.confidence==="low")g.confidence="low";else if(r.confidence==="medium")g.confidence="medium";
    });
    return {results:Object.keys(groups).map(function(k){return groups[k];}),deduplicationDecisions:decisions};
  }
  async function run(options){
    var started=now(),photos=options.photos||[],limit=Math.max(1,Math.min(4,options.concurrency||3)),perPhoto=options.perPhotoTimeoutMs||25000,ceiling=options.batchTimeoutMs||60000;
    var completed=[],failures=[],timings=[],cursor=0,active=[],closed=false;
    function emit(stage,id,status){if(options.onProgress)options.onProgress({stage:stage,photoId:id,status:status,completed:completed.length,total:photos.length,elapsedMs:Math.round(now()-started)});}
    emit("upload",null,"started");
    async function one(photo,index){var id=photo.id||"photo-"+(index+1),t=now();emit("analyzing",id,"started");try{
      var raw=await timeout(Promise.resolve(options.analyze(photo,id,index)),Math.min(perPhoto,Math.max(1,ceiling-(now()-started))),id);var value=validate(raw,id);
      completed.push(value);timings.push({photoId:id,aiMs:Math.round(now()-t),status:"complete",rawCompactResponse:raw});emit("analyzing",id,"complete");
    }catch(e){failures.push({photoId:id,status:e.code==="PHOTO_TIMEOUT"?"timeout":"failed",message:e.message});timings.push({photoId:id,aiMs:Math.round(now()-t),status:failures[failures.length-1].status});emit("analyzing",id,failures[failures.length-1].status);}}
    await new Promise(function(resolve){
      var ceilingTimer=setTimeout(function(){closed=true;resolve();},ceiling);
      function pump(){if(closed)return;while(active.length<limit&&cursor<photos.length){(function(i){var p=one(photos[i],i).finally(function(){active.splice(active.indexOf(p),1);if(cursor>=photos.length&&active.length===0){clearTimeout(ceilingTimer);resolve();}else pump();});active.push(p);})(cursor++);}if(cursor>=photos.length&&active.length===0){clearTimeout(ceilingTimer);resolve();}}
      pump();
    });
    for(var i=cursor;i<photos.length;i++)failures.push({photoId:photos[i].id||"photo-"+(i+1),status:"timeout",message:"Batch ceiling reached"});
    emit("merging",null,"started");var mt=now(),merged=merge(completed),mergeMs=Math.round(now()-mt);emit("merging",null,"complete");
    return {results:merged.results,completedPhotoCount:completed.length,unfinishedPhotos:failures,partial:failures.length>0,deduplicationDecisions:merged.deduplicationDecisions,diagnostics:{aiByPhoto:timings,mergeMs:mergeMs,totalSessionMs:Math.round(now()-started),status:failures.length?"partial":"complete"}};
  }
  return {RESPONSE_FIELDS:RESPONSE_FIELDS,candidates:candidates,request:request,validate:validate,merge:merge,run:run};
});
