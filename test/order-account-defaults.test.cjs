const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const start=source.indexOf('    async function loadOrderAccountDefaults('),end=source.indexOf('    function openPanel(',start),update=source.slice(source.indexOf('    const update = (key, value) => setPanel'),source.indexOf('\n',source.indexOf('    const update = (key, value) => setPanel')));
function harness(){
 let panel={mode:'new',idempotencyKey:'one',order:{siteContact:'',phone:'',requestedDeliveryDate:''}},finish;
 const context={BAKED_WORKER_URL:'https://synthetic.example',PanelStock:{username:'alice',apiFetch:()=>new Promise(resolve=>finish=resolve)},setPanel:fn=>{panel=fn(panel);}};
 vm.runInNewContext(update+source.slice(start,end)+'globalThis.load=loadOrderAccountDefaults;globalThis.edit=update;',context);
 return {context,get panel(){return panel;},set panel(value){panel=value;},complete(profile={username:'alice',displayName:'Admin Name',phone:'0411222333',siteOrderDefaults:{siteContact:'Stale name',phone:'9999'}},status=200){finish(Response.json({profile},{status}));}};
}
test('new desktop orders use the signed-in account name and phone, and keep delivery blank',async()=>{
 const h=harness(),pending=h.context.load('one','alice');h.complete();await pending;
 assert.equal(h.panel.order.siteContact,'Admin Name');assert.equal(h.panel.order.phone,'0411222333');assert.equal(h.panel.order.requestedDeliveryDate,'');
});
test('late account defaults do not overwrite typed or deliberately cleared contact fields',async()=>{
 for(const phone of ['0777','']){const h=harness(),pending=h.context.load('one','alice');h.context.edit('phone',phone);h.complete();await pending;assert.equal(h.panel.order.phone,phone);assert.equal(h.panel.order.siteContact,'Admin Name');}
 const h=harness(),pending=h.context.load('one','alice');h.context.edit('siteContact','Site Foreman');h.complete();await pending;assert.equal(h.panel.order.siteContact,'Site Foreman');assert.equal(h.panel.order.phone,'0411222333');
});
test('saved drafts, existing orders, closed panels and replacement forms ignore late defaults',async()=>{
 for(const replacement of [null,{mode:'new',idempotencyKey:'two',order:{siteContact:'Next'}},{mode:'new',idempotencyKey:'one',draftId:'saved',order:{siteContact:'Draft'}},{mode:'edit',idempotencyKey:'one',order:{siteContact:'Existing'}}]){
  const h=harness(),pending=h.context.load('one','alice');h.panel=replacement;h.complete();await pending;assert.equal(h.panel,replacement);
 }
});
test('account switches cannot apply an earlier account contact response',async()=>{
 const h=harness(),pending=h.context.load('one','alice'),original=h.panel;h.context.PanelStock.username='bob';h.complete();await pending;assert.equal(h.panel,original);
});
test('missing phone stays blank and failures permit manual entry without using stale preferences',async()=>{
 const h=harness(),pending=h.context.load('one','alice');h.complete({username:'alice',displayName:'Admin Name',phone:'',siteOrderDefaults:{phone:'9999'}});await pending;assert.equal(h.panel.order.phone,'');
 for(const [profile,status] of [[{username:'bob',displayName:'Wrong account',phone:'123'},200],[{},503]]){
  const j=harness(),request=j.context.load('one','alice');j.complete(profile,status);await request;assert.equal(j.panel.order.siteContact,'');assert.match(j.panel.contactDefaultsError,/Enter the site contact and phone/);j.context.edit('phone','Manual');assert.equal(j.panel.order.phone,'Manual');
 }
});
