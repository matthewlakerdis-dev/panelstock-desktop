const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'../index.html'),'utf8'),start=source.indexOf('    const canScheduleDelivery='),end=source.indexOf('    function deliveryScheduleModal()',start);
const order={id:'order',orderNumber:'7',project:'Test',orderType:'Panels',status:'completed',updatedAt:'v1',requestedDeliveryDate:'2026-10-28',scheduledDeliveryDate:'',items:[]};
function fixture(){
 const calls=[],context={isAdmin:true,deliveryEditor:null,deliveryLock:{current:false},deliveryAlive:{current:true},orders:[order],panel:null,PanelStock:{username:'admin',apiFetch:async(url,options)=>{calls.push({url,body:JSON.parse(options.body)});return Response.json({ok:true,order:{...order,updatedAt:'v2',scheduledDeliveryDate:'2026-10-29',scheduledDeliveryTime:'09:30'}});}},BAKED_WORKER_URL:'https://synthetic.example',Response};
 context.setDeliveryScheduleBusy=value=>{context.busy=value;};context.setDeliveryEditor=value=>{context.deliveryEditor=typeof value==='function'?value(context.deliveryEditor):value;};context.setOrders=fn=>{context.orders=fn(context.orders);};context.setPanel=fn=>{context.panel=fn(context.panel);};context.setNotice=value=>{context.notice=value;};
 vm.runInNewContext(source.slice(start,end)+'globalThis.actions={canScheduleDelivery,openDeliverySchedule,saveDeliverySchedule};',context);return {context,calls,...context.actions};
}
test('desktop admin scheduling supports panels and ready orders without changing their requested date or status',async()=>{
 const h=fixture();h.context.isAdmin=false;assert.equal(h.canScheduleDelivery(order),false);h.context.isAdmin=true;assert.equal(h.canScheduleDelivery(order),true);assert.equal(h.canScheduleDelivery({...order,status:'dispatched'}),false);
 h.openDeliverySchedule(order);h.context.deliveryEditor.date='2026-10-29';h.context.deliveryEditor.time='09:30';await h.saveDeliverySchedule({preventDefault(){}});
 assert.deepEqual(h.calls[0].body,{expectedUpdatedAt:'v1',scheduledDeliveryDate:'2026-10-29',scheduledDeliveryTime:'09:30'});assert.equal(h.context.orders[0].status,'completed');assert.equal(h.context.orders[0].requestedDeliveryDate,'2026-10-28');assert.equal(h.context.deliveryEditor,null);assert.equal(h.context.busy,false);
});
test('desktop conflicts keep typed values and lock out duplicate or stale-account saves',async()=>{
 const h=fixture();h.openDeliverySchedule(order);h.context.deliveryEditor.date='2026-10-30';h.context.PanelStock.apiFetch=async()=>Response.json({code:'ORDER_CONFLICT',order:{...order,updatedAt:'latest',scheduledDeliveryDate:'2026-10-29'}},{status:409});
 await h.saveDeliverySchedule({preventDefault(){}});assert.equal(h.context.deliveryEditor.date,'2026-10-30');assert.equal(h.context.deliveryEditor.conflict.updatedAt,'latest');
 const j=fixture();j.openDeliverySchedule(order);j.context.deliveryEditor.date='2026-10-29';let finish,calls=0;j.context.PanelStock.apiFetch=()=>{calls++;return new Promise(resolve=>finish=resolve);};
 const first=j.saveDeliverySchedule({preventDefault(){}});await j.saveDeliverySchedule({preventDefault(){}});assert.equal(calls,1);j.context.PanelStock.username='other';finish(Response.json({ok:true,order:{...order,scheduledDeliveryDate:'2026-10-29'}}));await first;assert.equal(j.context.orders[0].scheduledDeliveryDate,'');
});
