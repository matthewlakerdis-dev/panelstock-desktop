const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../workshop-stock.js'),'utf8');
const walk=n=>!n||typeof n!=='object'?[]:[n,...(n.children||[]).flat(Infinity).flatMap(walk)];
function harness(admin=false,factory='createPurchaseOrderReceiving'){
 const states=[],saved=new Map(),requests=[];let cursor=0;
 const React={createElement:(type,props,...children)=>({type,props:props||{},children}),useState:v=>{const i=cursor++;if(!(i in states))states[i]=typeof v==='function'?v():v;return [states[i],v=>states[i]=typeof v==='function'?v(states[i]):v];},useEffect(){},Fragment:'fragment'};
 const context={window:{},crypto:{randomUUID:()=> '12345678-1234-4234-a234-123456789012'},PanelStock:{username:'tester',apiFetch:async(url,options)=>{requests.push({url,body:JSON.parse(options.body)});return {ok:true,json:async()=>({...states[1],orderId:'po'})};}},localStorage:{getItem:k=>saved.get(k)||null,setItem:(k,v)=>saved.set(k,v),removeItem:k=>saved.delete(k)}};
 vm.runInNewContext(source,context);const Component=context.window[factory](React);
 const render=()=>{cursor=0;return walk(Component({isAdmin:admin,workerUrl:'https://api.test',taskAccess:{'factory.receive':true,'factory.stock':true}}));};
 render();return {states,saved,requests,render,context};
}
const order={id:'po',reference:'PO-42',supplier:'Supplier',status:'partial',version:4,notes:'',attachments:[{id:'pdf',name:'PO.pdf'}],receipts:[],lines:[{itemId:'angle',name:'Angle',sku:'ANG',unit:'lengths',ordered:10,received:3}]};
const stock=[{id:'black',name:'Angle',sku:'ANG',colour:'Black',lengthMm:6000,unit:'lengths'},{id:'white',name:'Angle',sku:'ANG',colour:'White',lengthMm:6000,unit:'lengths'}];
test('matching does not choose between colour variants or conflicting source attributes',()=>{
 const x=harness(true),match=x.context.window.matchPurchaseOrderLine;
 assert.equal(match({sku:'ANG'},stock).itemId,'');assert.equal(match({sku:'ANG',colour:'Black',lengthMm:6000},stock).itemId,'black');
 assert.equal(match({sku:'ANG',colour:'Red'},stock).itemId,'');assert.equal(match({sku:'ANG',lengthMm:3000},stock).itemId,'');assert.equal(match({description:'Angle Black'},stock).itemId,'');
});
test('duplicate PO resets the reference and retains only editable supplier and ordered items',async()=>{
 const x=harness(true);let nodes=open(x);nodes.find(n=>n.children.includes('Duplicate PO')).props.onClick();nodes=x.render();
 const ref=nodes.find(n=>n.type==='input'&&n.props.placeholder==='e.g. PO-2026-104');assert.equal(ref.props.value,'');
 ref.props.onChange({target:{value:'PO-NEW'}});nodes=x.render();await nodes.find(n=>n.children.includes('Save draft')).props.onClick();
 const body=x.requests[0].body;assert.equal(body.reference,'PO-NEW');assert.equal(body.expectedVersion,0);assert.notEqual(body.orderId,'po');assert.equal(body.lines[0].ordered,10);assert.equal(body.receipts,undefined);assert.equal(body.attachments,undefined);assert.equal(body.issues,undefined);
});
test('uploaded document is reviewed before save, attached, then explicitly released',async()=>{
 const x=harness(true),calls=[];x.states[1]={orders:[],items:stock,restoreEpoch:0};let saved;
 x.context.FileReader=class{readAsDataURL(){this.result='data:application/pdf;base64,JVBERi0xLjc=';this.onload();}};
 x.context.PanelStock.apiFetch=async(url,options)=>{const body=JSON.parse(options.body);calls.push({url,body});let value;
  if(url.endsWith('/analyse'))value={reference:'PO-IMPORTED',supplier:'Supplier',notes:'',warnings:[],lines:[{sku:'ANG',description:'Black angle',colour:'Black',lengthMm:6000,quantity:4,unit:'lengths'}]};
  else {if(body.action==='save')saved={...order,id:body.orderId,status:'draft',version:1,reference:body.reference,lines:body.lines.map(l=>({...l,name:'Angle',sku:'ANG',unit:'lengths',received:0})),attachments:[],receipts:[]};else if(url.endsWith('/files')){saved.attachments=[{id:body.id,name:body.name}];saved.version++;}else if(body.action==='publish'){saved.status='open';saved.version++;}value={orders:[saved],items:stock,restoreEpoch:0,orderId:saved.id};}return {ok:true,json:async()=>value};};
 let nodes=x.render();nodes.find(n=>n.children.includes('New purchase order')).props.onClick();nodes=x.render();await nodes.find(n=>n.type==='input'&&n.props.type==='file').props.onChange({target:{files:[{name:'PO.pdf',size:8}],value:''}});nodes=x.render();
 assert.equal(calls.length,1);assert.equal(nodes.find(n=>n.children.includes('Save draft')).props.disabled,true);assert.equal(nodes.find(n=>n.children.includes('Use reviewed items')).props.disabled,true);
 nodes.find(n=>n.type==='input'&&n.props.type==='checkbox').props.onChange({target:{checked:true}});nodes=x.render();nodes.find(n=>n.children.includes('Use reviewed items')).props.onClick();nodes=x.render();
 const release=nodes.find(n=>n.children.includes('Save & make available'));assert.equal(release.props.disabled,false);await release.props.onClick();
 assert.equal(calls.length,4);assert.equal(calls[1].body.action,'save');assert.equal(calls[1].body.lines[0].itemId,'black');assert.equal(calls[1].body.lines[0].ordered,4);assert.ok(calls[2].url.endsWith('/files'));assert.equal(calls[3].body.action,'publish');assert.equal(calls[3].body.expectedVersion,2);assert.equal(x.saved.size,0);
});
test('document upload failure leaves a retryable draft and never publishes it',async()=>{
 const x=harness(true),calls=[];x.states[1]={orders:[],items:stock,restoreEpoch:0};let saved,fail=true;
 x.context.FileReader=class{readAsDataURL(){this.result='data:application/pdf;base64,JVBERi0xLjc=';this.onload();}};
 x.context.PanelStock.apiFetch=async(url,options)=>{const body=JSON.parse(options.body);calls.push({url,body});let value;
  if(url.endsWith('/analyse'))value={reference:'PO-RETRY',supplier:'Supplier',lines:[{sku:'ANG',colour:'Black',quantity:4,unit:'lengths'}]};
  else {if(body.action==='save')saved={...order,id:body.orderId,status:'draft',version:1,reference:body.reference,lines:body.lines,attachments:[]};else if(url.endsWith('/files')){if(fail)return {ok:false,status:503,json:async()=>({error:'Temporary upload problem'})};saved.attachments=[{id:body.id,name:body.name}];saved.version++;}value={orders:[saved],items:stock,restoreEpoch:0,orderId:saved.id};}return {ok:true,json:async()=>value};};
 let nodes=x.render();nodes.find(n=>n.children.includes('New purchase order')).props.onClick();nodes=x.render();await nodes.find(n=>n.type==='input'&&n.props.type==='file').props.onChange({target:{files:[{name:'PO.pdf',size:8}],value:''}});nodes=x.render();nodes.find(n=>n.type==='input'&&n.props.type==='checkbox').props.onChange({target:{checked:true}});nodes=x.render();nodes.find(n=>n.children.includes('Use reviewed items')).props.onClick();nodes=x.render();await nodes.find(n=>n.children.includes('Save & make available')).props.onClick();nodes=x.render();
 assert.ok(!calls.some(c=>c.body.action==='publish'));assert.ok(nodes.some(n=>n.children.includes('Retry upload')));const original=calls[2];fail=false;await nodes.find(n=>n.children.includes('Retry upload')).props.onClick();assert.equal(calls[3].url,original.url);assert.equal(calls[3].body.id,original.body.id);assert.ok(!calls.some(c=>c.body.action==='publish'));
});
const issue={id:'issue-1',itemId:'angle',name:'Angle',unit:'lengths',kind:'damaged',quantity:2,notes:'Bent lengths',status:'open',user:'receiver',at:'2026-10-01T05:00:00Z'};
function open(x,value=order){x.states[2]=null;x.states[1]={orders:[value],items:[],restoreEpoch:0};let nodes=x.render();if(!['open','partial'].includes(value.status)){nodes.find(n=>n.type==='select'&&n.props.value==='outstanding').props.onChange({target:{value:'all'}});nodes=x.render();}nodes.find(n=>n.type==='button'&&n.props.className==='ws-po-card').props.onClick();return x.render();}
test('worker reports an issue with its own quantity and notes, without posting a receipt',async()=>{
 const x=harness();let nodes=open(x);assert.ok(!nodes.some(n=>n.children.includes('Close short')));
 nodes.find(n=>n.children.includes('Report delivery issue')).props.onClick();nodes=x.render();
 const field=label=>walk(nodes.find(n=>n.type==='label'&&n.children.includes(label)));
 field('Affected quantity').find(n=>n.type==='input').props.onChange({target:{value:'2'}});nodes=x.render();
 field('What happened?').find(n=>n.type==='textarea').props.onChange({target:{value:'Bent ends rejected'}});nodes=x.render();
 const save=nodes.find(n=>n.children.includes('Save delivery issue'));assert.equal(save.props.disabled,false);await save.props.onClick();
 assert.equal(x.requests[0].body.action,'report_issue');assert.equal(x.requests[0].body.quantity,'2');assert.equal(x.requests[0].body.notes,'Bent ends rejected');assert.equal(x.requests[0].body.itemId,'angle');assert.equal(x.requests[0].body.lines,undefined);
});
test('admin sees close-short balance and must provide a reason; open issues prevent closure',async()=>{
 const x=harness(true);let nodes=open(x,{...order,issues:[issue]});assert.equal(nodes.find(n=>n.children.includes('Close short')).props.disabled,true);
 nodes=open(x,{...order,issues:[{...issue,status:'resolved',resolvedAt:issue.at,resolvedBy:'admin',resolution:'Credit agreed'}]});nodes.find(n=>n.children.includes('Close short')).props.onClick();nodes=x.render();assert.equal(nodes.find(n=>n.children.includes('Confirm close short')).props.disabled,true);
 nodes.find(n=>n.type==='textarea'&&n.props.maxLength===500).props.onChange({target:{value:'Supplier credit agreed'}});nodes=x.render();await nodes.find(n=>n.children.includes('Confirm close short')).props.onClick();assert.equal(x.requests[0].body.action,'close_short');assert.equal(x.requests[0].body.reason,'Supplier credit agreed');
});
test('closed-short POs retain quantities and history but offer no receive or edit actions',()=>{
 const x=harness(true);const nodes=open(x,{...order,status:'closed_short',closedAt:issue.at,closedBy:'admin',closeReason:'No stock available'});
 assert.ok(nodes.some(n=>n.children.includes('No stock available')));assert.ok(!nodes.some(n=>['Edit PO','Review delivery','Report delivery issue'].some(label=>n.children.includes(label))));
});
test('workers see issue photos and timestamps; only admins can resolve',async()=>{
 const value={...order,issues:[issue],attachments:[...order.attachments,{id:'photo',issueId:issue.id,name:'damage.jpg',uploadedBy:'receiver',uploadedAt:issue.at}]};
 const worker=harness();let nodes=open(worker,value);assert.ok(nodes.some(n=>n.children.includes('damage.jpg')));assert.ok(!nodes.some(n=>n.children.includes('Resolve issue')));
 const x=harness(true);nodes=open(x,value);nodes.find(n=>n.children.includes('Resolve issue')).props.onClick();nodes=x.render();nodes.find(n=>n.type==='textarea'&&n.props.placeholder==='e.g. Supplier confirmed replacement on the next delivery').props.onChange({target:{value:'Replacement scheduled'}});nodes=x.render();await nodes.find(n=>n.children.includes('Confirm resolution')).props.onClick();assert.equal(x.requests[0].body.action,'resolve_issue');assert.equal(x.requests[0].body.issueId,issue.id);
});
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
