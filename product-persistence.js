(function(root,factory){
  var api=factory();if(typeof module==="object"&&module.exports)module.exports=api;else root.PourGridProductPersistence=api;
})(typeof self!=="undefined"?self:this,function(){
  "use strict";
  var STORAGE_KEY="pourgrid-product-edits";
  function stableId(product){return String(product&& (product.id||product.productId||product.catalogId||product.sku)||("catalog:"+String(product&& (product._catalogName||product.name)||"unknown").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"")));}
  function read(storage){try{return JSON.parse(storage.getItem(STORAGE_KEY)||"{}");}catch(error){return {};}}
  function resolve(all,product){var id=stableId(product),name=String(product&&product.name||"");if(all[id])return all[id];if(all[name])return all[name];var keys=Object.keys(all||{});for(var i=0;i<keys.length;i++){var edit=all[keys[i]];if(edit&&(edit.originalName===name||edit.name===name))return edit;}return null;}
  function same(a,b){try{return JSON.stringify(a)===JSON.stringify(b);}catch(error){return false;}}
  function saveVerified(storage,all,clock){clock=clock||Date.now;var writeStarted=clock(),writeMs=0,readMs=0,readBack,error=null;try{storage.setItem(STORAGE_KEY,JSON.stringify(all||{}));writeMs=Math.max(0,clock()-writeStarted);var readStarted=clock();readBack=JSON.parse(storage.getItem(STORAGE_KEY)||"{}");readMs=Math.max(0,clock()-readStarted);if(!same(readBack,all||{}))throw new Error("Stored product overrides did not match the saved values");}catch(e){error=e;}return {ok:!error,value:readBack,writeMs:writeMs,readMs:readMs,error:error&&error.message||null};}
  function withEdit(all,product,edit){var next=Object.assign({},all||{}),id=stableId(product),oldName=product&&product.name;delete next[oldName];Object.keys(next).forEach(function(key){var value=next[key];if(value&&(value.originalName===oldName||value.name===oldName)&&key!==id)delete next[key];});next[id]=Object.assign({catalogId:id,originalName:product&& (product._catalogName||oldName)},edit);return next;}
  function apply(product,edit){if(!edit)return product;Object.keys(edit).forEach(function(key){if(["packaging","catalogId","originalName"].indexOf(key)<0)product[key]=edit[key];});return product;}
  return {STORAGE_KEY:STORAGE_KEY,stableId:stableId,read:read,resolve:resolve,same:same,saveVerified:saveVerified,withEdit:withEdit,apply:apply};
});
