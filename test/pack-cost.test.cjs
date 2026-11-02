const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../workshop-stock.js'),'utf8');
const walk=n=>!n||typeof n!=='object'?[]:[n,...(n.children||[]).flat(Infinity).flatMap(walk)];
const fixture=()=>({revision:9,movements:[],items:[
 {id:'spacers',name:'Bulk spacers',sku:'KASP24',category:'extrusions',unit:'each',qty:125,reserved:25,available:100,onOrder:1000,reorderLevel:10,unitCost:0.25,costBasis:'pack',packCost:12.34,packSize:100},
 {id:'free',name:'Free spacers',sku:'FREE',category:'extrusions',unit:'each',qty:200,reserved:0,available:200,unitCost:9,costBasis:'pack',packCost:0,packSize:100},
 {id:'unpriced',name:'No pack quote',sku:'MISSING',category:'extrusions',unit:'each',qty:10,reserved:0,available:10,unitCost:99,costBasis:'pack',packCost:null,packSize:100},
 {id:'legacy',name:'Individual screw',sku:'EACH',category:'fixings',unit:'each',qty:3,reserved:0,available:3,unitCost:2,packSize:100}
]});
function harness(){
 const states=[],sent=[],exports=[],storage=new Map();let cursor=0;
 const React={createElement:(type,props,...children)=>({type,props:props||{},children}),useState:v=>{const i=cursor++;if(!(i in states))states[i]=typeof v==='function'?v():v;return [states[i],v=>states[i]=typeof v==='function'?v(states[i]):v];},useEffect(){},Fragment:'fragment'};
 const context={window:{},TextEncoder,Blob,atob,crypto:{randomUUID:()=> 'pack-mutation'},PanelStock:{username:'admin',apiFetch:async(url,options)=>{if(options)sent.push(JSON.parse(options.body));return {ok:true,json:async()=>states[0]};}},localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)},document:{addEventListener(){},createElement:()=>({click(){},remove(){}}),body:{appendChild(){}}},URL:{createObjectURL:()=> 'blob:pack-report',revokeObjectURL(){}},setTimeout(){return 0;}};
 vm.runInNewContext(source,context);const C=context.window.createWorkshopStock(React),render=()=>{cursor=0;return walk(C({isAdmin:true,workerUrl:'/api'}));};render();states[0]=fixture();
 context.window.PanelStockStocktakeReport.soh={xlsx:s=>{exports.push(s);return new Blob(['xlsx']);},pdf:s=>{exports.push(s);return new Blob(['pdf']);}};
 const node=label=>render().find(n=>n.props['aria-label']===label),button=label=>render().find(n=>n.type==='button'&&n.children.includes(label)),control=key=>walk(render().find(n=>n.type==='label'&&n.props.key===key)).find(n=>n.type==='input'||n.type==='select');
 return {states,render,node,button,control,set(key,value){control(key).props.onChange({target:{value}});},check(label,checked){node(label).props.onChange({target:{checked}});},openItem(name){node('Stock action for '+name).props.onChange({target:{value:'metadata'}});},openExport(){node('Export SOH').props.onClick();},download(format='Excel'){button('Download '+format).props.onClick();return exports.at(-1);},async save(){await render().find(n=>n.type==='form').props.onSubmit({preventDefault(){}});return sent.at(-1);}};
}

test('pack pricing editor retains individual stock counts and exposes a whole pack size and two-decimal pack price',async()=>{
 const x=harness(),before=structuredClone(x.states[0]);x.openItem('Bulk spacers');assert.equal(x.control('costBasis').props.value,'pack');assert.equal(x.control('unitCost'),undefined);
 const price=x.control('packCost'),size=x.control('packSize');assert.equal(price.props.value,12.34);assert.equal(price.props.min,0);assert.equal(price.props.step,'0.01');assert.equal(price.props.required,false);assert.equal(size.props.value,100);assert.equal(size.props.min,1);assert.equal(size.props.step,'1');assert.equal(size.props.required,true);
 assert.ok(x.render().some(n=>n.type==='label'&&n.props.key==='packCost'&&n.children.includes('Pack price (AUD ex GST)')));assert.ok(x.render().some(n=>n.type==='label'&&n.props.key==='packSize'&&n.children.includes('Stock units per pack (each)')));
 x.set('packCost','15.99');const payload=await x.save();assert.equal(payload.action,'metadata');assert.equal(payload.itemId,'spacers');assert.equal(payload.costBasis,'pack');assert.equal(payload.packCost,'15.99');assert.equal(payload.packSize,100);assert.equal(payload.unitCost,0.25);assert.equal(payload.unit,'each');assert.deepEqual(x.states[0],before);
});

test('switching the price basis restores each independent price instead of converting or overwriting it',async()=>{
 const x=harness();x.openItem('Bulk spacers');x.set('costBasis','unit');assert.equal(x.control('packCost'),undefined);assert.equal(x.control('unitCost').props.value,0.25);
 x.set('unitCost','0.35');x.set('costBasis','pack');assert.equal(x.control('packCost').props.value,12.34);assert.equal(x.control('packSize').props.value,100);
 const payload=await x.save();assert.equal(payload.unitCost,'0.35');assert.equal(payload.packCost,12.34);assert.equal(payload.packSize,100);assert.equal(payload.costBasis,'pack');assert.equal(x.states[0].items[0].qty,125);
});

test('pack costs distinguish a free pack from a missing pack quote without requiring a price',async()=>{
 const x=harness();x.openItem('Free spacers');assert.equal(x.control('packCost').props.value,0);assert.equal(x.control('packCost').props.required,false);let payload=await x.save();assert.equal(payload.packCost,0);
 x.openItem('No pack quote');assert.equal(x.control('packCost').props.value,'');assert.equal(x.control('packCost').props.required,false);payload=await x.save();assert.equal(payload.packCost,'');assert.equal(payload.unitCost,99);
 x.openItem('Individual screw');assert.equal(x.control('costBasis').props.value,'unit');assert.equal(x.control('unitCost').props.value,2);assert.equal(x.control('packCost'),undefined);
});

test('new item pack pricing uses the chosen stock unit and pack size without changing the opening count',async()=>{
 const x=harness();x.button('Add stock item').props.onClick();x.set('name','New spacer');x.set('unit','each');x.set('qty','250');x.set('costBasis','pack');x.set('packSize','100');x.set('packCost','12.34');
 const payload=await x.save();assert.equal(payload.action,'create');assert.equal(payload.item.unit,'each');assert.equal(payload.item.qty,'250');assert.equal(payload.item.packSize,'100');assert.equal(payload.item.packCost,'12.34');assert.equal(payload.item.costBasis,'pack');
});

test('SOH costed snapshots include raw pack details but never convert displayed quantities; uncosted snapshots omit all prices',()=>{
 const x=harness();x.openExport();x.check('Include costings',true);let snapshot=x.download('PDF');const row=snapshot.rows.find(r=>r.itemId==='spacers');assert.equal(row.costBasis,'pack');assert.equal(row.packCost,12.34);assert.equal(row.packSize,100);assert.equal(row.unitCost,0.25);assert.equal(row.qty,125);assert.equal(row.unit,'each');assert.equal(row.reserved,25);assert.equal(row.onOrder,1000);
 x.check('Include costings',false);snapshot=x.download();for(const r of snapshot.rows)for(const key of ['unitCost','packCost','costBasis','packSize','effectiveUnitCost','lineValue'])assert.equal(Object.hasOwn(r,key),false);
});

function methods(){const context={window:{},TextEncoder,Blob,atob};vm.runInNewContext(source,context);return context.window.PanelStockStocktakeReport.soh;}
const reportRow=(id,qty,patch={})=>({itemId:id,sku:id,name:'Spacer '+id,category:'Extrusions',unit:'each',qty,reserved:0,available:qty,onOrder:0,reorderLevel:0,status:'In stock',costBasis:'pack',packSize:100,packCost:12.34,unitCost:99,...patch});
const example=()=>({kind:'soh',name:'Packs counted individually',generatedAt:'2026-11-02T00:00:00Z',revision:9,categories:['Extrusions','Fixings'],supplier:'All suppliers',includeCostings:true,rows:[reportRow('one',1),reportRow('hundred',100,{reserved:75,available:25,onOrder:1000}),reportRow('twohundred',200),reportRow('penny',1,{packCost:1}),reportRow('tiny-hundred',100,{packCost:0.01}),reportRow('tiny-one',1,{packCost:0.01}),reportRow('unpriced',10,{packCost:null}),reportRow('free',100,{packCost:0}),reportRow('legacy-unit',3,{costBasis:undefined,unitCost:2}),reportRow('half-a',50,{packCost:0.01}),reportRow('half-b',50,{packCost:0.01})]});
function unzip(bytes){let offset=0;const files={};while(bytes.readUInt32LE(offset)===0x04034b50){const size=bytes.readUInt32LE(offset+18),length=bytes.readUInt16LE(offset+26),name=bytes.subarray(offset+30,offset+30+length).toString();files[name]=bytes.subarray(offset+30+length,offset+30+length+size).toString();offset+=30+length+size;}return files;}

test('pack report valuation divides exactly by pack size and rounds only each completed line, not the equivalent unit price',()=>{
 const input=example(),before=structuredClone(input),report=methods().prepare(input);
 assert.deepEqual(Array.from(report.rows,r=>r.lineValue),[0.12,12.34,24.68,0.01,0.01,0,null,0,6,0.01,0.01]);assert.equal(report.rows[0].effectiveUnitCost,0.1234);assert.equal(report.rows[4].effectiveUnitCost,0.0001);assert.equal(report.rows[8].effectiveUnitCost,2);assert.equal(report.rows[0].unitCost,99);assert.equal(report.rows[0].packCost,12.34);assert.equal(report.rows[6].effectiveUnitCost,null);assert.equal(report.rows[7].effectiveUnitCost,0);
 assert.equal(report.costSummary.totalValue,43.18);assert.equal(report.costSummary.pricedItems,10);assert.equal(report.costSummary.unpricedItems,1);assert.equal(report.costSummary.currency,'AUD');assert.equal(report.costSummary.taxBasis,'exGST');assert.deepEqual(input,before);
 assert.deepEqual(Array.from(report.rows,r=>[r.qty,r.unit]),input.rows.map(r=>[r.qty,r.unit]));
});

test('uncosted report preparation strips pack pricing and prepared unit costs while retaining only stock quantities',()=>{
 const prepared=methods().prepare(example()),off=methods().prepare({...prepared,includeCostings:false});assert.equal(Object.hasOwn(off,'costSummary'),false);
 for(const row of off.rows)for(const key of ['unitCost','packCost','packSize','costBasis','effectiveUnitCost','lineValue'])assert.equal(Object.hasOwn(row,key),false);
 assert.deepEqual(Array.from(off.rows,r=>r.qty),example().rows.map(r=>r.qty));
});

test('invalid pack size or pack price rejects costing instead of using an old per-unit price',()=>{
 for(const patch of [{packSize:0},{packSize:-1},{packSize:1.5},{packSize:1e9+1},{packSize:NaN},{packSize:Infinity},{packSize:''},{costBasis:'box'},{packCost:-1},{packCost:0.001},{packCost:0.0000001},{packCost:Infinity},{packCost:'bad'}]){
  const input={...example(),rows:[reportRow('invalid',100,patch)]},before=structuredClone(input);assert.throws(()=>methods().prepare(input));assert.deepEqual(input,before);
 }
 const missing=methods().prepare({...example(),rows:[reportRow('missing',100,{packCost:undefined,unitCost:10})]});assert.equal(missing.rows[0].lineValue,null);assert.equal(missing.costSummary.totalValue,0);assert.equal(missing.costSummary.unpricedItems,1);
});

test('real Excel export includes pack pricing context and fractional equivalent costs only when costings are enabled',async()=>{
 const files=unzip(Buffer.from(await methods().xlsx(example()).arrayBuffer())),sheet=files['xl/worksheets/sheet1.xml'];assert.match(sheet,/autoFilter ref="A12:R23"/);assert.match(sheet,/>Units per pack</);assert.match(sheet,/>Pack cost \(AUD ex GST\)</);assert.match(sheet,/>Price basis</);
 assert.match(sheet,/<c r="N13"[^>]* t="n"><v>0\.1234<\/v>/);assert.match(sheet,/<c r="O13"[^>]* t="n"><v>0\.12<\/v>/);assert.match(sheet,/<c r="P13"[^>]* t="n"><v>100<\/v>/);assert.match(sheet,/<c r="Q13"[^>]* t="n"><v>12\.34<\/v>/);assert.match(sheet,/>Per pack</);assert.match(sheet,/<c r="N17"[^>]* t="n"><v>0\.0001<\/v>/);assert.match(sheet,/<c r="O17"[^>]* t="n"><v>0\.01<\/v>/);assert.match(sheet,/>Not priced</);assert.match(sheet,/<v>43\.18<\/v>/);assert.ok(files['xl/media/lennox-logo.png']);
 const plain=unzip(Buffer.from(await methods().xlsx({...example(),includeCostings:false}).arrayBuffer()))['xl/worksheets/sheet1.xml'];assert.match(plain,/autoFilter ref="A12:M23"/);assert.doesNotMatch(plain,/Pack cost|Units per pack|Price basis|On-hand value|Unit cost|Per pack/);
});

test('real PDF explains pack price and equivalent per-item cost while valuing counted individuals',async()=>{
 const pdf=(await methods().pdf(example()).text()).replace(/\\([()\\])/g,'$1');assert.match(pdf,/Pack price \(AUD ex GST\): \$12\.34 \/ 100 each per pack/);assert.match(pdf,/Equivalent unit cost \(AUD ex GST\): \$0\.1234/);assert.match(pdf,/\$0\.0001/);assert.match(pdf,/Known on-hand value \(AUD ex GST\): \$43\.18/);assert.match(pdf,/Not priced/);assert.match(pdf,/All prices and values exclude GST/);
 const plain=(await methods().pdf({...example(),includeCostings:false}).text()).replace(/\\([()\\])/g,'$1');assert.doesNotMatch(plain,/Pack price|Equivalent unit cost|On-hand value|Known on-hand value|each per pack/);
});
