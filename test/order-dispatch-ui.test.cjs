const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{webcrypto}=require('node:crypto');
const source=fs.readFileSync(require('node:path').join(__dirname,'../index.html'),'utf8');
const code=source.slice(source.indexOf('  function SiteOrderDispatch('),source.indexOf('  function PanelDispatchLoads()'));
const order={id:'one',project:'Test project',orderNumber:'007',orderType:'Fixings',status:'completed',ready:true,usesPanelLoads:false,updatedAt:'v1',siteContact:'Test contact',phone:'123',items:[{quantity:3,description:'Fixing pack'}]};
function nodes(tree){if(!tree||typeof tree!=='object')return [];if(Array.isArray(tree))return tree.flatMap(nodes);return [tree,...nodes(tree.children)];}
function harness({orders=[order],selected=null,form={},filter='ready',fetcher=async()=>{throw Error('Unexpected request');}}={}){
  const values=[orders,false,'',selected,form,filter,''],refs=[{current:false},{current:true}];let stateIndex=0,refIndex=0,panelLoads=0;
  const context={import_react:{createElement:(tag,props,...children)=>({tag,props,children})},useState:()=>{const index=stateIndex++;return [values[index],value=>{values[index]=typeof value==='function'?value(values[index]):value;}];},useRef:()=>refs[refIndex++],useEffect:()=>{},PageHeading:'heading',Truck:'truck',crypto:webcrypto,Uint8Array,PanelStock:{apiFetch:fetcher},BAKED_WORKER_URL:'https://example.test'};
  vm.createContext(context);vm.runInContext(code+'globalThis.component=SiteOrderDispatch;',context);
  return {values,refs,render(){stateIndex=0;refIndex=0;return context.component({onPanelLoads:()=>panelLoads++});},get panelLoads(){return panelLoads;}};
}
const button=(tree,label)=>nodes(tree).find(node=>node.tag==='button'&&node.children.includes(label));

test('ready order cards dispatch non-panels and route panels through existing load controls',()=>{
  const h=harness({orders:[order,{...order,id:'panel',orderType:'Panels',usesPanelLoads:true}]});let tree=h.render();
  assert.ok(button(tree,'Dispatch order'));assert.ok(button(tree,'Dispatch panel loads'));
  button(tree,'Dispatch panel loads').props.onClick();assert.equal(h.panelLoads,1);
  button(tree,'Dispatch order').props.onClick();tree=h.render();
  assert.equal(h.values[3].id,'one');assert.match(h.values[3].mutationId,/^[a-f0-9]{32}$/);
  assert.ok(button(tree,'Confirm dispatch'));assert.ok(nodes(tree).some(node=>node.children?.includes('3 ×')));assert.ok(nodes(tree).some(node=>node.children?.includes('Fixing pack')));
});

test('dispatched history shows transport and driver without a repeat dispatch action',()=>{
  const h=harness({orders:[{...order,status:'dispatched',ready:false,dispatchedBy:'Alex',dispatchedAt:'2026-10-12T01:00:00Z',dispatch:{destination:'Test site',transport:'Test truck',driver:'Test driver'}}],filter:'dispatched'}),tree=h.render();
  assert.equal(button(tree,'Dispatch order'),undefined);
  assert.ok(nodes(tree).some(node=>node.children?.includes('Test truck · Test driver')));
});

test('double submit is blocked and uncertain retries retain form details and the same dispatch ID',async()=>{
  let finish,calls=0;const bodies=[];
  const h=harness({selected:{...order,mutationId:'22222222-2222-4222-8222-222222222222'},form:{destination:'Site',transport:'Truck',driver:'Alex',notes:'Keep dry'},fetcher:async(url,options)=>{assert.equal(url,'https://example.test/dispatch/orders');calls++;bodies.push(JSON.parse(options.body));return new Promise((resolve,reject)=>finish={resolve,reject});}});
  let tree=h.render(),form=nodes(tree).find(node=>node.tag==='form');
  form.props.onSubmit({preventDefault(){}});form.props.onSubmit({preventDefault(){}});
  assert.equal(calls,1);assert.equal(h.values[1],true);
  finish.reject(Error('Connection interrupted'));await new Promise(setImmediate);
  assert.equal(h.values[3].id,'one');assert.equal(h.values[4].notes,'Keep dry');assert.equal(h.values[2],'Connection interrupted');
  tree=h.render();form=nodes(tree).find(node=>node.tag==='form');form.props.onSubmit({preventDefault(){}});
  assert.deepEqual(bodies[1],bodies[0]);assert.equal(bodies[1].expectedUpdatedAt,'v1');
  finish.resolve(Response.json({ok:false,error:'Order changed; refresh and review'},{status:409}));await new Promise(setImmediate);
  assert.equal(h.values[3].id,'one');assert.equal(h.values[4].driver,'Alex');assert.equal(h.values[2],'Order changed; refresh and review');
});

test('successful dispatch updates the ready queue and clears the submitted form',async()=>{
  const sent={...order,status:'dispatched',ready:false};
  const h=harness({selected:{...order,mutationId:'22222222-2222-4222-8222-222222222222'},form:{destination:'Site',transport:'Truck',driver:'Alex'},fetcher:async()=>Response.json({ok:true,order:sent,orders:[sent]})});
  nodes(h.render()).find(node=>node.tag==='form').props.onSubmit({preventDefault(){}});await new Promise(setImmediate);
  assert.equal(h.values[3],null);assert.equal(h.values[0][0].status,'dispatched');
  assert.equal(button(h.render(),'Dispatch order'),undefined);assert.equal(h.values[2],'Order dispatched.');
});
