const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../workshop-stock.js'),'utf8');
const context={window:{},TextEncoder,Blob,atob};vm.runInNewContext(source,context);const soh=context.window.PanelStockStocktakeReport.soh;
const stock=(id='panel',patch={})=>({itemId:id,sku:'PANEL',name:'White ACP panel',category:'Panels',categoryKey:'panels',unit:'sheets',qty:3,reserved:1,available:2,onOrder:5,reorderLevel:0,status:'In stock',width:2400,height:1200,costBasis:'catalogue-area',unitCost:999,effectiveUnitCost:999,lineValue:2997,catalogueCost:{catalogId:'catalogue:white',name:'White ACP catalogue',ratePerM2:42.15,width:2400,height:1200},...patch});
const offcut=()=>stock('offcut:cut',{name:'White ACP offcut',category:'Offcuts',categoryKey:'offcuts',width:1200,height:600,catalogueCost:{catalogId:'catalogue:white',name:'White ACP catalogue',ratePerM2:42.15,width:1200,height:600}});
const example=(rows=[stock(),offcut()])=>({kind:'soh',name:'Catalogue priced stock',generatedAt:'2026-11-05T00:00:00Z',revision:42,categories:['Panels','Offcuts'],supplier:'All suppliers',includeCostings:true,rows});
const near=(actual,expected)=>assert.ok(Math.abs(actual-expected)<=Math.max(1,Math.abs(expected))*1e-12,actual+' should equal '+expected);
function unzip(bytes){let offset=0;const files={};while(bytes.readUInt32LE(offset)===0x04034b50){const size=bytes.readUInt32LE(offset+18),length=bytes.readUInt16LE(offset+26),name=bytes.subarray(offset+30,offset+30+length).toString();files[name]=bytes.subarray(offset+30+length,offset+30+length+size).toString();offset+=30+length+size;}return files;}
const numeric=(sheet,ref)=>{const match=sheet.match(new RegExp('<c r="'+ref+'"[^>]* t="n"><v>([^<]+)</v>'));assert.ok(match,'numeric '+ref);return Number(match[1]);};

test('catalogue rates price full panels and offcuts by actual item area and round the final line only',()=>{
 const input=example(),before=structuredClone(input),report=soh.prepare(input),[panel,cut]=report.rows;
 assert.equal(panel.areaRatePerM2,42.15);assert.equal(cut.areaRatePerM2,42.15);near(panel.unitAreaM2,2.88);near(cut.unitAreaM2,.72);near(panel.effectiveUnitCost,121.392);near(cut.effectiveUnitCost,30.348);
 assert.deepEqual(Array.from(report.rows,row=>row.lineValue),[364.18,91.04]);assert.equal(report.costSummary.totalValue,455.22);assert.equal(report.costSummary.unpricedItems,0);assert.equal(report.costSummary.pricedItems,2);assert.equal(report.costSummary.taxBasis,'exGST');
 assert.deepEqual(Array.from(report.rows,row=>[row.qty,row.reserved,row.available,row.onOrder]),[[3,1,2,5],[3,1,2,5]]);assert.deepEqual(input,before);assert.notEqual(panel.catalogueCost,input.rows[0].catalogueCost);
});

test('catalogue dimensions retain decimal and scientific precision with signed half-cent rounding',()=>{
 const rows=[stock('positive',{qty:1,width:500,height:1000,catalogueCost:{name:'Half cent',ratePerM2:.01,width:500,height:1000}}),stock('negative',{qty:-1,width:500,height:1000,catalogueCost:{name:'Half cent',ratePerM2:.01,width:500,height:1000}}),stock('decimal',{qty:1e9,width:.3,height:.7,catalogueCost:{name:'Decimal',ratePerM2:.21,width:.3,height:.7}}),stock('scientific',{qty:1e9,width:1e-4,height:1e-3,catalogueCost:{name:'Scientific',ratePerM2:1e9,width:1e-4,height:1e-3}})];
 const report=soh.prepare(example(rows));assert.deepEqual(Array.from(report.rows,row=>row.lineValue),[.01,-.01,44.1,100000]);assert.equal(report.costSummary.totalValue,100044.1);
});

test('missing catalogue rates and dimensions remain unpriced while an explicit zero rate is valid',()=>{
 const missing=[null,undefined,'','  ',true,false].map((rate,i)=>stock('rate'+i,{catalogueCost:{name:'Catalogue '+i,ratePerM2:rate,width:2400,height:1200}}));
 const rows=[...missing,stock('no-source',{catalogueCost:null}),stock('no-dimensions',{width:undefined,height:undefined,catalogueCost:{name:'Unknown size',ratePerM2:42.15}}),stock('zero-dimension',{width:0}),stock('free',{catalogueCost:{name:'Free panel',ratePerM2:0,width:2400,height:1200}})];
 const report=soh.prepare(example(rows));assert.deepEqual(Array.from(report.rows.slice(0,-1),row=>row.lineValue),Array(rows.length-1).fill(null));assert.equal(report.rows.at(-1).lineValue,0);assert.equal(report.rows.at(-1).effectiveUnitCost,0);assert.equal(report.rows.at(-1).areaRatePerM2,0);assert.equal(report.costSummary.totalValue,0);assert.equal(report.costSummary.pricedItems,1);assert.equal(report.costSummary.unpricedItems,rows.length-1);
 for(const rate of [-.01,1.001,1e9+1])assert.throws(()=>soh.prepare(example([stock('bad-rate',{catalogueCost:{name:'Invalid catalogue',ratePerM2:rate,width:2400,height:1200}})])),/valid cost with up to two decimal places/);
});

test('quantity-only reports strip catalogue source rates, derived prices and monetary summaries',async()=>{
 const costed=soh.prepare(example());costed.rows[0].catalogueRatePerM2=42.15;costed.rows[0].ratePerM2=42.15;costed.rows[0].catalogueCostStatus='resolved';const input={...costed,includeCostings:false},stripped=soh.prepare(input);
 assert.equal(Object.hasOwn(stripped,'costSummary'),false);for(const row of stripped.rows)for(const key of ['unitCost','packCost','costBasis','packSize','effectiveUnitCost','lineValue','areaCost','areaCostStatus','areaRatePerM2','unitAreaM2','catalogueCost','catalogueCostStatus','catalogueRatePerM2','ratePerM2'])assert.equal(Object.hasOwn(row,key),false,key);
 const sheet=unzip(Buffer.from(await soh.xlsx(input).arrayBuffer()))['xl/worksheets/sheet1.xml'],pdf=await soh.pdf(input).text();assert.match(sheet,/autoFilter ref="A12:M14"/);for(const text of [sheet,pdf])assert.doesNotMatch(text,/White ACP catalogue|catalogue:white|42\.15|121\.392|364\.18|455\.22|Catalogue rate|Source catalogue/);
});

test('catalogue Excel reports real catalogue source, rate, area and computed costs without inventing a full-sheet price',async()=>{
 const files=unzip(Buffer.from(await soh.xlsx(example()).arrayBuffer())),sheet=files['xl/worksheets/sheet1.xml'];assert.match(sheet,/autoFilter ref="A12:T14"/);assert.match(sheet,/>Source panel \/ catalogue</);assert.match(sheet,/>Source size \(mm\)</);assert.match(sheet,/>Source cost \(AUD ex GST\)</);assert.match(sheet,/>Area per item \(m²\)</);assert.match(sheet,/White ACP catalogue \/ catalogue:white/);assert.match(sheet,/2400 x 1200/);assert.match(sheet,/1200 x 600/);assert.match(sheet,/>Per square metre</);assert.doesNotMatch(sheet,/Source full sheet|Full sheet cost|Area per offcut/);
 near(numeric(sheet,'N13'),121.392);assert.equal(numeric(sheet,'O13'),364.18);assert.equal(numeric(sheet,'S13'),42.15);near(numeric(sheet,'T13'),2.88);near(numeric(sheet,'N14'),30.348);assert.equal(numeric(sheet,'O14'),91.04);near(numeric(sheet,'T14'),.72);assert.ok(files['xl/media/lennox-logo.png']);
 const mixed=example([stock(),stock('pack',{name:'Packed spacers',costBasis:'pack',packSize:100,packCost:12.34,qty:100,catalogueCost:undefined}),stock('unit',{name:'Unit item',costBasis:'unit',unitCost:2.5,qty:4,catalogueCost:undefined})]);const mixedSheet=unzip(Buffer.from(await soh.xlsx(mixed).arrayBuffer()))['xl/worksheets/sheet1.xml'];assert.match(mixedSheet,/autoFilter ref="A12:W15"/);assert.equal(numeric(mixedSheet,'V13'),42.15);near(numeric(mixedSheet,'W13'),2.88);assert.equal(numeric(mixedSheet,'O14'),12.34);assert.equal(numeric(mixedSheet,'O15'),10);assert.match(mixedSheet,/>Per pack</);assert.match(mixedSheet,/>Per stock unit</);
});

test('catalogue PDF explains source, rate, item area and computed sheet or offcut value with Lennox branding',async()=>{
 const pdf=(await soh.pdf(example()).text()).replace(/\\([()\\])/g,'$1');assert.match(pdf,/STOCK ON HAND/);assert.match(pdf,/Source catalogue: White ACP catalogue \/ catalogue:white/);assert.match(pdf,/Actual item size: 2400 x 1200 mm/);assert.match(pdf,/Catalogue rate \(AUD ex GST \/ m2\): \$42\.15/);assert.match(pdf,/Area per sheet: 2\.88 m2/);assert.match(pdf,/Area per offcut: 0\.72 m2/);assert.match(pdf,/Equivalent sheet cost \(AUD ex GST\): \$121\.392/);assert.match(pdf,/Equivalent offcut cost \(AUD ex GST\): \$30\.348/);assert.match(pdf,/On-hand value \(AUD ex GST\): \$364\.18/);assert.match(pdf,/On-hand value \(AUD ex GST\): \$91\.04/);assert.match(pdf,/All prices and values exclude GST/);assert.doesNotMatch(pdf,/Source full sheet:|Full-sheet cost/);assert.match(pdf,/\/Subtype \/Image/);assert.match(pdf,/\/FontFile2/);
});

test('catalogue valuation flows into the balanced Xero journal alongside unchanged unit and pack prices',()=>{
 const rows=[stock(),offcut(),stock('pack',{name:'Packed spacers',categoryKey:'fixings',costBasis:'pack',packSize:100,packCost:12.34,qty:100,catalogueCost:undefined}),stock('unit',{name:'Unit item',categoryKey:'consumables',costBasis:'unit',unitCost:2.5,qty:4,catalogueCost:undefined})];
 const options={date:'2026-11-05',narration:'Closing stock',basis:'closing',direction:'asset-debit',categoryGroups:{panels:'cladding',offcuts:'cladding',fixings:'fixings',consumables:'silicone'}};
 let journal=soh.xero.prepare(example(rows),options);assert.deepEqual(Array.from(journal.issues),[]);assert.deepEqual(Array.from(journal.rows,row=>row.amountCents),[-45522,-1234,0,0,-1000,47756]);assert.equal(journal.totals.balanceCents,0);assert.match(soh.xero.csv(journal),/Factory Stock on Hand as at 05-11-2026,11350,BAS Excluded,477\.56,,/);
 rows[0].catalogueCost.ratePerM2=null;journal=soh.xero.prepare(example(rows),options);assert.ok(journal.issues.some(issue=>/valid price for White ACP panel/.test(issue)));assert.throws(()=>soh.xero.csv(journal),/valid price/);
});
