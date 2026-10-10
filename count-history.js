(function(root,factory){
  var api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.PourGridCountHistory=api;
})(typeof window!=='undefined'?window:this,function(){
  'use strict';
  var DAY=86400000,VERSION='count-history-v1';
  function number(value){if(value===null||value===undefined||String(value).trim()==='')return null;var n=Number(value);return Number.isFinite(n)&&n>=0?n:null;}
  function key(value){return String(value||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');}
  function id(p){return String(p&&(p.productId||p.id||p.catalogId)||'catalog:'+key(p&&(p._catalogName||p.name)));}
  function matches(a,b){return id(a)===id(b)||key(a.productName||a.name)===key(b.productName||b.name);}
  function payload(row){return row&& (row.payload||row.data)||row||{};}
  function orderKey(e){return String(e.draftId||e._dbId||e.id||'');}
  function time(e){var p=payload(e),n=number(p.id);var at=Date.parse(p.countedAt||p.orderDate||'');if(Number.isFinite(at))return at;if(n&&n>1e12)return n;at=Date.parse(p.date?(p.date+' '+(p.time||'')):(e.created_at||e.createdAt||''));return Number.isFinite(at)?at:null;}
  function metric(p,cfg){
    cfg=cfg||p.packaging||{};if(cfg.mode==='invalid')return null;
    var per=number(cfg.unitsPerCase),pack=number(p.pack),unit=String(cfg.unitLabel||cfg.looseUnit||'').toLowerCase(),factor=1,orderFactor=1;
    if(cfg.mode==='nestedCase'){per=number(cfg.innerPacksPerCase)*number(cfg.unitsPerInner);if(!per)return null;factor=per;unit=unit||'units';}
    else if(cfg.mode==='halfCase'||cfg.looseUnit==='Half Case'){per=1;unit='cases';}
    else if(cfg.mode==='caseLoose'){if(!per)return null;factor=cfg.countBasis==='units'?1:per;unit=unit||'units';}
    else {per=pack;unit=Number(p.bottleMl)>0||p.unit==='Bottle'||p.unit==='Case'&&pack>1?'bottles':p.unit==='Case'?'cases':String(p.unit||'units').toLowerCase();}
    if(!/s$/.test(unit))unit+='s';
    if(p.unit==='Case'){if(!per)return null;orderFactor=unit==='cases'?1:per;}
    var sizeMl=unit==='bottles'?(number(p.bottleMl)||null):null;
    return {unit:unit,sizeMl:sizeMl,caseSize:per,countFactor:factor,orderFactor:orderFactor,identity:unit+':'+(sizeMl||'')};
  }
  function value(p,counts,cfg){
    counts=counts||{};cfg=cfg||p.packaging||{};var m=metric(p,cfg);if(!m)return null;
    var n=number(counts[p.name]),parts=['cases','inner','loose','halves'],hasParts=parts.some(function(k){return number(counts[p.name+'::'+k])!==null;});
    if(hasParts){var c=number(counts[p.name+'::cases'])||0,l=number(counts[p.name+'::loose'])||0;
      if(cfg.mode==='nestedCase')n=c*m.caseSize+(number(counts[p.name+'::inner'])||0)*cfg.unitsPerInner+l;
      else if(cfg.mode==='halfCase'||cfg.looseUnit==='Half Case')n=c+(number(counts[p.name+'::halves'])||0)*.5;
      else if(cfg.mode==='caseLoose')n=c*m.caseSize+l;
      else n=n===null?null:n*m.countFactor;
    }else n=n===null?null:n*m.countFactor;
    if(!cfg.mode&&m.unit==='bottles'&&m.sizeMl){[750,1000].forEach(function(size){if(size!==m.sizeMl){var alt=number(counts[p.name+'::alt'+size]);if(alt!==null)n=(n||0)+alt*size/m.sizeMl;}});}
    return n===null?null:{productId:id(p),productName:p.name,quantity:n,metric:m};
  }
  function capture(products,counts,config,at){return {version:VERSION,at:new Date(at||Date.now()).toISOString(),items:products.map(function(p){return value(p,counts,config(p));}).filter(Boolean)};}
  function historyRows(rows){var seen=new Set();return (rows||[]).map(payload).filter(function(e){var k=orderKey(e);if(!k||seen.has(k))return false;seen.add(k);return true;});}
  function countAt(e,p,cfg){
    if(e.inventorySnapshot){return (e.inventorySnapshot.items||[]).find(function(x){return matches(x,p);})||null;}
    var item=(e.items||[]).find(function(x){return matches(x,p);}),saved=item?Object.assign({},p,item,{name:item.name||p.name}):p;
    var result=value(saved,e.counts,item&&item.packaging||cfg);
    if(result)result.legacy=true;return result;
  }
  function timeline(history,p,cfg,journal){
    var rows=historyRows(history).map(function(e){var v=countAt(e,p,cfg),at=e.inventorySnapshot?Date.parse(e.inventorySnapshot.at):time(e);return v&&Number.isFinite(at)?Object.assign({},v,{at:at,source:e,sourceKey:orderKey(e)}):null;}).filter(Boolean);
    (journal||[]).filter(function(e){return e.kind==='count';}).forEach(function(e){var v=(e.snapshot.items||[]).find(function(x){return matches(x,p);}),at=Date.parse(e.snapshot.at);if(v&&Number.isFinite(at))rows.push(Object.assign({},v,{at:at,source:e,sourceKey:e.id}));});
    return rows.sort(function(a,b){return b.at-a.at||b.sourceKey.localeCompare(a.sourceKey);});
  }
  function ordered(item,fallback,cfg){
    var p=Object.assign({},fallback||{},item),m=item.inventoryMetric||metric(p,item.packaging||cfg);if(!m)return null;
    var n=number(item.finalOrderQty??item.orderQty??item.adjQty??item.qty);if(n===null)return null;
    // finalOrderQty is already expressed in purchase units, including loose adjustments.
    return {productId:id(p),productName:p.name,quantity:n*m.orderFactor,metric:m};
  }
  function vendorLines(e,vendor,products,config){
    var result=(e.items||[]).filter(function(x){return x.dist===vendor;}).map(function(x){var p=(products||[]).find(function(p){return matches(x,p);})||x;var v=ordered(x,p,config(p));return v?Object.assign(v,{orderedQuantity:v.quantity}):null;}).filter(Boolean);
    var stoli=(e.items||[]).find(function(x){return x.dist===vendor&&key(x.name)==='stoli-vodka';});
    if(stoli&&e.stoliFreeFlavor){var p=(products||[]).find(function(p){return p.name===e.stoliFreeFlavor;}),cases=number(stoli.finalPurchaseBreakdown&&stoli.finalPurchaseBreakdown.cases);if(cases===null)cases=Math.floor(number(stoli.finalOrderQty??stoli.orderQty)||0);if(p&&cases>0){var m=metric(p,config(p));if(m)result.push({productId:id(p),productName:p.name,quantity:cases*3,orderedQuantity:cases*3,metric:m,bonus:true});}}
    return result;
  }
  function latestReceipts(journal){var map=new Map();(journal||[]).filter(function(e){return e.kind==='receipt';}).forEach(function(e){var k=e.orderKey+'|'+e.vendor+'|'+(e.batchId||'initial'),old=map.get(k);if(!old||e.savedAt>old.savedAt||e.savedAt===old.savedAt&&e.id>old.id)map.set(k,e);});return map;}
  // Build purchase lines once per history/catalog revision, not once per product or keystroke.
  function prepare(history,journal,products,config){
    var receipts=latestReceipts(journal),confirmed=new Set();
    receipts.forEach(function(r){confirmed.add(r.orderKey+'|'+r.vendor);});
    return {receipts:receipts,orders:historyRows(history).map(function(e){return {entry:e,placed:e.inventorySnapshot?Date.parse(e.inventorySnapshot.at):time(e),vendors:Array.from(new Set((e.items||[]).map(function(i){return i.dist;}))).map(function(vendor){return {vendor:vendor,receipt:confirmed.has(orderKey(e)+'|'+vendor),lines:vendorLines(e,vendor,products,config)};})};})};
  }
  function compare(history,p,cfg,journal,previous,current,at,products,config,prepared){
    if(!previous||!current)return null;var end=Number(at),start=previous.at,m=current.metric;
    if(!m||previous.metric.identity!==m.identity)return {unavailable:'The package or bottle size changed between counts.'};
    prepared=prepared||prepare(history,journal,products||[p],config||function(){return cfg;});
    var receipts=prepared.receipts,confirmed=0,assumed=0,orderedTotal=0,unknown=false,legacy=!!previous.legacy;
    prepared.orders.forEach(function(row){var e=row.entry,placed=row.placed;
      row.vendors.forEach(function(group){var vendor=group.vendor,receipt=group.receipt,lines=group.lines;
        var relevant=lines.filter(function(x){return matches(x,p);});
        if(placed>=start&&placed<end)relevant.forEach(function(x){if(x.metric.identity!==m.identity)unknown=true;else orderedTotal+=x.quantity;});
        if(!receipt&&placed>=start&&placed<end){relevant.forEach(function(x){if(x.metric.identity!==m.identity)unknown=true;else if((e.shortShipped||[]).indexOf(x.productName)<0)assumed+=x.quantity;});
          (e.items||[]).filter(function(x){return x.dist===vendor&&matches(x,p);}).forEach(function(x){if(!ordered(x,p,cfg))unknown=true;});}
      });
    });
    receipts.forEach(function(receipt){var received=Date.parse(receipt.receivedAt);if(received<start||received>=end)return;(receipt.lines||[]).filter(function(x){return matches(x,p);}).forEach(function(x){if(x.metric.identity!==m.identity)unknown=true;else confirmed+=x.quantity;});});
    if(unknown)return {unavailable:'Package details are missing or changed. Usage cannot be compared safely.'};
    var used=previous.quantity+confirmed+assumed-current.quantity,days=(end-start)/DAY;
    return {before:previous.quantity,after:current.quantity,ordered:orderedTotal,received:confirmed,assumed:assumed,used:used,days:days,perDay:days>=1?used/days:null,estimated:assumed>0||legacy,legacy:legacy,negative:used<-.000001,metric:m};
  }
  function validateReceipt(e){if(!e.orderKey||!e.vendor||!Number.isFinite(Date.parse(e.receivedAt))||Date.parse(e.receivedAt)>Date.now()+60000)throw new Error('Choose a valid delivery date and time.');if(!e.lines.length)throw new Error('No delivery items.');e.lines.forEach(function(x){if(number(x.quantity)===null||!x.metric||!x.productId)throw new Error('Enter a nonnegative received quantity for every item.');});return e;}
  return {VERSION:VERSION,number:number,key:key,id:id,matches:matches,orderKey:orderKey,time:time,metric:metric,value:value,capture:capture,timeline:timeline,ordered:ordered,vendorLines:vendorLines,latestReceipts:latestReceipts,prepare:prepare,compare:compare,validateReceipt:validateReceipt};
});
