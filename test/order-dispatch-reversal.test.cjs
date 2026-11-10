const {test}=require('node:test'),assert=require('node:assert/strict');
const {createController,blockedReason}=require('../order-dispatch-reversal.js');
const order={id:'one',orderNumber:'001',project:'Test',status:'dispatched',updatedAt:'v1'};
function fixture(fetcher){let post=0;const client={username:'admin',async apiFetch(url,options){if(url.endsWith('/session'))return Response.json({isAdmin:true});if(!options.method)return Response.json({order});post++;return fetcher(url,options);}};const changes=[],controller=createController({order,client,baseUrl:'https://api.test',onChange:s=>changes.push(s),uuid:()=> 'stable-reversal-request'});return {controller,client,changes,get post(){return post;}};}
test('controller loads current order and validates the reason before posting',async()=>{
 const h=fixture(async()=>Response.json({ok:true,order:{...order,status:'completed'}}));await h.controller.load();assert.equal(h.controller.state.phase,'editing');await h.controller.submit(' ');assert.equal(h.post,0);assert.match(h.controller.state.error,/reason/);const saved=await h.controller.submit('Wrong load');assert.equal(saved.order.status,'completed');assert.equal(h.controller.state.phase,'done');
});
test('double submits lock and lost responses retry the same frozen mutation and reason',async()=>{
 let finish;const bodies=[];const h=fixture(async(url,options)=>{bodies.push(JSON.parse(options.body));return new Promise((resolve,reject)=>finish={resolve,reject});});await h.controller.load();const first=h.controller.submit('Wrong load');await h.controller.submit('Changed');assert.equal(h.post,1);finish.reject(Error('Lost response'));await first;assert.equal(h.controller.state.uncertain,true);const retry=h.controller.submit('Edited reason');assert.deepEqual(bodies[1],bodies[0]);assert.equal(bodies[0].expectedUpdatedAt,'v1');finish.resolve(Response.json({ok:true,idempotent:true,order:{...order,status:'dispatched',updatedAt:'later'}}));const result=await retry;assert.equal(result.idempotent,true);assert.equal(result.order.updatedAt,'later');
});
test('a conflict requires reviewing the latest dispatch before another attempt',async()=>{
 let latest=order;const calls=[];const h=fixture(async(url,options)=>{calls.push(JSON.parse(options.body));return Response.json({code:'ORDER_CONFLICT',order:{...order,updatedAt:'v2'}},{status:409});});await h.controller.load();await h.controller.submit('Wrong load');assert.ok(h.controller.state.conflict);await h.controller.submit('Wrong load');assert.equal(h.post,1);
 const original=h.client.apiFetch;h.client.apiFetch=(url,options)=>!options.method&&!url.endsWith('/session')?Response.json({order:{...order,updatedAt:'v2'}}):original(url,options);await h.controller.load();assert.equal(h.controller.state.conflict,null);await h.controller.submit('Wrong load');assert.equal(calls[1].expectedUpdatedAt,'v2');
});
test('delivery receipts, non-admins, account switches and disposed dialogs are guarded',async()=>{
 assert.match(blockedReason({...order,receipts:[{}]}),/delivery/);assert.match(blockedReason({...order,hasDeliveryReceipts:true}),/delivery/);
 const h=fixture(async()=>Response.json({ok:true,order}));h.client.apiFetch=async()=>Response.json({isAdmin:false});await h.controller.load();assert.equal(h.controller.state.phase,'blocked');await h.controller.submit('Reason');assert.equal(h.post,0);
 let finish;const switched=fixture(async()=>new Promise(resolve=>finish=resolve));await switched.controller.load();const work=switched.controller.submit('Reason');switched.client.username='another';finish(Response.json({ok:true,order:{...order,status:'completed'}}));assert.equal(await work,null);assert.equal(switched.changes.at(-1).busy,true);
 const disposed=fixture(async()=>Response.json({ok:true,order}));await disposed.controller.load();disposed.controller.dispose();await disposed.controller.submit('Reason');assert.equal(disposed.post,0);
});
test('unverified successful response remains retryable while permanent API denial blocks further posts',async()=>{
 const h=fixture(async()=>Response.json({ok:true,order:{id:'wrong'}}));await h.controller.load();await h.controller.submit('Reason');assert.equal(h.controller.state.uncertain,true);
 const denied=fixture(async()=>Response.json({error:'Delivery recorded'},{status:409}));await denied.controller.load();await denied.controller.submit('Reason');assert.equal(denied.controller.state.phase,'blocked');assert.equal(denied.controller.state.uncertain,false);await denied.controller.submit('Reason');assert.equal(denied.post,1);
});
