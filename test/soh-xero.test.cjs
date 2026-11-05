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
 assert.deepEqual(Array.from(journal.rows,row=>row.accountCode),['51050','51066','51097','51085','51090','11350']);
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
 const rows=parseCSV(soh.xero.csv(journal));assert.equal(rows.length,7);assert.deepEqual(rows.slice(1).map(row=>row[3]),['51050','51066','51097','51085','51090','11350']);assert.deepEqual(rows.slice(1).map(row=>row[5]),['0.00','-3.00','0.00','0.00','0.00','3.00']);
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
test('Xero exports every zero-value account row and permits a balanced all-zero journal',()=>{
 const input=fixture(),config=options();input.rows=[input.rows[0]];let journal=soh.xero.prepare(input,config);assert.equal(journal.rows.length,6);let rows=parseCSV(soh.xero.csv(journal));assert.equal(rows.length,7);assert.deepEqual(rows[2].slice(2),['Fixings Stock as at 29-02-2028','51066','BAS Excluded','0.00','job','Factory/Production - BAU']);assert.equal(rows[3][5],'0.00');assert.equal(rows[4][5],'0.00');assert.equal(rows[5][5],'0.00');
 input.rows[0].unitCost=0;journal=soh.xero.prepare(input,config);assert.equal(journal.rows.length,6);assert.deepEqual(plain(journal.issues),[]);assert.equal(journal.totals.balanceCents,0);rows=parseCSV(soh.xero.csv(journal));assert.equal(rows.length,7);assert.ok(rows.slice(1).every(row=>row[5]==='0.00'));assert.deepEqual(rows[6].slice(3),['11350','BAS Excluded','0.00','','']);
 input.rows=[{itemId:'zero',categoryKey:'unmapped',name:'Zero unpriced stock',qty:0,unitCost:null}];journal=soh.xero.prepare(input,config);assert.deepEqual(plain(journal.issues),[]);assert.equal(parseCSV(soh.xero.csv(journal)).length,7);
});
test('Xero serialization rejects tampered imbalance and preserves explicitly overridden account codes as strings',()=>{
 const config=options();config.accountCodes={cladding:'0051050',asset:'0011356'};let journal=soh.xero.prepare(fixture(),config);assert.deepEqual(plain(journal.issues),[]);
 const rows=parseCSV(soh.xero.csv(journal));assert.equal(rows[1][3],'0051050');assert.equal(rows[6][3],'0011356');
 journal=plain(journal);journal.rows[5].amount='218.55';journal.rows[5].amountCents=21855;assert.throws(()=>soh.xero.csv(journal),/balance to zero/);
});
test('Xero uses configured COS order, renamed labels, updated codes and added groups without changing the valuation',()=>{
 const input=fixture(),config=options(),before=JSON.stringify(input);config.groups=[{id:'adhesives',label:'Adhesives',accountCode:'51100'},...plain(soh.xero.groups).map(group=>group.id==='cladding'?{...group,label:'Facade materials',accountCode:'0051001'}:group.id==='fixings'?{...group,accountCode:'51067'}:group)];config.itemGroups={panel:'adhesives'};config.accountCodes={asset:'0011350'};config.trackingName='project';config.trackingOption='Factory - test';
 const journal=soh.xero.prepare(input,config);assert.deepEqual(plain(journal.issues),[]);assert.equal(journal.rows.length,7);assert.deepEqual(Array.from(journal.rows,row=>row.groupId),['adhesives','cladding','fixings','materials','route-stiffeners','silicone','asset']);assert.deepEqual(Array.from(journal.rows,row=>row.amountCents),[-20030,0,-300,1,-250,-1275,21854]);assert.equal(journal.totals.closingCents,21854);assert.equal(journal.totals.balanceCents,0);
 assert.equal(journal.rows[1].description,'Facade materials as at 29-02-2028');assert.equal(journal.rows[1].accountCode,'0051001');assert.equal(journal.rows[2].accountCode,'51067');assert.equal(journal.rows[6].accountCode,'0011350');assert.ok(journal.rows.slice(0,-1).every(row=>row.trackingName==='project'&&row.trackingOption==='Factory - test'));assert.equal(journal.rows.at(-1).trackingName,'');
 const rows=parseCSV(soh.xero.csv(journal));assert.equal(rows.length,8);assert.deepEqual(rows.slice(1).map(row=>row[3]),['51100','0051001','51067','51097','51085','51090','0011350']);assert.equal(rows[2][5],'0.00');assert.equal(JSON.stringify(input),before);
 config.groups[1].label='New facade name';config.groups[1].accountCode='51002';assert.equal(journal.groups[1].label,'Facade materials');assert.equal(journal.groups[1].accountCode,'0051001');assert.notEqual(journal.groups[1],config.groups[1]);assert.match(soh.xero.csv(journal),/Facade materials as at/);
 config.direction='asset-credit';const reversed=soh.xero.prepare(input,config);assert.deepEqual(Array.from(reversed.rows,row=>row.amountCents),[20030,0,300,-1,250,1275,-21854]);assert.equal(reversed.rows[1].description,'New facade name as at 29-02-2028');assert.equal(reversed.rows[1].accountCode,'51002');assert.equal(reversed.totals.balanceCents,0);
});
test('Xero falls back to legacy groups only when configured groups are undefined',()=>{
 const config=options();config.groups=undefined;assert.equal(soh.xero.prepare(fixture(),config).groups.length,5);
 for(const groups of [[],null,{},Array.from({length:51},(_,i)=>({id:'group-'+i,label:'Group '+i,accountCode:'50000'}))]){const journal=soh.xero.prepare(fixture(),{...config,groups});assert.ok(journal.issues.some(issue=>/between 1 and 50 COS groups/.test(issue)));assert.equal(journal.groups.length,0);assert.throws(()=>soh.xero.csv(journal),/COS groups/);}
});
test('Xero rejects unsafe, duplicate or invalid configured group fields instead of silently using defaults',()=>{
 const valid={id:'cladding',label:'Cladding',accountCode:'51050'},invalid=[{...valid,id:'asset'},{...valid,id:'Uppercase'},{...valid,id:'__proto__'},{...valid,id:'a'.repeat(81)},{...valid,label:''},{...valid,label:'x'.repeat(121)},{...valid,label:'Bad\nlabel'},{...valid,label:'<b>Cladding</b>'},{...valid,accountCode:''},{...valid,accountCode:'1'.repeat(31)},{...valid,accountCode:51050},{...valid,accountCode:'51\n050'}];
 for(const group of invalid){const journal=soh.xero.prepare(fixture(),{...options(),groups:[group]});assert.ok(journal.issues.some(issue=>/valid (ID|label|account code) for COS group/.test(issue)),JSON.stringify(group));assert.throws(()=>soh.xero.csv(journal));}
 const duplicate=soh.xero.prepare(fixture(),{...options(),groups:[valid,{...valid,label:'Another cladding'}]});assert.ok(duplicate.issues.some(issue=>/unique ID: cladding/.test(issue)));assert.equal(duplicate.groups.length,1);assert.equal(Object.prototype.polluted,undefined);
});
test('Xero includes all fifty configured groups and zero-value lines at supported field limits',()=>{
 const config=options();config.groups=Array.from({length:50},(_,i)=>({id:i===0?'a'.repeat(80):'group-'+i,label:i===0?'L'.repeat(120):'Group '+i,accountCode:i===0?'0'.repeat(30):String(51000+i)}));config.itemGroups=Object.fromEntries(fixture().rows.map(row=>[row.itemId,config.groups[0].id]));
 const journal=soh.xero.prepare(fixture(),config);assert.deepEqual(plain(journal.issues),[]);assert.equal(journal.rows.length,51);assert.equal(journal.rows[0].amountCents,-21854);assert.ok(journal.rows.slice(1,-1).every(row=>row.amount==='0.00'));assert.equal(journal.rows.at(-1).amountCents,21854);const rows=parseCSV(soh.xero.csv(journal));assert.equal(rows.length,52);assert.equal(rows[1][3],'0'.repeat(30));assert.ok(rows.slice(2,-1).every(row=>row[5]==='0.00'));
});
test('Xero CSV validates the prepared configured groups, order, row metadata and balance',()=>{
 const config=options();config.groups=[{id:'custom',label:'Custom COS',accountCode:'0052000'}];config.itemGroups=Object.fromEntries(fixture().rows.map(row=>[row.itemId,'custom']));const prepared=soh.xero.prepare(fixture(),config);assert.deepEqual(plain(prepared.issues),[]);assert.equal(parseCSV(soh.xero.csv(prepared)).length,3);
 for(const change of [journal=>delete journal.groups,journal=>journal.groups=[],journal=>journal.groups.push({...journal.groups[0]}),journal=>journal.groups[0].id='asset',journal=>journal.groups[0].label='Renamed without matching row',journal=>journal.rows.reverse(),journal=>journal.rows[0].accountCode='52\n000']){const journal=plain(prepared);change(journal);assert.throws(()=>soh.xero.csv(journal),/Prepare a valid stock journal/);}
 const unbalanced=plain(prepared);unbalanced.rows[1].amount='218.55';unbalanced.rows[1].amountCents=21855;assert.throws(()=>soh.xero.csv(unbalanced),/balance to zero/);
});
