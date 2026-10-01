const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../workshop-stock.js'),'utf8');
const walk=n=>!n||typeof n!=='object'?[]:[n,...(n.children||[]).flat(Infinity).flatMap(walk)];
function harness(admin=false,factory='createPurchaseOrderReceiving'){
 const states=[],saved=new Map(),requests=[];let cursor=0;
 const React={createElement:(type,props,...children)=>({type,props:props||{},children}),useState:v=>{const i=cursor++;if(!(i in states))states[i]=typeof v==='function'?v():v;return [states[i],v=>states[i]=typeof v==='function'?v(states[i]):v];},useEffect(){},Fragment:'fragment'};
 const context={window:{},crypto:{randomUUID:()=> '12345678-1234-4234-a234-123456789012'},PanelStock:{username:'tester',apiFetch:async(url,options)=>{requests.push({url,body:JSON.parse(options.body)});return {ok:true,json:async()=>({...states[1],orderId:'po'})};}},localStorage:{getItem:k=>saved.get(k)||null,setItem:(k,v)=>saved.set(k,v),removeItem:k=>saved.delete(k)}};
 vm.runInNewContext(source,context);const Component=context.window[factory](React);
 const render=()=>{cursor=0;return walk(Component({isAdmin:admin,workerUrl:'https://api.test',taskAccess:{'factory.receive':true,'factory.stock':true}}));};
 render();return {states,saved,requests,render};
}
const order={id:'po',reference:'PO-42',supplier:'Supplier',status:'partial',version:4,notes:'',attachments:[{id:'pdf',name:'PO.pdf'}],receipts:[],lines:[{itemId:'angle',name:'Angle',sku:'ANG',unit:'lengths',ordered:10,received:3}]};
test('worker reviews the delivery before sending only the quantities actually received',async()=>{
 const x=harness();x.states[1]={orders:[order],items:[],restoreEpoch:0};let nodes=x.render();assert.ok(!nodes.some(n=>n.children.includes('New purchase order')));
 nodes.find(n=>n.type==='button'&&n.props.className==='ws-po-card').props.onClick();nodes=x.render();const input=nodes.find(n=>n.props['aria-label']==='Receive ANG Angle');assert.equal(input.props.max,7);
 input.props.onChange({target:{value:'2'}});nodes=x.render();nodes.find(n=>n.children.includes('Review delivery')).props.onClick();nodes=x.render();
 const confirm=nodes.find(n=>n.children.includes('Confirm receipt — add to stock'));assert.equal(confirm.props.disabled,false);await confirm.props.onClick();
 assert.equal(x.requests.length,1);assert.deepEqual(JSON.parse(JSON.stringify(x.requests[0].body.lines)),[{itemId:'angle',quantity:'2'}]);assert.equal(x.requests[0].body.expectedVersion,4);assert.equal(x.requests[0].body.action,'receive');assert.equal(x.saved.size,0);
});
test('admin cannot release unsaved line changes or a PO without its document',()=>{
 const x=harness(true);x.states[1]={orders:[{...order,status:'draft',attachments:[]}],items:[{id:'angle',name:'Angle',sku:'ANG',unit:'lengths'}],restoreEpoch:0};let nodes=x.render();nodes.find(n=>n.type==='select'&&n.props.value==='outstanding').props.onChange({target:{value:'draft'}});nodes=x.render();nodes.find(n=>n.type==='button'&&n.props.className==='ws-po-card').props.onClick();nodes=x.render();assert.equal(nodes.find(n=>n.children.includes('Make available for receiving')).props.disabled,true);
 x.states[1].orders[0].attachments=[{id:'pdf',name:'PO.pdf'}];nodes=x.render();assert.equal(nodes.find(n=>n.children.includes('Make available for receiving')).props.disabled,false);
 nodes.find(n=>n.props['aria-label']==='Ordered quantity for ANG').props.onChange({target:{value:'20'}});nodes=x.render();assert.equal(nodes.find(n=>n.children.includes('Make available for receiving')).props.disabled,true);
});
test('bulk edit applies only checked fields to selected stock IDs',async()=>{
 const x=harness(true,'createWorkshopStock');x.states[0]={revision:2,items:[{id:'angle',name:'Angle',sku:'ANG',category:'extrusions',qty:2,available:2,reserved:0,unit:'lengths'}],movements:[]};let nodes=x.render();nodes.find(n=>n.props['aria-label']==='Select Angle ANG').props.onChange({target:{checked:true}});nodes=x.render();nodes.find(n=>n.children.includes('Bulk edit')).props.onClick();nodes=x.render();
 const supplier=nodes.find(n=>n.type==='div'&&n.props.className==='ws-bulk-field'&&walk(n).some(c=>c.type==='label'&&c.children.includes('Supplier')));walk(supplier).find(n=>n.type==='input'&&n.props.type==='checkbox').props.onChange({target:{checked:true}});nodes=x.render();nodes.find(n=>n.props['aria-label']==='Supplier').props.onChange({target:{value:'New supplier'}});nodes=x.render();
 const form=nodes.find(n=>n.type==='form');assert.ok(form);await form.props.onSubmit({preventDefault(){}});
 assert.deepEqual(JSON.parse(JSON.stringify(x.requests[0].body.changes)),{supplier:'New supplier'});assert.deepEqual(JSON.parse(JSON.stringify(x.requests[0].body.itemIds)),['angle']);assert.equal(x.requests[0].body.expectedRevision,2);
});
test('admin editing an issued PO exposes save changes and protects received lines',()=>{
 const x=harness(true);x.states[1]={orders:[order],items:[{id:'angle',name:'Angle',sku:'ANG',unit:'lengths'}],restoreEpoch:0};let nodes=x.render();nodes.find(n=>n.type==='button'&&n.props.className==='ws-po-card').props.onClick();nodes=x.render();nodes.find(n=>n.children.includes('Edit PO')).props.onClick();nodes=x.render();assert.ok(nodes.some(n=>n.children.includes('Save changes')));assert.equal(nodes.find(n=>n.children.includes('Remove')).props.disabled,true);assert.equal(nodes.find(n=>n.props['aria-label']==='Ordered quantity for ANG').props.min,3);assert.ok(!nodes.some(n=>n.children.includes('Review delivery')));
});
