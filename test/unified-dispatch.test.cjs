const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{webcrypto}=require('node:crypto'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,process.env.UNIFIED_MOBILE?'../../panelstock-app.modern.js':'../index.html'),'utf8');
const code=source.slice(source.indexOf('  function DispatchCenter()'),source.indexOf('  function SiteOrderDispatch('));
const order={id:'o',project:'Project',orderNumber:'007',orderType:'Fixings',siteAddress:'141 Queen Street',status:'completed',ready:true,updatedAt:'v1',items:[{quantity:2,description:'Fixings'}]};
const entry={key:'order:o',kind:'order',project:'Project',orderNumber:'007',orderType:'Fixings',status:'ready',ready:true,reason:'Ready for site',order};
const pending={...entry,key:'order:waiting',orderNumber:'008',status:'waiting',ready:false,reason:'Waiting for production / approval',order:{...order,id:'waiting',status:'approved'}};
const panel={key:'load:l',kind:'load',project:'Project',orderNumber:'009',orderType:'Panels',status:'ready',ready:true,reason:'Ready for powder coaters',load:{id:'l',project:'Project',orderNumber:'009',status:'waiting',ready:true,requiresPowderCoating:true,routing:true,qaComplete:true,siteAddress:'Panel site',items:[{id:'p',reference:'P1'}],legs:[]}};
function nodes(tree){if(Array.isArray(tree))return tree.flatMap(nodes);return tree&&typeof tree==='object'?[tree,...nodes(tree.children)]:[];}
function text(tree){if(Array.isArray(tree))return tree.map(text).join(' ');return tree&&typeof tree==='object'?text(tree.children):tree==null||typeof tree==='boolean'?'':String(tree);}
const button=(tree,label)=>nodes(tree).find(node=>node.tag==='button'&&node.children.includes(label));
function fixture({entries=[entry,pending,panel],canFinalQa=false,post}={}){
 const data={entries,dispatchVehicles:['Lennox Truck','Lennox Ute'],dispatchDrivers:[{username:'alex',displayName:'Alex'}],dispatchDefaultDriver:'alex',canFinalQa};
 const states=[entries,data,false,false,'','active','all','',{},null,{}],refs=[],calls=[];let cursor=0,refIndex=0;
 const context={import_react:{createElement:(tag,props,...children)=>({tag,props:props||{},children})},useState:initial=>{const i=cursor++;if(!(i in states))states[i]=initial;return [states[i],value=>{states[i]=typeof value==='function'?value(states[i]):value;}];},useRef:initial=>{const i=refIndex++;return refs[i]||(refs[i]={current:initial});},useEffect:()=>{},crypto:webcrypto,Uint8Array,PanelStock:{username:'alex',confirm:async()=>true,apiFetch:async(url,options)=>{calls.push({url,options,body:options?JSON.parse(options.body):null});return options&&post?post(url,JSON.parse(options.body)):Response.json(data);}},Response,BAKED_WORKER_URL:'https://worker.test',Truck:'truck',PageHeading:'heading'};
 vm.createContext(context);vm.runInContext(code,context);
 return {states,calls,render(){cursor=refIndex=0;return context.DispatchCenter();}};
}
test('one queue combines types, filters by type and stage and keeps waiting orders non-dispatchable',()=>{
 const view=fixture();let tree=view.render();assert.equal(nodes(tree).filter(n=>n.tag==='article').length,3);
 assert.equal(button(tree,'Site orders'),undefined);assert.equal(button(tree,'Panel loads'),undefined);
 nodes(tree).find(n=>n.tag==='select').props.onChange({target:{value:'Panels'}});tree=view.render();assert.equal(nodes(tree).filter(n=>n.tag==='article').length,1);
 nodes(tree).find(n=>n.tag==='select').props.onChange({target:{value:'all'}});button(view.render(),'Waiting').props.onClick();tree=view.render();assert.equal(nodes(tree).filter(n=>n.tag==='article').length,1);assert.equal(button(tree,'Dispatch to site'),undefined);
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
 assert.deepEqual(nodes(nodes(tree).find(n=>n.tag==='select')).filter(n=>n.tag==='option').map(n=>n.props.value),['powder_coaters']);
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
 assert.equal(button(fixture({entries:[final]}).render(),'Approve final QA'),undefined);
 const view=fixture({entries:[final],canFinalQa:true});await button(view.render(),'Approve final QA').props.onClick();
 assert.deepEqual(JSON.parse(JSON.stringify(view.calls.find(call=>call.body).body)),{id:'l',action:'final-qa',confirmed:true});
});
