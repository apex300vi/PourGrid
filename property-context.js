(function(root,factory){
  var api=factory();if(typeof module==="object"&&module.exports)module.exports=api;else root.PourGridPropertyContext=api;
})(typeof self!=="undefined"?self:this,function(){
  "use strict";

  var REGISTRY_KEY="pourgrid-property-registry-v1";
  var SCOPE_PREFIX="pg:";
  var TRIAL_DAYS=60;

  // Local storage keys that hold property-specific operating data. Anything not listed
  // here (auth context, selected location, release markers) stays device-global.
  var SCOPED_KEYS=[
    "sbb-counts","sbb-counts-cleared","sbb-ordered","sbb-count-photos",
    "sbb-notes","sbb-adjustments","sbb-adjustment-meta",
    "pourgrid-session","pourgrid-order-drafts-v2","pourgrid-drafts-v1",
    "pourgrid-product-edits","pourgrid-email-status","pourgrid-scan-history",
    "pourgrid-pour-oz","pourgrid-stoli-free-flavor",
    "pourgrid-property-catalog-v1","pourgrid-property-vendors-v1",
    "pourgrid-local-order-history-v1",
    "pourgrid-local-draft-backup","pourgrid-local-draft-backup-v1","pourgrid-shared-draft-queue-v1",
    "pourgrid-drink-recipes-v1","pourgrid-profit-lab-working-estimate-v2","pourgrid-profit-lab-migrated-v1"
  ];
  var SCOPED_PREFIXES=["pourgrid-migration-"];

  // Keys that prove this device already ran single-tenant PourGrid for Sapphire.
  var LEGACY_MARKER_KEYS=["sbb-counts","pourgrid-session","pourgrid-order-drafts-v2","pourgrid-product-edits"];

  function text(value){return String(value==null?"":value).trim();}

  function isScopedKey(key){
    var name=text(key);
    if(!name)return false;
    if(SCOPED_KEYS.indexOf(name)>=0)return true;
    for(var i=0;i<SCOPED_PREFIXES.length;i++)if(name.indexOf(SCOPED_PREFIXES[i])===0)return true;
    return false;
  }

  // The home property keeps the original unprefixed keys so the live Sapphire device
  // never needs a data migration. Every other property is namespaced.
  function scopeKey(key,propertyId,homePropertyId){
    var name=text(key),id=text(propertyId);
    if(!id||!isScopedKey(name))return name;
    if(homePropertyId&&id===text(homePropertyId))return name;
    return SCOPE_PREFIX+id+":"+name;
  }

  function scopedStorage(storage,propertyId,homePropertyId){
    function map(key){return scopeKey(key,propertyId,homePropertyId);}
    return {
      propertyId:text(propertyId),
      homePropertyId:text(homePropertyId)||null,
      key:map,
      getItem:function(key){try{return storage.getItem(map(key));}catch(error){return null;}},
      setItem:function(key,value){try{storage.setItem(map(key),value);}catch(error){}},
      removeItem:function(key){try{storage.removeItem(map(key));}catch(error){}}
    };
  }

  function isSapphireContext(context){
    var org=text(context&&context.organizationName).toLowerCase(),
        location=text(context&&context.locationName).toLowerCase();
    return org.indexOf("sapphire")>=0||location.indexOf("sapphire")>=0;
  }

  function hasLegacyLocalData(storage){
    if(!storage)return false;
    for(var i=0;i<LEGACY_MARKER_KEYS.length;i++){
      try{if(storage.getItem(LEGACY_MARKER_KEYS[i])!==null)return true;}catch(error){}
    }
    return false;
  }

  function emptyRegistry(){return {version:1,homePropertyId:null,properties:{}};}

  function readRegistry(storage){
    try{
      var value=JSON.parse(storage.getItem(REGISTRY_KEY)||"null");
      if(!value||value.version!==1||!value.properties||typeof value.properties!=="object")return emptyRegistry();
      return {version:1,homePropertyId:value.homePropertyId||null,properties:Object.assign({},value.properties)};
    }catch(error){return emptyRegistry();}
  }

  function writeRegistry(storage,registry){
    try{storage.setItem(REGISTRY_KEY,JSON.stringify(registry));return true;}catch(error){return false;}
  }

  function defaultDisplayName(context,isHome){
    var org=text(context&&context.organizationName),location=text(context&&context.locationName);
    if(isHome)return org||location||"This property";
    return location||org||"This property";
  }

  function label(property){
    var org=text(property&&property.organizationName),name=text(property&&property.displayName);
    if(org&&name&&org.toLowerCase()!==name.toLowerCase())return name+" · "+org;
    return name||org||"This property";
  }

  function createProperty(context,options){
    options=options||{};
    var isHome=!!options.isHome,now=text(options.now)||new Date().toISOString();
    var property={
      id:text(context&&context.locationId),
      organizationId:text(context&&context.organizationId),
      organizationName:text(context&&context.organizationName),
      locationName:text(context&&context.locationName),
      displayName:defaultDisplayName(context,isHome),
      seedCatalog:isHome?"sapphire-v12":"none",
      createdAt:now,
      onboardedAt:isHome?now:null,
      trial:isHome?null:{startedAt:now,days:TRIAL_DAYS}
    };
    return property;
  }

  // Reconciles the on-device registry with the authorized location the user just opened.
  function ensureProperty(registry,context,options){
    options=options||{};
    var id=text(context&&context.locationId);
    if(!id)return {registry:registry,property:null,created:false};
    var next={version:1,homePropertyId:registry.homePropertyId||null,properties:Object.assign({},registry.properties)};
    var isHome=next.homePropertyId?next.homePropertyId===id:(isSapphireContext(context)||!!options.legacyDevice);
    var existing=next.properties[id],created=false;
    if(!existing){
      existing=createProperty(context,{isHome:isHome,now:options.now});
      created=true;
    }else{
      existing=Object.assign({},existing,{
        organizationId:text(context&&context.organizationId)||existing.organizationId,
        organizationName:text(context&&context.organizationName)||existing.organizationName,
        locationName:text(context&&context.locationName)||existing.locationName
      });
      if(!text(existing.displayName))existing.displayName=defaultDisplayName(context,isHome);
    }
    if(!next.homePropertyId&&isHome)next.homePropertyId=id;
    next.properties[id]=existing;
    return {registry:next,property:existing,created:created};
  }

  function needsOnboarding(property){return !!property&&!text(property.onboardedAt);}

  function markOnboarded(registry,propertyId,now){
    var id=text(propertyId),existing=registry.properties[id];
    if(!existing)return registry;
    var next={version:1,homePropertyId:registry.homePropertyId||null,properties:Object.assign({},registry.properties)};
    next.properties[id]=Object.assign({},existing,{onboardedAt:text(now)||new Date().toISOString()});
    return next;
  }

  function renameProperty(registry,propertyId,displayName){
    var id=text(propertyId),existing=registry.properties[id],name=text(displayName);
    if(!existing||!name)return registry;
    var next={version:1,homePropertyId:registry.homePropertyId||null,properties:Object.assign({},registry.properties)};
    next.properties[id]=Object.assign({},existing,{displayName:name});
    return next;
  }

  function trialDaysRemaining(property,now){
    var trial=property&&property.trial;
    if(!trial||!trial.startedAt)return null;
    var started=Date.parse(trial.startedAt);
    if(!isFinite(started))return null;
    var days=Number(trial.days)||TRIAL_DAYS,
        elapsed=((typeof now==="number"?now:Date.now())-started)/86400000;
    return Math.max(0,Math.ceil(days-elapsed));
  }

  function boot(storage,context,options){
    options=options||{};
    var registry=readRegistry(storage),
        legacyDevice=Object.keys(registry.properties).length===0&&hasLegacyLocalData(storage),
        resolved=ensureProperty(registry,context,{legacyDevice:legacyDevice,now:options.now});
    if(!resolved.property){
      // No authorized context (offline shell or a test harness): behave exactly like the
      // original single-tenant app rather than inventing a property.
      var fallback={id:"",organizationId:"",organizationName:"",locationName:"",displayName:"Sapphire Beach Bar",seedCatalog:"sapphire-v12",onboardedAt:new Date().toISOString(),trial:null};
      return {registry:registry,property:fallback,homePropertyId:registry.homePropertyId,isHome:true,needsOnboarding:false,store:scopedStorage(storage,"",null),persisted:false};
    }
    var persisted=writeRegistry(storage,resolved.registry);
    return {
      registry:resolved.registry,
      property:resolved.property,
      homePropertyId:resolved.registry.homePropertyId,
      isHome:resolved.registry.homePropertyId===resolved.property.id,
      needsOnboarding:needsOnboarding(resolved.property),
      store:scopedStorage(storage,resolved.property.id,resolved.registry.homePropertyId),
      persisted:persisted
    };
  }

  return {
    REGISTRY_KEY:REGISTRY_KEY,
    SCOPE_PREFIX:SCOPE_PREFIX,
    SCOPED_KEYS:SCOPED_KEYS,
    SCOPED_PREFIXES:SCOPED_PREFIXES,
    TRIAL_DAYS:TRIAL_DAYS,
    isScopedKey:isScopedKey,
    scopeKey:scopeKey,
    scopedStorage:scopedStorage,
    isSapphireContext:isSapphireContext,
    hasLegacyLocalData:hasLegacyLocalData,
    emptyRegistry:emptyRegistry,
    readRegistry:readRegistry,
    writeRegistry:writeRegistry,
    createProperty:createProperty,
    ensureProperty:ensureProperty,
    needsOnboarding:needsOnboarding,
    markOnboarded:markOnboarded,
    renameProperty:renameProperty,
    trialDaysRemaining:trialDaysRemaining,
    label:label,
    boot:boot
  };
});
