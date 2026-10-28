const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'../index.html'),'utf8'),start=source.indexOf('  const isGateOrder='),end=source.indexOf('  function OrdersPage(',start);
const order={id:'gate-order',project:'Gate test',orderNumber:'7',orderType:'Panels',status:'approved',updatedAt:'v1'};
function fixture(canManage=true){
 const hooks=[],calls=[];let cursor=0;
 const context={Response,Date,isPanelOrder:order=>String(order.orderType||'').toLowerCase()==='panels',PanelStock:{username:'manager',apiFetch:async(url,options)=>{calls.push({url,body:JSON.parse(options.body)});return Response.json({ok:true,order:{...order,updatedAt:'v2',manualDrawing:{drawn:JSON.parse(options.body).drawn,updatedBy:'manager',updatedAt:'v2'}}});}},BAKED_WORKER_URL:'https://synthetic.example',import_react:{createElement:(type,props,...children)=>({type,props:props||{},children:children.flat(Infinity)})},useState(initial){const i=cursor++;if(!(i in hooks))hooks[i]=typeof initial==='function'?initial():initial;return [hooks[i],value=>{hooks[i]=typeof value==='function'?value(hooks[i]):value;}];},useRef(initial){const i=cursor++;return hooks[i]||(hooks[i]={current:initial});},useEffect(fn){fn();}};
 vm.runInNewContext(source.slice(start,end)+'globalThis.Modal=PanelDrawingModal;',context);
 const render=()=>{cursor=0;return context.Modal({order,canManage,onSaved:value=>{context.saved=value;},onClose(){}});};
 const nodes=node=>node&&typeof node==='object'?[node,...(node.children||[]).flatMap(nodes)]:[];
 const form=()=>nodes(render()).find(node=>node.type==='form'),select=label=>nodes(render()).find(node=>node.type==='select'&&node.props['aria-label']===label),button=label=>nodes(render()).find(node=>node.type==='button'&&node.children.includes(label));
 return {context,calls,hooks,render,form,select,button};
}

test('panel dialog saves Drawn through the panel endpoint without touching Gate QA',async()=>{
 const f=fixture();assert.equal(f.select('Fabricated/QA'),undefined);assert.equal(f.select('Ready for Dispatch'),undefined);f.select('Drawn').props.onChange({target:{value:'complete'}});await f.form().props.onSubmit({preventDefault(){}});
 assert.equal(f.calls[0].url,'https://synthetic.example/orders/gate-order/drawing');assert.deepEqual(f.calls[0].body,{expectedUpdatedAt:'v1',drawn:true});assert.equal(f.context.saved.manualDrawing.drawn,true);assert.equal(f.select('Drawn').props.value,'complete');
 f.select('Drawn').props.onChange({target:{value:'pending'}});await f.form().props.onSubmit({preventDefault(){}});assert.equal(f.calls[1].body.drawn,false);assert.equal(f.calls[1].body.expectedUpdatedAt,'v2');
 const viewer=fixture(false);assert.equal(viewer.select('Drawn').props.disabled,true);assert.equal(viewer.button('Save drawing status'),undefined);
});
test('panel dialog preserves changes on conflicts, prevents duplicate saves and ignores stale accounts',async()=>{
 const f=fixture();f.select('Drawn').props.onChange({target:{value:'complete'}});f.context.PanelStock.apiFetch=async()=>Response.json({code:'ORDER_CONFLICT',order:{...order,updatedAt:'latest'}},{status:409});await f.form().props.onSubmit({preventDefault(){}});assert.equal(f.select('Drawn').props.value,'complete');assert.equal(f.button('Save drawing status').props.disabled,true);f.button('Keep my changes').props.onClick();assert.equal(f.hooks[0].expectedUpdatedAt,'latest');
 const j=fixture();let finish,count=0;j.context.PanelStock.apiFetch=()=>{count++;return new Promise(resolve=>finish=resolve);};const saving=j.form().props.onSubmit({preventDefault(){}});await j.form().props.onSubmit({preventDefault(){}});assert.equal(count,1);j.context.PanelStock.username='another-account';finish(Response.json({ok:true,order:{...order,updatedAt:'private'}}));await saving;assert.equal(j.context.saved,undefined);
});
test('terminal panel orders are read-only in the drawing dialog',()=>{
 const f=fixture();f.render();f.hooks[0]={...f.hooks[0],order:{...order,status:'dispatched'}};assert.equal(f.select('Drawn').props.disabled,true);assert.equal(f.button('Save drawing status'),undefined);
});
test('Drawn buttons are available at both native Gate button locations',()=>{
 const rowStart=source.indexOf('isPanelOrder(order)&&e("button",{type:"button","aria-label":`Drawn status for Order');
 const rowEnd=source.indexOf(',"Drawn"),',rowStart)+',"Drawn")'.length;
 assert.ok(rowStart>=0);const row=source.slice(rowStart,rowEnd);
 const detailStart=source.indexOf('panel.mode==="view"&&isPanelOrder(panel.order)&&e("button",{type:"button",onClick:()=>setDrawingOrder');
 const detailEnd=source.indexOf(',"Drawn"),',detailStart)+',"Drawn")'.length;assert.ok(detailStart>=0);
 const selected=[],e=(type,props,...children)=>({type,props,children}),context={order,panel:{mode:'view',order},isPanelOrder:o=>o.orderType==='Panels',e,setDrawingOrder:value=>selected.push(value)};
 const button=vm.runInNewContext(row,context),detail=vm.runInNewContext(source.slice(detailStart,detailEnd),context);assert.equal(button.children[0],'Drawn');button.props.onClick();detail.props.onClick();assert.equal(selected.length,2);assert.equal(selected[0],order);
 context.order={...order,orderType:'Gate'};assert.equal(vm.runInNewContext(row,context),false);
});
test('saving the native panel dialog refreshes the order row and open order view',()=>{
 const start=source.indexOf('      drawingOrder&&e(PanelDrawingModal,');assert.ok(start>=0);const end=source.indexOf('\n',start);
 let orders=[order],panel={mode:'view',order,base:{...order}},notice;const context={drawingOrder:order,PanelDrawingModal:'dialog',canManage:true,isAdmin:false,e:(type,props)=>({type,props}),setDrawingOrder(){},setOrders:fn=>orders=fn(orders),setPanel:fn=>panel=fn(panel),setNotice:v=>notice=v};
 const node=vm.runInNewContext(source.slice(start,end),context),saved={...order,updatedAt:'v2',manualDrawing:{drawn:true}};node.props.onSaved(saved,false);assert.equal(orders[0].manualDrawing.drawn,true);assert.equal(panel.order.manualDrawing.drawn,true);assert.equal(panel.base.updatedAt,'v2');assert.match(notice,/drawing status saved/);
});

