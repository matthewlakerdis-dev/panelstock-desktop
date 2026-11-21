const {test}=require('node:test'),assert=require('node:assert/strict');
const {createController}=require('../site-order-bulk-dispatch.js');
const rows=[{id:'order-a',orderNumber:'1',project:'Alpha',eligible:true,expectedUpdatedAt:'v1',reviewToken:'a'.repeat(64),destination:'1 Alpha Road',items:[{quantity:2,description:'BRACKETS'}]},{id:'order-b',orderNumber:'2',project:'Beta',eligible:true,expectedUpdatedAt:'v2',reviewToken:'b'.repeat(64),destination:'2 Beta Road',items:[{quantity:1,description:'FIXINGS'}]}];
function fixture({orders=rows,post,status}={}){const calls=[],changes=[];let sequence=0;const client={username:'admin',apiFetch:async(url,options)=>{const body=JSON.parse(options.body);if(url.endsWith('/batch-status'))return status?status(body):Response.json({state:'unknown'});calls.push({url,body});return url.endsWith('/batch-preview')?Response.json({orders,dispatchVehicles:['Configured Truck','Ute'],dispatchDrivers:[{username:'alex',displayName:'Alex Driver'}],dispatchDefaultDriver:'alex'}):post?post(body):Response.json({ok:true,orderIds:body.orders.map(row=>row.id),orders:body.orders.map(row=>({id:row.id,status:'dispatched'}))});}};const controller=createController({orderIds:orders.map(row=>row.id),client,baseUrl:'https://worker.test',onChange:state=>changes.push(state),uuid:()=> 'mutation-'+(++sequence)});return{controller,client,calls,changes};}
test('bulk review prefills shared defaults, keeps separate site addresses and submits reviewed versions',async()=>{
 const h=fixture();await h.controller.review();assert.equal(h.controller.state.form.driver,'Alex Driver');assert.equal(h.controller.state.form.transport,'Configured Truck');h.controller.destination('order-b','Changed address');const result=await h.controller.submit();assert.equal(result.orders.length,2);assert.deepEqual(h.calls[1].body.orders.map(row=>row.destination),['1 Alpha Road','Changed address']);assert.equal(h.calls[1].body.orders[0].reviewToken,rows[0].reviewToken);assert.equal(h.calls[1].body.orders[1].expectedUpdatedAt,'v2');
});
test('blocked orders prevent dispatch until explicitly removed from the reviewed batch',async()=>{
 const h=fixture({orders:[rows[0],{...rows[1],eligible:false,reason:'QA remains'}]});await h.controller.review();assert.equal(await h.controller.submit(),null);assert.equal(h.calls.length,1);assert.equal(h.controller.remove('order-b'),true);assert.equal((await h.controller.submit()).orders.length,1);assert.deepEqual(h.calls[1].body.orders.map(row=>row.id),['order-a']);
});
test('empty addresses and required dispatch photos prevent submission',async()=>{
 const h=fixture({orders:[{...rows[0],requiresPhoto:true}]});await h.controller.review();h.controller.destination('order-a',' ');assert.equal(await h.controller.submit(),null);assert.match(h.controller.state.error,/address/);h.controller.destination('order-a','Site');assert.equal(await h.controller.submit(),null);assert.match(h.controller.state.error,/photo/);h.controller.change('photo','data:image/png;base64,aA==');assert.ok(await h.controller.submit());
});
test('double submit is locked and uncertain retries freeze every order and delivery field',async()=>{
 let finish;const h=fixture({post:()=>new Promise((resolve,reject)=>finish={resolve,reject})});await h.controller.review();const work=h.controller.submit();assert.equal(await h.controller.submit(),null);assert.equal(h.calls.length,2);finish.reject(Error('Lost response'));await work;assert.equal(h.controller.state.uncertain,true);h.controller.change('driver','Wrong');h.controller.destination('order-a','Wrong');assert.equal(h.controller.remove('order-b'),false);const retry=h.controller.submit();assert.deepEqual(h.calls[1].body,h.calls[2].body);finish.resolve(Response.json({ok:true,idempotent:true,orderIds:['order-a','order-b'],orders:[{id:'order-a',status:'completed'}]}));const result=await retry;assert.equal(result.idempotent,true);assert.equal(result.orders[0].status,'completed');
});
test('conflicts require a fresh review and a new request ID before changing any orders',async()=>{
 let conflict=true;const h=fixture({post:body=>conflict?Response.json({error:'Order changed'},{status:409}):Response.json({ok:true,orderIds:body.orders.map(row=>row.id),orders:body.orders.map(row=>({id:row.id,status:'dispatched'}))})});await h.controller.review();await h.controller.submit();assert.equal(h.controller.state.phase,'blocked');assert.equal(await h.controller.submit(),null);const old=h.calls[1].body.mutationId;conflict=false;await h.controller.review();assert.ok(await h.controller.submit());assert.notEqual(h.calls.at(-1).body.mutationId,old);
});
test('malformed success stays retryable, and malformed reviews never permit dispatch',async()=>{
 const h=fixture({post:()=>Response.json({ok:true,orders:[]})});await h.controller.review();await h.controller.submit();assert.equal(h.controller.state.uncertain,true);assert.match(h.controller.state.error,/verified/);
 const bad=fixture();bad.client.apiFetch=async()=>Response.json({orders:[{...rows[0],reviewToken:'bad'},rows[1]]});await bad.controller.review();assert.equal(bad.controller.state.phase,'blocked');assert.equal(await bad.controller.submit(),null);
});
test('account changes and closed dialogs cannot apply late batch responses',async()=>{
 for(const close of [false,true]){let finish;const h=fixture({post:()=>new Promise(resolve=>finish=resolve)});await h.controller.review();const work=h.controller.submit();if(close)h.controller.dispose();else h.client.username='another';finish(Response.json({ok:true,orderIds:['order-a','order-b'],orders:[{id:'order-a',status:'dispatched'},{id:'order-b',status:'dispatched'}]}));assert.equal(await work,null);assert.notEqual(h.controller.state.phase,'done');}
});

test('each order chooses its own partial quantities, while full deliveries stay unchanged',async()=>{
 const orders=[{...rows[0],selectionType:'lines',items:[{index:0,quantity:2,description:'BRACKETS'},{index:1,quantity:4,description:'FIXINGS'}]},rows[1]];
 const h=fixture({orders,post:body=>Response.json({ok:true,orderIds:body.orders.map(row=>row.id),partialOrderIds:['order-a'],orders:[{id:'order-a',status:'completed'},{id:'order-b',status:'dispatched'}]})});await h.controller.review();h.controller.delivery('order-a','part');h.controller.delivery('order-a',null,0,'1');h.controller.delivery('order-a',null,1,'0');assert.ok(await h.controller.submit());assert.deepEqual(h.calls[1].body.orders[0].lines,[{index:0,quantity:1}]);assert.equal(h.calls[1].body.orders[1].lines,undefined);
});
test('panel and Gate selections submit physical IDs, reject empty selections, and freeze on an uncertain retry',async()=>{
 const orders=[{...rows[0],selectionType:'panelIds',items:[{panelId:'p1',quantity:1,description:'P1'},{panelId:'p2',quantity:1,description:'P2'}]},{...rows[1],selectionType:'componentIds',items:[{componentId:'g1',quantity:1,description:'Gate A'}]}];
 const h=fixture({orders,post:()=>{throw Error('Lost response');}});await h.controller.review();h.controller.delivery('order-a','part');h.controller.delivery('order-a',null,1,0);h.controller.delivery('order-b','part');h.controller.delivery('order-b',null,0,0);assert.equal(await h.controller.submit(),null);assert.equal(h.calls.length,1);h.controller.delivery('order-b',null,0,1);await h.controller.submit();assert.deepEqual(h.calls[1].body.orders[0].panelIds,['p1']);assert.deepEqual(h.calls[1].body.orders[1].componentIds,['g1']);h.controller.delivery('order-a',null,0,0);await h.controller.submit();assert.deepEqual(h.calls[1].body,h.calls[2].body);
});
test('partial quantities cannot exceed the reviewed balance or be negative or nonnumeric',async()=>{
 for(const value of ['3','-1','bad']){const h=fixture({orders:[{...rows[0],selectionType:'lines',items:[{index:0,quantity:2,description:'BRACKETS'}]}]});await h.controller.review();h.controller.delivery('order-a','part');h.controller.delivery('order-a',null,0,value);assert.equal(await h.controller.submit(),null);assert.equal(h.calls.length,1);}
});

test('lost dispatch responses are confirmed once using the exact original body',async()=>{
 let original,checks=0;const h=fixture({post:body=>{original=body;throw Error('Lost response');},status:body=>{checks++;assert.deepEqual(body,original);return Response.json({state:'committed',result:{ok:true,idempotent:true,orderIds:['order-a','order-b'],orders:[{id:'order-a',status:'dispatched'},{id:'order-b',status:'dispatched'}]}});}});
 await h.controller.review();assert.ok(await h.controller.submit());assert.equal(checks,1);assert.equal(h.calls.length,2);assert.equal(h.controller.state.phase,'done');
});
test('a service error can recover its committed result and an unavailable status preserves the original request',async()=>{
 const h=fixture({post:()=>Response.json({error:'Service unavailable'},{status:503}),status:()=>Response.json({state:'committed',result:{ok:true,idempotent:true,orderIds:['order-a','order-b'],orders:[]}})});
 await h.controller.review();assert.ok(await h.controller.submit());
 const failed=fixture({post:()=>{throw Error('Lost response');},status:()=>{throw Error('Status unavailable');}});await failed.controller.review();await failed.controller.submit();await failed.controller.submit();assert.equal(failed.controller.state.uncertain,true);assert.deepEqual(failed.calls[1].body,failed.calls[2].body);
});
