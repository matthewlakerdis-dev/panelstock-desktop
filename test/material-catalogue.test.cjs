const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../workshop-stock.js'),'utf8');
const walk=n=>!n||typeof n!=='object'?[]:[n,...(n.children||[]).flat(Infinity).flatMap(walk)];
const fixture=()=>({revision:7,movements:[],catalog:[{id:'panel-material',material:'ACP',color:'White',thickness:4}],categories:{'cat-custom':'Sealants'},items:[
 {id:'angle',name:'Angle',sku:'ANGLE',category:'extrusions',unit:'lengths',qty:5,reserved:0,available:5,colour:'Black',lengthMm:6000,dimensions:'30 x 30',supplier:'Metals',unitCost:12,reservations:{}},
 {id:'angle-zero',name:'Angle',sku:'ANGLE',category:'extrusions',unit:'lengths',qty:0,reserved:0,available:0,colour:'White',lengthMm:3000,dimensions:'30 x 30',supplier:'Metals',reservations:{}},
 {id:'screw',name:'Screw',sku:'FIX',category:'fixings',unit:'each',qty:100,reserved:0,available:100,supplier:'Fixings',reservations:{},costBasis:'pack',packCost:10,packSize:100},
 {id:'glue',name:'Sealant',sku:'SEAL',category:'cat-custom',unit:'tubes',qty:0,reserved:0,available:0,reservations:{}},
 {id:'variant:panel',name:'Panel',category:'panels',legacy:true,unit:'sheets',qty:3,reserved:0,available:3},
 {id:'offcut:piece',name:'Sheet offcut',category:'offcuts',legacy:true,unit:'sheets',qty:1,reserved:0,available:1},
 {id:'workshop-cut',name:'Angle offcut',category:'offcuts',unit:'lengths',qty:1,reserved:0,available:1},
 {id:'archived',name:'Archived material',category:'consumables',archivedAt:'2026-01-01',unit:'each',qty:0}
]});
function harness({admin=true,catalogueOnly=true,saved=null}={}){
 const states=[],effects=[],requests=[],storage=new Map(saved?[['panelstock:workshop-pending:tester',JSON.stringify(saved)]]:[]);let cursor=0;
 const React={createElement:(type,props,...children)=>({type,props:props||{},children}),useState:v=>{const i=cursor++;if(!(i in states))states[i]=typeof v==='function'?v():v;return [states[i],v=>states[i]=typeof v==='function'?v(states[i]):v];},useEffect:fn=>effects.push(fn),Fragment:'fragment'};
 const context={window:{},TextEncoder,Blob,atob,crypto:{randomUUID:()=> 'catalogue-mutation'},PanelStock:{username:'tester',apiFetch:async(url,options)=>{if(options)requests.push(JSON.parse(options.body));return {ok:true,json:async()=>states[0]};}},localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},document:{addEventListener(){}},setTimeout(){}};
 vm.runInNewContext(source,context);const C=context.window.createWorkshopStock(React),render=()=>{cursor=0;effects.length=0;return walk(C({isAdmin:admin,taskAccess:{'factory.stock':true},workerUrl:'/api',catalogueOnly}));};render();states[0]=fixture();
 const node=label=>render().find(n=>n.props['aria-label']===label),button=label=>render().find(n=>n.type==='button'&&n.children.includes(label)),control=key=>walk(render().find(n=>n.type==='label'&&n.props.key===key)).find(n=>['input','select'].includes(n.type));
 return {states,effects,requests,context,render,node,button,control,set(key,value){control(key).props.onChange({target:{value}});},card(id){return render().find(n=>n.props['data-material-id']===id);},async save(){await render().find(n=>n.type==='form').props.onSubmit({preventDefault(){}});return requests.at(-1);},async recover(){render();effects[3]();await new Promise(r=>setImmediate(r));}};
}
test('material catalogue uses existing non-panel items, variants and custom categories including zero stock',()=>{
 const x=harness(),before=structuredClone(x.states[0]),nodes=x.render();
 assert.ok(nodes.some(n=>n.children.includes('Material Catalogue')));
 assert.deepEqual(nodes.filter(n=>n.props['data-material-id']).map(n=>n.props['data-material-id']),['angle','angle-zero','screw','glue']);
 for(const label of ['Receive against PO','Stocktake','Add stock item'])assert.ok(!nodes.some(n=>n.children.includes(label)));
 assert.ok(!nodes.some(n=>n.props.className==='ws-summary'));assert.equal(x.requests.length,0);assert.deepEqual(x.states[0],before);
 assert.ok(nodes.some(n=>n.children.some(c=>typeof c==='string'&&c.includes('3 profiles · 4 stocked variants'))));
});
test('catalogue search, category and supplier filters retain the same stock identities',()=>{
 const x=harness();x.node('Material category').props.onChange({target:{value:'cat-custom'}});assert.equal(x.render().filter(n=>n.props['data-material-id']).length,1);assert.ok(x.card('glue'));
 x.node('Material category').props.onChange({target:{value:'all'}});x.node('Material supplier').props.onChange({target:{value:'Metals'}});assert.equal(x.render().filter(n=>n.props['data-material-id']).length,2);
 x.node('Search materials').props.onChange({target:{value:'White'}});assert.ok(x.card('angle-zero'));assert.ok(!x.card('angle'));
});
test('new catalogue material always starts at zero and cannot be created as panels or offcuts',async()=>{
 const x=harness(),before=structuredClone(x.states[0]);x.button('Add material').props.onClick();x.set('name','New profile');x.set('sku','NEW');
 assert.equal(x.control('qty'),undefined);const choices=walk(x.control('category')).filter(n=>n.type==='option').map(n=>n.props.value);assert.ok(!choices.includes('panels'));assert.ok(!choices.includes('offcuts'));
 x.states[8]={...x.states[8],qty:99};const payload=await x.save();assert.equal(payload.action,'create');assert.equal(payload.item.qty,0);assert.equal(payload.expectedRevision,7);assert.equal(payload.item.sku,'NEW');assert.deepEqual(x.states[0],before);
});
test('catalogue editing and new variants reuse current IDs and preserve received quantities',async()=>{
 const x=harness(),before=structuredClone(x.states[0]);walk(x.card('angle')).find(n=>n.children.includes('Edit material')).props.onClick();x.set('supplier','Updated supplier');const payload=await x.save();
 assert.equal(payload.action,'metadata');assert.equal(payload.itemId,'angle');assert.equal(payload.supplier,'Updated supplier');assert.equal(x.states[0].items[0].qty,5);assert.deepEqual(x.states[0],before);
 walk(x.card('angle')).find(n=>n.children.includes('Add variant')).props.onClick();assert.equal(x.control('sku').props.value,'ANGLE');assert.equal(x.control('name').props.disabled,true);x.set('colour','Bronze');const created=await x.save();assert.equal(created.action,'create');assert.equal(created.item.sku,'ANGLE');assert.equal(created.item.qty,0);assert.equal(created.item.colour,'Bronze');
});
test('catalogue readers can browse but cannot create, edit or remove stock definitions',()=>{
 const x=harness({admin:false}),nodes=x.render();assert.equal(nodes.filter(n=>n.props['data-material-id']).length,4);for(const label of ['Add material','Edit material','Add variant','Remove material','Manage categories'])assert.ok(!nodes.some(n=>n.children.includes(label)));assert.equal(x.requests.length,0);
});
test('uncertain stock movements and nonzero opening stock cannot be retried from the catalogue',async()=>{
 for(const saved of [{action:'receive',itemId:'angle',quantity:2,mutationId:'old'},{action:'category_save',categoryId:'offcuts',name:'Renamed',mutationId:'old'},{action:'metadata',itemId:'workshop-cut',name:'Cut',mutationId:'old'},{action:'create',item:{action:'create',category:'extrusions',unit:'lengths',name:'New',qty:10},mutationId:'old'},{action:'create',item:{action:'create',category:'offcuts',unit:'lengths',name:'Offcut',qty:0},mutationId:'old'}]){
  const x=harness({saved});await x.recover();const nodes=x.render();assert.ok(!nodes.some(n=>n.type==='form'));assert.ok(nodes.some(n=>n.children.some(c=>typeof c==='string'&&c.includes('awaiting confirmation in SOH'))));assert.equal(x.button('Add material').props.disabled,true);assert.equal(x.requests.length,0);
 }
});
test('zero-stock catalogue creation retries the saved mutation without creating another item',async()=>{
 const saved={action:'create',item:{action:'create',category:'extrusions',unit:'lengths',name:'New profile',sku:'NEW',qty:0,packSize:1,costBasis:'unit'},expectedRevision:7,mutationId:'original'};
 const x=harness({saved});await x.recover();assert.ok(x.render().some(n=>n.type==='form'));const payload=await x.save();assert.deepEqual(payload,saved);
});
test('SOH retains panels and ordinary stock workflows outside catalogue mode',()=>{
 const x=harness({catalogueOnly:false}),nodes=x.render();assert.ok(nodes.some(n=>n.children.includes('Stock on hand')));assert.ok(nodes.some(n=>n.children.includes('Add stock item')));assert.ok(nodes.some(n=>n.children.includes('Receive against PO')));assert.ok(nodes.some(n=>n.props.className==='ws-summary'));
});
