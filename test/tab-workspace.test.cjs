const test=require('node:test'),assert=require('node:assert/strict');
const {acquire,scopedStorage}=require('../tab-workspace.js');
const {IndexedOutboxStorage,Outbox}=require('../panelstock-client.js');
const KEY='panelstock:outbox:v2',LOCK='panelstock-editor-v2';
function memory(){const data=new Map();return {data,get length(){return data.size;},key:index=>[...data.keys()][index],getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value),removeItem:key=>data.delete(key)};}
function lockService(){
 const held=new Set(),queues=new Map();
 function request(name,options,callback){
  return new Promise((resolve,reject)=>{
   const start=()=>{held.add(name);const release=()=>{held.delete(name);const next=queues.get(name)?.shift();if(next)next();};Promise.resolve().then(()=>callback({name})).then(value=>{release();resolve(value);},error=>{release();reject(error);});};
   if(!held.has(name))start();
   else if(options.ifAvailable)Promise.resolve().then(()=>callback(null)).then(resolve,reject);
   else{if(!queues.has(name))queues.set(name,[]);queues.get(name).push(start);}
  });
 }
 return {held,request};
}
function environment(){const storage=memory(),locks=lockService();let id=0;return {storage,locks,open(sessionStorage=memory(),owner='alex'){return acquire({locks,storage,sessionStorage,key:KEY,legacyLock:LOCK,owner,read:async key=>storage.getItem(key),uuid:()=>`00000000-0000-4000-8000-${String(++id).padStart(12,'0')}`});}};}
const tick=()=>new Promise(setImmediate);
test('concurrent pages and duplicated session storage receive separate durable queues',async()=>{
 const e=environment(),session=memory();
 const first=await e.open(session),clone=memory();clone.setItem(KEY+':workspace',session.getItem(KEY+':workspace'));
 const [second,third]=await Promise.all([e.open(clone),e.open()]);
 assert.equal(first.key,KEY);assert.notEqual(second.key,first.key);assert.notEqual(third.key,second.key);
 for(const [lease,name]of [[first,'first'],[second,'second'],[third,'third']])e.storage.setItem(lease.key,JSON.stringify({owner:'alex',queue:[{id:name}]}));
 assert.equal(JSON.parse(e.storage.getItem(first.key)).queue[0].id,'first');assert.equal(JSON.parse(e.storage.getItem(second.key)).queue[0].id,'second');
 first.release();second.release();third.release();await tick();
});
test('reload and a later page recover pending work only after its previous owner page closes',async()=>{
 const e=environment(),primary=await e.open(),session=memory(),second=await e.open(session);
 const packet=JSON.stringify({owner:'alex',queue:[{mutationId:'retained-packet'}],draft:null});e.storage.setItem(second.key,packet);
 const active=await e.open();assert.notEqual(active.key,second.key);active.release();second.release();await tick();
 const reloaded=await e.open(session);assert.equal(reloaded.key,second.key);assert.equal(e.storage.getItem(reloaded.key),packet);
 reloaded.release();await tick();const recovered=await e.open();assert.equal(recovered.key,second.key);assert.equal(e.storage.getItem(recovered.key),packet);
 primary.release();recovered.release();await tick();
});
test('another account cannot claim or overwrite an orphaned pending queue',async()=>{
 const e=environment(),saved=JSON.stringify({owner:'alex',queue:[{id:'private'}]});e.storage.setItem(KEY,saved);
 const sam=await e.open(undefined,'sam');assert.notEqual(sam.key,KEY);assert.equal(e.storage.getItem(KEY),saved);
 const alex=await e.open();assert.equal(alex.key,KEY);assert.equal(e.storage.getItem(KEY),saved);sam.release();alex.release();await tick();
});
test('an older open editor keeps its original queue while new pages use their own',async()=>{
 const e=environment();let release;
 void e.locks.request(LOCK,{},()=>new Promise(done=>release=done));await tick();
 const saved=JSON.stringify({owner:'alex',queue:[{id:'old-version'}]});e.storage.setItem(KEY,saved);
 const modern=await e.open();assert.notEqual(modern.key,KEY);assert.equal(e.storage.getItem(KEY),saved);
 release();await tick();const recovered=await e.open();assert.equal(recovered.key,KEY);modern.release();recovered.release();await tick();
});
test('site drafts and comments are isolated while account and project cache keys stay shared',()=>{
 const storage=memory(),first=scopedStorage(storage,KEY,KEY,['draft:','comment:']),second=scopedStorage(storage,KEY,KEY+':tab:12345678-1234-4234-8234-123456789012',['draft:','comment:']);
 first.setItem('draft:alex','first draft');second.setItem('draft:alex','second draft');first.setItem('comment:alex:order','first comment');second.setItem('comment:alex:order','second comment');
 assert.equal(first.getItem('draft:alex'),'first draft');assert.equal(second.getItem('draft:alex'),'second draft');assert.equal(first.getItem('comment:alex:order'),'first comment');
 second.setItem('projects','shared cache');assert.equal(first.getItem('projects'),'shared cache');second.removeItem('draft:alex');assert.equal(first.getItem('draft:alex'),'first draft');
});
test('scoped IndexedDB fallback writes and read-only probes cannot change another queue',async()=>{
 const storage=memory(),saved=JSON.stringify({owner:'alex',queue:[{id:'keep'}]});storage.setItem(KEY,saved);
 const own=KEY+':tab:12345678-1234-4234-8234-123456789012',adapter=await new IndexedOutboxStorage(storage,()=>{},false,own).ready();
 const box=new Outbox(adapter,async()=>new Response('{}',{status:503}));box.snapshot({variants:[],revision:1},'alex');box.stage({variants:[{id:'new',qty:1}]},'alex');await tick();
 assert.equal(storage.getItem(KEY),saved);assert.ok(JSON.parse(storage.getItem(own)).queue.length);
 const probe=await new IndexedOutboxStorage(storage,()=>{},true).ready();assert.throws(()=>probe.setItem(KEY,'changed'),/cannot change/);assert.throws(()=>probe.removeItem(KEY),/cannot change/);assert.equal(storage.getItem(KEY),saved);
});


test('an empty preferred workspace cannot hide recoverable work from a closed page',async()=>{
 const e=environment(),session=memory(),first=await e.open(session),second=await e.open();
 const pending=JSON.stringify({owner:'alex',queue:[{id:'recover-me'}]});e.storage.setItem(second.key,pending);
 first.release();second.release();await tick();
 const reopened=await e.open(session);assert.equal(reopened.key,second.key);assert.equal(e.storage.getItem(reopened.key),pending);reopened.release();await tick();
});
