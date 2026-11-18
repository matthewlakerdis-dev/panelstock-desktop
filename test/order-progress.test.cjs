const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'../index.html'),'utf8');
const helpers=source.slice(source.indexOf('  function isPanelOrder('),source.indexOf('  function OrdersPage('));
test('panel identity is normalized and stock and completion have readable labels',()=>{
 const ctx={};vm.runInNewContext(helpers+'globalThis.helpers={isPanelOrder,orderStatusLabel};',ctx);
 assert.equal(ctx.helpers.isPanelOrder({orderType:'  PANELS '}),true);
 for(const orderType of ['Fixings','Plant / Equipment','Other','Custom type',''])assert.equal(ctx.helpers.isPanelOrder({orderType}),false);
 assert.equal(ctx.helpers.orderStatusLabel('in_stock'),'In stock');
 assert.equal(ctx.helpers.orderStatusLabel('completed'),'Ready for dispatch');
 assert.equal(ctx.helpers.orderStatusLabel('dispatched'),'Dispatched');
});
test('quick status saves once in place, reverts failures and blocks panel writes',async()=>{
 const start=source.indexOf('    async function changeStatus(order, status)'),end=source.indexOf('    async function deleteOrder(order)',start);
 let finish,calls=0,choices={a:'in_stock'},busy=false,notice='',refreshes=0,orders=[];
 const ctx={statusRequest:{current:false},setStatusSaving:value=>busy=value,setStatusChoices:fn=>choices=fn(choices),setNotice:value=>notice=value,setOrders:fn=>orders=fn(orders),
  PanelStock:{apiFetch:async(url,options)=>{calls++;assert.equal(JSON.parse(options.body).expectedUpdatedAt,'v1');return new Promise(resolve=>finish=resolve);}},
  BAKED_WORKER_URL:'https://example.test',loadOrders:async()=>refreshes++,openPanel(){throw Error('Unexpected conflict');},setPanel(){}};
 vm.runInNewContext(helpers+source.slice(start,end)+'globalThis.apply=changeStatus;',ctx);
 const order={id:'a',orderType:'Fixings',status:'ordered',updatedAt:'v1'};orders=[order];
 await ctx.apply({...order,orderType:'Panels'},'in_stock');assert.equal(calls,0);
 await ctx.apply({...order,status:'completed'},'ordered');assert.equal(calls,0);
 await ctx.apply({...order,status:'dispatched'},'ordered');assert.equal(calls,0);
 const saved=ctx.apply(order,'in_stock');assert.equal(busy,true);
 await ctx.apply(order,'completed');assert.equal(calls,1);
 finish({status:200,ok:true,json:async()=>({ok:true,order:{...order,status:'in_stock',updatedAt:'v2'}})});await saved;
 assert.equal(busy,false);assert.equal(refreshes,0);assert.equal(orders[0].status,'in_stock');assert.equal(choices.a,undefined);
 choices={a:'completed'};const failed=ctx.apply(order,'completed');finish({status:500,ok:false,json:async()=>({error:'Try again'})});await failed;
 assert.equal(choices.a,undefined);assert.equal(notice,'Try again');assert.equal(busy,false);
 const done=ctx.apply(order,'completed');finish({status:200,ok:true,json:async()=>({ok:true,order:{...order,status:'completed',updatedAt:'v2'}})});await done;
 assert.match(notice,/ready for dispatch/);
});
test('web saves status on selection and preserves panel edit locks',()=>{
 assert.match(source,/canManage&&!isPanelOrder\(order\)&&order.status!=="dispatched"&&e\("button",\{type:"button",onClick:\(\)=>openPanel\("edit"/);
 assert.match(source,/void changeStatus\(order,status\)/);
 assert.doesNotMatch(source,/onClick:\(\)=>changeStatus\(order,statusChoices/);
 assert.match(source,/if\(mode==="edit"&&\(isPanelOrder\(order\)\|\|order.status==="dispatched"\)\)mode="view"/);
});
