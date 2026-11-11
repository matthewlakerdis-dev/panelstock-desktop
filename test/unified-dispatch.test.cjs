const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{webcrypto}=require('node:crypto'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,process.env.UNIFIED_MOBILE?'../../panelstock-app.modern.js':'../index.html'),'utf8');
const code=source.slice(source.indexOf('  function DispatchCenter()'),source.indexOf('  function SiteOrderDispatch('));
const order={id:'o',project:'Project',orderNumber:'007',orderType:'Fixings',siteAddress:'141 Queen Street',status:'completed',ready:true,updatedAt:'v1',items:[{quantity:2,description:'Fixings'}]};
const entry={key:'order:o',kind:'order',project:'Project',orderNumber:'007',orderType:'Fixings',status:'ready',ready:true,reason:'Ready for site',order};
const pending={...entry,key:'order:waiting',orderNumber:'008',status:'waiting',ready:false,reason:'Waiting for production / approval',order:{...order,id:'waiting',status:'approved'}};
const panel={key:'load:l',kind:'load',project:'Project',orderNumber:'009',orderType:'Panels',status:'ready',ready:true,reason:'Ready for powder coaters',load:{id:'l',project:'Project',orderNumber:'009',status:'waiting',ready:true,requiresPowderCoating:true,routing:true,qaComplete:true,siteAddress:'Panel site',items:[{id:'p',reference:'P1'}],legs:[]}};
function nodes(tree){if(Array.isArray(tree))return tree.flatMap(nodes);return tree&&typeof tree==='object'?[tree,...nodes(tree.children),...nodes(tree.props?.action)]:[];}
function text(tree){if(Array.isArray(tree))return tree.map(text).join(' ');return tree&&typeof tree==='object'?text(tree.children):tree==null||typeof tree==='boolean'?'':String(tree);}
const button=(tree,label)=>nodes(tree).find(node=>node.tag==='button'&&node.children.includes(label));
function fixture({entries=[entry,pending,panel],canFinalQa=false,post}={}){
 const data={entries,dispatchVehicles:['Lennox Truck','Lennox Ute'],dispatchDrivers:[{username:'alex',displayName:'Alex'}],dispatchDefaultDriver:'alex',canFinalQa};
 const states=[entries,data,false,false,'','ready','all','',{},null,{}],refs=[],calls=[];let cursor=0,refIndex=0;
 const context={import_react:{createElement:(tag,props,...children)=>({tag,props:props||{},children})},useState:initial=>{const i=cursor++;if(!(i in states))states[i]=initial;return [states[i],value=>{states[i]=typeof value==='function'?value(states[i]):value;}];},useRef:initial=>{const i=refIndex++;return refs[i]||(refs[i]={current:initial});},useEffect:()=>{},crypto:webcrypto,Uint8Array,PanelStock:{username:'alex',confirm:async()=>true,apiFetch:async(url,options)=>{calls.push({url,options,body:options?JSON.parse(options.body):null});return options&&post?post(url,JSON.parse(options.body)):Response.json(data);}},Response,BAKED_WORKER_URL:'https://worker.test',Truck:'truck',PageHeading:'heading',DispatchOrderPdfModal:'pdf-modal'};
 vm.createContext(context);vm.runInContext(code,context);
 return {states,calls,render(){cursor=refIndex=0;return context.DispatchCenter();}};
}
test('Dispatch shows only ready orders; tracking retains waiting orders and history',()=>{
 const view=fixture();let tree=view.render();assert.equal(nodes(tree).filter(n=>n.tag==='article').length,2);
 assert.equal(button(tree,'Site orders'),undefined);assert.equal(button(tree,'Panel loads'),undefined);
 nodes(tree).find(n=>n.tag==='select').props.onChange({target:{value:'Panels'}});tree=view.render();assert.equal(nodes(tree).filter(n=>n.tag==='article').length,1);
 button(view.render(),'Tracking & history').props.onClick();tree=view.render();assert.equal(nodes(tree).filter(n=>n.tag==='article').length,1);assert.equal(button(tree,'Dispatch to site'),undefined);button(tree,'Back to dispatch').props.onClick();assert.equal(nodes(view.render()).filter(n=>n.tag==='article').length,2);
});
test('shared form prefills defaults and submits non-panel orders with the concurrency and retry guards',async()=>{
 const view=fixture();await button(view.render(),'Dispatch to site').props.onClick();let tree=view.render();
 assert.match(text(tree),/Confirm dispatch/);assert.equal(view.states[10].destination,'141 Queen Street');assert.equal(view.states[10].transport,'Lennox Truck');assert.equal(view.states[10].driver,'Alex');
 assert.match(view.states[9].mutationId,/^[a-f0-9]{32}$/);
 await nodes(tree).find(n=>n.tag==='form').props.onSubmit({preventDefault(){}});await new Promise(r=>setImmediate(r));
 const posted=view.calls.find(call=>call.body);assert.equal(posted.url,'https://worker.test/dispatch/orders');assert.equal(posted.body.expectedUpdatedAt,'v1');assert.equal(posted.body.driver,'Alex');assert.ok(posted.body.mutationId);
});
test('milled panels use the load endpoint and cannot select site before powder coating',async()=>{
 const view=fixture();await button(view.render(),'Send to powder coaters').props.onClick();let tree=view.render();
 assert.equal(view.states[10].destinationType,'powder_coaters');assert.equal(view.states[10].destination,'');
 assert.deepEqual(nodes(nodes(tree).find(n=>n.tag==='select'&&n.props.value==='powder_coaters')).filter(n=>n.tag==='option').map(n=>n.props.value),['powder_coaters']);
 view.states[10].destination='Coater';nodes(tree).find(n=>n.tag==='form').props.onSubmit({preventDefault(){}});await new Promise(r=>setImmediate(r));
 const posted=view.calls.find(call=>call.body);assert.equal(posted.url,'https://worker.test/dispatch/panels');assert.equal(posted.body.action,'dispatch');assert.equal(posted.body.destinationType,'powder_coaters');
});
test('a stale ready entry is rechecked and a failed save preserves the entered form',async()=>{
 const view=fixture({post:()=>Response.json({error:'Try again'},{status:503})});await button(view.render(),'Dispatch to site').props.onClick();
 const mutationId=view.states[9].mutationId;nodes(view.render()).find(n=>n.tag==='form').props.onSubmit({preventDefault(){}});await new Promise(r=>setImmediate(r));
 assert.equal(view.states[9].mutationId,mutationId);assert.equal(view.states[10].destination,'141 Queen Street');assert.match(view.states[4],/Try again/);
 const stale=fixture({entries:[pending]});assert.equal(button(stale.render(),'Dispatch to site'),undefined);
});
test('final QA remains a confirmed action shown only to users with QA access',async()=>{
 const final={...panel,status:'waiting',ready:false,reason:'Awaiting final QA',load:{...panel.load,status:'awaiting_final_qa'}};
 const denied=fixture({entries:[final]});button(denied.render(),'Tracking & history').props.onClick();assert.equal(button(denied.render(),'Approve final QA'),undefined);
 const view=fixture({entries:[final],canFinalQa:true});button(view.render(),'Tracking & history').props.onClick();await button(view.render(),'Approve final QA').props.onClick();
 assert.deepEqual(JSON.parse(JSON.stringify(view.calls.find(call=>call.body).body)),{id:'l',action:'final-qa',confirmed:true});
});

test('returned panel loads submit their current revision when dispatching again',async()=>{
 const view=fixture({entries:[{...panel,load:{...panel.load,dispatchRevision:3}}]});await button(view.render(),'Send to powder coaters').props.onClick();view.states[10].destination='Coater';await nodes(view.render()).find(node=>node.tag==='form').props.onSubmit({preventDefault(){}});await new Promise(r=>setImmediate(r));assert.equal(view.calls.find(call=>call.body).body.dispatchRevision,3);
});

test('PDF actions use the exact linked Site Order and stay absent for unlinked factory loads',()=>{
 const linked={...panel,order:{...order,id:'panel-order'}};const view=fixture({entries:[entry,linked,panel]});let tree=view.render();const pdfs=nodes(tree).filter(n=>n.tag==='button'&&n.children.includes('Open PDF'));assert.equal(pdfs.length,2);pdfs[1].props.onClick();tree=view.render();const modal=nodes(tree).find(n=>n.tag==='pdf-modal');assert.equal(modal.props.order.id,'panel-order');assert.deepEqual(view.states[8],{});assert.equal(view.calls.length,0);modal.props.onClose();assert.equal(nodes(view.render()).some(n=>n.tag==='pdf-modal'),false);
});

test('part delivery submits selected quantities and preserves the remaining-balance choices',async()=>{
 const partialOrder={...order,items:[{quantity:10,description:'Fixings'},{quantity:2,description:'Brackets'}],dispatchItems:[{index:0,quantity:10,dispatched:4,remaining:6,description:'Fixings'},{index:1,quantity:2,dispatched:0,remaining:2,description:'Brackets'}]};
 const view=fixture({entries:[{...entry,order:partialOrder}],post:()=>Response.json({ok:true,partial:true})});await button(view.render(),'Dispatch to site').props.onClick();
 nodes(view.render()).find(n=>n.props['aria-label']==='Delivery amount').props.onChange({target:{value:'part'}});
 nodes(view.render()).find(n=>n.props['aria-label']==='Quantity to send: Fixings').props.onChange({target:{value:'3'}});
 nodes(view.render()).find(n=>n.props['aria-label']==='Quantity to send: Brackets').props.onChange({target:{value:'0'}});
 nodes(view.render()).find(n=>n.tag==='form').props.onSubmit({preventDefault(){}});await new Promise(r=>setImmediate(r));
 assert.deepEqual(view.calls.find(call=>call.body).body.lines,[{index:0,quantity:3}]);assert.match(view.states[4],/Part delivery saved/);
});
test('part panel deliveries submit individual panels with the reviewed manifest snapshot',async()=>{
 const load={...panel.load,panelIds:['p','p2'],items:[...panel.load.items,{id:'p2',reference:'P2'}]},view=fixture({entries:[{...panel,load}]});await button(view.render(),'Send to powder coaters').props.onClick();
 nodes(view.render()).find(n=>n.props['aria-label']==='Delivery amount').props.onChange({target:{value:'part'}});
 nodes(view.render()).find(n=>n.props['aria-label']==='Send Sheet — · Panel P2').props.onChange({target:{checked:false}});
 view.states[10].destination='Coater';nodes(view.render()).find(n=>n.tag==='form').props.onSubmit({preventDefault(){}});await new Promise(r=>setImmediate(r));
 const posted=view.calls.find(call=>call.body).body;assert.deepEqual(posted.panelIds,['p']);assert.deepEqual(posted.expectedPanelIds,['p','p2']);assert.equal(posted.expectedStatus,'waiting');assert.ok(posted.mutationId);
});

test('Gate part deliveries submit the selected physical component IDs',async()=>{
 const gate={...entry,orderType:'Buggy Gate',order:{...order,usesGateComponents:true,dispatchComponents:[{id:'gate-a',set:1,label:'Gate A',ready:true},{id:'gate-b',set:1,label:'Gate B',ready:true}]}};
 const view=fixture({entries:[gate]});await button(view.render(),'Dispatch to site').props.onClick();nodes(view.render()).find(n=>n.props['aria-label']==='Delivery amount').props.onChange({target:{value:'part'}});nodes(view.render()).find(n=>n.props['aria-label']==='Send Set 1 · Gate B').props.onChange({target:{checked:false}});nodes(view.render()).find(n=>n.tag==='form').props.onSubmit({preventDefault(){}});await new Promise(r=>setImmediate(r));
 const posted=view.calls.find(call=>call.body).body;assert.deepEqual(posted.componentIds,['gate-a']);assert.equal(posted.lines,undefined);
});
