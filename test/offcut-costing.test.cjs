const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../workshop-stock.js'),'utf8');
const walk=n=>!n||typeof n!=='object'?[]:[n,...(n.children||[]).flat(Infinity).flatMap(walk)];
const areaSource=(patch={})=>({sourceItemId:'variant:white',sourceName:'White ACP full panel',sourceWidth:2400,sourceHeight:1200,sourceCostBasis:'unit',sourceUnitCost:120,sourcePackCost:null,sourcePackSize:1,offcutWidth:1200,offcutHeight:600,ratePerM2:120/2.88,effectiveUnitCost:30,...patch});
const choices=()=>[{id:'variant:white',name:'White ACP full panel',width:2400,height:1200,ratePerM2:120/2.88,priced:true},{id:'variant:small',name:'Small matching panel',width:1200,height:1200,ratePerM2:50,priced:true},{id:'variant:unpriced',name:'Unquoted matching panel',width:3000,height:1500,ratePerM2:null,priced:false}];
const fixture=()=>({revision:12,movements:[],items:[
 {id:'offcut:cut',legacy:true,name:'White ACP offcut',sku:'CUT',category:'offcuts',unit:'sheets',color:'White',material:'ACP',thickness:3,width:1200,height:600,qty:3,reserved:1,available:2,onOrder:0,reorderLevel:0,unitCost:9,costBasis:'area',costSourceItemId:'',areaCost:areaSource(),areaCostStatus:'resolved',areaCostSources:choices()},
 {id:'variant:white',legacy:true,name:'White ACP full panel',sku:'FULL',category:'panels',unit:'sheets',qty:0,reserved:0,available:0,unitCost:120,costBasis:'unit',width:2400,height:1200},
 {id:'manual',name:'Workshop extrusion offcut',category:'offcuts',unit:'lengths',qty:4,reserved:0,available:4,unitCost:5,costBasis:'unit'}
]});
function harness(){
 const states=[],sent=[],exports=[],storage=new Map();let cursor=0;
 const React={createElement:(type,props,...children)=>({type,props:props||{},children}),useState:v=>{const i=cursor++;if(!(i in states))states[i]=typeof v==='function'?v():v;return [states[i],v=>states[i]=typeof v==='function'?v(states[i]):v];},useEffect(){},Fragment:'fragment'};
 const context={window:{},TextEncoder,Blob,atob,crypto:{randomUUID:()=> 'offcut-cost-mutation'},PanelStock:{username:'admin',apiFetch:async(url,options)=>{if(options)sent.push(JSON.parse(options.body));return {ok:true,json:async()=>states[0]};}},localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)},document:{addEventListener(){},createElement:()=>({click(){},remove(){}}),body:{appendChild(){}}},URL:{createObjectURL:()=> 'blob:offcut-report',revokeObjectURL(){}},setTimeout(){return 0;}};
 vm.runInNewContext(source,context);const C=context.window.createWorkshopStock(React),render=()=>{cursor=0;return walk(C({isAdmin:true,workerUrl:'/api'}));};render();states[0]=fixture();
 context.window.PanelStockStocktakeReport.soh={xlsx:s=>{exports.push(s);return new Blob(['xlsx']);},pdf:s=>{exports.push(s);return new Blob(['pdf']);}};
 const node=label=>render().find(n=>n.props['aria-label']===label),button=label=>render().find(n=>n.type==='button'&&n.children.includes(label)),control=key=>walk(render().find(n=>n.type==='label'&&n.props.key===key)).find(n=>n.type==='input'||n.type==='select');
 return {states,render,node,button,control,set(key,value){control(key).props.onChange({target:{value}});},check(label,checked){node(label).props.onChange({target:{checked}});},openItem(name){node('Stock action for '+name).props.onChange({target:{value:'metadata'}});},openExport(){node('Export SOH').props.onClick();},download(format='Excel'){button('Download '+format).props.onClick();return exports.at(-1);},async save(){await render().find(n=>n.type==='form').props.onSubmit({preventDefault(){}});return sent.at(-1);}};
}

test('only sheet offcuts offer area pricing and the source picker shows dimensions, precise ex-GST rates and unpriced sheets',async()=>{
 const x=harness(),before=structuredClone(x.states[0]);x.openItem('White ACP offcut');
 assert.equal(x.control('costBasis').props.value,'area');assert.ok(walk(x.control('costBasis')).some(n=>n.type==='option'&&n.props.value==='area'));
 assert.equal(x.control('unitCost'),undefined);assert.equal(x.control('packCost'),undefined);assert.equal(x.control('costSourceItemId').props.value,'');
 const options=walk(x.control('costSourceItemId')).filter(n=>n.type==='option');assert.equal(options[0].props.value,'');assert.match(options[0].children.join(''),/Automatic/);
 assert.match(options[1].children.join(''),/White ACP full panel.*2400 × 1200 mm.*41\.66666667.*ex GST/);assert.match(options.at(-1).children.join(''),/Unquoted matching panel.*Not priced/);
 x.set('costSourceItemId','variant:small');const payload=await x.save();assert.equal(payload.action,'metadata');assert.equal(payload.itemId,'offcut:cut');assert.equal(payload.costBasis,'area');assert.equal(payload.costSourceItemId,'variant:small');assert.equal(payload.unit,'sheets');assert.equal(payload.unitCost,9);assert.deepEqual(x.states[0],before);
 for(const name of ['White ACP full panel','Workshop extrusion offcut']){x.openItem(name);assert.ok(!walk(x.control('costBasis')).some(n=>n.type==='option'&&n.props.value==='area'));assert.equal(x.control('costSourceItemId'),undefined);}
});

test('switching manual offcut prices to area mode and back preserves the independently entered unit price',async()=>{
 const x=harness();Object.assign(x.states[0].items[0],{costBasis:'unit',unitCost:7.89});x.openItem('White ACP offcut');assert.equal(x.control('unitCost').props.value,7.89);
 x.set('unitCost','8.91');x.set('costBasis','area');assert.equal(x.control('unitCost'),undefined);assert.equal(x.control('costSourceItemId').props.value,'');
 x.set('costSourceItemId','variant:white');x.set('costBasis','unit');assert.equal(x.control('unitCost').props.value,'8.91');x.set('costBasis','area');assert.equal(x.control('costSourceItemId').props.value,'variant:white');
 const payload=await x.save();assert.equal(payload.unitCost,'8.91');assert.equal(payload.costBasis,'area');assert.equal(payload.costSourceItemId,'variant:white');assert.equal(x.states[0].items[0].qty,3);assert.equal(x.states[0].items[0].reserved,1);
});

test('unresolved area pricing explains an ambiguous source and a missing matching panel',()=>{
 const x=harness();Object.assign(x.states[0].items[0],{areaCost:null,areaCostStatus:'needs_source'});x.openItem('White ACP offcut');
 assert.ok(x.render().some(n=>n.type==='p'&&n.children.join('').includes('different rates per m²')));
 x.states[0].items[0].areaCostSources=[];x.states[0].items[0].areaCostStatus='no_matching_source';assert.ok(x.render().some(n=>n.type==='p'&&n.children.join('').includes('Add a matching full panel and its price')));
});

test('costed SOH snapshots carry exact source inputs; quantity-only exports omit every area or monetary field',()=>{
 const x=harness();x.openExport();x.check('Include costings',true);const snapshot=x.download('PDF'),row=snapshot.rows.find(r=>r.itemId==='offcut:cut');
 assert.equal(row.costBasis,'area');assert.equal(row.areaCost.sourceUnitCost,120);assert.equal(row.areaCost.sourceWidth,2400);assert.equal(row.areaCost.offcutWidth,1200);assert.equal(row.qty,3);assert.equal(row.reserved,1);assert.equal(row.available,2);assert.equal(row.unit,'sheets');
 x.check('Include costings',false);for(const r of x.download().rows)for(const key of ['unitCost','packCost','costBasis','packSize','effectiveUnitCost','lineValue','areaCost','areaCostStatus','areaRatePerM2','unitAreaM2'])assert.equal(Object.hasOwn(r,key),false,key);
});

function methods(){const context={window:{},TextEncoder,Blob,atob};vm.runInNewContext(source,context);return context.window.PanelStockStocktakeReport.soh;}
const reportRow=(id='offcut:cut',patch={})=>({itemId:id,sku:'CUT',name:'White ACP offcut',category:'Offcuts',unit:'sheets',qty:3,reserved:1,available:2,onOrder:0,reorderLevel:0,status:'In stock',costBasis:'area',unitCost:99,packCost:null,packSize:1,width:1200,height:600,areaCost:areaSource(),areaCostStatus:'resolved',...patch});
const example=(rows=[reportRow()])=>({kind:'soh',name:'Offcut valuation',generatedAt:'2026-11-02T00:00:00Z',revision:12,categories:['Offcuts'],supplier:'All suppliers',includeCostings:true,rows});
const near=(actual,expected)=>assert.ok(Math.abs(actual-expected)<=Math.abs(expected)*1e-12,actual+' should equal '+expected);
function unzip(bytes){let offset=0;const files={};while(bytes.readUInt32LE(offset)===0x04034b50){const size=bytes.readUInt32LE(offset+18),length=bytes.readUInt16LE(offset+26),name=bytes.subarray(offset+30,offset+30+length).toString();files[name]=bytes.subarray(offset+30+length,offset+30+length+size).toString();offset+=30+length+size;}return files;}

test('area valuation derives square-metre and individual offcut costs from full-sheet inputs without mutating counts',()=>{
 const input=example(),before=structuredClone(input),report=methods().prepare(input),row=report.rows[0];near(row.areaRatePerM2,120/2.88);near(row.unitAreaM2,.72);assert.equal(row.effectiveUnitCost,30);assert.equal(row.lineValue,90);assert.equal(report.costSummary.totalValue,90);assert.equal(report.costSummary.taxBasis,'exGST');assert.equal(report.costSummary.currency,'AUD');assert.equal(report.costSummary.pricedItems,1);assert.equal(report.costSummary.unpricedItems,0);assert.deepEqual(input,before);
 assert.deepEqual([row.qty,row.unit,row.reserved,row.available,row.onOrder],[3,'sheets',1,2,0]);
 const packed=methods().prepare(example([reportRow('packed',{areaCost:areaSource({sourceCostBasis:'pack',sourcePackCost:1200,sourcePackSize:10,sourceUnitCost:999})})])).rows[0];assert.equal(packed.lineValue,90);assert.equal(packed.effectiveUnitCost,30);near(packed.areaRatePerM2,row.areaRatePerM2);
});

test('decimal and scientific dimensions retain precision until the complete on-hand line is rounded',()=>{
 const decimal=areaSource({sourceWidth:.3,sourceHeight:.7,sourceUnitCost:.21,offcutWidth:.1,offcutHeight:.1,ratePerM2:1,effectiveUnitCost:999});
 const tiny=areaSource({sourceWidth:1e-4,sourceHeight:1e-3,sourceUnitCost:1,offcutWidth:1e-5,offcutHeight:1e-4});
 const report=methods().prepare(example([reportRow('decimal',{areaCost:decimal}),reportRow('tiny',{areaCost:tiny}),reportRow('half-cent',{qty:.5,areaCost:areaSource({sourceWidth:3000,sourceHeight:1000,sourceUnitCost:.03,offcutWidth:1000,offcutHeight:1000})})]));
 assert.deepEqual(Array.from(report.rows,r=>r.lineValue),[.03,.03,.01]);near(report.rows[0].areaRatePerM2,1e6);near(report.rows[0].effectiveUnitCost,.01);near(report.rows[1].effectiveUnitCost,.01);assert.equal(report.costSummary.totalValue,.07);
});

test('unresolved area sources stay unpriced instead of falling back to old manual prices, while a free source remains priced',()=>{
 const rows=[reportRow('ambiguous',{areaCost:null,areaCostStatus:'needs_source'}),reportRow('free',{areaCost:areaSource({sourceUnitCost:0,ratePerM2:0,effectiveUnitCost:0})}),reportRow('missing-pack',{areaCost:areaSource({sourceCostBasis:'pack',sourcePackCost:null,sourcePackSize:10})})];
 const report=methods().prepare(example(rows));assert.deepEqual(Array.from(report.rows,r=>r.lineValue),[null,0,null]);assert.deepEqual(Array.from(report.rows,r=>r.effectiveUnitCost),[null,0,null]);assert.equal(report.rows[1].areaRatePerM2,0);assert.equal(report.costSummary.totalValue,0);assert.equal(report.costSummary.pricedItems,1);assert.equal(report.costSummary.unpricedItems,2);
 const stripped=methods().prepare({...report,includeCostings:false});assert.equal(Object.hasOwn(stripped,'costSummary'),false);for(const row of stripped.rows)for(const key of ['unitCost','packCost','costBasis','packSize','effectiveUnitCost','lineValue','areaCost','areaCostStatus','areaRatePerM2','unitAreaM2'])assert.equal(Object.hasOwn(row,key),false,key);assert.deepEqual(Array.from(stripped.rows,r=>r.qty),[3,3,3]);
});

test('Excel exports actual source dimensions, sheet cost, numeric area rate and offcut area with area-only and mixed layouts',async()=>{
 const files=unzip(Buffer.from(await methods().xlsx(example()).arrayBuffer())),sheet=files['xl/worksheets/sheet1.xml'];assert.match(sheet,/autoFilter ref="A12:T13"/);assert.match(sheet,/>Source full sheet \/ price basis</);assert.match(sheet,/>Full sheet size \(mm\)</);assert.match(sheet,/>Rate \(AUD ex GST \/ m²\)</);assert.match(sheet,/>Area per offcut \(m²\)</);assert.match(sheet,/White ACP full panel \/ variant:white/);assert.match(sheet,/2400 x 1200/);
 for(const [column,value] of [['N',30],['O',90],['R',120],['S',120/2.88],['T',.72]]){const cell=sheet.match(new RegExp('<c r="'+column+'13"[^>]* t="n"><v>([^<]+)</v>'));assert.ok(cell,'numeric '+column+'13');near(Number(cell[1]),value);}
 assert.ok(files['xl/media/lennox-logo.png']);
 const mixed=example([reportRow(),reportRow('pack',{name:'Packed spacers',category:'Extrusions',unit:'each',qty:100,costBasis:'pack',packSize:100,packCost:12.34,areaCost:undefined})]);const mixedSheet=unzip(Buffer.from(await methods().xlsx(mixed).arrayBuffer()))['xl/worksheets/sheet1.xml'];assert.match(mixedSheet,/autoFilter ref="A12:W14"/);assert.match(mixedSheet,/<c r="U13"[^>]* t="n"><v>120<\/v>/);assert.match(mixedSheet,/<c r="W13"[^>]* t="n"><v>0\.72<\/v>/);assert.match(mixedSheet,/Per square metre/);assert.match(mixedSheet,/<v>102\.34<\/v>/);
 const plain=unzip(Buffer.from(await methods().xlsx({...mixed,includeCostings:false}).arrayBuffer()))['xl/worksheets/sheet1.xml'];assert.match(plain,/autoFilter ref="A12:M14"/);assert.doesNotMatch(plain,/Full sheet|Source full sheet|Rate \(AUD|Area per offcut|Unit cost|On-hand value|120\.00|41\.6666/);
});

test('PDF explains full-sheet cost, rate, offcut area and counted stock value in AUD excluding GST',async()=>{
 const pdf=(await methods().pdf(example()).text()).replace(/\\([()\\])/g,'$1');assert.match(pdf,/Source full sheet: White ACP full panel \/ 2400 x 1200 mm/);assert.match(pdf,/Full-sheet cost \(AUD ex GST\): \$120\.00/);assert.match(pdf,/Rate \(AUD ex GST \/ m2\): \$41\.666666666667/);assert.match(pdf,/Area per offcut: 0\.72 m2/);assert.match(pdf,/Equivalent offcut cost \(AUD ex GST\): \$30\.00/);assert.match(pdf,/On-hand value \(AUD ex GST\): \$90\.00/);assert.match(pdf,/All prices and values exclude GST/);
 const packed=(await methods().pdf(example([reportRow('packed',{areaCost:areaSource({sourceCostBasis:'pack',sourcePackCost:1200,sourcePackSize:10})})])).text()).replace(/\\([()\\])/g,'$1');assert.match(packed,/Full-sheet cost \(AUD ex GST\): \$120\.00/);assert.match(packed,/On-hand value \(AUD ex GST\): \$90\.00/);
 const plain=(await methods().pdf({...example(),includeCostings:false}).text()).replace(/\\([()\\])/g,'$1');assert.doesNotMatch(plain,/Source full sheet|Full-sheet cost|Area per offcut|Equivalent offcut cost|On-hand value|41\.666/);
});
