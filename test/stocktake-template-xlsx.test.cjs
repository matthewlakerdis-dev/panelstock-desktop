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
const mainRow=(sheet,name)=>Number(Object.entries(sheet).find(([ref,cell])=>/^C\d+$/.test(ref)&&(cell.value===name||String(cell.value).startsWith(name+' / ')))?.[0].slice(1));
const findRow=(sheet,column,value)=>Number(Object.entries(sheet).find(([ref,cell])=>new RegExp('^'+column+'\\d+$').test(ref)&&cell.value===value)?.[0].slice(column.length));
async function workbook(raw=sample(),options={}){
 const api=setup(),prepared=api.prepareWorkbook(raw,options),files=unzip(Buffer.from(await api.xlsx(prepared).arrayBuffer())),text=name=>files[name].toString();
 return {prepared,files,main:cells(text('xl/worksheets/sheet1.xml')),summary:cells(text('xl/worksheets/sheet2.xml')),journal:cells(text('xl/worksheets/sheet3.xml')),details:cells(text('xl/worksheets/sheet4.xml')),text};
}

test('template workbook keeps compact A:H, selected counted rows, zero, safe codes and Australian dates',async()=>{
 const raw=sample(),{main,details,files,text}=await workbook(raw,{currentRows:[{id:'not-counted',name:'DO NOT EXPORT',qty:99999,unitCost:100}]});
 assert.deepEqual('ABCDEFGH'.split('').map(c=>main[c+'4'].value),['Name','Supplier','Description','Size','Qty','UOM','Unit Rate','Total Value']);
 const itemRows=raw.rows.map(item=>mainRow(main,item.name));assert.ok(itemRows.every(Number.isFinite));
 for(const r of itemRows)assert.match(text('xl/worksheets/sheet1.xml'),new RegExp('<row r="'+r+'" ht="18.75" customHeight="1"'));
 assert.equal((text('xl/worksheets/sheet1.xml').match(/bestFit="1"/g)||[]).length,8);
 assert.equal(main['E'+mainRow(main,'Zero count')].value,0);assert.equal(main['H'+mainRow(main,'Free item')].value,0);
 const code=details['C'+findRow(details,'A','pack200')];assert.equal(code.value,'=1+1');assert.equal(code.inline,true);assert.equal(code.formula,undefined);assert.match(main['C'+mainRow(main,'Pack two hundred')].value,/Keep upright.*Legacy note/);
 assert.doesNotMatch(text('xl/worksheets/sheet1.xml'),/DO NOT EXPORT/);assert.match(text('xl/worksheets/sheet1.xml'),/Selected count only:/);
 assert.equal(main.G3.value,Date.UTC(2026,9,31)/86400000+25569);
 const styles=text('xl/styles.xml'),xfs=[...styles.match(/<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/)[1].matchAll(/<xf\b[^>]*>/g)],format=xfs[main.G3.style][0].match(/numFmtId="(\d+)"/)[1];
 assert.match(styles,new RegExp('<numFmt numFmtId="'+format+'" formatCode="dd/mm/yyyy"'));
 const bars=Object.entries(main).filter(([ref,cell])=>/^A\d+$/.test(ref)&&/^COS - /.test(cell.value||'')&&!main['C'+ref.slice(1)]?.value).map(([ref])=>Number(ref.slice(1)));
 assert.equal(bars.length,3);
 for(const r of bars){
  assert.ok('BCDEFGH'.split('').every(c=>main[c+r].value===''));
  assert.doesNotMatch(text('xl/worksheets/sheet1.xml'),new RegExp('mergeCell ref="A'+r+':H'+r+'"'));
  const fillId=xfs[main['A'+r].style][0].match(/fillId="(\d+)"/)[1],fills=[...styles.match(/<fills\b[^>]*>([\s\S]*?)<\/fills>/)[1].matchAll(/<fill>[\s\S]*?<\/fill>/g)];assert.match(fills[Number(fillId)][0],/FFD9D9D9/);
 }
 const xfBlocks=[...styles.match(/<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/)[1].matchAll(/<xf\b[^>]*>[\s\S]*?<\/xf>/g)];
 for(const r of itemRows)for(const c of ['C','E','G','H'])assert.doesNotMatch(xfBlocks[main[c+r].style][0],/wrapText="1"/);
 const widths=xml=>[...xml.matchAll(/<col min="(\d+)"[^>]*width="([\d.]+)"/g)].map(match=>Number(match[2]));
 const originalWidths=widths(text('xl/worksheets/sheet1.xml')),wide=sample();wide.rows[0].supplier='An exceptionally wide supplier name '.repeat(12);
 const expanded=await workbook(wide),expandedWidths=widths(expanded.text('xl/worksheets/sheet1.xml'));assert.ok(expandedWidths[1]>originalWidths[1]);assert.ok(expandedWidths.every(width=>width>=8&&width<=255));
 assert.equal(details.AC4.value,'Source stocktake');assert.equal(details.AD4.value,'Quantity source');assert.equal(details.K4.value,'Quantity');assert.equal(details.R4.value,'Stock value (AUD ex GST)');assert.equal(details['AD'+findRow(details,'A','pack200')].value,'Manual count');assert.match(text('xl/worksheets/sheet4.xml'),/autoFilter ref="A4:AD10"/);
 assert.doesNotMatch(text('xl/worksheets/sheet1.xml'),/Prices captured at|Current prices at export|Valued at:|Pricing:/);
 assert.match(text('xl/worksheets/sheet1.xml'),/topLeftCell="A5"/);assert.match(text('xl/worksheets/sheet1.xml'),new RegExp('autoFilter ref="A4:H'+Math.max(...itemRows)+'"'));assert.match(text('xl/worksheets/sheet1.xml'),/fitToPage="1"/);
 const borderOf=cell=>Number(xfs[cell.style][0].match(/borderId="(\d+)"/)[1]);
 const tables=[{sheet:main,index:1,start:4,end:Math.max(...itemRows)},{sheet:cells(text('xl/worksheets/sheet2.xml')),index:2,start:4,end:4+settings().cosGroups.length},{sheet:cells(text('xl/worksheets/sheet3.xml')),index:3,start:8,end:9+settings().cosGroups.length},{sheet:details,index:4,start:4,end:4+raw.rows.length}];
 for(const table of tables){
  const sheetXml=text('xl/worksheets/sheet'+table.index+'.xml');assert.match(sheetXml,/<pane[^>]*xSplit="0"[^>]*ySplit="[1-9]\d*"[^>]*topLeftCell="A\d+"[^>]*state="frozen"/);assert.doesNotMatch(sheetXml,/bottomRight/);
  for(const [ref,cell] of Object.entries(table.sheet)){const r=Number(ref.match(/\d+$/)[0]);assert.equal(borderOf(cell)>0,r>=table.start&&r<=table.end,'borders stay inside the actual table: sheet '+table.index+' '+ref);}
 }
 assert.match(text('xl/workbook.xml'),/'Lennox Stocktake'!\$A\$1:\$H\$/);assert.match(text('xl/workbook.xml'),/COS Summary.*Journal.*Count details/);
 assert.deepEqual([...files['xl/media/lennox-logo.png'].subarray(0,8)],[137,80,78,71,13,10,26,10]);assert.ok(!Object.keys(files).some(name=>/vbaProject|externalLink/i.test(name)));
});

test('pack and area values retain precise rates and formula caches aggregate by group ID',async()=>{
 const {main,summary,details}=await workbook();
 for(const [name,quantity,rate,total] of [['Pack two hundred',200,.1234,24.68],['Pack one',1,.1234,.12],['Area offcut',3,6.12,18.36],['Catalogue panel',2,48.96,97.92]]){
  const r=mainRow(main,name);assert.equal(main['E'+r].value,quantity);assert.equal(main['G'+r].value,rate);assert.equal(main['H'+r].value,total);
 }
 const lastMain=Math.max(...sample().rows.map(item=>mainRow(main,item.name)));assert.equal(main.H3.formula,'ROUND(SUM(H5:H'+lastMain+'),2)');assert.equal(main.H3.value,141.08);
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
 assert.equal(main.C3.value,sample().name);assert.equal(main.H3.value,141.08);assert.doesNotMatch(main['C'+mainRow(main,'Pack two hundred')].value,/Current prices at export|Pricing:/);assert.match(journal.B4.value,/Current prices at export/);
 assert.doesNotMatch(text('xl/worksheets/sheet1.xml'),/Current prices at export/);assert.match(text('xl/worksheets/sheet4.xml'),/quantities in this completed stocktake/);assert.match(text('xl/worksheets/sheet4.xml'),/Blank values are unavailable, not zero/);
});

async function monthlyWorkbook(stocktakes,options){
 const api=setup(),prepared=api.prepareMonthly(stocktakes,options),files=unzip(Buffer.from(await api.xlsx(prepared).arrayBuffer())),text=name=>files[name].toString();
 return {prepared,main:cells(text('xl/worksheets/sheet1.xml')),summary:cells(text('xl/worksheets/sheet2.xml')),journal:cells(text('xl/worksheets/sheet3.xml')),details:cells(text('xl/worksheets/sheet4.xml')),text};
}
const recorded=(id,name,rows)=>({id,name,status:'completed',completedAt:'2026-11-05T00:00:00Z',report:{pricingCapturedAt:capturedAt,rows}});

test('monthly XLSX includes Brisbane-month partial submissions once with winning frozen prices and source audit',async()=>{
 const [pack,,area,,zero]=sample().rows,at='2026-10-30T14:30:00Z';
 const stocktakes=[
  recorded('old','Earlier count',[{...pack,name:'Superseded spacer',quantity:100,packCost:50,at:'2026-10-02T00:00:00Z'}]),
  {id:'open',name:'Open partial count',status:'open',itemIds:['pack200','zero','unsubmitted'],counts:{pack200:{quantity:200,expectedQty:180,user:'Latest worker',at,item:{...pack,name:'Latest frozen spacer',pricingCapturedAt:at}},zero:{quantity:0,expectedQty:2,user:'Zero worker',at:'2026-10-03T00:00:00Z',item:{...zero,pricingCapturedAt:at}}}},
  recorded('boundary-in','September UTC, October Brisbane',[{...area,at:'2026-09-30T14:00:00Z'}]),
  recorded('boundary-out','October UTC, November Brisbane',[{...sample().rows[5],name:'EXCLUDE NOVEMBER',at:'2026-10-31T14:00:00Z'}]),
  {id:'draft',name:'Unsubmitted draft',status:'open',itemIds:['catalogue'],counts:{},report:{rows:[{...sample().rows[3],name:'EXCLUDE UNSUBMITTED'}]}}
 ];
 const original=JSON.stringify(stocktakes),currentRows=sample().rows.map(row=>({...row,id:row.itemId,name:'LIVE NAME DO NOT EXPORT',qty:99999,packCost:999,unitCost:999}));
 const {prepared,main,summary,journal,details,text}=await monthlyWorkbook(stocktakes,{month:'2026-10',currentRows,currentSettings:settings(),allowCurrentPricing:true,generatedAt:'2026-11-08T01:00:00Z'});
 assert.equal(JSON.stringify(stocktakes),original);assert.equal(prepared.rows.length,3);assert.equal(prepared.monthlyScope.submittedCounts,4);assert.equal(prepared.monthlyScope.duplicatesRemoved,1);
 const r=mainRow(main,'Latest frozen spacer');assert.equal(main['E'+r].value,200);assert.equal(main['G'+r].value,.1234);assert.equal(main['H'+r].value,24.68);assert.equal(main.H3.value,43.04);assert.equal(main.H3.formula,'ROUND(SUM(H5:H9),2)');
 assert.match(main.C3.value,/October 2026/);assert.equal(main.G3.value,Date.UTC(2026,9,31)/86400000+25569);assert.equal(main['E'+mainRow(main,'Zero count')].value,0);
 assert.doesNotMatch(text('xl/worksheets/sheet1.xml'),/EXCLUDE|LIVE NAME|Superseded|Current prices at export|Prices captured at/);assert.match(text('xl/worksheets/sheet1.xml'),/autoFilter ref="A4:H9"/);assert.match(text('xl/worksheets/sheet4.xml'),/autoFilter ref="A4:AD7"/);
 const audit=findRow(details,'A','pack200');assert.equal(details['K'+audit].value,200);assert.equal(details['J'+audit].value,180);assert.equal(details['M'+audit].value,'Latest worker');assert.equal(details['U'+audit].value,12.34);assert.equal(details['AC'+audit].value,'Open partial count');assert.match(details['O'+audit].value,/captured at completion/);
 assert.equal(details['AC'+findRow(details,'A','area')].value,'September UTC, October Brisbane');
 assert.equal(summary['G'+findRow(summary,'A','cladding')].value,18.36);assert.equal(summary['G'+findRow(summary,'A','fixings')].value,24.68);assert.match(summary['G'+findRow(summary,'A','cladding')].formula,/\$B\$5:\$B\$7/);
 assert.equal(journal.B5.value,'COMPLETE / MONTHLY STOCKTAKE CLOSING VALUE');assert.equal(journal.B3.value,'Monthly Stocktake October 2026');assert.equal(journal.F13.value,43.04);
});

test('monthly XLSX keeps the latest zero balance and exports another month independently without summing counts',async()=>{
 const pack=sample().rows[0],free=sample().rows[5],stocktakes=[
  recorded('earlier','October positive',[{...pack,name:'October superseded positive',quantity:7,at:'2026-10-20T00:00:00Z'}]),
  recorded('zero','October zero winner',[{...pack,name:'October zero balance',quantity:0,at:'2026-10-21T00:00:00Z'}]),
  recorded('free','October free',[{...free,at:'2026-10-22T00:00:00Z'}]),
  recorded('next','November winner',[{...pack,name:'November balance',quantity:999,packCost:500,at:'2026-11-01T00:00:00Z'}])
 ];
 const options={currentSettings:settings(),allowCurrentPricing:true,generatedAt:'2026-11-08T01:00:00Z'},oct=await monthlyWorkbook(stocktakes,{...options,month:'2026-10'}),nov=await monthlyWorkbook(stocktakes,{...options,month:'2026-11'});
 assert.equal(oct.prepared.rows.length,2);assert.equal(oct.main.H3.value,0);assert.equal(oct.main['E'+mainRow(oct.main,'October zero balance')].value,0);assert.equal(oct.details['AC'+findRow(oct.details,'A','pack200')].value,'October zero winner');assert.doesNotMatch(oct.text('xl/worksheets/sheet1.xml'),/November balance|superseded positive/);
 assert.equal(oct.journal.F13.value,0);assert.equal(oct.journal.B5.value,'COMPLETE / MONTHLY STOCKTAKE CLOSING VALUE');
 assert.equal(nov.prepared.rows.length,1);assert.equal(nov.main['E'+mainRow(nov.main,'November balance')].value,999);assert.equal(nov.main.H3.value,4995);assert.equal(nov.details['AC'+findRow(nov.details,'A','pack200')].value,'November winner');assert.match(nov.main.C3.value,/November 2026/);assert.doesNotMatch(nov.text('xl/worksheets/sheet1.xml'),/October zero|Free item/);
});
