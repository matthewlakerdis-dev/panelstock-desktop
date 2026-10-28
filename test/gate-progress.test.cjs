const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'../index.html'),'utf8'),start=source.indexOf('  const isGateOrder='),end=source.indexOf('  function OrdersPage(',start);
const order={id:'gate-order',project:'Gate test',orderNumber:'7',orderType:'Gate',status:'approved',updatedAt:'v1'};
function fixture(canManage=true){
 const hooks=[],calls=[];let cursor=0;
 const context={Response,Date,PanelStock:{username:'manager',apiFetch:async(url,options)=>{calls.push({url,body:JSON.parse(options.body)});return Response.json({ok:true,order:{...order,updatedAt:'v2',manualProduction:{stages:{drawn:JSON.parse(options.body).stages.drawn,fabricatedQa:'pending',readyForDispatch:'pending'}}}});}},BAKED_WORKER_URL:'https://synthetic.example',import_react:{createElement:(type,props,...children)=>({type,props:props||{},children:children.flat(Infinity)})},useState(initial){const i=cursor++;if(!(i in hooks))hooks[i]=typeof initial==='function'?initial():initial;return [hooks[i],value=>{hooks[i]=typeof value==='function'?value(hooks[i]):value;}];},useRef(initial){const i=cursor++;return hooks[i]||(hooks[i]={current:initial});},useEffect(fn){fn();}};
 vm.runInNewContext(source.slice(start,end)+'globalThis.Modal=GateProductionModal;',context);
 const render=()=>{cursor=0;return context.Modal({order,canManage,onSaved:value=>{context.saved=value;},onClose(){}});};
 const nodes=node=>node&&typeof node==='object'?[node,...(node.children||[]).flatMap(nodes)]:[];
 const form=()=>nodes(render()).find(node=>node.type==='form'),select=label=>nodes(render()).find(node=>node.type==='select'&&node.props['aria-label']===label),button=label=>nodes(render()).find(node=>node.type==='button'&&node.children.includes(label));
 return {context,calls,hooks,render,form,select,button};
}
test('desktop sends only Drawn to the QA handoff and keeps QA and readiness read-only',async()=>{
 const f=fixture();assert.equal(f.select('Fabricated/QA').props.disabled,true);assert.equal(f.select('Ready for Dispatch').props.disabled,true);f.select('Drawn').props.onChange({target:{value:'complete'}});await f.form().props.onSubmit({preventDefault(){}});
 assert.deepEqual(f.calls[0].body,{expectedUpdatedAt:'v1',stages:{drawn:'complete'}});assert.equal(f.context.saved.updatedAt,'v2');assert.equal(f.select('Fabricated/QA').props.value,'pending');
 const viewer=fixture(false);assert.equal(viewer.select('Drawn').props.disabled,true);assert.equal(viewer.button('Save production progress'),undefined);
});
test('desktop conflicts preserve entries until explicit review and stale accounts cannot accept late results',async()=>{
 const f=fixture();f.select('Drawn').props.onChange({target:{value:'complete'}});f.context.PanelStock.apiFetch=async()=>Response.json({code:'ORDER_CONFLICT',order:{...order,updatedAt:'latest'}},{status:409});await f.form().props.onSubmit({preventDefault(){}});assert.equal(f.select('Drawn').props.value,'complete');assert.equal(f.button('Save production progress').props.disabled,true);f.button('Keep my changes').props.onClick();assert.equal(f.hooks[0].expectedUpdatedAt,'latest');
 const j=fixture();let finish,count=0;j.context.PanelStock.apiFetch=()=>{count++;return new Promise(resolve=>finish=resolve);};const saving=j.form().props.onSubmit({preventDefault(){}});await j.form().props.onSubmit({preventDefault(){}});assert.equal(count,1);j.context.PanelStock.username='another-account';finish(Response.json({ok:true,order:{...order,updatedAt:'private'}}));await saving;assert.equal(j.context.saved,undefined);
});
