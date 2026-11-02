const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {parseLink,createController}=require('../excel-order-actions.js');
const id='12345678-1234-4234-8234-123456789012';
const order={id,project:'Example',orderNumber:'007',orderType:'Fixings',status:'submitted',updatedAt:'v1'};
const tick=()=>new Promise(setImmediate);
function harness(action,fetcher){
 const calls=[],client={username:'alex',apiFetch:async(url,options)=>{calls.push({url,options});return fetcher(url,options);}};
 const changes=[];
 const controller=createController({link:{id,action},client,baseUrl:'https://api.example',onChange:value=>changes.push(value),uuid:()=>id});
 return {controller,client,calls,changes};
}
test('links accept only explicit ready or dispatch actions with a valid order ID',()=>{
 assert.deepEqual(parseLink('https://web.panelstockhq.com/?orderAction=ready&orderId='+id),{id,action:'ready'});
 assert.deepEqual(parseLink('https://web.panelstockhq.com/?orderAction=dispatch&orderId='+id),{id,action:'dispatch'});
 for(const href of ['bad','https://web.panelstockhq.com/?orderAction=delete&orderId='+id,'https://web.panelstockhq.com/?orderAction=ready&orderId=../../orders','https://web.panelstockhq.com/'])assert.equal(parseLink(href),null);
});
test('opening a ready link only reads the latest order; confirmation writes its current version once',async()=>{
 let finish;
 const h=harness('ready',async(url,options)=>options?new Promise(resolve=>finish=resolve):Response.json({order}));
 await h.controller.load();assert.equal(h.controller.state.phase,'confirm');
 assert.equal(h.calls.length,1);assert.equal(h.calls[0].options,undefined);
 const saved=h.controller.submit();await h.controller.submit();assert.equal(h.calls.length,2);
 assert.deepEqual(JSON.parse(h.calls[1].options.body),{status:'completed',expectedUpdatedAt:'v1'});
 assert.equal(h.calls[1].url,'https://api.example/orders/'+id+'/status');
 finish(Response.json({ok:true}));await saved;
 assert.equal(h.controller.state.phase,'done');assert.match(h.controller.state.message,/Ready for dispatch/);
});
test('panel and gate readiness remains controlled by production; stale links do not reset terminal statuses',async()=>{
 for(const source of [{...order,orderType:'Panels'},{...order,orderType:'Gate'},{...order,status:'dispatched'},{...order,status:'cancelled'},{...order,status:'completed'}]){
  const h=harness('ready',async()=>Response.json({order:source}));await h.controller.load();await h.controller.submit();
  assert.notEqual(h.controller.state.phase,'confirm');assert.equal(h.calls.length,1);
 }
});
test('a changed order requires an explicit reload before reconfirming readiness',async()=>{
 let stamp='v1';
 const h=harness('ready',async(url,options)=>options?Response.json({error:'Order changed',code:'ORDER_CONFLICT'},{status:409}):Response.json({order:{...order,updatedAt:stamp}}));
 await h.controller.load();await h.controller.submit();assert.equal(h.controller.state.needsReview,true);
 await h.controller.submit();assert.equal(h.calls.length,2);
 stamp='v2';await h.controller.load();await h.controller.submit();
 assert.equal(JSON.parse(h.calls[3].options.body).expectedUpdatedAt,'v2');
});
test('uncertain non-panel dispatch retries keep the same dispatch ID and delivery details',async()=>{
 let fail=true;
 const h=harness('dispatch',async(url,options)=>{if(!options)return Response.json({orders:[{...order,status:'completed',ready:true,usesPanelLoads:false}]});if(fail)throw Error('Connection interrupted');return Response.json({ok:true});});
 await h.controller.load();assert.equal(h.calls.length,1);assert.equal(h.calls[0].options,undefined);
 const details={destination:'Example site',transport:'Truck',driver:'Alex',notes:'Keep dry'};
 await h.controller.submit(details);assert.equal(h.controller.state.phase,'confirm');assert.equal(h.controller.state.needsReview,false);
 fail=false;await h.controller.submit(details);
 assert.equal(h.calls[1].options.body,h.calls[2].options.body);
 assert.equal(JSON.parse(h.calls[2].options.body).mutationId,id);assert.equal(h.controller.state.phase,'done');
});
test('panel orders show only matching loads and dispatch a selected site-ready load through the existing API',async()=>{
 const load={id:'load-one',project:'Example',orderNumber:'007',status:'waiting',readyForSite:true,panelIds:['panel-one']};
 const loads=[load,{...load,id:'blocked',readyForSite:false},{...load,id:'other',project:'Another project'},{...load,id:'number',orderNumber:'7'}];
 let dispatched=false;
 const h=harness('dispatch',async(url,options)=>{
  if(options){assert.equal(url,'https://api.example/dispatch/panels');assert.deepEqual(JSON.parse(options.body),{destination:'Site',transport:'Truck',driver:'Alex',id:'load-one',action:'dispatch',destinationType:'site'});dispatched=true;return Response.json({ok:true});}
  return url.endsWith('/dispatch/orders')?Response.json({orders:[{...order,usesPanelLoads:true,ready:!dispatched,status:dispatched?'dispatched':'completed'}]}):Response.json({loads});
 });
 await h.controller.load();assert.equal(h.controller.state.phase,'loads');assert.deepEqual(h.controller.state.loads.map(value=>value.id),['load-one','blocked']);
 h.controller.selectLoad('other');assert.equal(h.controller.state.phase,'loads');h.controller.selectLoad('blocked');assert.equal(h.controller.state.phase,'loads');
 h.controller.selectLoad('load-one');assert.equal(h.controller.state.phase,'confirm');
 await h.controller.submit({destination:'Site',transport:'Truck',driver:'Alex'});assert.equal(h.controller.state.phase,'done');
 assert.equal(h.calls.filter(value=>value.options).length,1);
});
test('denied permissions, expired readiness, account changes and unmounts cannot trigger a status write',async()=>{
 const denied=harness('ready',async()=>Response.json({error:'You do not have access to this task'},{status:403}));await denied.controller.load();await denied.controller.submit();assert.equal(denied.calls.length,1);assert.match(denied.controller.state.error,/access/);
 const stale=harness('dispatch',async()=>Response.json({orders:[]}));await stale.controller.load();await stale.controller.submit();assert.equal(stale.calls.length,1);assert.equal(stale.controller.state.phase,'blocked');
 const switched=harness('ready',async()=>Response.json({order}));await switched.controller.load();switched.client.username='sam';await switched.controller.submit();assert.equal(switched.calls.length,1);
 let finish;const disposed=harness('ready',()=>new Promise(resolve=>finish=resolve));void disposed.controller.load();disposed.controller.dispose();const count=disposed.changes.length;finish(Response.json({order}));await tick();assert.equal(disposed.changes.length,count);
});
test('the login-independent link capture and confirmation UI are wired into the published desktop assets',()=>{
 const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8'),build=fs.readFileSync(path.join(__dirname,'../scripts/build-production.cjs'),'utf8');
 assert.ok(html.indexOf('src="excel-order-actions.js')<html.indexOf('function App()'));
 assert.match(html,/createComponent\(import_react.default,PanelStock,BAKED_WORKER_URL,window.PanelStockExcelActions.link\)/);
 assert.match(html,/jsx\)\(ExcelOrderAction,\{username\}\)/);
 for(const name of ['excel-order-actions.js','excel-order-actions.css'])assert.ok(build.includes(name));
});

test('schedule links read the current date/time and save only after admin confirmation',async()=>{
 const scheduled={...order,status:'completed',scheduledDeliveryDate:'2026-11-06',scheduledDeliveryTime:'09:30'};
 const h=harness('schedule',async(url,options)=>options?Response.json({ok:true}):url.endsWith('/session')?Response.json({isAdmin:true}):Response.json({order:scheduled}));
 assert.deepEqual(parseLink('https://web.panelstockhq.com/?orderAction=schedule&orderId='+id),{id,action:'schedule'});
 await h.controller.load();assert.equal(h.controller.state.phase,'confirm');assert.equal(h.controller.state.order.scheduledDeliveryTime,'09:30');assert.equal(h.calls.filter(call=>call.options).length,0);
 await h.controller.submit({scheduledDeliveryDate:'2026-11-09',scheduledDeliveryTime:'10:15'});
 const write=h.calls.find(call=>call.options);assert.equal(write.url,'https://api.example/orders/'+id+'/delivery');
 assert.deepEqual(JSON.parse(write.options.body),{scheduledDeliveryDate:'2026-11-09',scheduledDeliveryTime:'10:15',expectedUpdatedAt:'v1'});assert.equal(h.controller.state.phase,'done');
});
test('non-admins and terminal orders cannot schedule, while active panel and gate orders can',async()=>{
 const denied=harness('schedule',async()=>Response.json({isAdmin:false}));await denied.controller.load();await denied.controller.submit({scheduledDeliveryDate:'2026-11-09'});assert.equal(denied.calls.length,1);assert.match(denied.controller.state.message,/administrators/);
 for(const status of ['cancelled','dispatched']){
  const h=harness('schedule',async url=>url.endsWith('/session')?Response.json({isAdmin:true}):Response.json({order:{...order,status}}));await h.controller.load();await h.controller.submit({scheduledDeliveryDate:'2026-11-09'});assert.equal(h.calls.filter(call=>call.options).length,0);assert.equal(h.controller.state.phase,'blocked');
 }
 for(const orderType of ['Panels','Gate']){
  const h=harness('schedule',async url=>url.endsWith('/session')?Response.json({isAdmin:true}):Response.json({order:{...order,orderType}}));await h.controller.load();assert.equal(h.controller.state.phase,'confirm');
 }
});
test('scheduling validates dates and optional times and requires an explicit clear action',async()=>{
 const h=harness('schedule',async(url,options)=>options?Response.json({ok:true}):url.endsWith('/session')?Response.json({isAdmin:true}):Response.json({order}));await h.controller.load();
 for(const details of [{},{scheduledDeliveryDate:''},{scheduledDeliveryDate:'2026-02-31'},{scheduledDeliveryDate:'2026-11-09',scheduledDeliveryTime:'25:00'},{scheduledDeliveryDate:'2026-11-09',scheduledDeliveryTime:42}])assert.equal(await h.controller.submit(details),false);
 assert.equal(h.calls.filter(call=>call.options).length,0);
 await h.controller.submit({scheduledDeliveryDate:'2028-02-29'});assert.equal(h.controller.state.phase,'done');assert.equal(JSON.parse(h.calls.at(-1).options.body).scheduledDeliveryTime,'');
 const clear=harness('schedule',async(url,options)=>options?Response.json({ok:true}):url.endsWith('/session')?Response.json({isAdmin:true}):Response.json({order:{...order,scheduledDeliveryDate:'2026-11-09',scheduledDeliveryTime:'08:00'}}));await clear.controller.load();await clear.controller.submit({clearSchedule:true});
 assert.deepEqual(JSON.parse(clear.calls.at(-1).options.body),{scheduledDeliveryDate:'',scheduledDeliveryTime:'',expectedUpdatedAt:'v1'});assert.match(clear.controller.state.message,/cleared/);
});
test('changed delivery schedules require reload and a new confirmation against the latest version',async()=>{
 let stamp='v1';const h=harness('schedule',async(url,options)=>options?Response.json({error:'Order changed',code:'ORDER_CONFLICT'},{status:409}):url.endsWith('/session')?Response.json({isAdmin:true}):Response.json({order:{...order,updatedAt:stamp}}));
 await h.controller.load();await h.controller.submit({scheduledDeliveryDate:'2026-11-09'});assert.equal(h.controller.state.needsReview,true);
 const count=h.calls.length;await h.controller.submit({scheduledDeliveryDate:'2026-11-09'});assert.equal(h.calls.length,count);
 stamp='v2';await h.controller.load();await h.controller.submit({scheduledDeliveryDate:'2026-11-10'});assert.equal(JSON.parse(h.calls.at(-1).options.body).expectedUpdatedAt,'v2');
});
