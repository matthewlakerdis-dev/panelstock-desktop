const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../workshop-stock.js'),'utf8');
const walk=n=>!n||typeof n!=='object'?[]:[n,...(n.children||[]).flat(Infinity).flatMap(walk)];
const fixture=()=>({revision:42,movements:[],items:[
 {id:'angle',name:'Angle priced',sku:'ANG',category:'extrusions',unit:'lengths',qty:2.5,reserved:0.5,available:2,onOrder:4,reorderLevel:1,unitCost:12.34,supplier:'Alpha',location:'Rack A'},
 {id:'rod',name:'Rod unpriced',sku:'ROD',category:'extrusions',unit:'lengths',qty:4,reserved:0,available:4,onOrder:0,reorderLevel:0,supplier:'Beta',location:'Rack B'},
 {id:'free',name:'Free pack',sku:'',category:'fixings',unit:'packs',qty:3,reserved:0,available:3,onOrder:0,reorderLevel:0,unitCost:0},
 {id:'variant:sheet',name:'White ACP panel',sku:'PANEL',legacy:true,category:'panels',unit:'sheets',qty:1,reserved:0,available:1,onOrder:0,reorderLevel:0,color:'White',material:'ACP',thickness:4,width:1200,height:2400,unitCost:25}
]});
function harness(){
 const states=[],sent=[],exports=[],storage=new Map();let cursor=0;
 const React={createElement:(type,props,...children)=>({type,props:props||{},children}),useState:v=>{const i=cursor++;if(!(i in states))states[i]=typeof v==='function'?v():v;return [states[i],v=>states[i]=typeof v==='function'?v(states[i]):v];},useEffect(){},Fragment:'fragment'};
 const context={window:{},TextEncoder,Blob,atob,crypto:{randomUUID:()=> 'cost-test-mutation'},PanelStock:{username:'admin',apiFetch:async(url,options)=>{if(options)sent.push(JSON.parse(options.body));return {ok:true,json:async()=>states[0]};}},localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)},document:{addEventListener(){},createElement:()=>({click(){},remove(){}}),body:{appendChild(){}}},URL:{createObjectURL:()=> 'blob:costing-test',revokeObjectURL(){}},setTimeout(){return 0;}};
 vm.runInNewContext(source,context);const Component=context.window.createWorkshopStock(React),render=()=>{cursor=0;return walk(Component({isAdmin:true,workerUrl:'/api'}));};render();states[0]=fixture();
 context.window.PanelStockStocktakeReport.soh={xlsx:s=>{exports.push(s);return new Blob(['xlsx']);},pdf:s=>{exports.push(s);return new Blob(['pdf']);}};
 const node=label=>render().find(n=>n.props['aria-label']===label),button=label=>render().find(n=>n.type==='button'&&n.children.includes(label));
 return {context,states,sent,exports,render,node,button,field(key){return walk(render().find(n=>n.type==='label'&&n.props.key===key)).find(n=>n.type==='input');},change(label,value){node(label).props.onChange({target:{value}});},check(label,checked){node(label).props.onChange({target:{checked}});},openExport(){node('Export SOH').props.onClick();},download(format='Excel'){button('Download '+format).props.onClick();return exports.at(-1);},openItem(name){node('Stock action for '+name).props.onChange({target:{value:'metadata'}});},async save(){await render().find(n=>n.type==='form').props.onSubmit({preventDefault(){}});return sent.at(-1);}};
}

test('create form has an optional cost per displayed stock unit and preserves blank and zero values',async()=>{
 const x=harness();x.button('Add stock item').props.onClick();let nodes=x.render(),cost=x.field('unitCost');
 assert.equal(cost.props.type,'number');assert.equal(cost.props.min,0);assert.equal(cost.props.step,'0.01');assert.equal(cost.props.required,false);assert.equal(cost.props.value,'');
 assert.ok(nodes.some(n=>n.type==='label'&&n.props.key==='unitCost'&&n.children.includes('Unit cost (AUD / lengths)')));
 x.field('name').props.onChange({target:{value:'New stock'}});let payload=await x.save();assert.equal(payload.action,'create');assert.equal(payload.item.unitCost,'');
 x.button('Add stock item').props.onClick();x.field('name').props.onChange({target:{value:'No charge'}});x.field('unitCost').props.onChange({target:{value:'0'}});payload=await x.save();assert.equal(payload.item.unitCost,'0');
});

test('editing existing costs fills their value and sends entered prices or blank clearing through metadata',async()=>{
 const x=harness();x.openItem('Angle priced');assert.equal(x.field('unitCost').props.value,12.34);
 x.field('unitCost').props.onChange({target:{value:'45.67'}});let payload=await x.save();assert.equal(payload.action,'metadata');assert.equal(payload.itemId,'angle');assert.equal(payload.unitCost,'45.67');
 x.openItem('Angle priced');x.field('unitCost').props.onChange({target:{value:''}});payload=await x.save();assert.equal(payload.unitCost,'');
 x.openItem('Free pack');assert.equal(x.field('unitCost').props.value,0);assert.ok(x.render().some(n=>n.type==='label'&&n.props.key==='unitCost'&&n.children.includes('Unit cost (AUD / packs)')));
});

test('legacy panels expose a unit cost per sheet in the existing metadata editor',async()=>{
 const x=harness();x.openItem('White ACP panel');const cost=x.field('unitCost');assert.equal(cost.props.value,25);assert.equal(cost.props.disabled,false);
 assert.ok(x.render().some(n=>n.type==='label'&&n.props.key==='unitCost'&&n.children.includes('Unit cost (AUD / sheets)')));
 cost.props.onChange({target:{value:'100.25'}});const payload=await x.save();assert.equal(payload.itemId,'variant:sheet');assert.equal(payload.unitCost,'100.25');
});

test('costings are opt-in for every popup opening and off snapshots contain no row prices',()=>{
 const x=harness();x.openExport();assert.equal(x.node('Include costings').props.checked,false);let snapshot=x.download();assert.equal(snapshot.includeCostings,false);assert.ok(snapshot.rows.every(r=>!Object.hasOwn(r,'unitCost')));
 x.check('Include costings',true);assert.equal(x.node('Include costings').props.checked,true);snapshot=x.download('PDF');assert.equal(snapshot.includeCostings,true);assert.equal(snapshot.rows.find(r=>r.itemId==='angle').unitCost,12.34);
 x.button('Close').props.onClick();x.openExport();assert.equal(x.node('Include costings').props.checked,false);snapshot=x.download();assert.equal(snapshot.includeCostings,false);assert.ok(snapshot.rows.every(r=>!Object.hasOwn(r,'unitCost')));
});

test('priced SOH snapshots use only selected filtered rows and distinguish zero from missing costs',()=>{
 const x=harness();x.openExport();x.check('Include costings',true);let snapshot=x.download();assert.equal(snapshot.rows.find(r=>r.itemId==='free').unitCost,0);assert.equal(snapshot.rows.find(r=>r.itemId==='rod').unitCost,null);
 x.button('Clear categories').props.onClick();x.check('Include Extrusions',true);x.change('Export supplier',JSON.stringify('Alpha'));snapshot=x.download('PDF');
 assert.deepEqual(Array.from(snapshot.rows,r=>r.itemId),['angle']);assert.equal(snapshot.rows[0].unitCost,12.34);assert.equal(snapshot.rows[0].qty,2.5);assert.equal(snapshot.rows[0].reserved,0.5);assert.equal(snapshot.rows[0].onOrder,4);assert.equal(snapshot.rows[0].unit,'lengths');
 x.check('Include costings',false);snapshot=x.download();assert.equal(snapshot.includeCostings,false);assert.equal(Object.hasOwn(snapshot.rows[0],'unitCost'),false);
});

test('bulk cost edit is optional and uses a two-decimal number field',()=>{
 const x=harness();x.check('Select Angle priced ANG',true);x.button('Bulk edit').props.onClick();let nodes=x.render(),field=nodes.find(n=>n.props['aria-label']==='Unit cost (AUD)');
 assert.ok(field);assert.equal(field.props.disabled,true);assert.equal(field.props.min,0);assert.equal(field.props.step,'0.01');
 const row=nodes.find(n=>n.props.className==='ws-bulk-field'&&n.props.key==='unitCost');walk(row).find(n=>n.type==='input'&&n.props.type==='checkbox').props.onChange({target:{checked:true}});
 field=x.node('Unit cost (AUD)');assert.equal(field.props.disabled,false);assert.equal(field.props.value,'');
});

function realExports(){const context={window:{},TextEncoder,Blob,atob};vm.runInNewContext(source,context);return context.window.PanelStockStocktakeReport.soh;}
const costingSample=()=>({kind:'soh',name:'Costing example',generatedAt:'2026-11-02T00:00:00Z',revision:42,categories:['Panels','Extrusions'],supplier:'All suppliers',includeCostings:true,rows:[
 {itemId:'half-a',sku:'A',name:'Half cent A',category:'Extrusions',unit:'lengths',qty:0.5,reserved:0.25,available:0.25,onOrder:999,reorderLevel:0,status:'In stock',unitCost:0.01},
 {itemId:'half-b',sku:'B',name:'Half cent B',category:'Extrusions',unit:'lengths',qty:0.5,reserved:0,available:0.5,onOrder:0,reorderLevel:0,status:'In stock',unitCost:0.01},
 {itemId:'pack',sku:'=1+1',name:'Packs',category:'Fixings',unit:'packs',qty:2,reserved:1,available:1,onOrder:25,reorderLevel:0,packSize:100,status:'In stock',unitCost:3.21},
 {itemId:'missing',sku:'',name:'No price',category:'Panels',unit:'sheets',qty:100,reserved:0,available:100,onOrder:0,reorderLevel:0,status:'In stock',unitCost:null},
 {itemId:'free',sku:'',name:'Free item',category:'Fixings',unit:'each',qty:6,reserved:0,available:6,onOrder:0,reorderLevel:0,status:'In stock',unitCost:0}
]});
function unzipStored(bytes){let offset=0;const files={};while(bytes.readUInt32LE(offset)===0x04034b50){const size=bytes.readUInt32LE(offset+18),length=bytes.readUInt16LE(offset+26),name=bytes.subarray(offset+30,offset+30+length).toString();files[name]=bytes.subarray(offset+30+length,offset+30+length+size).toString();offset+=30+length+size;}return files;}

test('cost preparation rounds each line to cents, sums the rounded values and costs on hand rather than available or packs contents',()=>{
 const input=costingSample(),before=structuredClone(input),report=realExports().prepare(input);
 assert.deepEqual(Array.from(report.rows,r=>r.lineValue),[0.01,0.01,6.42,null,0]);assert.equal(report.costSummary.totalValue,6.44);assert.equal(report.costSummary.currency,'AUD');assert.equal(report.costSummary.pricedItems,4);assert.equal(report.costSummary.unpricedItems,1);assert.deepEqual(input,before);
 const off=realExports().prepare({...report,includeCostings:false});assert.equal(Object.hasOwn(off,'costSummary'),false);assert.ok(off.rows.every(r=>!Object.hasOwn(r,'unitCost')&&!Object.hasOwn(r,'lineValue')));
 const tooLarge=costingSample();tooLarge.rows=[{...tooLarge.rows[0],qty:1e9,unitCost:1e9}];assert.throws(()=>realExports().prepare(tooLarge),/too large to export accurately/);
});

test('costing Excel adds AUD prices and on-hand values only when requested while retaining numeric zero and missing-price text',async()=>{
 const methods=realExports(),input=costingSample(),costed=unzipStored(Buffer.from(await methods.xlsx(input).arrayBuffer())),sheet=costed['xl/worksheets/sheet1.xml'];
 assert.match(sheet,/>Unit cost \(AUD\)</);assert.match(sheet,/>On-hand value \(AUD\)</);assert.match(sheet,/autoFilter ref="A12:O17"/);assert.match(sheet,/<c r="N13"[^>]* t="n"><v>0\.01<\/v>/);assert.match(sheet,/<c r="O13"[^>]* t="n"><v>0\.01<\/v>/);assert.match(sheet,/<c r="O15"[^>]* t="n"><v>6\.42<\/v>/);assert.match(sheet,/<c r="N17"[^>]* t="n"><v>0<\/v>/);assert.match(sheet,/>Not priced</);assert.match(sheet,/<v>6\.44<\/v>/);assert.doesNotMatch(sheet,/<f>/);
 const uncosted=unzipStored(Buffer.from(await methods.xlsx({...input,includeCostings:false}).arrayBuffer()))['xl/worksheets/sheet1.xml'];assert.match(uncosted,/autoFilter ref="A12:M17"/);assert.doesNotMatch(uncosted,/Unit cost|On-hand value|Known on-hand value|Not priced/);
});

test('costing PDF shows line prices, a known total and unpriced warning only when enabled',async()=>{
 const methods=realExports(),input=costingSample(),pdf=(await methods.pdf(input).text()).replace(/\\([()\\])/g,'$1');
 assert.match(pdf,/Unit cost \(AUD\)/);assert.match(pdf,/On-hand value \(AUD\)/);assert.match(pdf,/Known on-hand value \(AUD\): \$6\.44/);assert.match(pdf,/Not priced/);assert.match(pdf,/1 item\(s\) not priced/);
 const plain=await methods.pdf({...input,includeCostings:false}).text();assert.doesNotMatch(plain,/Unit cost|On-hand value|Known on-hand value|Not priced/);
});
