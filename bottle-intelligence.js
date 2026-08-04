(function(root,factory){
  var api=factory();
  if(typeof module==="object"&&module.exports)module.exports=api;
  else root.PourGridIntelligence=api;
})(typeof self!=="undefined"?self:this,function(){
  "use strict";
  var RESPONSE_FIELDS=["productId","packagingType","detectedCases","detectedLooseUnits","confidence","sourcePhotoIds","shortEvidenceCode"];
  var WEAK_EVIDENCE=/^(?:|unspecified|unknown|unreadable|illegible|blank|none|null|n\/a|na|not[-_ ]?visible|no[-_ ]?code)$/i;

  function now(){return typeof performance!=="undefined"&&performance.now?performance.now():Date.now();}
  function catalogId(p){return String(p.id||p.productId||p.catalogId||p.sku||p.name||"Unknown");}
  function candidates(catalog,context){
    context=context||{};var pool=(catalog||[]).filter(function(p){
      return (!context.vendor||p.dist===context.vendor)&&(!context.category||p.cat===context.category);
    });
    if(context.vendor==="Merchants")pool.sort(function(a,b){
      var ap=a.cat==="Mixer"?0:1,bp=b.cat==="Mixer"?0:1;return ap-bp;
    });
    return pool.slice(0,30).map(function(p){return {productId:catalogId(p),displayName:p.name||catalogId(p),packagingType:p.packagingType||p.variant||p.unit||"Case",unitsPerCase:Number(p.unitsPerCase||p.pack)||1};});
  }
  function request(image,photoId,candidateSet){
    return {image:{base64:image.base64,mediaType:image.mediaType},photoId:photoId,candidates:candidateSet,
      responseFormat:{type:"json",additionalProperties:false,fields:RESPONSE_FIELDS},
      rules:["Return JSON only","Use Unknown when no candidate matches","Return the candidate productId exactly","Count a sealed known pack as one case","Count loose units separately","Do not infer hidden units","Use shortEvidenceCode for visible packaging signatures"]};
  }
  function timeout(promise,ms,label){
    var timer;return Promise.race([promise,new Promise(function(_,reject){timer=setTimeout(function(){var e=new Error(label+" timed out");e.code="PHOTO_TIMEOUT";reject(e);},ms);})]).finally(function(){clearTimeout(timer);});
  }
  function validate(raw,photoId){
    raw=raw||{};var out={};RESPONSE_FIELDS.forEach(function(k){out[k]=raw[k];});
    out.productId=out.productId||"Unknown";out.packagingType=out.packagingType||"unknown";
    out.detectedCases=Math.max(0,Number(out.detectedCases)||0);out.detectedLooseUnits=Math.max(0,Number(out.detectedLooseUnits)||0);
    out.confidence=["high","medium","low"].indexOf(out.confidence)>=0?out.confidence:"low";
    out.sourcePhotoIds=Array.isArray(out.sourcePhotoIds)&&out.sourcePhotoIds.length?out.sourcePhotoIds:[photoId];out.shortEvidenceCode=String(out.shortEvidenceCode||"UNSPECIFIED").trim().slice(0,80);
    return out;
  }
  function normalized(value){return String(value||"").trim().toLowerCase().replace(/\s+/g,"-");}
  function reliableEvidence(value){var v=String(value||"").trim();return v&&!WEAK_EVIDENCE.test(v)?v:"";}
  function variantKey(r){return normalized(r.packagingVariant||r.packagingType||"unknown");}
  function contextsOverlap(a,b){
    var ac=a._photoContext||{},bc=b._photoContext||{};
    if(ac.locationId&&bc.locationId&&ac.locationId!==bc.locationId)return false;
    if(ac.overlapGroup&&bc.overlapGroup)return ac.overlapGroup===bc.overlapGroup;
    if(Array.isArray(ac.overlapWith)&&ac.overlapWith.indexOf(bc.photoId)>=0)return true;
    if(Array.isArray(bc.overlapWith)&&bc.overlapWith.indexOf(ac.photoId)>=0)return true;
    return !ac.locationId&&!bc.locationId;
  }
  function merge(results){
    var groups={},decisions=[];
    (results||[]).forEach(function(r){
      var identity=r.productId||"Unknown",key=identity+"::"+variantKey(r),g=groups[key];
      if(!g)g=groups[key]={productId:identity,packagingType:r.packagingType,packagingVariant:r.packagingVariant,detectedCases:0,detectedLooseUnits:0,confidence:"high",sourcePhotoIds:[],shortEvidenceCode:"",evidenceSignatures:[],mergeStatus:"merged",_observations:[]};
      var signature=reliableEvidence(r.shortEvidenceCode),prior=null;
      if(signature)for(var i=0;i<g._observations.length;i++){if(g._observations[i].signature===signature&&contextsOverlap(g._observations[i].result,r)){prior=g._observations[i];break;}}
      if(prior){
        var previous=prior.result,unitsPerCase=Number(r._unitsPerCase||previous._unitsPerCase)||1,old=previous.detectedCases*unitsPerCase+previous.detectedLooseUnits,next=r.detectedCases*unitsPerCase+r.detectedLooseUnits;
        if(next>old){g.detectedCases+=r.detectedCases-previous.detectedCases;g.detectedLooseUnits+=r.detectedLooseUnits-previous.detectedLooseUnits;prior.result=r;}
        g.mergeStatus="deduplicated";decisions.push({productId:identity,packagingType:r.packagingType,photos:previous.sourcePhotoIds.concat(r.sourcePhotoIds).filter(function(v,j,a){return a.indexOf(v)===j;}),decision:"suspected duplicate; clearest/highest visible count retained",signature:signature});
      }else{
        g.detectedCases+=r.detectedCases;g.detectedLooseUnits+=r.detectedLooseUnits;
        g._observations.push({signature:signature,result:r});
      }
      if(signature&&g.evidenceSignatures.indexOf(signature)<0)g.evidenceSignatures.push(signature);
      g.shortEvidenceCode=g.shortEvidenceCode||signature||r.shortEvidenceCode;
      g.sourcePhotoIds=g.sourcePhotoIds.concat(r.sourcePhotoIds).filter(function(v,j,a){return a.indexOf(v)===j;});
      if(r.confidence==="low"||g.confidence==="low")g.confidence="low";else if(r.confidence==="medium")g.confidence="medium";
    });
    return {results:Object.keys(groups).map(function(k){delete groups[k]._observations;return groups[k];}),deduplicationDecisions:decisions};
  }
  async function run(options){
    options=options||{};var started=now(),photos=options.photos||[],limit=Math.max(1,Math.min(4,options.concurrency||3)),perPhoto=options.perPhotoTimeoutMs||25000,ceiling=options.batchTimeoutMs||60000;
    var completed=[],timings=[],cursor=0,active=0,finalized=false,settled=false,states=photos.map(function(photo,index){return {photoId:photo.id||"photo-"+(index+1),status:"pending",photo:photo,index:index};});
    function emit(stage,id,status){if(!finalized&&options.onProgress)options.onProgress({stage:stage,photoId:id,status:status,completed:completed.length,total:photos.length,elapsedMs:Math.round(now()-started)});}
    function finishState(state,status,message,raw,t){if(finalized||state.status==="complete"||state.status==="failed"||state.status==="timeout")return false;state.status=status;state.message=message;timings.push({photoId:state.photoId,aiMs:Math.round(now()-t),status:status,rawCompactResponse:raw});return true;}
    emit("upload",null,"started");
    async function one(state){
      var t=now();state.status="active";emit("analyzing",state.photoId,"started");
      try{
        var raw=await timeout(Promise.resolve().then(function(){return options.analyze(state.photo,state.photoId,state.index);}),Math.min(perPhoto,Math.max(1,ceiling-(now()-started))),state.photoId);
        if(finalized)return;var value=validate(raw,state.photoId);value._unitsPerCase=Number(options.unitsPerCase)||1;value._photoContext={photoId:state.photoId,locationId:state.photo.locationId||"",overlapGroup:state.photo.overlapGroup||(!state.photo.locationId?"batch":""),overlapWith:state.photo.overlapWith||[]};
        if(finishState(state,"complete",null,raw,t)){completed.push(value);emit("analyzing",state.photoId,"complete");}
      }catch(e){if(finalized)return;var status=e&&e.code==="PHOTO_TIMEOUT"?"timeout":"failed";if(finishState(state,status,e&&e.message||String(e),null,t))emit("analyzing",state.photoId,status);}
    }
    await new Promise(function(resolve){
      function resolveOnce(){if(!settled){settled=true;resolve();}}
      var ceilingTimer=setTimeout(function(){finalized=true;states.forEach(function(s){if(s.status==="pending"||s.status==="active"){s.status="timeout";s.message="Batch ceiling reached";timings.push({photoId:s.photoId,aiMs:Math.round(now()-started),status:"timeout"});}});resolveOnce();},ceiling);
      function pump(){
        if(finalized)return;while(active<limit&&cursor<states.length){var state=states[cursor++];active++;one(state).finally(function(){active--;if(finalized)return;if(cursor>=states.length&&active===0){clearTimeout(ceilingTimer);resolveOnce();}else pump();});}
        if(cursor>=states.length&&active===0){clearTimeout(ceilingTimer);resolveOnce();}
      }
      pump();
    });
    var ceilingReached=finalized;if(!ceilingReached)emit("merging",null,"started");
    var mt=now(),merged=merge(completed),mergeMs=Math.round(now()-mt);if(!ceilingReached)emit("merging",null,"complete");finalized=true;
    var unfinished=states.filter(function(s){return s.status!=="complete";}).map(function(s){return {photoId:s.photoId,status:s.status,message:s.message};});
    return {results:merged.results,completedPhotoCount:completed.length,unfinishedPhotos:unfinished,partial:unfinished.length>0,deduplicationDecisions:merged.deduplicationDecisions,diagnostics:{aiByPhoto:timings,mergeMs:mergeMs,totalSessionMs:Math.round(now()-started),status:unfinished.length?"partial":"complete"}};
  }
  return {RESPONSE_FIELDS:RESPONSE_FIELDS,candidates:candidates,request:request,validate:validate,merge:merge,run:run,reliableEvidence:reliableEvidence};
});
