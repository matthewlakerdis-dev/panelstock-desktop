const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../workshop-stock.js'),'utf8');
const walk=n=>!n||typeof n!=='object'?[]:[n,...(n.children||[]).flat(Infinity).flatMap(walk)];
const text=n=>n===null||n===undefined?'':typeof n==='string'||typeof n==='number'?String(n):(n.children||[]).flat(Infinity).map(text).join('');
const stock=(id,category,unitCost,qty,patch={})=>({id,name:'Stock '+id,sku:id,category,unit:'each',unitCost,qty,reserved:1,available:qty-1,onOrder:100,supplier:'Alpha',location:'Rack A',...patch});
const fixture=()=>({revision:33,movements:[],categories:{steel:'Metal stock'},items:[
 stock('panel','panels',10,2,{legacy:true,unit:'sheets',width:2400,height:1200}),
 stock('fixing','fixings',5,3),stock('steel','steel',7,4),stock('extrusion','extrusions',8,5),stock('silicone','consumables',9,6),
 stock('zero','other',null,0,{reserved:0,available:0,onOrder:0}),
 stock('other-supplier','extrusions',100,2,{supplier:'Beta'}),stock('other-location','extrusions',30,2,{location:'Rack B'})
]});
const categoryGroups={panels:'cladding',fixings:'fixings',steel:'materials',extrusions:'route-stiffeners',consumables:'silicone'};
function harness(){
 const states=[],snapshots=[],prepared=[],csvCalls=[],downloads=[],requests=[],storage=new Map();let cursor=0;
 const React={createElement:(type,props,...children)=>({type,props:props||{},children}),useState:value=>{const i=cursor++;if(!(i in states))states[i]=typeof value==='function'?value():value;return [states[i],value=>states[i]=typeof value==='function'?value(states[i]):value];},useEffect(){},Fragment:'fragment'};
 const context={window:{},TextEncoder,Blob,atob,PanelStock:{username:'admin',apiFetch:async(...args)=>{requests.push(args);throw Error('Exports must not write stock');}},localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)},document:{addEventListener(){},createElement:tag=>{assert.equal(tag,'a');return {click(){downloads.push({name:this.download,url:this.href,blob:blobs.get(this.href)});},remove(){}};},body:{appendChild(){}}},URL:{createObjectURL:blob=>{const url='blob:xero-'+(blobs.size+1);blobs.set(url,blob);return url;},revokeObjectURL(){}},setTimeout(){return 0;}};
 const blobs=new Map();vm.runInNewContext(source,context);const soh=context.window.PanelStockStocktakeReport.soh,xero=soh.xero;assert.ok(xero,'Xero export helper is installed');
 soh.xlsx=snapshot=>{snapshots.push({format:'xlsx',snapshot:structuredClone(snapshot)});return new Blob(['xlsx']);};soh.pdf=snapshot=>{snapshots.push({format:'pdf',snapshot:structuredClone(snapshot)});return new Blob(['pdf']);};
 soh.xero={...xero,prepare(snapshot,options){const result=xero.prepare(snapshot,options);prepared.push({snapshot:structuredClone(snapshot),options:structuredClone(options),result:structuredClone(result)});return result;},csv(result){csvCalls.push(structuredClone(result));return xero.csv(result);}};
 const C=context.window.createWorkshopStock(React),render=()=>{cursor=0;return walk(C({isAdmin:true,workerUrl:'/api',onExportExcel(){throw Error('Unfiltered exporter called');},onExportPDF(){throw Error('Unfiltered exporter called');}}));};render();states[0]=fixture();
 const node=label=>render().find(n=>n.props['aria-label']===label),button=label=>render().find(n=>n.type==='button'&&n.children.includes(label));
 return {states,storage,snapshots,prepared,csvCalls,downloads,requests,render,node,button,groups:xero.groups,change(label,value){const input=node(label);assert.ok(input,label);input.props.onChange({target:{value}});},check(label,checked){const input=node(label);assert.ok(input,label);input.props.onChange({target:{checked}});},open(){node('Export SOH').props.onClick();this.change('Export supplier',JSON.stringify('Alpha'));this.change('Export location',JSON.stringify('Rack A'));},openXero(){button('Xero journal CSV').props.onClick();},last(){render();return prepared.at(-1);}};
}
const displayedCategories={panels:'Panels',fixings:'Fixings',steel:'Metal stock',extrusions:'Extrusions',consumables:'Consumables'};
function configure(x,{map=true,direction='asset-debit'}={}){
 x.change('Journal date','2026-11-04');x.change('Narration','Factory stock, November 2026');x.change('Journal direction',direction);
 if(map)for(const [category,group] of Object.entries(categoryGroups))x.change('Account group for '+displayedCategories[category],group);
}

test('Xero opens a separate configuration popup with costed stock and requires a direction and explicit account mappings',()=>{
 const x=harness();x.open();assert.equal(x.node('Include costings').props.checked,false);x.openXero();assert.ok(x.node('Xero journal CSV'));assert.equal(x.node('Journal direction').props.value,'');
 for(const label of Object.values(displayedCategories)){const select=x.node('Account group for '+label);assert.equal(select.props.value,'');assert.equal(walk(select).filter(n=>n.type==='option').length,6);}
 const latest=x.last();assert.equal(latest.options.basis,'closing');assert.equal(latest.snapshot.includeCostings,true);assert.equal(latest.snapshot.rows.length,6);assert.equal(latest.snapshot.rows.find(r=>r.itemId==='steel').categoryKey,'steel');assert.equal(latest.snapshot.rows.find(r=>r.itemId==='steel').category,'Metal stock');assert.equal(latest.snapshot.rows.find(r=>r.itemId==='fixing').unitCost,5);
 assert.equal(x.button('Download Xero CSV').props.disabled,true);x.button('Download Xero CSV').props.onClick();assert.equal(x.downloads.length,0);assert.equal(x.requests.length,0);
});

test('the full closing journal previews six balanced rows and downloads the date, narration and selected stock values without API writes',async()=>{
 const x=harness(),before=structuredClone(x.states[0]);x.open();x.openXero();configure(x);const latest=x.last(),result=latest.result;
 assert.deepEqual(result.issues,[]);assert.equal(result.rows.length,6);assert.equal(result.totals.closingCents,15700);assert.equal(result.totals.assetCents,15700);assert.equal(result.totals.balanceCents,0);assert.equal(result.rows.reduce((sum,row)=>sum+row.amountCents,0),0);assert.equal(result.date,'2026-11-04');assert.equal(result.formattedDate,'04/11/2026');assert.equal(result.narration,'Factory stock, November 2026');
 const body=walk(x.node('Xero journal preview')).find(n=>n.type==='tbody'),rows=walk(body).filter(n=>n.type==='tr');assert.equal(rows.length,6);assert.deepEqual(rows.map(row=>text(row.children.flat(Infinity).filter(n=>n?.type==='td')[5])),Array.from(result.rows,row=>row.amount));
 assert.equal(x.button('Download Xero CSV').props.disabled,false);x.button('Download Xero CSV').props.onClick();assert.equal(x.downloads.length,1);const download=x.downloads[0];assert.match(download.name,/2026-11-04\.csv$/);assert.match(download.blob.type,/text\/csv/);const csv=await download.blob.text();assert.match(csv,/^\*Narration,\*Date,Description,\*AccountCode,\*TaxRate,\*Amount,TrackingName1,TrackingOption1\r\n/);assert.equal(csv.trim().split('\r\n').length,7);assert.equal((csv.match(/"Factory stock, November 2026",04\/11\/2026/g)||[]).length,6);assert.match(csv,/11350,BAS Excluded,157\.00/);assert.match(csv,/job,Factory\/Production - BAU/);assert.deepEqual(x.states[0],before);assert.equal(x.requests.length,0);
});

test('item overrides change account totals and returning to category assignment restores the category mapping',()=>{
 const x=harness();x.open();x.openXero();configure(x);x.change('Account group for item Stock panel','materials');let latest=x.last();assert.deepEqual(latest.result.issues,[]);assert.equal(latest.options.itemGroups.panel,'materials');assert.equal(latest.result.rows.find(r=>r.groupId==='cladding').closingCents,0);assert.equal(latest.result.rows.find(r=>r.groupId==='materials').closingCents,4800);assert.equal(latest.result.totals.assetCents,15700);
 x.change('Account group for item Stock panel','');latest=x.last();assert.deepEqual(latest.result.issues,[]);assert.equal(latest.result.rows.find(r=>r.groupId==='cladding').closingCents,2000);assert.equal(latest.result.rows.find(r=>r.groupId==='materials').closingCents,2800);assert.equal(x.button('Download Xero CSV').props.disabled,false);assert.equal(x.requests.length,0);
});

test('unmapped nonzero stock blocks CSV downloads while zero-quantity unpriced stock does not require a mapping',()=>{
 const x=harness();x.open();x.openXero();configure(x,{map:false});for(const [category,group] of Object.entries(categoryGroups))if(category!=='steel')x.change('Account group for '+displayedCategories[category],group);
 let latest=x.last();assert.ok(latest.result.issues.some(issue=>issue.includes('Stock steel')));assert.equal(x.button('Download Xero CSV').props.disabled,true);x.button('Download Xero CSV').props.onClick();assert.equal(x.downloads.length,0);
 x.change('Account group for Metal stock','materials');latest=x.last();assert.deepEqual(latest.result.issues,[]);assert.equal(latest.snapshot.rows.find(r=>r.itemId==='zero').qty,0);assert.equal(latest.options.categoryGroups.other,undefined);assert.equal(x.button('Download Xero CSV').props.disabled,false);assert.equal(x.requests.length,0);
});

test('unpriced nonzero stock is identified and prevents a download even when its category has an account group',()=>{
 const x=harness();x.states[0].items.push(stock('unpriced-rivet','fixings',null,1));x.open();x.openXero();configure(x);const latest=x.last();assert.ok(latest.result.issues.some(issue=>/price/i.test(issue)&&issue.includes('Stock unpriced-rivet')));assert.equal(x.button('Download Xero CSV').props.disabled,true);x.button('Download Xero CSV').props.onClick();assert.equal(x.downloads.length,0);assert.equal(x.requests.length,0);
});

test('Xero retains the filtered SOH snapshot and leaves the Excel/PDF costing toggle and visible SOH filters unchanged',()=>{
 const x=harness();x.change('Stock supplier',JSON.stringify('Alpha'));x.change('Stock location',JSON.stringify('Rack A'));x.change('Search stock','Stock');x.open();x.button('Clear categories').props.onClick();x.check('Include Panels',true);x.check('Include Extrusions',true);x.change('Export sort','available');x.check('Export available stock only',true);x.openXero();
 const latest=x.last();assert.equal(latest.snapshot.includeCostings,true);assert.deepEqual(Array.from(latest.snapshot.rows,r=>r.itemId),['panel','extrusion']);assert.equal(latest.snapshot.rows[1].qty,5);assert.equal(latest.snapshot.rows[1].reserved,1);assert.equal(latest.snapshot.rows[1].onOrder,100);assert.ok(latest.snapshot.categories.some(value=>value==='Search: Stock'));assert.ok(latest.snapshot.categories.some(value=>value==='Sort: Lowest available'));
 x.button('Back to SOH export').props.onClick();assert.equal(x.node('Include costings').props.checked,false);assert.equal(x.node('Export supplier').props.value,JSON.stringify('Alpha'));assert.equal(x.node('Export location').props.value,JSON.stringify('Rack A'));assert.equal(x.node('Export search').props.value,'Stock');assert.equal(x.node('Export sort').props.value,'available');assert.equal(x.node('Export available stock only').props.checked,true);
 for(const format of ['Excel','PDF']){x.button('Download '+format).props.onClick();const snapshot=x.snapshots.at(-1).snapshot;assert.equal(snapshot.includeCostings,false);assert.deepEqual(snapshot.rows.map(r=>r.itemId),['panel','extrusion']);assert.ok(snapshot.rows.every(row=>!Object.hasOwn(row,'unitCost')));}
 assert.equal(x.node('Stock supplier').props.value,JSON.stringify('Alpha'));assert.equal(x.node('Stock location').props.value,JSON.stringify('Rack A'));assert.equal(x.node('Search stock').props.value,'Stock');assert.equal(x.requests.length,0);
});

test('saved item assignments are included in the Xero snapshot and take precedence over category assignments',()=>{
 const x=harness();x.states[0].items.find(item=>item.id==='panel').xeroGroup='materials';x.open();x.openXero();assert.equal(x.node('Account group for item Stock panel').props.value,'materials');configure(x);const latest=x.last();assert.equal(latest.snapshot.rows.find(row=>row.itemId==='panel').xeroGroup,'materials');assert.equal(latest.options.itemGroups.panel,'materials');assert.equal(latest.result.rows.find(row=>row.groupId==='materials').closingCents,4800);assert.equal(latest.result.rows.find(row=>row.groupId==='cladding').closingCents,0);assert.deepEqual(latest.result.issues,[]);assert.equal(x.requests.length,0);
});

test('a successful download remembers direction and category choices for the same owner and device',()=>{
 const x=harness();x.open();x.openXero();configure(x,{direction:'asset-credit'});let latest=x.last();assert.deepEqual(latest.result.issues,[]);assert.equal(latest.result.totals.assetCents,-15700);x.button('Download Xero CSV').props.onClick();assert.equal(x.downloads.length,1);
 x.button('Back to SOH export').props.onClick();x.openXero();assert.equal(x.node('Journal direction').props.value,'asset-credit');for(const [key,group] of Object.entries(categoryGroups))assert.equal(x.node('Account group for '+displayedCategories[key]).props.value,group);latest=x.last();assert.deepEqual(latest.result.issues,[]);assert.equal(x.requests.length,0);
});

test('saved former default stock accounts are corrected while other explicit account codes stay unchanged',()=>{
 for(const [saved,expected] of [['11356','11350'],[11356,'11350'],['0011356','0011356'],['90000','90000']]){
  const x=harness();x.storage.set('panelstock:xero-settings:v1:/api:admin',JSON.stringify({accountCodes:{asset:saved},direction:'asset-debit',categoryGroups}));x.open();x.openXero();
  assert.equal(x.node('Stock asset account').props.value,expected);const journal=x.last().result;assert.deepEqual(journal.issues,[]);assert.equal(journal.rows.at(-1).accountCode,expected);assert.equal(journal.rows.at(-1).amount,'157.00');
 }
});

test('Xero CSV retains a zero-value account row alongside the closing total',async()=>{
 const x=harness();const fixing=x.states[0].items.find(row=>row.id==='fixing');fixing.qty=0;fixing.reserved=0;fixing.available=0;x.open();x.openXero();configure(x);x.button('Download Xero CSV').props.onClick();
 const csv=await x.downloads[0].blob.text();assert.equal(csv.trim().split('\r\n').length,7);assert.match(csv,/51066,BAS Excluded,0\.00,/);assert.match(csv,/11350,BAS Excluded,142\.00,/);assert.ok(x.render().some(n=>n.type==='p'&&text(n).includes('All six account rows are included, including zero values.')));
});
