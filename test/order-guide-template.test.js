'use strict';
// The onboarding spreadsheet is the only thing standing between a new location and its own
// order guide, so the template it downloads, the sheet it uploads, and the catalog that
// comes out the other side are all pinned here.
const test=require('node:test');
const assert=require('node:assert/strict');
const Template=require('../order-guide-template.js');
const Catalog=require('../property-catalog.js');
const Context=require('../property-context.js');

const HEADER='Section,Category,Item Name,Vendor,Vendor Workspace,Vendor Email,Order Unit,Units Per Case,Bottle Size (mL),Build-To (Par),Notes';

function sheet(rows){return [HEADER].concat(rows).join('\r\n')+'\r\n';}
function memoryStore(){
  const values=new Map();
  return {
    getItem:k=>values.has(k)?values.get(k):null,
    setItem:(k,v)=>{values.set(k,String(v));},
    removeItem:k=>{values.delete(k);},
    keys:()=>Array.from(values.keys())
  };
}

test('the template covers beer, liquor, wine, and N/A with the canonical header',()=>{
  const csv=Template.buildTemplate({propertyName:'SeaSalt'});
  const rows=Template.parseCsv(csv);
  const header=rows.find(row=>row[0]==='Section');
  assert.deepEqual(header,Template.HEADER);
  assert.deepEqual(Template.HEADER,HEADER.split(','));
  ['BEER','LIQUOR','WINE','N/A'].forEach(key=>{
    assert.ok(rows.some(row=>row[0]===key),'template has a '+key+' example');
  });
  assert.match(csv,/# PourGrid order guide template — SeaSalt/);
  assert.match(csv,/only ever builds SeaSalt's guide/);
});

test('the untouched template imports nothing — every example row is skipped',()=>{
  const parsed=Template.parseTemplate(Template.buildTemplate({propertyName:'SeaSalt'}));
  assert.equal(parsed.count,0);
  assert.equal(parsed.skippedExamples,8);
  assert.equal(parsed.errors.length,0);
  assert.equal(parsed.ok,false);
  assert.match(parsed.fatal,/no items on it yet/);
});

test('the template names an existing vendor in its examples when the property has one',()=>{
  const vendors=Catalog.addVendor([],{name:'Island Beverage',workspace:'bar'}).vendors;
  assert.match(Template.buildTemplate({propertyName:'SeaSalt',vendors}),/Island Beverage/);
});

test('a filled sheet becomes this property’s vendors and items',()=>{
  const parsed=Template.parseTemplate(sheet([
    'BEER,Beer,Carib Cans,Island Beverage,Bar,orders@island.example,Case,1,,20,Case count',
    'LIQUOR,Vodka,House Vodka,Island Beverage,Bar,,Case,12,1000,36,',
    'WINE,Wine,House Chardonnay,Vintners,Bar,,Case,12,750,24,',
    'NA,Mixer,Lime Juice,Produce Co,Food & produce,,Case,12,1000,8,'
  ]));
  assert.equal(parsed.ok,true);
  assert.equal(parsed.errors.length,0);
  assert.equal(parsed.count,4);
  assert.deepEqual(parsed.vendors,[
    {name:'Island Beverage',workspace:'bar',email:'orders@island.example'},
    {name:'Vintners',workspace:'bar',email:''},
    {name:'Produce Co',workspace:'merchants',email:''}
  ]);
  assert.deepEqual(parsed.items[0],{name:'Carib Cans',dist:'Island Beverage',cat:'Beer',unit:'Case',pack:1,buildTo:20,note:'Case count',section:'BEER'});
  assert.equal(parsed.items[1].bottleMl,1000);
  assert.equal(parsed.items[3].cat,'Mixer');
  assert.deepEqual(parsed.sections.map(s=>[s.key,s.count]),[['BEER',1],['LIQUOR',1],['WINE',1],['NA',1]]);
  assert.equal(Template.summary(parsed),'4 items · 3 vendors · 1 beer, 1 liquor, 1 wine, 1 n/a');
});

test('blank section, category, unit, and pack fall back to the section defaults',()=>{
  const parsed=Template.parseTemplate(sheet([
    ',Vodka,House Vodka,Island Beverage,,,,,,24,',
    'N/A,,Coke Cans,Island Beverage,,,,,,10,'
  ]));
  assert.equal(parsed.ok,true);
  assert.equal(parsed.items[0].cat,'Vodka');
  assert.equal(parsed.items[0].pack,12,'liquor defaults to a 12-pack case');
  assert.equal(parsed.items[0].unit,'Case');
  assert.equal(parsed.items[1].section,'NA');
  assert.equal(parsed.items[1].cat,'Non-Alc');
  assert.equal(parsed.items[1].pack,1,'N/A defaults to case-counted');
});

test('headers can be reordered, renamed, or padded and the sheet still reads',()=>{
  const parsed=Template.parseTemplate([
    '# a note the manager typed at the top',
    '',
    'SKU,Par Level,Distributor,Group,Case Size,Order By',
    'Carib Cans,20,Island Beverage,Beer,1,cases',
    '"Bacardi Superior, 1L",36,Island Beverage,Spirits,12,Bottle'
  ].join('\n'));
  assert.equal(parsed.ok,true,JSON.stringify(parsed.errors));
  assert.equal(parsed.items[0].buildTo,20);
  assert.equal(parsed.items[0].section,'BEER');
  assert.equal(parsed.items[1].name,'Bacardi Superior, 1L');
  assert.equal(parsed.items[1].section,'LIQUOR');
  assert.equal(parsed.items[1].unit,'Bottle');
});

test('a leading byte order mark from Excel does not hide the first column',()=>{
  const parsed=Template.parseTemplate('﻿'+sheet(['BEER,Beer,Carib Cans,Island Beverage,Bar,,Case,1,,20,']));
  assert.equal(parsed.ok,true);
  assert.equal(parsed.items[0].section,'BEER');
});

test('bad rows are reported by line number and block the whole import',()=>{
  const parsed=Template.parseTemplate(sheet([
    'BEER,Beer,Carib Cans,,Bar,,Case,1,,20,',
    'SNACKS,Chips,Plantain Chips,Produce Co,,,Case,1,,4,',
    'LIQUOR,Vodka,House Vodka,Island Beverage,,,Barrel,12,,24,',
    'LIQUOR,Vodka,Second Vodka,Island Beverage,,,Case,0,,24,',
    'LIQUOR,Vodka,Third Vodka,Island Beverage,,,Case,12,,-4,',
    ',,Nameless,,,,,,,,',
    ',,,,,,,,,,'
  ]));
  assert.equal(parsed.ok,false);
  assert.equal(parsed.fatal,null);
  assert.match(parsed.errors[0],/^Row 2 \(Carib Cans\): add the vendor/);
  assert.match(parsed.errors[1],/^Row 3 \(Plantain Chips\): Section must be BEER, LIQUOR, WINE, or N\/A\.$/);
  assert.match(parsed.errors[2],/^Row 4 \(House Vodka\): "Barrel" is not an order unit\. Use Case, Bottle, BIB, Tank, Pack, Carton\.$/);
  assert.match(parsed.errors[3],/^Row 5 \(Second Vodka\): Units Per Case/);
  assert.match(parsed.errors[4],/^Row 6 \(Third Vodka\): Build-To \(Par\) has to be zero or more\.$/);
  assert.match(parsed.errors[5],/^Row 7 \(Nameless\): add the vendor/);
  assert.equal(parsed.errors.length,6,'the all-blank last row is skipped, not reported');
  assert.equal(parsed.count,0,'nothing survives a sheet with errors on every row');
});

test('the same SKU twice is caught, and a row that already failed is not a duplicate',()=>{
  const parsed=Template.parseTemplate(sheet([
    'BEER,Beer,Carib Cans,Island Beverage,Bar,,Case,1,,20,',
    'BEER,Beer,carib cans,Island Beverage,Bar,,Case,1,,8,'
  ]));
  assert.equal(parsed.ok,false);
  assert.deepEqual(parsed.errors,['Row 3 (carib cans): this item is already on row 2.']);

  const afterFailure=Template.parseTemplate(sheet([
    'BEER,Beer,Carib Cans,,Bar,,Case,1,,20,',
    'BEER,Beer,Carib Cans,Island Beverage,Bar,,Case,1,,20,'
  ]));
  assert.equal(afterFailure.errors.length,1,'the rejected row does not also collide with the good one');
  assert.deepEqual(afterFailure.items.map(item=>item.name),['Carib Cans']);
});

test('a missing build-to warns instead of failing, and a junk bottle size is dropped',()=>{
  const parsed=Template.parseTemplate(sheet([
    'LIQUOR,Vodka,House Vodka,Island Beverage,,,Case,12,one liter,,'
  ]));
  assert.equal(parsed.ok,true);
  assert.equal(parsed.items[0].buildTo,0);
  assert.equal('bottleMl' in parsed.items[0],false);
  assert.match(parsed.warnings[0],/no build-to yet/);
  assert.match(parsed.warnings[1],/ignored the bottle size "one liter"/);
});

test('one vendor spelled two ways stays one vendor',()=>{
  const parsed=Template.parseTemplate(sheet([
    'BEER,Beer,Carib Cans,Island Beverage,Bar,,Case,1,,20,',
    'BEER,Beer,Heineken Cans,island beverage,Food & produce,,Case,1,,15,'
  ]));
  assert.equal(parsed.vendors.length,1);
  assert.equal(parsed.vendors[0].name,'Island Beverage');
  assert.equal(parsed.items[1].dist,'Island Beverage');
  assert.match(parsed.warnings[0],/kept the Bar workspace set on row 2/);
});

test('a sheet that is not the template is refused before anything is saved',()=>{
  const parsed=Template.parseTemplate('sales,covers\n1200,88\n');
  assert.equal(parsed.ok,false);
  assert.match(parsed.fatal,/needs a header row with an "Item Name" column/);
  const noVendor=Template.parseTemplate('Item Name,Build-To (Par)\nCarib Cans,20\n');
  assert.equal(noVendor.ok,false);
  assert.match(noVendor.fatal,/no "Vendor" column/);
});

test('the same sheet saved with semicolons or tabs parses identically',()=>{
  const rows=[
    ['BEER','Beer','Carib Cans','Island Beverage','Bar','','Case','1','','20','Case count'],
    ['LIQUOR','Vodka','House Vodka','Island Beverage','Bar','','Case','12','1000','36','']
  ];
  const comma=Template.parseTemplate(sheet(rows.map(row=>row.join(','))));
  Template.DELIMITERS.filter(sep=>sep!==',').forEach(sep=>{
    const parsed=Template.parseTemplate([HEADER.split(',').join(sep)]
      .concat(rows.map(row=>row.join(sep))).join('\r\n')+'\r\n');
    assert.equal(parsed.ok,true,JSON.stringify([sep,parsed.fatal,parsed.errors]));
    assert.deepEqual(parsed.items,comma.items);
    assert.deepEqual(parsed.vendors,comma.vendors);
  });
  assert.equal(Template.sniffDelimiter('Item Name;Vendor;Build-To (Par)\nCarib;Bellows;20\n'),';');
  // The instruction lines are full of commas whichever delimiter the file uses, so they
  // must not be what decides it.
  assert.equal(Template.sniffDelimiter(Template.buildTemplate({propertyName:'SeaSalt'})),',');
});

test('a workbook, a PDF, and an empty file are each named rather than called "not the template"',()=>{
  const complain=source=>Template.parseTemplate(source).fatal;
  assert.match(complain('PK'+String.fromCharCode(3,4)+'  [Content_Types].xml'),/Excel workbook \(\.xlsx\) or a Numbers file/);
  assert.match(complain(String.fromCharCode(0xFFFD,0xFFFD,0x11,0xFFFD)+'junk'),/older Excel workbook \(\.xls\)/);
  assert.match(complain(String.fromCharCode(0xD0,0xCF,0x11,0xE0)+'junk'),/older Excel workbook \(\.xls\)/);
  assert.match(complain('%PDF-1.7\n1 0 obj'),/That is a PDF/);
  assert.match(complain(''),/That file is empty/);
  assert.match(complain('   \r\n'),/That file is empty/);
  assert.match(complain('a b c '),/not a spreadsheet PourGrid can read/);
  // A real CSV that simply is not the template still gets the template explanation.
  assert.match(complain('sales,covers\n1200,88\n'),/needs a header row with an "Item Name" column/);
});

test('a sheet the catalog would refuse fails in the preview instead of after the save',()=>{
  const email=Template.parseTemplate(sheet(['BEER,Beer,Carib Cans,Island Beverage,Bar,orders@island,Case,1,,20,']));
  assert.equal(email.ok,false);
  assert.deepEqual(email.errors,['Row 2 (Carib Cans): "orders@island" is not a valid vendor email. Fix it or leave the cell blank.']);

  const longVendor=Template.parseTemplate(sheet(['BEER,Beer,Carib Cans,'+'V'.repeat(Catalog.VENDOR_NAME_MAX+1)+',Bar,,Case,1,,20,']));
  assert.equal(longVendor.ok,false);
  assert.match(longVendor.errors[0],/shorten the vendor name to under 60 characters/);

  const longItem=Template.parseTemplate(sheet(['BEER,Beer,'+'N'.repeat(Catalog.ITEM_NAME_MAX+1)+',Island Beverage,Bar,,Case,1,,20,']));
  assert.equal(longItem.ok,false);
  assert.match(longItem.errors[0],/shorten this item name to under 80 characters/);

  // Every one of these is a rule property-catalog enforces on save; the point is that the
  // uploader hears about it while the preview is still the only thing that exists.
  [email,longVendor,longItem].forEach(parsed=>{
    const built=Template.applyTemplate(parsed,{existingVendors:[],existingItems:[]});
    assert.equal(built.ok,false);
    assert.deepEqual(built.added,[]);
  });
});

test('a row that collides with the published guide is an error, not a partial import',()=>{
  const parsed=Template.parseTemplate(sheet([
    'LIQUOR,Vodka,Stoli Vodka,Island Beverage,Bar,,Case,12,1000,99,',
    'LIQUOR,Vodka,New House Vodka,Island Beverage,Bar,,Case,12,1000,24,'
  ]),{reservedNames:['stoli vodka']});
  assert.equal(parsed.ok,false);
  assert.match(parsed.errors[0],/^Row 2 \(Stoli Vodka\): the published order guide already has this item/);
  assert.equal(parsed.count,1,'the good row parsed, but ok is false so nothing may be written');
});

test('a name the property already has warns without blocking a replace',()=>{
  const parsed=Template.parseTemplate(sheet(['BEER,Beer,Carib Cans,Island Beverage,Bar,,Case,1,,20,']),
    {existingItemNames:['carib cans']});
  assert.equal(parsed.ok,true,'replacing the catalog with this sheet is still legitimate');
  assert.match(parsed.warnings[0],/adding to the current list will skip it/);
});

test('an implausibly large sheet is refused before it is walked row by row',()=>{
  const rows=[];
  for(let i=0;i<=Template.MAX_ROWS;i++)rows.push('BEER,Beer,Item '+i+',Island Beverage,Bar,,Case,1,,20,');
  const parsed=Template.parseTemplate(sheet(rows));
  assert.equal(parsed.ok,false);
  assert.match(parsed.fatal,/more than 2000 rows below the header/);
  assert.deepEqual(parsed.items,[]);
});

test('applying a sheet builds the catalog and replaces an earlier import',()=>{
  const first=Template.parseTemplate(sheet([
    'BEER,Beer,Carib Cans,Island Beverage,Bar,,Case,1,,20,',
    'LIQUOR,Vodka,House Vodka,Island Beverage,Bar,,Case,12,1000,36,'
  ]));
  const built=Template.applyTemplate(first,{existingVendors:[],existingItems:[]});
  assert.deepEqual(built.added,['Carib Cans','House Vodka']);
  assert.deepEqual(built.addedVendors,['Island Beverage']);
  assert.equal(built.skipped.length,0);
  assert.equal(built.items.length,2);
  assert.equal(built.items[0].custom,true);

  const second=Template.parseTemplate(sheet(['WINE,Wine,House Chardonnay,Vintners,Bar,,Case,12,750,24,']));
  const replaced=Template.applyTemplate(second,{existingVendors:built.vendors,existingItems:built.items});
  assert.deepEqual(replaced.items.map(i=>i.name),['House Chardonnay'],'replace is the default');
  assert.deepEqual(Catalog.vendorNames(replaced.vendors),['Island Beverage','Vintners'],'vendors are never dropped');

  const appended=Template.applyTemplate(second,{existingVendors:built.vendors,existingItems:built.items,mode:'append'});
  assert.deepEqual(appended.items.map(i=>i.name),['Carib Cans','House Vodka','House Chardonnay']);
});

test('an appended sheet skips names the property already has instead of failing',()=>{
  const parsed=Template.parseTemplate(sheet([
    'BEER,Beer,Carib Cans,Island Beverage,Bar,,Case,1,,20,',
    'BEER,Beer,Soca Cans,Island Beverage,Bar,,Case,1,,10,'
  ]));
  const built=Template.applyTemplate(parsed,{existingVendors:[],existingItems:[]});
  const again=Template.applyTemplate(parsed,{existingVendors:built.vendors,existingItems:built.items,mode:'append'});
  assert.deepEqual(again.added,[]);
  assert.deepEqual(again.skipped.map(row=>row.name),['Carib Cans','Soca Cans']);
  assert.match(again.skipped[0].reason,/already exists/);
  assert.equal(again.items.length,2);
});

test('a sheet can never shadow a published guide product',()=>{
  const parsed=Template.parseTemplate(sheet(['LIQUOR,Vodka,Stoli Vodka,Island Beverage,Bar,,Case,12,1000,99,']));
  const result=Template.applyTemplate(parsed,{existingVendors:[],existingItems:[],reservedNames:['Stoli Vodka']});
  assert.deepEqual(result.added,[]);
  assert.deepEqual(result.skipped.map(row=>row.name),['Stoli Vodka']);
  assert.equal(result.items.length,0);
});

test('importing a sheet writes only into the importing property’s namespace',()=>{
  const storage=memoryStore();
  // Sapphire is the home property, so its catalog keeps the original unprefixed key.
  const sapphire=Context.scopedStorage(storage,'loc-sapphire','loc-sapphire');
  const seasalt=Context.scopedStorage(storage,'loc-seasalt','loc-sapphire');
  Catalog.saveItems(sapphire,[{name:'Sapphire Only',dist:'Bellows/WI',cat:'Vodka',pack:12,unit:'Case',buildTo:12}]);

  const parsed=Template.parseTemplate(sheet(['BEER,Beer,Carib Cans,Island Beverage,Bar,,Case,1,,20,']));
  const result=Template.applyTemplate(parsed,{
    existingVendors:Catalog.readVendors(seasalt,{seedCatalog:'none'}),
    existingItems:Catalog.readItems(seasalt)
  });
  Catalog.saveItems(seasalt,result.items);
  Catalog.saveVendors(seasalt,result.vendors);

  assert.deepEqual(Catalog.readItems(seasalt).map(i=>i.name),['Carib Cans']);
  assert.deepEqual(Catalog.readItems(sapphire).map(i=>i.name),['Sapphire Only'],'Sapphire is untouched');
  assert.deepEqual(Catalog.vendorNames(Catalog.readVendors(sapphire,{seedCatalog:'sapphire-v12'})),['Bellows/WI','CC1','Merchants']);
  assert.ok(storage.keys().includes('pg:loc-seasalt:pourgrid-property-catalog-v1'));
  assert.ok(storage.keys().includes('pg:loc-seasalt:pourgrid-property-vendors-v1'));
});

test('the download filename carries the property name',()=>{
  assert.equal(Template.templateFilename('SeaSalt'),'PourGrid-Order-Guide-Template-SeaSalt.csv');
  assert.equal(Template.templateFilename('Paradise Pie'),'PourGrid-Order-Guide-Template-Paradise-Pie.csv');
  assert.equal(Template.templateFilename(''),'PourGrid-Order-Guide-Template.csv');
});

test('csv round-trips commas, quotes, and newlines inside a cell',()=>{
  const line=Template.csvLine(['a,b','say "hi"','one\ntwo']);
  assert.deepEqual(Template.parseCsv(line),[['a,b','say "hi"','one\ntwo']]);
});
