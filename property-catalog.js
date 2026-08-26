(function(root,factory){
  var api=factory();if(typeof module==="object"&&module.exports)module.exports=api;else root.PourGridPropertyCatalog=api;
})(typeof self!=="undefined"?self:this,function(){
  "use strict";

  var CATALOG_KEY="pourgrid-property-catalog-v1";
  var VENDORS_KEY="pourgrid-property-vendors-v1";
  var WORKSPACES=["bar","merchants"];
  var ORDER_UNITS=["Case","Bottle","BIB","Tank","Pack","Carton"];
  // Named rather than inlined so the spreadsheet importer can check a row against the same
  // rules addVendor/addItem enforce, and report it before anything is written.
  var VENDOR_NAME_MAX=60;
  var ITEM_NAME_MAX=80;
  var EMAIL_PATTERN=/^\S+@\S+\.\S+$/;

  // Sapphire's live vendor routing, unchanged. New properties start with nothing.
  var SAPPHIRE_VENDORS=[
    {name:"Bellows/WI",workspace:"bar"},
    {name:"CC1",workspace:"bar"},
    {name:"Merchants",workspace:"merchants"}
  ];

  var VENDOR_COLORS={
    "Bellows/WI":{bg:"rgba(52,104,216,0.18)",text:"#8FB2FF",dot:"#4FA8FF"},
    "CC1":{bg:"rgba(231,76,60,0.18)",text:"#FF8F85",dot:"#E10A17"},
    "Merchants":{bg:"rgba(30,145,85,0.18)",text:"#5FE0A0",dot:"#00B893"}
  };
  var COLOR_PALETTE=[
    {bg:"rgba(52,104,216,0.18)",text:"#8FB2FF",dot:"#4FA8FF"},
    {bg:"rgba(231,76,60,0.18)",text:"#FF8F85",dot:"#E10A17"},
    {bg:"rgba(30,145,85,0.18)",text:"#5FE0A0",dot:"#00B893"},
    {bg:"rgba(232,169,60,0.18)",text:"#F2C879",dot:"#E8A93C"},
    {bg:"rgba(146,86,214,0.18)",text:"#C6A6F2",dot:"#9256D6"},
    {bg:"rgba(0,168,181,0.18)",text:"#79DCE4",dot:"#00A8B5"}
  ];

  function text(value){return String(value==null?"":value).trim();}
  function slug(value){
    var name=text(value);
    if(name.normalize)name=name.normalize("NFD").replace(/[̀-ͯ]/g,"");
    return name.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"")||"item";
  }
  function readJson(store,key,fallback){
    try{var value=JSON.parse(store.getItem(key)||"null");return value==null?fallback:value;}catch(error){return fallback;}
  }
  function writeJson(store,key,value){
    try{store.setItem(key,JSON.stringify(value));return true;}catch(error){return false;}
  }

  function isValidEmail(value){return EMAIL_PATTERN.test(text(value));}

  function normalizeVendor(input){
    var name=text(input&&input.name),workspace=text(input&&input.workspace).toLowerCase();
    if(!name)return null;
    return {name:name,workspace:WORKSPACES.indexOf(workspace)>=0?workspace:"bar",email:text(input&&input.email)||""};
  }

  function normalizeVendors(list){
    var seen={},out=[];
    (Array.isArray(list)?list:[]).forEach(function(entry){
      var vendor=normalizeVendor(entry);
      if(!vendor)return;
      var key=vendor.name.toLowerCase();
      if(seen[key])return;
      seen[key]=true;out.push(vendor);
    });
    return out;
  }

  function seedVendorsFor(property){
    return property&&property.seedCatalog==="sapphire-v12"?SAPPHIRE_VENDORS.map(function(v){return Object.assign({},v,{email:""});}):[];
  }

  function readVendors(store,property){
    var stored=readJson(store,VENDORS_KEY,null);
    if(stored===null)return seedVendorsFor(property);
    return normalizeVendors(stored);
  }
  function saveVendors(store,vendors){return writeJson(store,VENDORS_KEY,normalizeVendors(vendors));}

  function addVendor(vendors,input){
    var vendor=normalizeVendor(input),list=normalizeVendors(vendors);
    if(!vendor)return {ok:false,error:"Give the vendor a name.",vendors:list};
    if(vendor.name.length>VENDOR_NAME_MAX)return {ok:false,error:"Vendor names stay under "+VENDOR_NAME_MAX+" characters.",vendors:list};
    if(list.some(function(x){return x.name.toLowerCase()===vendor.name.toLowerCase();}))return {ok:false,error:"That vendor already exists.",vendors:list};
    if(vendor.email&&!isValidEmail(vendor.email))return {ok:false,error:"Enter a valid vendor email, or leave it blank.",vendors:list};
    return {ok:true,error:null,vendors:list.concat([vendor]),vendor:vendor};
  }

  function removeVendor(vendors,name,items){
    var list=normalizeVendors(vendors),key=text(name).toLowerCase();
    var used=(Array.isArray(items)?items:[]).some(function(item){return text(item&&item.dist).toLowerCase()===key;});
    if(used)return {ok:false,error:"Move or remove that vendor's items first.",vendors:list};
    return {ok:true,error:null,vendors:list.filter(function(x){return x.name.toLowerCase()!==key;})};
  }

  function vendorNames(vendors){return normalizeVendors(vendors).map(function(x){return x.name;});}
  function barVendorNames(vendors){return normalizeVendors(vendors).filter(function(x){return x.workspace!=="merchants";}).map(function(x){return x.name;});}
  function merchantVendorNames(vendors){return normalizeVendors(vendors).filter(function(x){return x.workspace==="merchants";}).map(function(x){return x.name;});}
  function isMerchantVendor(vendors,name){return merchantVendorNames(vendors).indexOf(text(name))>=0;}

  function vendorColors(vendors){
    var map={};
    normalizeVendors(vendors).forEach(function(vendor,index){
      map[vendor.name]=VENDOR_COLORS[vendor.name]||COLOR_PALETTE[index%COLOR_PALETTE.length];
    });
    return map;
  }

  function colorFor(colors,name){
    return (colors&&colors[name])||VENDOR_COLORS[name]||COLOR_PALETTE[0];
  }

  function normalizeItem(input){
    var name=text(input&&input.name);
    if(!name)return null;
    var pack=Math.floor(Number(input&&input.pack)),
        buildTo=Number(input&&input.buildTo),
        unit=text(input&&input.unit),
        bottleMl=Number(input&&input.bottleMl);
    var item={
      id:text(input&&input.id)||("custom:"+slug(name)),
      name:name,
      dist:text(input&&input.dist),
      cat:text(input&&input.cat)||"General",
      buildTo:isFinite(buildTo)&&buildTo>0?buildTo:0,
      pack:isFinite(pack)&&pack>0?pack:1,
      unit:ORDER_UNITS.indexOf(unit)>=0?unit:"Case",
      note:text(input&&input.note),
      custom:true
    };
    if(isFinite(bottleMl)&&bottleMl>0)item.bottleMl=bottleMl;
    return item;
  }

  function readItems(store){
    var stored=readJson(store,CATALOG_KEY,[]);
    return (Array.isArray(stored)?stored:[]).map(normalizeItem).filter(Boolean);
  }
  function saveItems(store,items){return writeJson(store,CATALOG_KEY,(Array.isArray(items)?items:[]).map(normalizeItem).filter(Boolean));}

  function addItem(items,input,vendors,reservedNames){
    var list=(Array.isArray(items)?items:[]).map(normalizeItem).filter(Boolean),
        item=normalizeItem(input),
        available=vendorNames(vendors);
    if(!item)return {ok:false,error:"Give the item a name.",items:list};
    if(item.name.length>ITEM_NAME_MAX)return {ok:false,error:"Item names stay under "+ITEM_NAME_MAX+" characters.",items:list};
    if(!item.dist)return {ok:false,error:"Choose a vendor for this item.",items:list};
    if(available.indexOf(item.dist)<0)return {ok:false,error:"That vendor is not set up for this property yet.",items:list};
    var taken=list.map(function(x){return x.name.toLowerCase();}).concat((Array.isArray(reservedNames)?reservedNames:[]).map(function(x){return text(x).toLowerCase();}));
    if(taken.indexOf(item.name.toLowerCase())>=0)return {ok:false,error:"An item with that name already exists.",items:list};
    if(list.some(function(x){return x.id===item.id;}))item.id=item.id+"-"+(list.length+1);
    if(!(Number(item.pack)>0))return {ok:false,error:"Units per case must be a positive whole number.",items:list};
    if(!(Number(item.buildTo)>=0))return {ok:false,error:"Build-to must be zero or greater.",items:list};
    return {ok:true,error:null,items:list.concat([item]),item:item};
  }

  function removeItem(items,id){
    var key=text(id);
    return (Array.isArray(items)?items:[]).map(normalizeItem).filter(Boolean).filter(function(item){return item.id!==key;});
  }

  // Seed products (Sapphire's v12 guide) plus everything this property added itself.
  function buildCatalog(seedProducts,customItems){
    var seed=Array.isArray(seedProducts)?seedProducts:[],
        taken={};
    seed.forEach(function(product){taken[text(product&&product.name).toLowerCase()]=true;});
    var custom=(Array.isArray(customItems)?customItems:[]).map(normalizeItem).filter(Boolean).filter(function(item){
      var key=item.name.toLowerCase();
      if(taken[key])return false;
      taken[key]=true;return true;
    });
    return seed.concat(custom);
  }

  function isReadyForOrdering(vendors,catalog){
    return vendorNames(vendors).length>0&&(Array.isArray(catalog)?catalog:[]).length>0;
  }

  return {
    CATALOG_KEY:CATALOG_KEY,
    VENDORS_KEY:VENDORS_KEY,
    ORDER_UNITS:ORDER_UNITS,
    WORKSPACES:WORKSPACES,
    VENDOR_NAME_MAX:VENDOR_NAME_MAX,
    ITEM_NAME_MAX:ITEM_NAME_MAX,
    isValidEmail:isValidEmail,
    SAPPHIRE_VENDORS:SAPPHIRE_VENDORS,
    VENDOR_COLORS:VENDOR_COLORS,
    COLOR_PALETTE:COLOR_PALETTE,
    slug:slug,
    normalizeVendor:normalizeVendor,
    normalizeVendors:normalizeVendors,
    seedVendorsFor:seedVendorsFor,
    readVendors:readVendors,
    saveVendors:saveVendors,
    addVendor:addVendor,
    removeVendor:removeVendor,
    vendorNames:vendorNames,
    barVendorNames:barVendorNames,
    merchantVendorNames:merchantVendorNames,
    isMerchantVendor:isMerchantVendor,
    vendorColors:vendorColors,
    colorFor:colorFor,
    normalizeItem:normalizeItem,
    readItems:readItems,
    saveItems:saveItems,
    addItem:addItem,
    removeItem:removeItem,
    buildCatalog:buildCatalog,
    isReadyForOrdering:isReadyForOrdering
  };
});
