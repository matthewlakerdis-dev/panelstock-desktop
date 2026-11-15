const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../workshop-stock.js'),'utf8');
const walk=n=>!n||typeof n!=='object'?[]:[n,...(n.children||[]).flat(Infinity).flatMap(walk)];
const stock=()=>({revision:7,categories:{extrusions:'Extrusions',fixings:'Fixings',consumables:'Consumables',other:'Other',panels:'Panels',offcuts:'Offcuts'},stockReferences:[],items:[{id:'angle',name:'Warehouse angle',sku:'OUR-ANGLE',category:'extrusions',unit:'lengths',qty:7,reserved:2,available:5,colour:'Black',lengthMm:6000,dimensions:'30 x 30',unitCost:12},{id:'variant:sheet',name:'Sheet',category:'panels',legacy:true,unit:'sheets',qty:4},{id:'cut',name:'Offcut',category:'offcuts',unit:'lengths',qty:1}]});
const documentResult=()=>({ok:true,supplier:'Metals supplier',warnings:['Check the tape unit.'],lines:[{sku:'SUP-ANGLE',description:'Black angle',colour:'Black',dimensions:'30 x 30',lengthMm:6000,unit:'lengths',category:'extrusions',supplier:''},{sku:'TAPE',description:'Protective tape',colour:'',dimensions:'',lengthMm:null,unit:'rolls',category:'consumables',supplier:''},{sku:'IGNORE',description:'Excluded item',colour:'',dimensions:'',lengthMm:null,unit:'each',category:'other',supplier:''}]});
const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function harness({saved=null,admin=true,result=documentResult()}={}){
 const states=[],effects=[],requests=[],store=new Map(saved?[['panelstock:material-import-pending:/api:tester',JSON.stringify(saved)]]:[]),callbacks=[];let cursor=0,view=stock();
 const React={createElement:(type,props,...children)=>({type,props:props||{},children}),useState:value=>{const i=cursor++;if(!(i in states))states[i]=typeof value==='function'?value():value;return [states[i],value=>states[i]=typeof value==='function'?value(states[i]):value];},useEffect:fn=>effects.push(fn),Fragment:'fragment'};
 const context={window:{},TextEncoder,Blob,atob,crypto:{randomUUID:()=> 'material-import-12345678'},PanelStock:{username:'tester'},FileReader:class{readAsDataURL(){this.result='data:application/pdf;base64,JVBERi0xLjc=';this.onload();}},localStorage:{getItem:key=>store.get(key)||null,setItem:(key,value)=>store.set(key,value),removeItem:key=>store.delete(key)}};
 let handler=async(url,body)=>({ok:true,json:async()=>url.endsWith('/analyse')?result:{...view,revision:8,importSummary:{created:1,matched:1}}});
 context.PanelStock.apiFetch=async(url,options)=>{const body=options?JSON.parse(options.body):undefined;requests.push({url,body});return handler(url,body);};
 vm.runInNewContext(source,context);const C=context.window.createMaterialCatalogueImport(React),render=()=>{cursor=0;effects.length=0;return walk(C({workerUrl:'/api',isAdmin:admin,data:view,onSaved:value=>callbacks.push(value),onClose:()=>callbacks.push('close')}));};render();effects[1]();await tick();
 const row=key=>render().find(n=>n.props['data-import-row']===String(key)),button=label=>render().find(n=>n.type==='button'&&n.children.includes(label)),field=(key,label)=>walk(row(key)).find(n=>n.type==='label'&&n.children.includes(label)),control=(key,label)=>walk(field(key,label)).find(n=>n.type==='input'||n.type==='select');
 return {context,requests,store,callbacks,states,render,row,button,control,setHandler:value=>handler=value,choose(key,mode){control(key,'Action').props.onChange({target:{value:mode}});},set(key,label,value){control(key,label).props.onChange({target:{value}});},confirm(){render().find(n=>n.props.className==='ws-po-import-confirm').children[0].props.onChange({target:{checked:true}});},async upload(name='materials.pdf',size=8){await render().find(n=>n.type==='input'&&n.props.type==='file').props.onChange({target:{files:[{name,size}],value:''}});},async submit(){await button(saved?'Retry saved import':'Import reviewed materials').props.onClick();}};
}
function prepare(x){
 walk(x.row(0)).find(n=>n.props.className==='ws-po-suggestion').props.onClick();
 x.choose(1,'create');x.choose(2,'skip');x.confirm();
}
test('PDF review matches existing stock, creates selected zero-stock materials and skips unchecked rows',async()=>{
 const x=await harness();await x.upload();assert.equal(x.requests.length,1);assert.equal(x.requests[0].url,'/api/material-catalogue/analyse');assert.deepEqual(Object.keys(x.requests[0].body),['name','data']);
 assert.equal(x.button('Import reviewed materials').props.disabled,true);prepare(x);assert.equal(x.button('Import reviewed materials').props.disabled,false);
 await x.submit();const body=x.requests[1].body;assert.equal(body.action,'catalogue_import');assert.equal(body.expectedRevision,7);assert.equal(body.rows.length,2);assert.equal(body.rows[0].itemId,'angle');assert.equal(body.rows[0].remember,true);assert.equal(body.rows[0].source.sku,'SUP-ANGLE');assert.equal(body.rows[0].item,undefined);assert.equal(body.rows[1].mode,'create');assert.equal(body.rows[1].item.qty,0);assert.equal(body.rows[1].item.unit,'rolls');assert.equal(body.rows[1].item.unitCost,undefined);assert.ok(!JSON.stringify(body).includes('JVBER'));assert.equal(x.callbacks.length,1);assert.equal(x.store.size,0);
});
test('PDF type/size and read-only permissions reject before the reader request',async()=>{
 const x=await harness();await x.upload('wrong.xlsx');await x.upload('large.pdf',5*1024*1024+1);assert.equal(x.requests.length,0);
 const reader=await harness({admin:false});assert.ok(reader.render().some(n=>n.props.role==='alert'));assert.ok(!reader.render().some(n=>n.type==='input'));assert.equal(reader.requests.length,0);
});
test('matching search spans stock fields and excludes panels/offcuts',async()=>{
 const x=await harness();await x.upload();x.choose(0,'match');x.set(0,'Find current stock','Warehouse Black');const options=walk(x.control(0,'Current stock item')).filter(n=>n.type==='option');assert.ok(options.some(n=>n.props.value==='angle'));assert.ok(!options.some(n=>['variant:sheet','cut'].includes(n.props.value)));
});
test('supplier changes clear prior selections and review while unknown units must be chosen',async()=>{
 const result=documentResult();result.lines[1].unit='';const x=await harness({result});await x.upload();prepare(x);assert.equal(x.button('Import reviewed materials').props.disabled,true);x.set(1,'Stock unit','rolls');x.confirm();assert.equal(x.button('Import reviewed materials').props.disabled,false);
 const field=x.render().find(n=>n.type==='label'&&n.children.includes('Default supplier'));walk(field).find(n=>n.type==='input').props.onChange({target:{value:'Other supplier'}});assert.equal(x.control(0,'Action').props.value,'review');assert.equal(x.render().find(n=>n.props.className==='ws-po-import-confirm').children[0].props.checked,false);
});
test('duplicate stock variants and duplicate source rows require review before any save',async()=>{
 const result=documentResult();result.lines[1]={...result.lines[0]};const x=await harness({result});await x.upload();x.choose(0,'create');x.choose(1,'create');x.choose(2,'skip');x.confirm();assert.equal(x.button('Import reviewed materials').props.disabled,true);assert.ok(x.render().some(n=>n.children.includes('This supplier row is repeated in the PDF. Skip the duplicate row.')));assert.equal(x.requests.length,1);
});
test('an uncertain save retains and retries the exact original import once',async()=>{
 const x=await harness();await x.upload();prepare(x);x.setHandler(async()=>({ok:false,status:503,json:async()=>({error:'Unavailable'})}));await x.submit();const original=x.requests[1].body;assert.ok(x.button('Retry saved import'));assert.equal(x.store.size,1);
 x.setHandler(async()=>({ok:true,json:async()=>({...stock(),revision:8})}));await x.button('Retry saved import').props.onClick();assert.deepEqual(x.requests[2].body,original);assert.equal(x.store.size,0);assert.equal(x.callbacks.length,1);
});
test('stock conflict clears confirmation and requires a fresh review without silently resubmitting',async()=>{
 const x=await harness();await x.upload();prepare(x);x.setHandler(async()=>({ok:false,status:409,json:async()=>({error:'Stock changed'})}));await x.submit();assert.equal(x.store.size,0);assert.equal(x.button('Import reviewed materials').props.disabled,true);assert.ok(x.button('Refresh stock matches'));
 x.setHandler(async()=>({ok:true,json:async()=>({...stock(),revision:8})}));await x.button('Refresh stock matches').props.onClick();assert.equal(x.control(0,'Action').props.value,'review');assert.equal(x.requests.filter(r=>r.body?.action==='catalogue_import').length,1);assert.equal(x.button('Import reviewed materials').props.disabled,true);
});
test('saved imports recover after reopening and malformed recovery stays blocked',async()=>{
 const saved={action:'catalogue_import',fileName:'materials.pdf',expectedRevision:7,mutationId:'saved-material-import-1',rows:[{key:'0',mode:'match',source:{sku:'SUP',description:'Angle'},itemId:'angle'}]};const x=await harness({saved});assert.ok(x.button('Retry saved import'));await x.submit();assert.deepEqual(x.requests[0].body,saved);
 const corrupt=await harness({saved:{action:'catalogue_import'}});assert.ok(corrupt.render().some(n=>n.children.some(c=>typeof c==='string'&&c.includes('saved import could not be recovered'))));assert.equal(corrupt.requests.length,0);assert.equal(corrupt.render().find(n=>n.type==='input'&&n.props.type==='file').props.disabled,true);
});
test('existing supplier alias versions are sent with a confirmed match',async()=>{
 const x=await harness();const sourceRow=documentResult().lines[0],key=x.context.window.purchaseOrderStockKey('Metals supplier',sourceRow);x.states[0].stockReferences=[{key,source:sourceRow,supplier:'Metals supplier',itemId:'angle',itemIdentity:x.context.window.purchaseOrderItemIdentity(x.states[0].items[0]),version:3}];await x.upload();x.choose(1,'skip');x.choose(2,'skip');x.confirm();await x.submit();assert.equal(x.requests[1].body.rows[0].expectedReferenceVersion,3);assert.equal(x.requests[1].body.rows[0].expectedItemIdentity,x.context.window.purchaseOrderItemIdentity(stock().items[0]));
});

test('existing profiles keep shared definitions and require a distinct variant for creation',async()=>{
 const result=documentResult();result.lines[0].sku='OUR-ANGLE';const x=await harness({result});await x.upload();x.choose(0,'create');x.choose(1,'skip');x.choose(2,'skip');x.confirm();assert.equal(x.button('Import reviewed materials').props.disabled,true);assert.ok(x.render().some(n=>n.children.includes('This code, colour and length already exists. Match the current stock item.')));
 assert.equal(x.control(0,'Material name').props.value,'Warehouse angle');for(const label of ['Material name','Category','Stock unit','Dimensions / profile'])assert.equal(x.control(0,label).props.disabled,true);
 x.set(0,'Colour / finish','White');x.confirm();assert.equal(x.button('Import reviewed materials').props.disabled,false);await x.submit();assert.equal(x.requests[1].body.rows[0].item.name,'Warehouse angle');assert.equal(x.requests[1].body.rows[0].item.qty,0);
});

test('blank source rows and conflicting new profiles are blocked before saving',async()=>{
 const result=documentResult();result.lines[0]={...result.lines[0],sku:'',description:''};const x=await harness({result});await x.upload();x.choose(0,'create');x.set(0,'Material name','Manually named material');x.choose(1,'skip');x.choose(2,'skip');x.confirm();assert.equal(x.button('Import reviewed materials').props.disabled,true);assert.ok(x.render().some(n=>n.children.includes('No code or description was read. Skip this row and add it manually.')));
 const repeated=documentResult();repeated.lines[0].sku='NEW';repeated.lines[1].sku='NEW';const y=await harness({result:repeated});await y.upload();y.choose(0,'create');y.choose(1,'create');y.choose(2,'skip');y.confirm();assert.ok(y.render().some(n=>n.children.includes('New variants with this code must use the same material name, category, stock unit and profile dimensions.')));assert.equal(y.requests.length,1);
});
