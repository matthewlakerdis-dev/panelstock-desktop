const test=require('node:test'),assert=require('node:assert/strict');
const {parseLink,createController}=require('../excel-order-actions.js');
const id='12345678-1234-4234-8234-123456789012';
const order={id,project:'Example',orderNumber:'007',orderType:'Panels',status:'approved',updatedAt:'v1'};
function harness(source=order,actor={taskAccess:{'site.orders.manage':true}},write=async()=>Response.json({ok:true})){
 const calls=[],client={username:'manager',apiFetch:async(url,options)=>{calls.push({url,options});return options?write(url,options):Response.json(url.endsWith('/session')?actor:{order:source});}};
 const changes=[],controller=createController({link:{id,action:'drawn'},client,baseUrl:'https://api.example',onChange:s=>changes.push(s),uuid:()=>id});
 return {controller,client,calls,changes};
}
test('drawn links open read-only and confirm against the latest version using the existing panel or gate API',async()=>{
 assert.deepEqual(parseLink('https://web.panelstockhq.com/?orderAction=drawn&orderId='+id),{id,action:'drawn'});
 for(const orderType of ['Panels','Gate']){
  let finish;const h=harness({...order,orderType},undefined,()=>new Promise(resolve=>finish=resolve));
  await h.controller.load();assert.equal(h.controller.state.phase,'confirm');assert.equal(h.calls.filter(c=>c.options).length,0);
  const saving=h.controller.submit({status:'completed',drawn:false,stages:{readyForDispatch:'complete'}});await h.controller.submit();
  const writes=h.calls.filter(c=>c.options);assert.equal(writes.length,1);
  assert.equal(writes[0].url,'https://api.example/orders/'+id+(orderType==='Gate'?'/progress':'/drawing'));
  assert.deepEqual(JSON.parse(writes[0].options.body),{...(orderType==='Gate'?{stages:{drawn:'complete'}}:{drawn:true}),expectedUpdatedAt:'v1'});
  finish(Response.json({ok:true}));assert.equal(await saving,true);assert.equal(h.controller.state.phase,'done');
  assert.match(h.controller.state.message,/marked Drawn/);if(orderType==='Gate')assert.match(h.controller.state.message,/queued for QA/);
 }
});
test('already drawn links cannot requeue Gate QA, reset manual overrides or change terminal and unrelated orders',async()=>{
 for(const source of [{...order,manualDrawing:{drawn:true}},{...order,drawingProgress:{drawn:true}},{...order,orderType:'Gate',manualProduction:{stages:{drawn:'complete'}}},{...order,orderType:'Gate',manualProduction:{qaWorkflowVersion:1,stages:{drawn:'complete',fabricatedQa:'complete'}}},{...order,status:'dispatched'},{...order,status:'cancelled'},{...order,orderType:'Fixings'}]){
  const h=harness(source);await h.controller.load();assert.notEqual(h.controller.state.phase,'confirm');assert.equal(await h.controller.submit(),false);assert.equal(h.calls.filter(c=>c.options).length,0);
 }
 const override=harness({...order,drawingProgress:{drawn:true},manualDrawing:{drawn:false}});await override.controller.load();assert.equal(override.controller.state.phase,'confirm');
});
test('drawn requires management access, handles denied reads and writes, and cannot write after account changes or disposal',async()=>{
 const denied=harness(order,{taskAccess:{'site.orders.view':true}});await denied.controller.load();await denied.controller.submit();assert.equal(denied.calls.length,1);assert.match(denied.controller.state.message,/management access/);
 const admin=harness(order,{isAdmin:true});await admin.controller.load();assert.equal(admin.controller.state.phase,'confirm');
 const revoked=harness(order,undefined,()=>Response.json({error:'Access revoked'},{status:403}));await revoked.controller.load();assert.equal(await revoked.controller.submit(),false);assert.match(revoked.controller.state.error,/Access revoked/);assert.notEqual(revoked.controller.state.phase,'done');
 const failedRead=harness();failedRead.client.apiFetch=async()=>Response.json({error:'Session expired'},{status:401});await failedRead.controller.load();assert.equal(failedRead.controller.state.phase,'blocked');assert.match(failedRead.controller.state.error,/expired/);
 for(const mode of ['switch','dispose']){const h=harness();await h.controller.load();if(mode==='switch')h.client.username='other';else h.controller.dispose();assert.equal(await h.controller.submit(),false);assert.equal(h.calls.filter(c=>c.options).length,0);}
 let finish;const late=harness();late.client.apiFetch=()=>new Promise(r=>finish=r);const loading=late.controller.load();late.controller.dispose();const count=late.changes.length;finish(Response.json({isAdmin:true}));await loading;assert.equal(late.changes.length,count);
});
test('uncertain or conflicting drawn saves require reload, and a newer completed drawing causes no retry write',async()=>{
 for(const kind of ['conflict','network']){
  const source={...order};const h=harness(source,undefined,()=>{if(kind==='network')throw Error('Connection interrupted');return Response.json({error:'Order changed'},{status:409});});
  await h.controller.load();assert.equal(await h.controller.submit(),false);assert.equal(h.controller.state.needsReview,true);
  const count=h.calls.length;await h.controller.submit();assert.equal(h.calls.length,count);
  source.updatedAt='v2';await h.controller.load();await h.controller.submit();assert.equal(JSON.parse(h.calls.at(-1).options.body).expectedUpdatedAt,'v2');
  source.manualDrawing={drawn:true};await h.controller.load();const writes=h.calls.filter(c=>c.options).length;await h.controller.submit();assert.equal(h.controller.state.phase,'done');assert.equal(h.calls.filter(c=>c.options).length,writes);
 }
});
