const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
function workerHarness(source,scope){
  const handlers={},buckets=new Map(),base=new URL(scope);
  let offline=false;
  const key=value=>new URL(typeof value==='string'?value:value.url,base).href;
  const caches={
    keys:async()=>[...buckets.keys()],
    delete:async name=>buckets.delete(name),
    open:async name=>{
      if(!buckets.has(name))buckets.set(name,new Map());
      const entries=buckets.get(name);
      return {
        addAll:async assets=>{for(const asset of assets)entries.set(key(asset),new Response('static asset'));},
        put:async(req,response)=>entries.set(key(req),response.clone()),
        match:async req=>entries.get(key(req))?.clone()
      };
    }
  };
  const clients={claim:async()=>{}};
  const context={URL,Request,Response,Headers,caches,clients,console,
    fetch:async()=>{if(offline)throw Error('Offline');return new Response('online asset');},
    self:{location:base,registration:{scope},clients,skipWaiting:async()=>{},addEventListener:(name,fn)=>handlers[name]=fn}};
  vm.runInNewContext(source,context);
  async function dispatch(name,request){
    let response;const pending=[];
    handlers[name]({request,waitUntil:promise=>pending.push(promise),respondWith:promise=>{response=promise;}});
    const result=await response;await Promise.all(pending);return result;
  }
  return {caches,buckets,dispatch,offline:()=>{offline=true;}};
}

test('desktop first installation includes offline CSS and only existing local assets',async()=>{
 const root=path.resolve(__dirname,'..'),source=fs.readFileSync(path.join(root,'push-sw.js'),'utf8');
 const h=workerHarness(source,'https://web.example/');
 await h.dispatch('install');await h.dispatch('activate');h.offline();
 for(const url of h.buckets.get('panelstock-shell-v2').keys()){
   const asset=new URL(url).pathname;
   assert.ok(fs.existsSync(path.join(root,asset==='/'?'index.html':asset.slice(1))),asset);
 }
 assert.equal((await h.dispatch('fetch',new Request('https://web.example/tailwind.css'))).status,200);
 assert.equal((await h.dispatch('fetch',{url:'https://web.example/index.html?open=notifications',method:'GET',mode:'navigate',headers:new Headers()})).status,200);
 assert.equal(await h.dispatch('fetch',new Request('https://api.example/support')),undefined);
 assert.equal(await h.dispatch('fetch',new Request('https://web.example/index.html?token=secret')),undefined);
 assert.doesNotMatch(source,/cdn.tailwindcss.com/);
});
