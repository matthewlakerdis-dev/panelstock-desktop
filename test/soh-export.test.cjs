const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../workshop-stock.js'),'utf8');
const fixture=()=>({revision:42,movements:[],items:[
 {id:'variant:p',legacy:true,category:'panels',name:'White ACP panel',sku:'PANEL',color:'White',material:'ACP',thickness:3,width:1200,height:2400,supplier:'Alpha',location:'Rack A',qty:4,reserved:1,available:3,onOrder:5,reorderLevel:2,unit:'sheets'},
 {id:'offcut:o',legacy:true,category:'offcuts',name:'White ACP offcut',sku:'OFFCUT',color:'White',material:'ACP',thickness:3,width:600,height:800,supplier:'Alpha',location:'Rack A',qty:2,reserved:0,available:2,onOrder:0,reorderLevel:0,unit:'sheets'},
 {id:'angle10',category:'extrusions',name:'Angle 10',sku:'',colour:'Black',dimensions:'25 x 25 x 3 mm',lengthMm:6000,supplier:'Alpha',location:'Rack A',qty:5,reserved:1,available:4,onOrder:2,reorderLevel:6,unit:'lengths'},
 {id:'angle2',category:'extrusions',name:'Angle 2',sku:'ANG2',colour:'Black',dimensions:'20 x 20',lengthMm:3000,supplier:'Alpha',location:'Rack A',qty:2,reserved:1,available:1,onOrder:0,reorderLevel:3,unit:'lengths'},
 {id:'angle20',category:'extrusions',name:'Angle 20',sku:'ANG20',colour:'Mill',supplier:'Beta',location:'Rack A',qty:0,reserved:2,available:-2,onOrder:0,reorderLevel:0,unit:'lengths'},
 {id:'bolt',category:'fixings',name:'Bolt',sku:'',qty:0,reserved:0,available:0,onOrder:0,reorderLevel:0,unit:'each'}
]});
const walk=n=>!n||typeof n!=='object'?[]:[n,...(n.children||[]).flat(Infinity).flatMap(walk)];
function harness(admin=true,inlineExport,catalogueOnly){
 const states=[],exports=[],downloads=[],effects=[];let cursor=0;
 const React={createElement:(type,props,...children)=>({type,props:props||{},children}),useState:v=>{const i=cursor++;if(!(i in states))states[i]=typeof v==='function'?v():v;return [states[i],v=>states[i]=typeof v==='function'?v(states[i]):v];},useEffect(effect){effects.push(effect);},Fragment:'fragment'};
 const context={window:{},TextEncoder,Blob,atob,PanelStock:{username:'viewer',apiFetch:async()=>({ok:true,json:async()=>fixture()})},localStorage:{getItem:()=>null},document:{addEventListener(){},createElement:()=>({click(){downloads.push(this.download);},remove(){}}),body:{appendChild(){}}},URL:{createObjectURL:()=> 'blob:soh-test',revokeObjectURL(){}},setTimeout(){return 0;}};
 vm.runInNewContext(source,context);const Component=context.window.createWorkshopStock(React);
 const render=()=>{cursor=0;effects.length=0;return walk(Component({isAdmin:admin,inlineExport,catalogueOnly,taskAccess:{'factory.stock':true},onExportExcel(){throw Error('Legacy unfiltered exporter called');},onExportPDF(){throw Error('Legacy unfiltered exporter called');}}));};
 render();states[0]=fixture();
 context.window.PanelStockStocktakeReport.soh={xlsx:s=>{exports.push({format:'xlsx',snapshot:s});return new Blob(['xlsx']);},pdf:s=>{exports.push({format:'pdf',snapshot:s});return new Blob(['pdf']);}};
 const node=label=>render().find(n=>n.props['aria-label']===label),button=text=>render().find(n=>n.type==='button'&&n.children.includes(text));
 return {states,exports,downloads,context,render,node,button,runEffects(){effects.slice().forEach(effect=>effect());},open(){node('Export SOH').props.onClick();assert.ok(node('Export stock on hand'));},change(label,value){node(label).props.onChange({target:{value}});},check(label,checked){node(label).props.onChange({target:{checked}});},download(format='Excel'){button('Download '+format).props.onClick();return exports.at(-1)?.snapshot;},async downloadAsync(format='PDF'){await button('Download '+format).props.onClick();return exports.at(-1)?.snapshot;}};
}
test('SOH export popup includes Panels independently from Offcuts and ignores hidden bulk selections',async()=>{
 const x=harness();x.check('Select Angle 10 ',true);x.render().find(n=>n.type==='button'&&n.children[0]==='Panels').props.onClick();x.open();
 assert.equal(x.node('Include Panels').props.checked,true);assert.equal(x.node('Include Offcuts').props.checked,false);
 const report=x.download();assert.deepEqual(Array.from(report.rows,r=>r.itemId),['variant:p']);assert.equal(report.rows[0].unit,'sheets');assert.equal(report.rows[0].colour,'White');assert.match(report.rows[0].dimensions,/ACP.*3 mm.*1200 x 2400 mm/);assert.equal(report.rows[0].qty,4);assert.equal(report.rows[0].reserved,1);assert.equal(report.rows[0].available,3);assert.equal(report.rows[0].onOrder,5);assert.equal(report.revision,42);assert.equal(report.kind,'soh');assert.ok(!Number.isNaN(Date.parse(report.generatedAt)));
 x.check('Include Offcuts',true);assert.deepEqual(Array.from((await x.downloadAsync('PDF')).rows,r=>r.itemId),['offcut:o','variant:p']);
});
test('SOH export applies popup categories, supplier, location, status, search, availability and chosen sort together',async()=>{
 const x=harness(false);x.open();x.button('Clear categories').props.onClick();x.check('Include Extrusions',true);x.change('Export supplier',JSON.stringify('Alpha'));x.change('Export location',JSON.stringify('Rack A'));x.change('Export status','reorder');x.change('Export search','angle');x.check('Export available stock only',true);x.change('Export sort','available');
 const report=(await x.downloadAsync('PDF'));assert.deepEqual(Array.from(report.rows,r=>r.itemId),['angle2','angle10']);assert.equal(report.supplier,'Alpha');assert.ok(report.categories.some(v=>v.includes('Sort: Lowest available')));assert.ok(report.categories.some(v=>v.includes('Search: angle')));assert.ok(report.categories.some(v=>v.includes('Available stock only')));assert.equal(report.rows[1].sku,'');assert.equal(x.downloads.length,1);assert.match(x.downloads[0],/^Lennox-SOH-.*\.pdf$/);
});
test('SOH popup preselects current filters and changing popup filters does not change the visible SOH filters',()=>{
 const x=harness();x.render().find(n=>n.type==='button'&&n.children[0]==='Extrusions').props.onClick();x.change('Stock supplier',JSON.stringify('Alpha'));x.change('Stock location',JSON.stringify('Rack A'));x.change('Stock status','reorder');x.change('Search stock','Angle');x.change('Sort stock','available');x.button('Available only').props.onClick();x.open();
 assert.equal(x.node('Include Extrusions').props.checked,true);assert.equal(x.node('Include Panels').props.checked,false);assert.equal(x.node('Export supplier').props.value,JSON.stringify('Alpha'));assert.equal(x.node('Export location').props.value,JSON.stringify('Rack A'));assert.equal(x.node('Export status').props.value,'reorder');assert.equal(x.node('Export search').props.value,'Angle');assert.equal(x.node('Export sort').props.value,'available');assert.equal(x.node('Export available stock only').props.checked,true);
 assert.deepEqual(Array.from(x.download().rows,r=>r.itemId),['angle2','angle10']);x.change('Export search','unmatched');x.change('Export supplier','');x.button('Close').props.onClick();assert.equal(x.node('Search stock').props.value,'Angle');assert.equal(x.node('Stock supplier').props.value,JSON.stringify('Alpha'));
});
test('SOH export disables downloads for zero categories and for no matching rows',async()=>{
 const x=harness();x.open();x.button('Clear categories').props.onClick();assert.equal(x.button('Download Excel').props.disabled,true);assert.equal(x.button('Download PDF').props.disabled,true);x.download();assert.equal(x.exports.length,0);
 x.check('Include Panels',true);x.change('Export search','unmatched');assert.equal(x.button('Download Excel').props.disabled,true);(await x.downloadAsync('PDF'));assert.equal(x.exports.length,0);
});
test('SOH export preserves zero and negative quantities and supports missing supplier and location filters',()=>{
 const x=harness();x.open();let report=x.download();const negative=report.rows.find(r=>r.itemId==='angle20'),zero=report.rows.find(r=>r.itemId==='bolt');assert.equal(negative.qty,0);assert.equal(negative.reserved,2);assert.equal(negative.available,-2);assert.equal(zero.qty,0);assert.equal(zero.reorderLevel,0);assert.equal(zero.sku,'');assert.ok(report.rows.every(r=>typeof r.qty==='number'&&typeof r.available==='number'));
 x.change('Export supplier',JSON.stringify(''));x.change('Export location',JSON.stringify(''));report=x.download();assert.deepEqual(Array.from(report.rows,r=>r.itemId),['bolt']);assert.equal(report.supplier,'No supplier');assert.ok(report.categories.some(v=>v==='Location: No location'));
});
function realExports(){const context={window:{},TextEncoder,Blob,atob};vm.runInNewContext(source,context);return context.window.PanelStockStocktakeReport;}
test('SOH Excel has its own thirteen-column snapshot schema and preserves numeric zero, negatives and formula-safe item codes',async()=>{
 const x=harness();x.states[0].items.find(i=>i.id==='angle2').sku='=2+2';x.open();const snapshot=x.download();const bytes=Buffer.from(await realExports().soh.xlsx(snapshot).arrayBuffer()),files={};let offset=0;
 while(bytes.readUInt32LE(offset)===0x04034b50){const size=bytes.readUInt32LE(offset+18),length=bytes.readUInt16LE(offset+26),name=bytes.subarray(offset+30,offset+30+length).toString();files[name]=bytes.subarray(offset+30+length,offset+30+length+size).toString();offset+=30+length+size;}
 const sheet=files['xl/worksheets/sheet1.xml'];assert.match(sheet,/STOCK ON HAND/);assert.match(sheet,/EXPORTED \(BRISBANE\)/);assert.match(sheet,/FILTERS/);assert.match(sheet,/autoFilter ref="A12:M18"/);assert.match(sheet,/C13.*frozen|frozen.*C13/);assert.match(sheet,/>On hand</);assert.match(sheet,/>Reserved</);assert.match(sheet,/>Available</);assert.match(sheet,/>Reorder level</);assert.doesNotMatch(sheet,/STOCKTAKE REPORT|>Expected<|>Counted<|>Variance</);assert.match(sheet,/<c r="H15"[^>]* t="n"><v>0<\/v>/);assert.match(sheet,/<c r="I15"[^>]* t="n"><v>2<\/v>/);assert.match(sheet,/<c r="J15"[^>]* t="n"><v>-2<\/v>/);assert.match(sheet,/=2\+2/);assert.doesNotMatch(sheet,/<f>/);assert.ok(files['xl/media/lennox-logo.png']);
});
test('SOH PDF is labelled as a current stock export and retains panel and workshop quantities',async()=>{
 const x=harness();x.open();const snapshot=x.download();const pdf=await realExports().soh.pdf(snapshot).text();assert.ok(pdf.startsWith('%PDF-1.4'));assert.match(pdf,/STOCK ON HAND/);assert.doesNotMatch(pdf,/STOCKTAKE REPORT/);assert.match(pdf,/White ACP panel/);assert.match(pdf,/Angle 20/);assert.match(pdf,/\/Subtype \/Image/);assert.match(pdf,/\/FontFile2/);assert.match(pdf,/Page 1 of/);
 const offset=Number(pdf.match(/startxref\n(\d+)/)[1]);assert.equal(pdf.slice(offset,offset+4),'xref');
});

test('the Reports entry shows the shared stock filters and download actions inline',async()=>{
 const x=harness(true,true);
 const reportsSource=fs.readFileSync(path.join(__dirname,'../reports-page.js'),'utf8');
 const state=[];let cursor=0;
 vm.runInNewContext(reportsSource,x.context);
 const Reports=x.context.window.createReportsPage({
  createElement:(type,props,...children)=>({type,props:props||{},children}),
  useState:initial=>{const i=cursor++;if(!(i in state))state[i]=initial;return [state[i],value=>{state[i]=value;}];},
  useEffect(){}
 });
 const report=()=>{cursor=0;return walk(Reports({renderStockExport:()=>({type:'shared-export',props:{}})}));};
 report().find(n=>n.type==='select').props.onChange({target:{value:'stock'}});
 assert.equal(report().filter(n=>n.type==='select').length,1);
 assert.equal(report().some(n=>n.type==='button'),false);
 assert.ok(report().some(n=>n.type==='shared-export'));

 x.render();x.runEffects();
 assert.ok(x.node('Export stock on hand'));
 assert.equal(x.node('Include Panels').props.checked,true);
 assert.equal(x.node('Include Offcuts').props.checked,true);
 for(const label of ['Xero journal CSV','Download Excel','Download PDF'])assert.ok(x.button(label));
 x.change('Export supplier',JSON.stringify('Beta'));
 assert.deepEqual(Array.from((await x.downloadAsync('PDF')).rows,r=>r.itemId),['angle20']);
 assert.equal(x.node('Export stock on hand').props.role,undefined);
 assert.equal(x.button('Cancel'),undefined);
});

test('the inline Material Catalogue keeps panel and offcut stock out of the export',async()=>{
 const x=harness(true,true,true);
 x.render();x.runEffects();
 assert.ok(x.node('Export material catalogue'));
 assert.equal(x.node('Include Panels'),undefined);
 assert.equal(x.node('Include Offcuts'),undefined);
 const report=(await x.downloadAsync('PDF'));
 assert.equal(report.name,'Material Catalogue');
 assert.deepEqual(Array.from(report.rows,r=>r.itemId),['angle2','angle10','angle20','bolt']);
 assert.match(x.downloads[0],/^Lennox-Material-Catalogue-.*[.]pdf$/);
 assert.match(await realExports().soh.pdf(report).text(),/MATERIAL CATALOGUE/);
});

test('SOH PDF embeds a compact profile thumbnail per row and reuses shared pictures',async()=>{
 const x=harness(),img='data:image/png;base64,AA==';
 let decoded=0;
 const drawSizes=[];
 x.context.Image=class {
  constructor(){this.naturalWidth=1600;this.naturalHeight=800;}
  set src(value){assert.equal(value,img);decoded++;this.onload();}
 };
 const originalCreate=x.context.document.createElement;
 x.context.document.createElement=tag=>tag==='canvas'?{
  getContext:()=>({fillRect(){},drawImage(_image,_x,_y,width,height){drawSizes.push([width,height]);}}),
  toDataURL:()=> 'data:image/jpeg;base64,/9j/2Q=='
 }:originalCreate(tag);
 x.states[0].items[0].image=img;
 x.states[0].items[1].image=img;
 x.states[0].items[2].colorHex='#24546b';
 x.open();
 await x.button('Download PDF').props.onClick();
 const snapshot=x.exports.at(-1).snapshot;
 assert.equal(decoded,1);
 assert.deepEqual(drawSizes,[[96,48]]);
 const pdf=await realExports().soh.pdf(snapshot).text();
 assert.equal((pdf.match(/\/StockImage\d+ Do/g)||[]).length,2);
 assert.equal((pdf.match(/\/Subtype \/Image/g)||[]).length,2);
 assert.match(pdf,/q 26[.]00 0 0 13[.]00 43[.]00 [0-9.]+ cm \/StockImage/);
 assert.match(pdf,/0[.]141 0[.]329 0[.]420 rg 47 [0-9.]+ 18 18 re f/);
 await x.button('Download Excel').props.onClick();
 assert.ok(x.exports.at(-1).snapshot.rows.every(row=>!row.thumbnail&&!row.swatch));
});

test('SOH hides panel and offcut records without on-hand stock from rows, counts and exports',()=>{
 const x=harness(),expected=['angle2','angle10','angle20','bolt','offcut:o','variant:p'];
 for(const category of ['panels','offcuts'])for(const [label,quantity] of [['zero',0],['negative',-1],['missing',undefined]]){
  x.states[0].items.push({...fixture().items[0],id:category+'-'+label,category,name:category+' '+label,qty:quantity,reserved:2,available:-2,location:''});
 }
 for(const prefix of ['variant:','offcut:'])x.states[0].items.push({...fixture().items[2],id:prefix+'uncategorised',name:prefix+' without stock',qty:0,reserved:2,available:-2,location:''});
 const tree=x.render(),table=tree.find(n=>n.type==='tbody');
 assert.deepEqual(walk(table).filter(n=>n.type==='tr').map(n=>n.props.key),expected);
 for(const [label,count] of [['Stock items',6],['Needs restocking',4],['Allocated to jobs',4],['Location needed',1]]){
  const metric=tree.find(n=>n.type==='button'&&n.props.className?.startsWith('ws-metric ')&&walk(n).some(v=>v.children?.includes(label)));
  assert.equal(walk(metric).find(n=>n.type==='strong').children[0],count,label);
 }
 const tabs=walk(x.node('Stock categories'));
 for(const [label,count] of [['All Stock',6],['Panels',1],['Offcuts',1],['Extrusions',3],['Fixings',1]]){
  const tab=tabs.find(n=>n.type==='button'&&n.children[0]===label);
  assert.equal(walk(tab).find(n=>n.type==='span').children[0],count,label);
 }
 x.open();
 for(const [label,count] of [['Panels',1],['Offcuts',1],['Extrusions',3],['Fixings',1]]){
  const category=x.render().find(n=>n.type==='label'&&walk(n).some(v=>v.props['aria-label']==='Include '+label));
  assert.equal(walk(category).find(n=>n.type==='small').children[0],' ('+count+')',label);
 }
 assert.ok(x.render().some(n=>n.type==='strong'&&n.children[0]==='6 items will be exported'));
 for(const format of ['Excel','PDF'])assert.deepEqual(Array.from(x.download(format).rows,r=>r.itemId),expected);
});

test('fully reserved panels and offcuts remain in SOH and exports until Available only is enabled',async()=>{
 const x=harness();
 for(const item of x.states[0].items.filter(i=>['panels','offcuts'].includes(i.category))){item.reserved=item.qty;item.available=0;}
 const rowIds=()=>walk(x.render().find(n=>n.type==='tbody')).filter(n=>n.type==='tr').map(n=>n.props.key);
 assert.ok(rowIds().includes('variant:p'));assert.ok(rowIds().includes('offcut:o'));
 x.open();
 let report=x.download();
 for(const id of ['variant:p','offcut:o']){
  const row=report.rows.find(r=>r.itemId===id);assert.ok(row);assert.equal(row.qty,row.reserved);assert.equal(row.available,0);
 }
 x.check('Export available stock only',true);report=(await x.downloadAsync('PDF'));
 assert.ok(report.rows.every(r=>!['variant:p','offcut:o'].includes(r.itemId)));
 x.button('Close').props.onClick();x.button('Available only').props.onClick();
 assert.deepEqual(rowIds(),['angle2','angle10']);
});

test('a refreshed panel with no stock cannot remain bulk-selected and zero workshop stock still needs restocking',()=>{
 const x=harness();x.check('Select White ACP panel PANEL',true);assert.equal(x.button('Bulk edit').props.disabled,false);
 x.states[0]={...x.states[0],items:x.states[0].items.map(i=>i.id==='variant:p'?{...i,qty:0,available:0}:i)};
 assert.equal(x.node('Select White ACP panel PANEL'),undefined);
 assert.equal(x.button('Bulk edit').props.disabled,true);
 assert.ok(x.render().some(n=>n.type==='span'&&n.children[0]==='0 selected'));
 x.check('Select all visible stock items',true);x.button('Bulk edit').props.onClick();
 const bulk=x.states.find(v=>v?.action==='bulk_metadata');
 assert.ok(!bulk.itemIds.includes('variant:p'));assert.ok(bulk.itemIds.includes('angle20'));assert.ok(bulk.itemIds.includes('bolt'));
 x.button('Cancel').props.onClick();
 x.render().find(n=>n.type==='button'&&n.props.className?.startsWith('ws-metric ')&&walk(n).some(v=>v.children?.includes('Needs restocking'))).props.onClick();
 const restock=walk(x.node('Restocking overview')).filter(n=>n.type==='article').map(n=>n.props.key);
 assert.ok(restock.includes('angle20'));assert.ok(restock.includes('bolt'));assert.ok(!restock.includes('variant:p'));
});

test('SOH PDF includes default profile references, reuses identical shapes and leaves item images untouched',async()=>{
 const x=harness(),decoded=[];
 const base={...x.states[0].items.find(item=>item.category==='extrusions')};
 x.states[0].items=[{...base,id:'square-one',name:'SHS'},{...base,id:'square-two',name:'Square Hollow'},{...base,id:'rectangle',name:'RHS'}];
 x.context.Image=class {
  constructor(){this.naturalWidth=160;this.naturalHeight=120;}
  set src(value){assert.match(value,/^data:image\/svg\+xml;charset=utf-8,/);decoded.push(decodeURIComponent(value.split(',')[1]));this.onload();}
 };
 const originalCreate=x.context.document.createElement;
 x.context.document.createElement=tag=>tag==='canvas'?{getContext:()=>({fillRect(){},drawImage(){}}),toDataURL:()=> 'data:image/jpeg;base64,/9j/2Q=='}:originalCreate(tag);
 x.open();await x.button('Download PDF').props.onClick();
 const snapshot=x.exports.at(-1).snapshot;
 assert.equal(decoded.length,2);assert.ok(decoded.some(svg=>svg.includes('data-profile-kind="shs"')));assert.ok(decoded.some(svg=>svg.includes('data-profile-kind="rhs"')));
 assert.ok(snapshot.rows.every(row=>row.thumbnail?.width===96&&row.thumbnail?.height===72));
 const square=snapshot.rows.filter(row=>row.itemId.startsWith('square-'));assert.equal(square[0].thumbnail,square[1].thumbnail);
 assert.ok(x.states[0].items.every(item=>!Object.hasOwn(item,'image')));
});
