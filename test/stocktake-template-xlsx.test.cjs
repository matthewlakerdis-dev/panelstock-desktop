const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../workshop-stock.js'),'utf8');

function setup(){const context={window:{},TextEncoder,Blob,atob};vm.runInNewContext(source,context);return context.window.PanelStockStocktakeReport;}
const capturedAt='2026-10-30T14:30:00Z'; // 31 October in Brisbane.
const settings=()=>({cosGroups:[{id:'cladding',label:'Cladding',accountCode:'51050'},{id:'fixings',label:'Fixings',accountCode:'51050'},{id:'materials',label:'Materials & Supplies',accountCode:'51097'},{id:'silicone',label:'Silicone',accountCode:'51090'}],assetAccountCode:'11350',trackingName:'job',trackingOption:'Factory/Production - BAU',direction:'asset-debit'});
function sample(){
 const base={category:'extrusions',categoryLabel:'Extrusions',supplier:'Supplier & Co',unit:'each',sku:'=1+1',qty:999,expectedQty:180,variance:20,user:'Count worker',at:capturedAt,xeroGroup:'fixings'};
 return {name:'Selected October count',categories:['extrusions','offcuts','panels'],supplier:'Supplier & Co',completedAt:capturedAt,pricingCapturedAt:capturedAt,stocktakeSettings:settings(),rows:[
  {...base,itemId:'pack200',name:'Pack two hundred',details:'Keep upright',notes:'Legacy note',quantity:200,costBasis:'pack',packSize:100,packCost:12.34},
  {...base,itemId:'pack1',name:'Pack one',quantity:1,expectedQty:null,variance:null,costBasis:'pack',packSize:100,packCost:12.34},
  {...base,itemId:'area',name:'Area offcut',category:'offcuts',categoryLabel:'Offcuts',unit:'sheets',quantity:3,xeroGroup:'cladding',costBasis:'area',width:600,height:600,areaCost:{sourceItemId:'sheet',sourceName:'Full sheet',sourceWidth:2000,sourceHeight:3000,sourceCostBasis:'unit',sourceUnitCost:102,ratePerM2:17}},
  {...base,itemId:'catalogue',name:'Catalogue panel',category:'panels',categoryLabel:'Panels',unit:'sheets',quantity:2,xeroGroup:'cladding',costBasis:'catalogue-area',width:2400,height:1200,catalogueCost:{catalogId:'cat',name:'White aluminium',width:2400,height:1200,ratePerM2:17}},
  {...base,itemId:'zero',name:'Zero count',quantity:0,xeroGroup:'cladding',costBasis:'unit',unitCost:6},
  {...base,itemId:'free',name:'Free item',quantity:2,xeroGroup:'materials',costBasis:'unit',unitCost:0}
 ]};
}
function unzip(bytes){
 const files={};let offset=0;
 while(bytes.readUInt32LE(offset)===0x04034b50){
  assert.equal(bytes.readUInt16LE(offset+8),0,'export ZIP entries use the supported stored format');
  const size=bytes.readUInt32LE(offset+18),nameLength=bytes.readUInt16LE(offset+26),extraLength=bytes.readUInt16LE(offset+28),start=offset+30+nameLength+extraLength;
  files[bytes.subarray(offset+30,offset+30+nameLength).toString()]=bytes.subarray(start,start+size);offset=start+size;
 }
 assert.equal(bytes.readUInt32LE(offset),0x02014b50,'a real XLSX central directory follows the entries');return files;
}
const decode=text=>text.replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&');
function cells(xml){
 const result={};
 for(const match of xml.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)){
  const attr=match[1],body=match[2]||'',ref=attr.match(/\br="([^"]+)"/)[1],inline=/\bt="inlineStr"/.test(attr),number=body.match(/<v>([^<]*)<\/v>/),formula=body.match(/<f>([\s\S]*?)<\/f>/);
  result[ref]={value:inline?decode(body.match(/<t\b[^>]*>([\s\S]*?)<\/t>/)?.[1]||''):number?Number(number[1]):null,inline,style:Number(attr.match(/\bs="(\d+)"/)?.[1]||0),formula:formula?decode(formula[1]):undefined};
 }
 return result;
}
const findRow=(sheet,column,value)=>Number(Object.entries(sheet).find(([ref,cell])=>new RegExp('^'+column+'\\d+$').test(ref)&&cell.value===value)?.[0].slice(column.length));
async function workbook(raw=sample(),options={}){
 const api=setup(),prepared=api.prepareWorkbook(raw,options),files=unzip(Buffer.from(await api.xlsx(prepared).arrayBuffer())),text=name=>files[name].toString();
 return {prepared,files,main:cells(text('xl/worksheets/sheet1.xml')),summary:cells(text('xl/worksheets/sheet2.xml')),journal:cells(text('xl/worksheets/sheet3.xml')),details:cells(text('xl/worksheets/sheet4.xml')),text};
}

test('template workbook keeps A:L, selected counted rows, zero, safe codes and Australian dates',async()=>{
 const raw=sample(),{main,files,text}=await workbook(raw,{currentRows:[{id:'not-counted',name:'DO NOT EXPORT',qty:99999,unitCost:100}]});
 assert.deepEqual('ABCDEFGHIJKL'.split('').map(c=>main[c+'4'].value),['Account','Name','Type','Supplier','Code','Description','Size','Type','Qty','Unit of Measure','Unit Rate','Total Value']);
 assert.equal(Object.keys(main).filter(ref=>/^I(?:[5-9]|10)$/.test(ref)).length,raw.rows.length);
 assert.equal(main['I'+findRow(main,'F','Zero count')].value,0);assert.equal(main['L'+findRow(main,'F','Free item')].value,0);
 const code=main['E'+findRow(main,'H','Pack two hundred')];assert.equal(code.value,'=1+1');assert.equal(code.inline,true);assert.equal(code.formula,undefined);assert.match(main['F'+findRow(main,'H','Pack two hundred')].value,/Keep upright\nLegacy note/);
 assert.doesNotMatch(text('xl/worksheets/sheet1.xml'),/DO NOT EXPORT/);assert.match(text('xl/worksheets/sheet1.xml'),/Selected count only:/);
 assert.equal(main.I2.value,Date.UTC(2026,9,31)/86400000+25569);
 const styles=text('xl/styles.xml'),xfs=[...styles.match(/<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/)[1].matchAll(/<xf\b[^>]*>/g)],format=xfs[main.I2.style][0].match(/numFmtId="(\d+)"/)[1];
 assert.match(styles,new RegExp('<numFmt numFmtId="'+format+'" formatCode="dd/mm/yyyy"'));
 assert.match(text('xl/worksheets/sheet1.xml'),/topLeftCell="F5"/);assert.match(text('xl/worksheets/sheet1.xml'),/autoFilter ref="A4:L10"/);assert.match(text('xl/worksheets/sheet1.xml'),/fitToPage="1"/);
 assert.match(text('xl/workbook.xml'),/'Lennox Stocktake'!\$A\$1:\$L\$/);assert.match(text('xl/workbook.xml'),/COS Summary.*Journal.*Count details/);
 assert.deepEqual([...files['xl/media/lennox-logo.png'].subarray(0,8)],[137,80,78,71,13,10,26,10]);assert.ok(!Object.keys(files).some(name=>/vbaProject|externalLink/i.test(name)));
});

test('pack and area values retain precise rates and formula caches aggregate by group ID',async()=>{
 const {main,summary,details}=await workbook();
 for(const [name,quantity,rate,total] of [['Pack two hundred',200,.1234,24.68],['Pack one',1,.1234,.12],['Area offcut',3,6.12,18.36],['Catalogue panel',2,48.96,97.92]]){
  const r=findRow(main,'H',name);assert.equal(main['I'+r].value,quantity);assert.equal(main['K'+r].value,rate);assert.equal(main['L'+r].value,total);
 }
 assert.equal(main.L3.formula,'ROUND(SUM(L5:L10),2)');assert.equal(main.L3.value,141.08);
 const cladding=findRow(summary,'A','cladding'),fixings=findRow(summary,'A','fixings');
 assert.equal(summary['B'+cladding].value,summary['B'+fixings].value,'separate COS groups may share an account code');
 assert.equal(summary['G'+cladding].value,116.28);assert.equal(summary['G'+fixings].value,24.8);
 assert.equal(summary['G'+cladding].formula,"ROUND(SUMIF('Count details'!$B$5:$B$10,A"+cladding+",'Count details'!$R$5:$R$10),2)");
 const pack=findRow(details,'A','pack200'),area=findRow(details,'A','area');
 assert.equal(details['T'+pack].value,100);assert.equal(details['U'+pack].value,12.34);assert.equal(details['Y'+area].value,17);assert.equal(details['Z'+area].value,.36);assert.equal(details['V'+area].value,'Full sheet / sheet');
});

test('journal includes configured zero groups and balances against stock asset 11350 in either direction',async()=>{
 for(const [direction,factor] of [['asset-debit',1],['asset-credit',-1]]){
  const raw=sample();raw.stocktakeSettings.direction=direction;const {journal}=await workbook(raw);
  assert.equal(journal.B5.value,'COMPLETE / SELECTED STOCKTAKE CLOSING VALUE');assert.equal(journal.F8.value,'*Amount');
  const expected=[-116.28,-24.8,0,0,141.08];
  for(let i=0;i<expected.length;i++){const r=i+9;assert.equal(journal['F'+r].value,expected[i]===0?0:expected[i]*factor);assert.equal(journal['E'+r].value,'BAS Excluded');}
  assert.equal(journal.D13.value,'11350');assert.equal(journal.G13.value,'');assert.equal(journal.H13.value,'');assert.equal(journal.G9.value,'job');assert.equal(journal.H9.value,'Factory/Production - BAU');
  assert.equal(expected.reduce((sum,_,i)=>sum+Math.round(journal['F'+(i+9)].value*100),0),0);assert.equal(journal.F15.formula,'ROUND(SUM(F9:F13),2)');assert.equal(journal.F15.value,0);
 }
});

test('missing nonzero prices, COS mappings or accounting settings omit the journal import table',async()=>{
 const cases=[raw=>{raw.rows[0].packCost=null;},raw=>{raw.rows[0].xeroGroup='unavailable';},raw=>{delete raw.stocktakeSettings;}];
 for(const change of cases){
  const raw=sample();change(raw);const {journal,text}=await workbook(raw);
  assert.equal(journal.B5.value,'JOURNAL INCOMPLETE');assert.doesNotMatch(text('xl/worksheets/sheet3.xml'),/\*Amount|\*Narration/);assert.match(text('xl/worksheets/sheet3.xml'),/No journal amounts have been generated/);
 }
});

test('historical current-price fallback preserves count audit and labels pricing provenance in every relevant sheet',async()=>{
 const raw=sample(),currentRows=raw.rows.map(row=>({...row,id:row.itemId,qty:99999,quantity:99999,expectedQty:99999,variance:0}));delete raw.pricingCapturedAt;delete raw.stocktakeSettings;
 raw.rows=raw.rows.map(({unitCost,packCost,packSize,costBasis,areaCost,catalogueCost,xeroGroup,...row})=>row);
 const {main,details,journal,text}=await workbook(raw,{allowCurrentPricing:true,currentRows,currentSettings:settings(),generatedAt:'2026-11-08T01:00:00Z'});
 const pack=findRow(details,'A','pack200'),unknown=findRow(details,'A','pack1');
 assert.equal(details['J'+pack].value,180);assert.equal(details['K'+pack].value,200);assert.equal(details['L'+pack].value,20);assert.equal(details['M'+pack].value,'Count worker');assert.match(details['N'+pack].value,/31\/10\/2026/);
 assert.equal(details['J'+unknown].value,null);assert.equal(details['L'+unknown].value,null);assert.equal(details['O'+pack].value,'Current prices at export');assert.match(details['P'+pack].value,/08\/11\/2026/);
 assert.equal(main.H3.value,'Current prices');assert.equal(main.L3.value,141.08);assert.match(main['F'+findRow(main,'H','Pack two hundred')].value,/Current prices at export/);assert.match(journal.B4.value,/Current prices at export/);
 assert.match(text('xl/worksheets/sheet1.xml'),/quantities in this completed stocktake/);assert.match(text('xl/worksheets/sheet4.xml'),/Blank values are unavailable, not zero/);
});
