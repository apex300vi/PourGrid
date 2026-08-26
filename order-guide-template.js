(function(root,factory){
  // property-catalog.js owns every rule about what a valid vendor or item is. This module
  // resolves it lazily so script order in index.html does not matter and node tests can
  // require it directly.
  function catalog(){
    if(root&&root.PourGridPropertyCatalog)return root.PourGridPropertyCatalog;
    if(typeof require==="function")return require("./property-catalog.js");
    return null;
  }
  var api=factory(catalog);
  if(typeof module==="object"&&module.exports)module.exports=api;else root.PourGridOrderGuideTemplate=api;
})(typeof self!=="undefined"?self:this,function(catalog){
  "use strict";

  // A new location fills one row per SKU. Sections are the four buying groups every bar
  // recognises; Category is the finer shelf group PourGrid sorts counts by.
  var SECTIONS=[
    {key:"BEER",label:"Beer",defaultCategory:"Beer",defaultUnit:"Case",defaultPack:1,
     categories:["Beer"],
     hint:"Cans, bottles, draft, and seltzer. Count and build-to are usually cases."},
    {key:"LIQUOR",label:"Liquor",defaultCategory:"Liquor",defaultUnit:"Case",defaultPack:12,
     categories:["Vodka","Rum","Gin","Tequila","Whiskey","Bourbon","Scotch","Brandy","Liqueur","Liquor"],
     hint:"Spirits and cordials. Count and build-to are usually bottles."},
    {key:"WINE",label:"Wine",defaultCategory:"Wine",defaultUnit:"Case",defaultPack:12,
     categories:["Wine"],
     hint:"Still, sparkling, and rose. Count and build-to are usually bottles."},
    {key:"NA",label:"N/A",defaultCategory:"Non-Alc",defaultUnit:"Case",defaultPack:1,
     categories:["Non-Alc","BIB","Water","Mixer","Fruit"],
     hint:"Sodas, bag-in-box, juice, mixers, water, and garnish."}
  ];

  var SECTION_ALIASES={
    BEER:"BEER",BEERS:"BEER",DRAFT:"BEER",DRAFTBEER:"BEER",SELTZER:"BEER",SELTZERS:"BEER",CIDER:"BEER",
    LIQUOR:"LIQUOR",LIQUORS:"LIQUOR",SPIRIT:"LIQUOR",SPIRITS:"LIQUOR",CORDIAL:"LIQUOR",CORDIALS:"LIQUOR",
    WINE:"WINE",WINES:"WINE",SPARKLING:"WINE",CHAMPAGNE:"WINE",ROSE:"WINE",
    NA:"NA",NONALC:"NA",NONALCOHOL:"NA",NONALCOHOLIC:"NA",NOALCOHOL:"NA",SOFTDRINK:"NA",SOFTDRINKS:"NA",
    SODA:"NA",SODAS:"NA",MIXER:"NA",MIXERS:"NA",JUICE:"NA",WATER:"NA",BIB:"NA",GARNISH:"NA",FRUIT:"NA"
  };

  var COLUMNS=[
    {key:"section",label:"Section",aliases:["section","group","type","department"]},
    {key:"cat",label:"Category",aliases:["category","subcategory","shelf","class"]},
    {key:"name",label:"Item Name",aliases:["itemname","item","product","productname","sku","skuname","description"]},
    {key:"dist",label:"Vendor",aliases:["vendor","distributor","supplier","dist","purveyor"]},
    {key:"workspace",label:"Vendor Workspace",aliases:["vendorworkspace","workspace","orderscreen"]},
    {key:"email",label:"Vendor Email",aliases:["vendoremail","orderemail","email"]},
    {key:"unit",label:"Order Unit",aliases:["orderunit","unit","purchaseunit","orderby"]},
    {key:"pack",label:"Units Per Case",aliases:["unitspercase","packsize","pack","casesize","unitspercase()","bottlespercase","perscase"]},
    {key:"bottleMl",label:"Bottle Size (mL)",aliases:["bottlesizeml","bottlesize","sizeml","ml","volumeml"]},
    {key:"buildTo",label:"Build-To (Par)",aliases:["buildtopar","buildto","build","par","parlevel","buildtolevel","target"]},
    {key:"note",label:"Notes",aliases:["notes","note","comment","comments"]}
  ];

  var HEADER=COLUMNS.map(function(column){return column.label;});
  var WORKSPACE_LABELS={bar:"Bar",merchants:"Food & produce"};
  var EXAMPLE_PREFIX="EXAMPLE";

  function text(value){return String(value==null?"":value).trim();}
  function norm(value){return text(value).toLowerCase().replace(/[^a-z0-9]/g,"");}

  function sectionByKey(key){
    for(var i=0;i<SECTIONS.length;i++)if(SECTIONS[i].key===key)return SECTIONS[i];
    return null;
  }
  function sectionForCategory(value){
    var wanted=norm(value);
    if(!wanted)return null;
    for(var i=0;i<SECTIONS.length;i++){
      for(var j=0;j<SECTIONS[i].categories.length;j++)if(norm(SECTIONS[i].categories[j])===wanted)return SECTIONS[i];
    }
    return null;
  }
  function resolveSection(sectionValue,categoryValue){
    var key=SECTION_ALIASES[text(sectionValue).toUpperCase().replace(/[^A-Z0-9]/g,"")];
    if(key)return sectionByKey(key);
    return sectionForCategory(sectionValue)||sectionForCategory(categoryValue);
  }

  function resolveWorkspace(value){
    var key=norm(value);
    if(!key)return "";
    if(key==="bar"||key==="barworkspace"||key==="liquor"||key==="beverage")return "bar";
    if(key.indexOf("merchant")===0||key.indexOf("food")===0||key.indexOf("produce")>=0||key.indexOf("kitchen")>=0)return "merchants";
    return "";
  }

  function resolveUnit(value){
    var units=(catalog()&&catalog().ORDER_UNITS)||["Case"],wanted=norm(value);
    if(!wanted)return null;
    for(var i=0;i<units.length;i++)if(norm(units[i])===wanted)return units[i];
    // Common ways a manager writes the same thing on their own sheet.
    if(wanted==="cases"||wanted==="cs"||wanted==="box")return "Case";
    if(wanted==="bottles"||wanted==="btl"||wanted==="each"||wanted==="ea")return "Bottle";
    if(wanted==="baginbox"||wanted==="bagnbox"||wanted==="bibs")return "BIB";
    if(wanted==="keg"||wanted==="tanks")return "Tank";
    if(wanted==="packs"||wanted==="sixpack"||wanted==="6pack")return "Pack";
    if(wanted==="cartons")return "Carton";
    return null;
  }

  function isExampleRow(name){
    return text(name).toUpperCase().indexOf(EXAMPLE_PREFIX)===0;
  }

  // --- CSV ------------------------------------------------------------------

  function csvCell(value){
    var cell=String(value==null?"":value);
    return /[",\r\n]/.test(cell)||cell!==cell.trim()?'"'+cell.replace(/"/g,'""')+'"':cell;
  }
  function csvLine(cells){return cells.map(csvCell).join(",");}

  // RFC 4180: quoted fields may hold commas, newlines, and doubled quotes.
  function parseCsv(input){
    var source=String(input==null?"":input).replace(/^\uFEFF/,""),rows=[],row=[],cell="",quoted=false,i=0;
    function endCell(){row.push(cell);cell="";}
    function endRow(){endCell();rows.push(row);row=[];}
    while(i<source.length){
      var ch=source.charAt(i);
      if(quoted){
        if(ch==='"'){
          if(source.charAt(i+1)==='"'){cell+='"';i+=2;continue;}
          quoted=false;i++;continue;
        }
        cell+=ch;i++;continue;
      }
      if(ch==='"'){quoted=true;i++;continue;}
      if(ch===","){endCell();i++;continue;}
      if(ch==="\r"){if(source.charAt(i+1)==="\n")i++;endRow();i++;continue;}
      if(ch==="\n"){endRow();i++;continue;}
      cell+=ch;i++;
    }
    if(cell.length||row.length)endRow();
    return rows;
  }

  function isBlankRow(cells){
    return !(Array.isArray(cells)?cells:[]).some(function(cell){return text(cell)!=="";});
  }
  function isCommentRow(cells){
    return Array.isArray(cells)&&text(cells[0]).charAt(0)==="#";
  }

  // --- Template -------------------------------------------------------------

  function instructions(propertyName){
    var name=text(propertyName)||"this property";
    return [
      "# PourGrid order guide template — "+name,
      "# 1. One row per SKU you order. Leave the column headings exactly as they are.",
      "# 2. Section must be BEER, LIQUOR, WINE, or N/A. Category is the shelf group PourGrid sorts counts by.",
      "# 3. Vendor is who you order the item from. Repeat the same vendor name on every one of its rows.",
      "# 4. Units Per Case is how many bottles or cans come in one case. Use 1 if you order and count whole cases.",
      "# 5. Build-To (Par) is how many you want on hand after a delivery, in the same units you physically count.",
      "# 6. Delete the EXAMPLE rows before you upload — PourGrid skips them either way.",
      "# 7. Save as CSV and upload it on the PourGrid setup screen. This sheet only ever builds "+name+"'s guide."
    ];
  }

  function exampleRows(vendorName){
    var vendor=text(vendorName)||"Your Distributor";
    return [
      ["BEER","Beer","EXAMPLE: Carib Cans",vendor,"Bar","","Case","1","","20","Counted and ordered by the case"],
      ["BEER","Beer","EXAMPLE: Heineken 0.0 Cans",vendor,"Bar","","Case","1","","4",""],
      ["LIQUOR","Vodka","EXAMPLE: House Vodka",vendor,"Bar","","Case","12","1000","36","Counted by the bottle"],
      ["LIQUOR","Liqueur","EXAMPLE: Triple Sec",vendor,"Bar","","Case","12","1000","12",""],
      ["WINE","Wine","EXAMPLE: House Chardonnay",vendor,"Bar","","Case","12","750","24",""],
      ["WINE","Wine","EXAMPLE: Prosecco Splits",vendor,"Bar","","Case","24","187","48",""],
      ["N/A","BIB","EXAMPLE: BIB Coke",vendor,"Bar","","BIB","1","","3","Bag-in-box syrup"],
      ["N/A","Mixer","EXAMPLE: Lime Juice",vendor,"Food & produce","","Case","12","1000","8",""]
    ];
  }

  function buildTemplate(options){
    options=options||{};
    var vendors=(catalog()?catalog().vendorNames(options.vendors):[])||[];
    var lines=instructions(options.propertyName);
    lines.push(csvLine(HEADER));
    if(options.includeExamples!==false)exampleRows(vendors[0]).forEach(function(row){lines.push(csvLine(row));});
    return lines.join("\r\n")+"\r\n";
  }

  function templateFilename(propertyName){
    var slug=text(propertyName).replace(/[^A-Za-z0-9]+/g,"-").replace(/^-|-$/g,"");
    return "PourGrid-Order-Guide-Template"+(slug?"-"+slug:"")+".csv";
  }

  // --- Parsing a filled sheet ----------------------------------------------

  function columnKeyFor(header){
    var wanted=norm(header);
    if(!wanted)return null;
    for(var i=0;i<COLUMNS.length;i++){
      if(COLUMNS[i].aliases.indexOf(wanted)>=0)return COLUMNS[i].key;
    }
    return null;
  }

  function mapHeader(cells){
    var map={},hits=0;
    (Array.isArray(cells)?cells:[]).forEach(function(cell,index){
      var key=columnKeyFor(cell);
      if(key&&!(key in map)){map[key]=index;hits++;}
    });
    return {map:map,hits:hits};
  }

  function findHeader(rows){
    for(var i=0;i<rows.length;i++){
      if(isCommentRow(rows[i])||isBlankRow(rows[i]))continue;
      var mapped=mapHeader(rows[i]);
      if("name" in mapped.map&&mapped.hits>=2)return {index:i,map:mapped.map};
    }
    return null;
  }

  function cellAt(cells,map,key){
    var index=map[key];
    return index==null?"":text(cells[index]);
  }

  function number(value){
    var raw=text(value).replace(/,/g,"");
    if(!raw)return null;
    var parsed=Number(raw);
    return isFinite(parsed)?parsed:NaN;
  }

  function parseTemplate(input,options){
    options=options||{};
    var result={
      ok:false,fatal:null,items:[],vendors:[],errors:[],warnings:[],
      skippedExamples:0,sections:[],count:0
    };
    var rows=parseCsv(input);
    var header=findHeader(rows);
    if(!header){
      result.fatal='That file does not look like the PourGrid template. It needs a header row with an "Item Name" column — download the template and fill that in.';
      return result;
    }
    var map=header.map;
    if(!("dist" in map)){
      result.fatal='The sheet has no "Vendor" column. Every item has to say who it is ordered from.';
      return result;
    }

    var seenItems={},vendorOrder=[],vendorsByKey={},counts={};
    SECTIONS.forEach(function(section){counts[section.key]=0;});

    for(var i=header.index+1;i<rows.length;i++){
      var cells=rows[i],line=i+1;
      if(isBlankRow(cells)||isCommentRow(cells))continue;
      var name=cellAt(cells,map,"name");
      if(isExampleRow(name)){result.skippedExamples++;continue;}

      var vendorName=cellAt(cells,map,"dist");
      if(!name){
        result.errors.push("Row "+line+": add an item name.");
        continue;
      }
      if(!vendorName){
        result.errors.push("Row "+line+" ("+name+"): add the vendor this item is ordered from.");
        continue;
      }
      var nameKey=name.toLowerCase();
      if(seenItems[nameKey]){
        result.errors.push("Row "+line+" ("+name+"): this item is already on row "+seenItems[nameKey]+".");
        continue;
      }

      var sectionValue=cellAt(cells,map,"section"),categoryValue=cellAt(cells,map,"cat");
      var section=resolveSection(sectionValue,categoryValue);
      if(!section){
        result.errors.push("Row "+line+" ("+name+"): Section must be BEER, LIQUOR, WINE, or N/A.");
        continue;
      }

      var unitValue=cellAt(cells,map,"unit"),unit=unitValue?resolveUnit(unitValue):section.defaultUnit;
      if(!unit){
        result.errors.push("Row "+line+" ("+name+'): "'+unitValue+'" is not an order unit. Use '+((catalog()&&catalog().ORDER_UNITS)||[]).join(", ")+".");
        continue;
      }

      var packValue=cellAt(cells,map,"pack"),pack=packValue?number(packValue):section.defaultPack;
      if(!(isFinite(pack)&&pack>0)){
        result.errors.push("Row "+line+" ("+name+"): Units Per Case has to be a whole number of 1 or more.");
        continue;
      }
      pack=Math.floor(pack);

      var buildValue=cellAt(cells,map,"buildTo"),buildTo=buildValue?number(buildValue):0;
      if(!(isFinite(buildTo)&&buildTo>=0)){
        result.errors.push("Row "+line+" ("+name+"): Build-To (Par) has to be zero or more.");
        continue;
      }
      if(!buildValue)result.warnings.push("Row "+line+" ("+name+"): no build-to yet, so PourGrid will not order it until you set one.");

      var item={
        name:name,
        dist:vendorName,
        cat:categoryValue||section.defaultCategory,
        unit:unit,
        pack:pack,
        buildTo:buildTo,
        note:cellAt(cells,map,"note"),
        section:section.key
      };
      var mlValue=cellAt(cells,map,"bottleMl");
      if(mlValue){
        var ml=number(mlValue);
        if(isFinite(ml)&&ml>0)item.bottleMl=ml;
        else result.warnings.push("Row "+line+" ("+name+'): ignored the bottle size "'+mlValue+'".');
      }

      seenItems[nameKey]=line;
      counts[section.key]++;
      result.items.push(item);

      var vendorKey=vendorName.toLowerCase();
      var workspace=resolveWorkspace(cellAt(cells,map,"workspace")),email=cellAt(cells,map,"email");
      if(!vendorsByKey[vendorKey]){
        vendorsByKey[vendorKey]={name:vendorName,workspace:workspace||"bar",email:email,line:line,workspaceSet:!!workspace};
        vendorOrder.push(vendorKey);
      }else{
        var known=vendorsByKey[vendorKey];
        if(workspace&&!known.workspaceSet){known.workspace=workspace;known.workspaceSet=true;}
        else if(workspace&&known.workspace!==workspace){
          result.warnings.push("Row "+line+" ("+vendorName+"): kept the "+WORKSPACE_LABELS[known.workspace]+" workspace set on row "+known.line+".");
        }
        if(email&&!known.email)known.email=email;
      }
    }

    result.vendors=vendorOrder.map(function(key){
      var vendor=vendorsByKey[key];
      return {name:vendor.name,workspace:vendor.workspace,email:vendor.email};
    });
    // "bellows" on one row and "Bellows" on another is one vendor; every item points at
    // the spelling from that vendor's first row.
    result.items.forEach(function(item){item.dist=vendorsByKey[item.dist.toLowerCase()].name;});
    result.sections=SECTIONS.map(function(section){
      return {key:section.key,label:section.label,count:counts[section.key]};
    });
    result.count=result.items.length;
    if(!result.errors.length&&!result.count)result.fatal="The sheet has no items on it yet. Fill in a row for each SKU and upload it again.";
    result.ok=!result.fatal&&!result.errors.length&&result.count>0;
    return result;
  }

  function summary(parsed){
    if(!parsed)return "";
    var parts=(parsed.sections||[]).filter(function(section){return section.count>0;})
      .map(function(section){return section.count+" "+section.label.toLowerCase();});
    var head=parsed.count+" item"+(parsed.count===1?"":"s")+" · "+parsed.vendors.length+" vendor"+(parsed.vendors.length===1?"":"s");
    return parts.length?head+" · "+parts.join(", "):head;
  }

  // --- Applying to this property's catalog ----------------------------------

  // Only ever called with the active property's own vendors and items. `reservedNames`
  // are published guide products, which a sheet may never shadow or overwrite.
  function applyTemplate(parsed,options){
    options=options||{};
    var Catalog=catalog(),
        replace=options.mode!=="append",
        vendors=Catalog.normalizeVendors(options.existingVendors),
        items=replace?[]:(Array.isArray(options.existingItems)?options.existingItems:[]).map(Catalog.normalizeItem).filter(Boolean),
        reserved=Array.isArray(options.reservedNames)?options.reservedNames:[],
        added=[],skipped=[],addedVendors=[];

    (parsed&&parsed.vendors||[]).forEach(function(vendor){
      var exists=vendors.some(function(known){return known.name.toLowerCase()===vendor.name.toLowerCase();});
      if(exists)return;
      var result=Catalog.addVendor(vendors,vendor);
      if(!result.ok){skipped.push({name:vendor.name,reason:result.error});return;}
      vendors=result.vendors;addedVendors.push(vendor.name);
    });

    function canonicalVendor(name){
      var key=String(name==null?"":name).trim().toLowerCase();
      for(var i=0;i<vendors.length;i++)if(vendors[i].name.toLowerCase()===key)return vendors[i].name;
      return name;
    }

    (parsed&&parsed.items||[]).forEach(function(entry){
      // A property that already spells the vendor differently keeps its own spelling.
      var item=Object.assign({},entry,{dist:canonicalVendor(entry.dist)});
      var result=Catalog.addItem(items,item,vendors,reserved);
      if(!result.ok){skipped.push({name:item.name,reason:result.error});return;}
      items=result.items;added.push(item.name);
    });

    return {vendors:vendors,items:items,added:added,addedVendors:addedVendors,skipped:skipped,mode:replace?"replace":"append"};
  }

  return {
    SECTIONS:SECTIONS,
    COLUMNS:COLUMNS,
    HEADER:HEADER,
    WORKSPACE_LABELS:WORKSPACE_LABELS,
    parseCsv:parseCsv,
    csvLine:csvLine,
    buildTemplate:buildTemplate,
    templateFilename:templateFilename,
    resolveSection:resolveSection,
    resolveUnit:resolveUnit,
    resolveWorkspace:resolveWorkspace,
    parseTemplate:parseTemplate,
    summary:summary,
    applyTemplate:applyTemplate
  };
});
