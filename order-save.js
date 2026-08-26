(function(root,factory){
  var api=factory();if(typeof module==="object"&&module.exports)module.exports=api;else root.PourGridOrderSave=api;
})(typeof self!=="undefined"?self:this,function(){
  "use strict";

  // An order is only "saved" when the server hands back an order id. Anything else —
  // a shared draft that never opened, a dropped connection, a rejected payload — is a
  // failure that has to be visible, because order history is what build-to tracking and
  // predictive ordering read from. A payload that lives only in localStorage is lost work.
  var PENDING_KEY="pourgrid-unsaved-orders-v1";
  var VERSION="order-save-v1.0.0";

  // Failures that prove the payload never reached the database. Only these are safe to
  // re-route: every other failure may already have written a row, and re-routing would
  // put the same order in History twice under a different draft identity.
  var NEVER_SENT=[
    /shared draft is not fully synced/i,
    /shared draft service unavailable/i,
    /shared draft did not open/i,
    /shared draft (?:state )?is unavailable/i,
    /resolve shared draft changes before review/i
  ];

  function text(value){return String(value===null||value===undefined?"":value).trim();}
  function message(error){return text(error&&error.message!==undefined?error.message:error);}

  // Postgres hands bigints back as a number or a string depending on the transport, so the
  // id is validated rather than coerced. A falsy, zero, or unparseable id is not a save.
  function serverOrderId(value){
    var raw=value;
    if(raw===null||raw===undefined||raw===false||raw===true)return null;
    if(typeof raw==="object"){
      if(Array.isArray(raw))raw=raw.length?raw[0]:null;
      if(raw&&typeof raw==="object")raw=raw.orderId!==undefined?raw.orderId:raw.order_id!==undefined?raw.order_id:raw.id;
      if(raw===null||raw===undefined||typeof raw==="object")return null;
    }
    if(typeof raw==="number"&&!isFinite(raw))return null;
    var name=text(raw);
    if(!name||name==="0"||name==="NaN"||name==="null"||name==="undefined"||name==="false")return null;
    return raw;
  }

  function unconfirmed(route){
    var error=new Error("PourGrid could not confirm a server-side save: the "+route+" save returned no order id.");
    error.code="pg_unconfirmed_save";
    error.pgRoute=route;
    // Deliberately not re-routable. No id came back, so we cannot know whether a row exists.
    error.pgReachedServer=true;
    return error;
  }

  function neverReachedServer(error){
    if(!error)return false;
    if(error.pgReachedServer===true)return false;
    if(error.pgNeverSent===true)return true;
    var detail=message(error);
    for(var i=0;i<NEVER_SENT.length;i++)if(NEVER_SENT[i].test(detail))return true;
    return false;
  }

  function assertSavable(entry){
    if(!entry||typeof entry!=="object"||Array.isArray(entry))throw new Error("An order payload is required.");
    if(!text(entry.draftId))throw new Error("A draft identity is required before an order can be saved.");
    if(entry.orderType!=="bar"&&entry.orderType!=="merchants")throw new Error("Order workflow is invalid.");
    if(!Array.isArray(entry.items)||!entry.items.length)throw new Error("At least one order item is required.");
    if(!entry.counts||typeof entry.counts!=="object"||Array.isArray(entry.counts))throw new Error("A count snapshot is required.");
  }

  // Submits one order and resolves only on a confirmed server-side write.
  //   deps.finalizeShared — optional; closes the shared draft and saves in one transaction.
  //   deps.saveDirect     — the authenticated location-scoped save_location_order RPC.
  // Retries of an already-staged order pass saveDirect alone: save_location_order is
  // idempotent on the draft identity, so a lost response cannot become a second order.
  function submit(entry,deps){
    deps=deps||{};
    try{assertSavable(entry);}catch(error){return Promise.reject(error);}
    var routes=[];
    function direct(previous){
      if(typeof deps.saveDirect!=="function")return Promise.reject(previous||new Error("Authenticated order save is unavailable. Reload PourGrid and sign in again."));
      return Promise.resolve().then(function(){return deps.saveDirect(entry);}).then(function(result){
        routes.push("direct");
        var id=serverOrderId(result);
        if(id===null)throw unconfirmed("direct");
        return {orderId:id,route:"direct",routes:routes,version:VERSION};
      });
    }
    if(typeof deps.finalizeShared!=="function")return direct(null);
    return Promise.resolve().then(function(){return deps.finalizeShared(entry);}).then(function(result){
      routes.push("shared-draft");
      var id=serverOrderId(result);
      if(id===null)throw unconfirmed("shared-draft");
      return {orderId:id,route:"shared-draft",routes:routes,version:VERSION};
    },function(error){
      routes.push("shared-draft");
      if(!neverReachedServer(error))throw error;
      return direct(error);
    });
  }

  function parse(store,key){
    try{var raw=store&&store.getItem?store.getItem(key):null;return raw?JSON.parse(raw):null;}catch(error){return null;}
  }
  function persist(store,rows){
    try{store.setItem(PENDING_KEY,JSON.stringify(rows));return true;}catch(error){return false;}
  }
  function usable(row){return !!(row&&typeof row==="object"&&text(row.draftId)&&row.entry&&typeof row.entry==="object");}

  function list(store){
    var rows=parse(store,PENDING_KEY);
    return Array.isArray(rows)?rows.filter(usable):[];
  }
  function find(store,draftId){
    var id=text(draftId);
    if(!id)return null;
    var rows=list(store);
    for(var i=0;i<rows.length;i++)if(text(rows[i].draftId)===id)return rows[i];
    return null;
  }
  function remove(store,draftId){
    var id=text(draftId),rows=list(store).filter(function(row){return text(row.draftId)!==id;});
    persist(store,rows);
    return rows;
  }

  // Staged before the network call, so an order survives a failed save, a closed tab, or a
  // phone that dies mid-request. Re-staging the same draft keeps the original stagedAt and
  // the attempt count: the record is the order, not the attempt.
  function stage(store,entry,meta){
    meta=meta||{};
    assertSavable(entry);
    var rows=list(store),id=text(entry.draftId),existing=null;
    rows=rows.filter(function(row){
      if(text(row.draftId)!==id)return true;
      existing=row;return false;
    });
    var record={
      version:VERSION,
      draftId:id,
      orderType:text(entry.orderType)||text(meta.orderType)||"bar",
      label:text(meta.label)||(existing&&text(existing.label))||"",
      stagedAt:(existing&&text(existing.stagedAt))||text(meta.now)||new Date().toISOString(),
      attempts:existing&&Number(existing.attempts)>0?Number(existing.attempts):0,
      lastError:existing?existing.lastError||null:null,
      lastAttemptAt:existing?existing.lastAttemptAt||null:null,
      entry:entry
    };
    rows.push(record);
    record.persisted=persist(store,rows);
    return record;
  }

  function fail(store,draftId,error,now){
    var id=text(draftId),rows=list(store),touched=null;
    rows.forEach(function(row){
      if(text(row.draftId)!==id)return;
      row.attempts=(Number(row.attempts)||0)+1;
      row.lastError=message(error)||"Save failed";
      row.lastAttemptAt=text(now)||new Date().toISOString();
      touched=row;
    });
    if(touched)persist(store,rows);
    return touched;
  }

  function resolve(store,draftId,orderId){
    var record=find(store,draftId);
    remove(store,draftId);
    return record?{draftId:record.draftId,orderId:orderId===undefined?null:orderId,entry:record.entry}:null;
  }

  return {
    VERSION:VERSION,
    PENDING_KEY:PENDING_KEY,
    serverOrderId:serverOrderId,
    neverReachedServer:neverReachedServer,
    assertSavable:assertSavable,
    submit:submit,
    stage:stage,
    fail:fail,
    resolve:resolve,
    list:list,
    find:find,
    remove:remove
  };
});
