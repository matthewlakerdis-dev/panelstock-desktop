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
function harness(admin=true){
 const states=[],exports=[],downloads=[];let cursor=0;
 const React={createElement:(type,props,...children)=>({type,props:props||{},children}),useState:v=>{const i=cursor++;if(!(i in states))states[i]=typeof v==='function'?v():v;return [states[i],v=>states[i]=typeof v==='function'?v(states[i]):v];},useEffect(){},Fragment:'fragment'};
 const context={window:{},TextEncoder,Blob,atob,PanelStock:{username:'viewer'},localStorage:{getItem:()=>null},document:{addEventListener(){},createElement:()=>({click(){downloads.push(this.download);},remove(){}}),body:{appendChild(){}}},URL:{createObjectURL:()=> 'blob:soh-test',revokeObjectURL(){}},setTimeout(){return 0;}};
 vm.runInNewContext(source,context);const Component=context.window.createWorkshopStock(React);
 const render=()=>{cursor=0;return walk(Component({isAdmin:admin,taskAccess:{'factory.stock':true},onExportExcel(){throw Error('Legacy unfiltered exporter called');},onExportPDF(){throw Error('Legacy unfiltered exporter called');}}));};
 render();states[0]=fixture();
 context.window.PanelStockStocktakeReport.soh={xlsx:s=>{exports.push({format:'xlsx',snapshot:s});return new Blob(['xlsx']);},pdf:s=>{exports.push({format:'pdf',snapshot:s});return new Blob(['pdf']);}};
 const node=label=>render().find(n=>n.props['aria-label']===label),button=text=>render().find(n=>n.type==='button'&&n.children.includes(text));
 return {states,exports,downloads,context,render,node,button,open(){node('Export SOH').props.onClick();assert.ok(node('Export stock on hand'));},change(label,value){node(label).props.onChange({target:{value}});},check(label,checked){node(label).props.onChange({target:{checked}});},download(format='Excel'){button('Download '+format).props.onClick();return exports.at(-1)?.snapshot;}};
}
test('SOH export popup includes Panels independently from Offcuts and ignores hidden bulk selections',()=>{
 const x=harness();x.check('Select Angle 10 ',true);x.render().find(n=>n.type==='button'&&n.children[0]==='Panels').props.onClick();x.open();
 assert.equal(x.node('Include Panels').props.checked,true);assert.equal(x.node('Include Offcuts').props.checked,false);
 const report=x.download();assert.deepEqual(Array.from(report.rows,r=>r.itemId),['variant:p']);assert.equal(report.rows[0].unit,'sheets');assert.equal(report.rows[0].colour,'White');assert.match(report.rows[0].dimensions,/ACP.*3 mm.*1200 x 2400 mm/);assert.equal(report.rows[0].qty,4);assert.equal(report.rows[0].reserved,1);assert.equal(report.rows[0].available,3);assert.equal(report.rows[0].onOrder,5);assert.equal(report.revision,42);assert.equal(report.kind,'soh');assert.ok(!Number.isNaN(Date.parse(report.generatedAt)));
 x.check('Include Offcuts',true);assert.deepEqual(Array.from(x.download('PDF').rows,r=>r.itemId),['offcut:o','variant:p']);
});
test('SOH export applies popup categories, supplier, location, status, search, availability and chosen sort together',()=>{
 const x=harness(false);x.open();x.button('Clear categories').props.onClick();x.check('Include Extrusions',true);x.change('Export supplier',JSON.stringify('Alpha'));x.change('Export location',JSON.stringify('Rack A'));x.change('Export status','reorder');x.change('Export search','angle');x.check('Export available stock only',true);x.change('Export sort','available');
 const report=x.download('PDF');assert.deepEqual(Array.from(report.rows,r=>r.itemId),['angle2','angle10']);assert.equal(report.supplier,'Alpha');assert.ok(report.categories.some(v=>v.includes('Sort: Lowest available')));assert.ok(report.categories.some(v=>v.includes('Search: angle')));assert.ok(report.categories.some(v=>v.includes('Available stock only')));assert.equal(report.rows[1].sku,'');assert.equal(x.downloads.length,1);assert.match(x.downloads[0],/^Lennox-SOH-.*\.pdf$/);
});
test('SOH popup preselects current filters and changing popup filters does not change the visible SOH filters',()=>{
 const x=harness();x.render().find(n=>n.type==='button'&&n.children[0]==='Extrusions').props.onClick();x.change('Stock supplier',JSON.stringify('Alpha'));x.change('Stock location',JSON.stringify('Rack A'));x.change('Stock status','reorder');x.change('Search stock','Angle');x.change('Sort stock','available');x.button('Available only').props.onClick();x.open();
 assert.equal(x.node('Include Extrusions').props.checked,true);assert.equal(x.node('Include Panels').props.checked,false);assert.equal(x.node('Export supplier').props.value,JSON.stringify('Alpha'));assert.equal(x.node('Export location').props.value,JSON.stringify('Rack A'));assert.equal(x.node('Export status').props.value,'reorder');assert.equal(x.node('Export search').props.value,'Angle');assert.equal(x.node('Export sort').props.value,'available');assert.equal(x.node('Export available stock only').props.checked,true);
 assert.deepEqual(Array.from(x.download().rows,r=>r.itemId),['angle2','angle10']);x.change('Export search','unmatched');x.change('Export supplier','');x.button('Close').props.onClick();assert.equal(x.node('Search stock').props.value,'Angle');assert.equal(x.node('Stock supplier').props.value,JSON.stringify('Alpha'));
});
test('SOH export disables downloads for zero categories and for no matching rows',()=>{
 const x=harness();x.open();x.button('Clear categories').props.onClick();assert.equal(x.button('Download Excel').props.disabled,true);assert.equal(x.button('Download PDF').props.disabled,true);x.download();assert.equal(x.exports.length,0);
 x.check('Include Panels',true);x.change('Export search','unmatched');assert.equal(x.button('Download Excel').props.disabled,true);x.download('PDF');assert.equal(x.exports.length,0);
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
