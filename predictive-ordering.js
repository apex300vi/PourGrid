(function(root,factory){
  var api=factory();if(typeof module==="object"&&module.exports)module.exports=api;else root.PourGridPredictiveOrdering=api;
})(typeof self!=="undefined"?self:this,function(){
  "use strict";

  var VERSION="predictive-ordering-v1.0.0";

  // ── Tunables ────────────────────────────────────────────────────────────────
  // A SKU needs this many usable usage observations before PourGrid will project
  // a trend. Below it we fall back to the build-to the manager already set,
  // because a fabricated trend on two data points is worse than no trend at all.
  var MIN_USAGE_OBSERVATIONS=3;
  // Trend needs enough points to split into a recent half and a prior half.
  var MIN_TREND_OBSERVATIONS=4;
  // Recent cycles matter more; weight decays with a ~6 week half-life.
  var WEIGHT_HALF_LIFE_WEEKS=6;
  // Bar data is noisy. Apply only half the measured trend and cap the swing.
  var TREND_DAMPING=0.5,TREND_MIN=0.75,TREND_MAX=1.35;
  // Cycles shorter than a day or longer than three weeks are not comparable.
  var MIN_CYCLE_DAYS=1,MAX_CYCLE_DAYS=21;
  var DEFAULT_HORIZON_DAYS=7,MIN_HORIZON_DAYS=4,MAX_HORIZON_DAYS=14;
  // Deliveries slip in the USVI; carry a few extra days of cover.
  var DEFAULT_SAFETY_DAYS=3;
  // A prediction may never push a SKU more than this far past its build-to.
  // The build-to is Josh's stated ceiling; prediction advises inside it.
  var OVERSHOOT_LIMIT=1.75;
  var DAY_MS=86400000;
  // St. Thomas is AST year round (UTC-4, no daylight saving).
  var ST_THOMAS_OFFSET_MS=4*3600000;

  // ── USVI seasonal baseline ──────────────────────────────────────────────────
  // Relative bar volume by month for a St. Thomas beach bar. Winter high season
  // (cruise + villa traffic, roughly mid-December through April) runs well above
  // average; September and October — peak hurricane season, when many St. Thomas
  // restaurants close or cut hours — run well below it. These are location-level
  // tourism factors, not per-SKU curves: PourGrid will not invent a per-SKU
  // seasonal shape from under a year of history.
  var RAW_SEASONAL_INDEX={1:1.15,2:1.20,3:1.22,4:1.12,5:0.98,6:0.95,7:1.00,8:0.90,9:0.72,10:0.75,11:0.95,12:1.16};
  var MONTH_NAMES=["","January","February","March","April","May","June","July","August","September","October","November","December"];

  var SEASONAL_INDEX=(function(){
    var months=Object.keys(RAW_SEASONAL_INDEX),total=0,normalized={};
    months.forEach(function(m){total+=RAW_SEASONAL_INDEX[m];});
    var mean=total/months.length;
    months.forEach(function(m){normalized[m]=RAW_SEASONAL_INDEX[m]/mean;});
    return Object.freeze(normalized);
  })();

  function seasonalIndex(month){var value=SEASONAL_INDEX[Number(month)];return value>0?value:1;}
  function monthName(month){return MONTH_NAMES[Number(month)]||"";}
  // Reads as "<Month> is historically <label> in the USVI (+N% versus the year)".
  function seasonLabel(month){
    var index=seasonalIndex(month);
    if(index>=1.08)return "high season";
    if(index>=1.02)return "a busier month";
    if(index>0.98)return "about average";
    if(index>0.85)return "a slower month";
    return "slow season";
  }

  // ── Small helpers ───────────────────────────────────────────────────────────
  function finite(value){if(value===null||value===undefined||value==="")return null;var n=Number(value);return Number.isFinite(n)?n:null;}
  function text(value){return String(value===null||value===undefined?"":value).trim();}
  function key(value){
    return text(value).toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g,"")
      .replace(/[^a-z0-9]+/g," ").trim();
  }
  function median(values){
    var list=values.filter(Number.isFinite).slice().sort(function(a,b){return a-b;});
    if(!list.length)return null;
    var mid=Math.floor(list.length/2);
    return list.length%2?list[mid]:(list[mid-1]+list[mid])/2;
  }
  function round1(value){return Math.round(value*10)/10;}
  function plural(n,one,many){return Math.abs(Number(n))===1?one:many;}
  // "Case"/"Bottle" as the shopper says it: 1 case, 3 cases.
  function purchaseWords(product,n){var unit=text(product&&product.unit).toLowerCase()||"unit";return Math.abs(Number(n))===1?unit:unit+"s";}

  // The month a timestamp falls in, in St. Thomas local time (1-12).
  function stThomasMonth(millis){return new Date(millis-ST_THOMAS_OFFSET_MS).getUTCMonth()+1;}

  // ── Packaging basis ─────────────────────────────────────────────────────────
  // Mirrors PourGridVision.unitInfo/orderQuantity so a suggestion is expressed in
  // exactly the same purchase units as the quantity control it sits beside.
  // "space" below means the shared comparison space that orderQuantity uses to
  // subtract a count from a build-to.
  function defaultBuildToBasis(product,mode){
    if(!product||product.unit!=="Case")return "units";
    if(mode!=="standard")return "cases";
    return (finite(product.pack)||0)>1?"units":"cases";
  }
  function defaultUnitLabel(product,orderedByCase,unitsPerCase){
    var unit=text(product&&product.unit).toLowerCase();
    if(unit&&unit!=="case")return /s$/.test(unit)?unit:unit+"s";
    return orderedByCase&&unitsPerCase>1?"bottles":"units";
  }
  function basisFor(product,packaging){
    product=product||{};
    var config=packaging||product.packaging||{},
        unitsPerCase=Math.max(1,finite(config.unitsPerCase)||finite(product.unitsPerCase)||finite(product.pack)||1),
        mode=text(config.mode)||"standard",
        orderedByCase=product.unit==="Case",
        buildToBasis=product.unit!=="Case"?"units":text(config.buildToBasis)||defaultBuildToBasis(product,mode),
        countBasis=text(config.countBasis)||(mode==="standard"?"units":"cases"),
        unitBasis=buildToBasis==="units",
        mixedBasis=!unitBasis&&countBasis==="units";
    return {
      unitsPerCase:unitsPerCase,orderedByCase:orderedByCase,mode:mode,
      buildToBasis:buildToBasis,countBasis:countBasis,unitBasis:unitBasis,mixedBasis:mixedBasis,
      dividesByCase:orderedByCase&&(unitBasis||mixedBasis),
      unitLabel:text(config.unitLabel)||defaultUnitLabel(product,orderedByCase,unitsPerCase)
    };
  }
  function countToSpace(basis,counted){var n=finite(counted);if(n===null)return null;return basis.unitBasis&&basis.countBasis==="cases"?n*basis.unitsPerCase:n;}
  function targetToSpace(basis,target){var n=finite(target);if(n===null)return null;return basis.mixedBasis?n*basis.unitsPerCase:n;}
  function purchaseToSpace(basis,quantity){
    var n=finite(quantity);if(n===null)return null;
    if(!basis.orderedByCase)return n;
    return basis.dividesByCase?n*basis.unitsPerCase:n;
  }
  function spaceToPurchase(basis,amount){
    var n=finite(amount);if(n===null)return null;
    if(!basis.orderedByCase)return Math.max(0,Math.ceil(n));
    return Math.max(0,Math.ceil(basis.dividesByCase?n/basis.unitsPerCase:n));
  }

  // ── History reading ─────────────────────────────────────────────────────────
  // An entry's timestamp, most trustworthy source first. Legacy Sapphire orders
  // carry `id` as epoch milliseconds; normalized/structured rows carry ISO dates.
  function entryTime(entry){
    if(!entry)return null;
    var normalized=entry._normalized&&entry._normalized.orderDate,
        candidates=[normalized,entry.orderDate,entry.created_at,entry.createdAt];
    for(var i=0;i<candidates.length;i++){
      var parsed=Date.parse(text(candidates[i]));
      if(Number.isFinite(parsed))return parsed;
    }
    var id=finite(entry.id);
    // Only a plausible epoch-millisecond id counts; structured rows use uuids.
    if(id!==null&&id>1000000000000)return id;
    var dateText=text(entry.date);
    if(dateText){
      var withTime=Date.parse(dateText+" "+text(entry.time));
      if(Number.isFinite(withTime))return withTime;
      var dateOnly=Date.parse(dateText);
      if(Number.isFinite(dateOnly))return dateOnly;
    }
    return null;
  }

  // Normalizing every item and count name for every product would be O(products
  // x orders x items) string work on a phone. Each entry is indexed once and the
  // index is cached against the entry object, so a full catalogue sweep is a map
  // lookup per product per order.
  var ENTRY_INDEX=typeof WeakMap==="function"?new WeakMap():null;
  function indexEntry(entry){
    if(ENTRY_INDEX&&ENTRY_INDEX.has(entry))return ENTRY_INDEX.get(entry);
    var items=Array.isArray(entry&&entry.items)?entry.items:[],
        counts=entry&&entry.counts,
        byKey=Object.create(null),
        countNames=Object.create(null);
    items.forEach(function(item){
      var name=key(item&&(item.name||item.productName));
      if(name&&!(name in byKey))byKey[name]=item;
    });
    if(counts&&typeof counts==="object"&&!Array.isArray(counts))
      Object.keys(counts).forEach(function(name){
        // "Name::cases" style keys hold count sub-parts, not a product total.
        if(name.indexOf("::")>=0)return;
        var normalized=key(name);
        if(normalized&&!(normalized in countNames))countNames[normalized]=name;
      });
    var index={items:byKey,countNames:countNames,counts:counts||null,at:entryTime(entry)};
    if(ENTRY_INDEX)ENTRY_INDEX.set(entry,index);
    return index;
  }
  function orderedPurchaseUnits(item){
    if(!item)return 0;
    var value=finite(item.finalOrderQty);
    if(value===null)value=finite(item.orderQty);
    if(value===null)value=finite(item.calculatedOrderQty);
    return value===null?0:Math.max(0,value);
  }
  // Counts are keyed by the exact product name; a normalized match is the
  // fallback so a punctuation-only rename does not silently drop a SKU.
  function countFor(index,product,productKey){
    if(!index.counts)return null;
    var exact=finite(index.counts[product.name]);
    if(exact!==null)return exact;
    var name=index.countNames[productKey];
    return name===undefined?null:finite(index.counts[name]);
  }
  function hasCountSlot(index,product,productKey){
    if(!index.counts)return false;
    if(Object.prototype.hasOwnProperty.call(index.counts,product.name))return true;
    return productKey in index.countNames;
  }

  // Defensive single-tenant guard. The history RPC is already scoped to one
  // (organization, location) pair, so this only ever matters if a caller mixes
  // caches from two properties on one device.
  function belongsToLocation(entry,locationId){
    if(!locationId)return true;
    var owner=text(entry&&(entry.locationId||entry.location_id))
      ||text(entry&&entry._normalized&&entry._normalized.locationId);
    return !owner||owner===text(locationId);
  }

  /**
   * The per-SKU order log: one row per saved order that could speak to this SKU,
   * oldest first. `cycle` rows carry a count snapshot and can produce usage.
   */
  function orderLog(history,product,options){
    options=options||{};
    product=product||{};
    var productKey=key(product.name),rows=[];
    (Array.isArray(history)?history:[]).forEach(function(entry){
      if(!entry||typeof entry!=="object"||!belongsToLocation(entry,options.locationId))return;
      var index=indexEntry(entry),when=index.at;
      if(when===null)return;
      var item=index.items[productKey]||null,counted=hasCountSlot(index,product,productKey);
      // Keep an entry only if this SKU was part of that workflow at all: it was
      // counted, or it was ordered. A Merchants order says nothing about a
      // Bellows SKU and must not become a zero-usage week for it.
      if(!counted&&!item)return;
      rows.push({
        at:when,
        month:stThomasMonth(when),
        counted:counted?countFor(index,product,productKey):null,
        hasCount:counted,
        orderedPurchaseUnits:orderedPurchaseUnits(item),
        itemBasis:item?basisFor(Object.assign({},product,{unit:item.unit||product.unit,pack:finite(item.pack)||product.pack}),item.packaging):null,
        source:entry
      });
    });
    rows.sort(function(a,b){return a.at-b.at;});
    return rows;
  }

  /**
   * Usage per week between consecutive counted cycles:
   *   used = count(before) + delivered(before) - count(after)
   * Cycles missing a count on either end, or spanning an implausible number of
   * days, are excluded with a stated reason rather than guessed at.
   */
  function usageObservations(log,basis){
    var observations=[],excluded=[];
    for(var i=1;i<log.length;i++){
      var previous=log[i-1],current=log[i],days=(current.at-previous.at)/DAY_MS;
      if(!previous.hasCount||!current.hasCount){excluded.push("A count snapshot was not recorded for one end of the cycle.");continue;}
      if(!Number.isFinite(days)||days<MIN_CYCLE_DAYS||days>MAX_CYCLE_DAYS){excluded.push("The elapsed period is outside the comparable 1-21 day range.");continue;}
      var before=countToSpace(basis,previous.counted),after=countToSpace(basis,current.counted);
      if(before===null||after===null){excluded.push("A count value was not readable.");continue;}
      var received=purchaseToSpace(previous.itemBasis||basis,previous.orderedPurchaseUnits)||0,
          used=before+received-after;
      // A negative result means a transfer in, a miscount, or a delivery that
      // landed after the next count. It is not usage, so it is dropped.
      if(used<0){excluded.push("The count went up by more than was delivered, so the cycle is not usable.");continue;}
      observations.push({at:current.at,month:previous.month,days:days,used:used,perWeek:used/days*7});
    }
    return {observations:observations,excluded:excluded};
  }

  // Recency weight: 1.0 for the newest observation, halving every ~6 weeks.
  function recencyWeight(ageWeeks){return Math.pow(0.5,Math.max(0,ageWeeks)/WEIGHT_HALF_LIFE_WEEKS);}

  /**
   * Deseasonalized weekly baseline. Each observation is divided by the seasonal
   * index of the month it was measured in, so a busy March does not permanently
   * inflate a SKU's baseline, then re-seasonalized for the week being ordered.
   */
  function baselineWeekly(observations,now){
    var weightedSum=0,weightTotal=0;
    observations.forEach(function(o){
      var ageWeeks=(now-o.at)/DAY_MS/7,weight=recencyWeight(ageWeeks);
      weightedSum+=(o.perWeek/seasonalIndex(o.month))*weight;
      weightTotal+=weight;
    });
    return weightTotal>0?weightedSum/weightTotal:null;
  }

  /**
   * Trend over the recent half of the observations versus the prior half, on
   * deseasonalized rates so a seasonal swing is never reported as a trend.
   */
  function trendOf(observations){
    if(observations.length<MIN_TREND_OBSERVATIONS)return null;
    var window=Math.min(3,Math.floor(observations.length/2)),
        recent=observations.slice(-window),
        prior=observations.slice(-(window*2),-window);
    if(!recent.length||!prior.length)return null;
    function mean(list){
      var total=0;list.forEach(function(o){total+=o.perWeek/seasonalIndex(o.month);});
      return total/list.length;
    }
    var recentMean=mean(recent),priorMean=mean(prior);
    if(!(priorMean>0))return null;
    var change=(recentMean-priorMean)/priorMean,
        factor=Math.min(TREND_MAX,Math.max(TREND_MIN,1+change*TREND_DAMPING));
    return {
      direction:change>0.05?"up":change<-0.05?"down":"flat",
      percent:Math.round(change*100),
      // What actually reaches the projection after damping and the cap.
      appliedPercent:Math.round((factor-1)*100),
      factor:factor,
      weeks:recent.length,
      recentWeekly:round1(recentMean),
      priorWeekly:round1(priorMean)
    };
  }

  /** Median days between orders and the size this SKU is usually ordered in. */
  function cadenceOf(log){
    var gaps=[],sizes=[];
    for(var i=1;i<log.length;i++){
      var days=(log[i].at-log[i-1].at)/DAY_MS;
      if(days>=MIN_CYCLE_DAYS&&days<=MAX_CYCLE_DAYS)gaps.push(days);
    }
    log.forEach(function(row){if(row.orderedPurchaseUnits>0)sizes.push(row.orderedPurchaseUnits);});
    var gap=median(gaps);
    return {
      medianDays:gap===null?null:Math.round(gap),
      horizonDays:gap===null?DEFAULT_HORIZON_DAYS:Math.min(MAX_HORIZON_DAYS,Math.max(MIN_HORIZON_DAYS,Math.round(gap))),
      typicalPurchaseUnits:median(sizes),
      timesOrdered:sizes.length,
      cyclesSeen:log.length
    };
  }

  // A manager-set seasonal profile already moved the build-to. When one is
  // active we must not also apply the month factor, or the same swing is
  // counted twice.
  function managerProfile(options){
    var profile=options&&options.seasonalProfile;
    if(!profile)return null;
    var multiplier=finite(profile.percentageMultiplier);
    if(multiplier===null||multiplier===100)return null;
    if(text(profile.profileType)==="Normal")return null;
    return {name:text(profile.name)||text(profile.profileType)||"Custom",multiplier:multiplier};
  }

  function parFallback(product,basis,onHandSpace,buildToSpace,detail){
    var shortfall=buildToSpace===null?null:Math.max(0,buildToSpace-(onHandSpace===null?0:onHandSpace));
    return {
      basis:"par",
      confidence:"low",
      suggestedPurchaseUnits:shortfall===null||onHandSpace===null?null:spaceToPurchase(basis,shortfall),
      shortfallSpace:shortfall,
      detail:detail
    };
  }

  /**
   * Suggest a next-order quantity for one SKU.
   *
   * Returns a plain object; it never mutates state and never submits anything.
   * The order screen renders this as advice beside the count and build-to, and
   * Josh types the number he actually wants.
   */
  function suggest(history,product,options){
    options=options||{};
    product=product||{};
    var now=finite(options.now)||Date.now(),
        basis=basisFor(product,options.packaging),
        buildToSpace=targetToSpace(basis,options.buildTo===undefined?product.buildTo:options.buildTo),
        onHandSpace=countToSpace(basis,options.onHand),
        month=stThomasMonth(now),
        manager=managerProfile(options),
        seasonal={
          month:month,
          monthName:monthName(month),
          index:round1(seasonalIndex(month)*100)/100,
          percent:Math.round((seasonalIndex(month)-1)*100),
          label:seasonLabel(month),
          source:"usvi-baseline",
          applied:!manager
        },
        log=orderLog(history,product,options),
        usage=usageObservations(log,basis),
        observations=usage.observations,
        cadence=cadenceOf(log),
        result={
          calculationVersion:VERSION,
          productName:text(product.name),
          unit:product.unit||"Unit",
          unitLabel:basis.unitLabel,
          weeksOfHistory:log.length?Math.max(1,Math.round((now-log[0].at)/DAY_MS/7)):0,
          onHandSpace:onHandSpace,
          buildToSpace:buildToSpace,
          observations:observations.length,
          cyclesSeen:log.length,
          excludedCycles:usage.excluded.length,
          seasonal:seasonal,
          managerProfile:manager,
          cadence:cadence,
          trend:null,
          baselineWeeklyUnits:null,
          projectedWeeklyUnits:null,
          clamped:false,
          suggestedPurchaseUnits:null,
          reasons:[],
          summary:""
        };

    // ── Sparse data: use the build-to Josh already set ────────────────────────
    if(observations.length<MIN_USAGE_OBSERVATIONS){
      var weeks=observations.length,
          fallback=parFallback(product,basis,onHandSpace,buildToSpace,
            weeks?"Only "+weeks+" comparable "+plural(weeks,"week","weeks")+" of usage so far":"No comparable usage cycles yet");
      result.basis=fallback.basis;
      result.confidence=fallback.confidence;
      result.suggestedPurchaseUnits=fallback.suggestedPurchaseUnits;
      result.reasons.push(buildToSpace===null||onHandSpace===null
        ?fallback.detail+", and there is no count to measure against yet."
        :fallback.detail+" — using the build-to of "+round1(buildToSpace)+" "+basis.unitLabel+" instead of a trend.");
      if(cadence.timesOrdered>0&&cadence.typicalPurchaseUnits!==null)
        result.reasons.push("Ordered "+cadence.timesOrdered+" "+plural(cadence.timesOrdered,"time","times")+" before, usually "+round1(cadence.typicalPurchaseUnits)+" "+purchaseWords(product,cadence.typicalPurchaseUnits)+" at a time.");
      result.summary=result.suggestedPurchaseUnits===null
        ?"Enter a count to see a build-to suggestion."
        :"Build-to suggestion — not enough history for a trend yet.";
      return result;
    }

    // ── Enough history: project forward ──────────────────────────────────────
    var baseline=baselineWeekly(observations,now),
        trend=trendOf(observations),
        trendFactor=trend?trend.factor:1,
        seasonalFactor=manager?1:seasonalIndex(month),
        projected=baseline===null?null:baseline*seasonalFactor*trendFactor;

    result.trend=trend;
    result.baselineWeeklyUnits=baseline===null?null:round1(baseline);
    result.projectedWeeklyUnits=projected===null?null:round1(projected);

    if(projected===null||onHandSpace===null){
      // We can still say something useful without a count: the size this SKU is
      // usually ordered in. We do not pretend to know the shortfall.
      result.basis="history";
      result.confidence="low";
      result.suggestedPurchaseUnits=cadence.typicalPurchaseUnits===null?null:Math.max(0,Math.ceil(cadence.typicalPurchaseUnits));
      result.reasons.push(onHandSpace===null
        ?"No count entered yet, so this is the size you usually order rather than a shortfall."
        :"Usage history is present but not projectable, so this is the size you usually order.");
      result.summary=result.suggestedPurchaseUnits===null?"Enter a count to see a suggestion.":"Typical order size — enter a count for a full projection.";
      return result;
    }

    var horizonDays=cadence.horizonDays,
        safetyDays=finite(options.safetyDays)===null?DEFAULT_SAFETY_DAYS:Math.max(0,finite(options.safetyDays)),
        coverDays=horizonDays+safetyDays,
        neededSpace=projected*coverDays/7-onHandSpace;

    // Never advise past the build-to ceiling by more than the overshoot limit.
    if(buildToSpace!==null&&buildToSpace>0){
      var ceiling=buildToSpace*OVERSHOOT_LIMIT-onHandSpace;
      if(neededSpace>ceiling){neededSpace=ceiling;result.clamped=true;}
    }
    neededSpace=Math.max(0,neededSpace);

    result.basis="history";
    result.confidence=observations.length>=6?"high":observations.length>=4?"medium":"low";
    result.neededSpace=round1(neededSpace);
    result.coverDays=coverDays;
    result.suggestedPurchaseUnits=spaceToPurchase(basis,neededSpace);

    // ── Reasoning ────────────────────────────────────────────────────────────
    result.reasons.push("Using about "+round1(projected)+" "+basis.unitLabel+" a week over "+observations.length+" counted "+plural(observations.length,"cycle","cycles")+".");
    if(trend&&trend.direction!=="flat"){
      var trendLine="Trending "+trend.direction+" "+Math.abs(trend.percent)+"% over the last "+trend.weeks+" "+plural(trend.weeks,"week","weeks")+" versus the "+trend.weeks+" before.";
      // Say so when damping or the cap keeps most of a swing out of the number,
      // so the stated percentage is never read as the applied percentage.
      if(Math.abs(trend.appliedPercent-trend.percent)>=15)
        trendLine+=" Short-run swings are damped, so PourGrid applies "+(trend.appliedPercent>0?"+":"")+trend.appliedPercent+"% of it.";
      result.reasons.push(trendLine);
    }
    else if(trend)
      result.reasons.push("Usage has been flat over the last "+trend.weeks+" "+plural(trend.weeks,"week","weeks")+".");
    if(manager)
      result.reasons.push("Manager profile \""+manager.name+"\" is set to "+manager.multiplier+"%, so PourGrid is not adding its own month factor.");
    else if(seasonal.percent!==0)
      result.reasons.push(seasonal.monthName+" is historically "+seasonal.label+" in the USVI ("+(seasonal.percent>0?"+":"")+seasonal.percent+"% versus the year).");
    if(cadence.medianDays!==null&&cadence.typicalPurchaseUnits!==null)
      result.reasons.push("You order this about every "+cadence.medianDays+" days, usually "+round1(cadence.typicalPurchaseUnits)+" "+purchaseWords(product,cadence.typicalPurchaseUnits)+".");
    if(result.clamped)
      result.reasons.push("Capped so the order does not push you far past the build-to of "+round1(buildToSpace)+" "+basis.unitLabel+".");

    // The summary names whichever seasonal input actually moved the number, so
    // it can never credit the month factor while a manager profile is standing
    // that factor down.
    var seasonNote=manager?manager.name+" profile at "+manager.multiplier+"%":seasonal.monthName+" is "+seasonal.label,
        headline=trend&&trend.direction!=="flat"
          ?"Trending "+trend.direction+" "+Math.abs(trend.percent)+"%"
          :round1(projected)+" "+basis.unitLabel+"/week";
    result.summary=headline+" · "+seasonNote;
    return result;
  }

  /** Suggestions for a list of products, keyed by product name. */
  function suggestAll(history,products,optionsFor){
    var out={};
    (Array.isArray(products)?products:[]).forEach(function(product){
      if(!product||!text(product.name))return;
      var options=typeof optionsFor==="function"?optionsFor(product):optionsFor;
      out[product.name]=suggest(history,product,options||{});
    });
    return out;
  }

  return {
    VERSION:VERSION,
    MIN_USAGE_OBSERVATIONS:MIN_USAGE_OBSERVATIONS,
    OVERSHOOT_LIMIT:OVERSHOOT_LIMIT,
    SEASONAL_INDEX:SEASONAL_INDEX,
    seasonalIndex:seasonalIndex,
    seasonLabel:seasonLabel,
    monthName:monthName,
    stThomasMonth:stThomasMonth,
    basisFor:basisFor,
    countToSpace:countToSpace,
    targetToSpace:targetToSpace,
    purchaseToSpace:purchaseToSpace,
    spaceToPurchase:spaceToPurchase,
    orderLog:orderLog,
    usageObservations:usageObservations,
    trendOf:trendOf,
    cadenceOf:cadenceOf,
    suggest:suggest,
    suggestAll:suggestAll
  };
});
