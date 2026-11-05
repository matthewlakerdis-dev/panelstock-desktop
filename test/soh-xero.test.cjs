const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../workshop-stock.js'),'utf8');
const context={window:{},TextEncoder,Blob,atob};vm.runInNewContext(source,context);
const soh=context.window.PanelStockStocktakeReport.soh;
const fixture=()=>({kind:'soh',name:'Stock on hand',revision:42,generatedAt:'2026-11-05T00:00:00Z',categories:['Supplier: Alpha'],includeCostings:false,rows:[
 {itemId:'panel',categoryKey:'panels',category:'Panels',name:'Panel',qty:2,unitCost:100.15,unit:'sheets'},
 {itemId:'fixing',categoryKey:'fixings',category:'Fixings',name:'Fixing pack',qty:25,costBasis:'pack',packSize:100,packCost:12,unit:'each'},
 {itemId:'material',categoryKey:'other',category:'Other',name:'Half-cent material',qty:-0.5,unitCost:0.01,unit:'each'},
 {itemId:'offcut',categoryKey:'offcuts',category:'Offcuts',name:'Area-priced offcut',qty:1,costBasis:'area',width:500,height:500,areaCost:{offcutWidth:500,offcutHeight:500,sourceWidth:1000,sourceHeight:2000,sourceName:'Source panel',sourceCostBasis:'unit',sourceUnitCost:20},unit:'sheets'},
 {itemId:'silicone',categoryKey:'consumables',category:'Consumables',name:'Silicone',qty:3,unitCost:4.25,unit:'each'}
]});
const options=()=>({date:'2028-02-29',narration:'Stock, "closing"\nFactory',basis:'closing',direction:'asset-debit',categoryGroups:{panels:'cladding',fixings:'fixings',other:'materials',offcuts:'route-stiffeners',consumables:'silicone'},trackingName:'job',trackingOption:'Factory/Production - BAU'});
const plain=value=>JSON.parse(JSON.stringify(value));
function parseCSV(text){
 const rows=[];let row=[],field='',quoted=false;
 for(let i=0;i<text.length;i++){
  const c=text[i];
  if(c==='"'){if(quoted&&text[i+1]==='"'){field+='"';i++;}else quoted=!quoted;}
  else if(!quoted&&c===','){row.push(field);field='';}
  else if(!quoted&&c==='\r'&&text[i+1]==='\n'){row.push(field);rows.push(row);row=[];field='';i++;}
  else field+=c;
 }
 assert.equal(quoted,false);assert.equal(field,'');assert.equal(row.length,0);return rows;
}
test('Xero closing journal uses exact unit, pack and offcut line valuations and balances to cents',()=>{
 assert.ok(soh.xero,'Xero export is exposed on the SOH report helper');
 const input=fixture(),config=options(),before=JSON.stringify({input,config}),journal=soh.xero.prepare(input,config);
 assert.deepEqual(plain(journal.issues),[]);assert.equal(journal.rows.length,6);assert.equal(journal.formattedDate,'29/02/2028');
 assert.deepEqual(Array.from(journal.rows,row=>row.amountCents),[-20030,-300,1,-250,-1275,21854]);
 assert.deepEqual(Array.from(journal.rows,row=>row.accountCode),['51050','51066','51097','51085','51090','11356']);
 assert.deepEqual(Array.from(journal.rows,row=>row.amount),['-200.30','-3.00','0.01','-2.50','-12.75','218.54']);
 assert.deepEqual(Array.from(journal.rows,row=>row.description),['Cladding Stock as at 29-02-2028','Fixings Stock as at 29-02-2028','Materials & Supplies as at 29-02-2028','Route Stiffeners & Z Tags as at 29-02-2028','Silicone as at 29-02-2028','Factory Stock on Hand as at 29-02-2028']);
 assert.equal(journal.totals.closingCents,21854);assert.equal(journal.totals.assetCents,21854);assert.equal(journal.totals.balanceCents,0);assert.equal(journal.totals.debitCents,journal.totals.creditCents);
 assert.ok(journal.rows.every(row=>row.taxRate==='BAS Excluded'));assert.ok(journal.rows.slice(0,5).every(row=>row.trackingName==='job'&&row.trackingOption==='Factory/Production - BAU'));assert.equal(journal.rows[5].trackingName,'');assert.equal(journal.rows[5].trackingOption,'');
 assert.equal(JSON.stringify({input,config}),before);
});
test('Xero CSV has exact headers, real calendar date, six signed balanced lines, CSV quoting and CRLF',()=>{
 const journal=soh.xero.prepare(fixture(),options()),csv=soh.xero.csv(journal),rows=parseCSV(csv);
 assert.equal(csv.split('\r\n')[0],'*Narration,*Date,Description,*AccountCode,*TaxRate,*Amount,TrackingName1,TrackingOption1');
 assert.equal(rows.length,7);assert.ok(rows.every(row=>row.length===8));assert.ok(rows.slice(1).every(row=>row[0]==='Stock, "closing"\r\nFactory'&&row[1]==='29/02/2028'&&row[4]==='BAS Excluded'));
 assert.match(csv,/"Stock, ""closing""\r\nFactory"/);assert.doesNotMatch(csv,/(?<!\r)\n|\r(?!\n)/);assert.ok(csv.endsWith('\r\n'));
 assert.equal(rows.slice(1).reduce((sum,row)=>sum+Math.round(Number(row[5])*100),0),0);assert.deepEqual(rows[6].slice(6),['','']);
});
test('Xero adjustment journal requires every opening balance and preserves negative deltas for both directions',()=>{
 const config=options();config.basis='adjustment';config.openingBalances={cladding:'201.00',fixings:'3.00',materials:'-0.01','route-stiffeners':'0',silicone:'12.75'};
 let journal=soh.xero.prepare(fixture(),config);assert.deepEqual(plain(journal.issues),[]);assert.deepEqual(Array.from(journal.rows,row=>row.amountCents),[70,0,0,-250,0,180]);assert.equal(journal.totals.changeCents,180);
 config.direction='asset-credit';journal=soh.xero.prepare(fixture(),config);assert.deepEqual(Array.from(journal.rows,row=>row.amountCents),[-70,0,0,250,0,-180]);assert.equal(journal.totals.balanceCents,0);
 delete config.openingBalances.fixings;journal=soh.xero.prepare(fixture(),config);assert.ok(journal.issues.some(issue=>/opening balance for Fixings/.test(issue)));assert.throws(()=>soh.xero.csv(journal),/opening balance/);
 config.openingBalances.fixings='3.001';assert.ok(soh.xero.prepare(fixture(),config).issues.some(issue=>/Fixings.*two decimal/.test(issue)));
});
test('Xero requires explicit category mapping for every nonzero item and honors per-item overrides',()=>{
 const input=fixture(),config=options();delete config.categoryGroups.panels;
 let journal=soh.xero.prepare(input,config);assert.ok(journal.issues.some(issue=>/account group for Panel/.test(issue)));assert.throws(()=>soh.xero.csv(journal),/account group/);
 config.itemGroups={panel:'materials'};journal=soh.xero.prepare(input,config);assert.deepEqual(plain(journal.issues),[]);assert.equal(journal.rows[0].closingCents,0);assert.equal(journal.rows[2].closingCents,20029);
 config.itemGroups.panel='';assert.ok(soh.xero.prepare(input,config).issues.some(issue=>/account group for Panel/.test(issue)));
 config.itemGroups.panel='unknown';assert.ok(soh.xero.prepare(input,config).issues.some(issue=>/account group for Panel/.test(issue)));
});
test('Xero blocks all unpriced nonzero stock and recalculates instead of trusting stale or injected totals',()=>{
 const input=fixture(),config=options();input.rows[0].unitCost=null;input.rows[0].lineValue=200.30;input.costSummary={totalValue:218.54};
 let journal=soh.xero.prepare(input,config);assert.ok(journal.issues.some(issue=>/valid price for Panel/.test(issue)));assert.throws(()=>soh.xero.csv(journal),/valid price/);
 input.rows[0].unitCost=0;delete config.categoryGroups.panels;journal=soh.xero.prepare(input,config);assert.ok(journal.issues.some(issue=>/account group for Panel/.test(issue)));
 config.categoryGroups.panels='cladding';input.rows[1].packCost=null;input.rows[3].areaCost=null;journal=soh.xero.prepare(input,config);assert.ok(journal.issues.some(issue=>/valid price for Fixing pack/.test(issue)));assert.ok(journal.issues.some(issue=>/valid price for Area-priced offcut/.test(issue)));
});
test('Xero uses only the supplied filtered snapshot and permits unpriced unmapped zero quantity rows',()=>{
 const input=fixture(),config=options();input.rows=[input.rows[1],{itemId:'zero',categoryKey:'unknown',name:'Zero stock',qty:0,unitCost:null}];
 const journal=soh.xero.prepare(input,config);assert.deepEqual(plain(journal.issues),[]);assert.equal(journal.totals.closingCents,300);assert.equal(journal.rows[0].closingCents,0);assert.equal(journal.rows[1].closingCents,300);assert.equal(journal.rows[5].amount,'3.00');
 const rows=parseCSV(soh.xero.csv(journal));assert.equal(rows.length,3);assert.deepEqual(rows.slice(1).map(row=>row[3]),['51066','11356']);
});
test('Xero preserves report half-cent and per-stock-line pack rounding rather than rounding group sums',()=>{
 const input=fixture(),config=options();input.rows=[{itemId:'positive',categoryKey:'other',name:'Half cent',qty:0.5,unitCost:0.01},...Array.from({length:6},(_,i)=>({itemId:'pack'+i,categoryKey:'fixings',name:'Small pack '+i,qty:1,costBasis:'pack',packSize:3,packCost:0.01}))];
 const journal=soh.xero.prepare(input,config);assert.deepEqual(plain(journal.issues),[]);assert.equal(journal.rows[1].closingCents,0);assert.equal(journal.rows[2].closingCents,1);assert.equal(journal.totals.closingCents,1);
 input.rows=[{itemId:'negative',categoryKey:'other',name:'Negative half cent',qty:-0.5,unitCost:0.01}];assert.equal(soh.xero.prepare(input,config).rows[2].closingCents,-1);
});
test('Xero requires explicit financial choices, valid dates, narration, codes and bounded amounts',()=>{
 const input=fixture(),config=options();delete config.basis;delete config.direction;config.date='2026-02-29';config.narration='  ';config.accountCodes={fixings:''};
 let journal=soh.xero.prepare(input,config);assert.ok(journal.issues.some(issue=>/closing value/.test(issue)));assert.ok(journal.issues.some(issue=>/debit or credit/.test(issue)));assert.ok(journal.issues.some(issue=>/valid journal date/.test(issue)));assert.ok(journal.issues.some(issue=>/narration/.test(issue)));assert.ok(journal.issues.some(issue=>/account code for Fixings/.test(issue)));assert.throws(()=>soh.xero.csv(journal));
 assert.ok(journal.rows.every(row=>row.amountCents===0));
 for(const date of ['2026-04-31','1900-02-29','2026-11-05T00:00:00Z','05/11/2026'])assert.ok(soh.xero.prepare(input,{...options(),date}).issues.some(issue=>/valid journal date/.test(issue)));
 input.rows[0].unitCost=1e9;input.rows[0].qty=1e9;journal=soh.xero.prepare(input,options());assert.ok(journal.issues.some(issue=>/too large/.test(issue)));assert.throws(()=>soh.xero.csv(journal),/too large/);
});
test('Xero preview retains zero groups, CSV omits them and an all-zero journal cannot be exported',()=>{
 const input=fixture(),config=options();input.rows=[input.rows[0]];let journal=soh.xero.prepare(input,config);assert.equal(journal.rows.length,6);assert.equal(parseCSV(soh.xero.csv(journal)).length,3);
 input.rows[0].unitCost=0;journal=soh.xero.prepare(input,config);assert.equal(journal.rows.length,6);assert.ok(journal.issues.some(issue=>/no nonzero amounts/.test(issue)));assert.throws(()=>soh.xero.csv(journal),/no nonzero amounts/);
});
test('Xero serialization rejects tampered imbalance and preserves explicitly overridden account codes as strings',()=>{
 const config=options();config.accountCodes={cladding:'0051050',asset:'0011356'};let journal=soh.xero.prepare(fixture(),config);assert.deepEqual(plain(journal.issues),[]);
 const rows=parseCSV(soh.xero.csv(journal));assert.equal(rows[1][3],'0051050');assert.equal(rows[6][3],'0011356');
 journal=plain(journal);journal.rows[5].amount='218.55';journal.rows[5].amountCents=21855;assert.throws(()=>soh.xero.csv(journal),/balance to zero/);
});
