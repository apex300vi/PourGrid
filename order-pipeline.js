(function(root,factory){var api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.PourGridOrderPipeline=api;})(typeof self!=='undefined'?self:this,function(){
  'use strict';
  var SHARED='Shared / Not specified';
  function id(product){return String(product&&product.catalogId||product&&product.id||'').trim();}
  function workspace(product){return product&&product.dist==='Merchants'?'merchants':'bar';}
  function emailSection(product){
    if(!product)return SHARED;
    if(product.emailRoute==='shared')return SHARED;
    if(product.emailRoute==='westIndies')return 'West Indies';
    if(product.emailRoute==='bellows')return 'Bellows';
    if(!String(product.dist||'').trim())return SHARED;
    if(product.dist==='Bellows/WI')return product.supplier==='West Indies'?'West Indies':'Bellows';
    return product.dist;
  }
  function line(product,quantity){return {productId:id(product),name:product.name,workspace:workspace(product),vendor:product.dist||null,emailSection:emailSection(product),quantity:Number(quantity)};}
  function reconcile(products,quantityFor){
    var rows=[],seen={};
    (products||[]).filter(function(p){return p.active!==false;}).forEach(function(product){
      var quantity=Number(quantityFor(product));
      if(!(quantity>0))return;
      var item=line(product,quantity),key=item.productId;
      if(!key)throw new Error('Active product lacks a stable product ID: '+String(product.name||'(unnamed)'));
      if(seen[key])throw new Error('Duplicate active product route: '+key);
      seen[key]=true;rows.push(item);
    });
    return rows;
  }
  function audit(products,quantityFor){
    var active=(products||[]).filter(function(p){return p.active!==false;}),rows=reconcile(active,quantityFor),bySection={},missing=[];
    active.forEach(function(p){if(!id(p))missing.push(String(p.name||'(unnamed)'));});
    rows.forEach(function(row){bySection[row.emailSection]=(bySection[row.emailSection]||0)+1;});
    return {activeProducts:active.length,orderableProducts:rows.length,successfullyRouted:rows.length,routedBySection:bySection,shared:bySection[SHARED]||0,missingConfiguration:missing,duplicates:[],dropped:[]};
  }
  return {SHARED:SHARED,id:id,workspace:workspace,emailSection:emailSection,line:line,reconcile:reconcile,audit:audit};
});
