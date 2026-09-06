const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync(require.resolve('../panelstock-client.js'),'utf8');
const SESSION='panelstock:session:v2',OUTBOX='panelstock:outbox:v2';
const user=name=>({username:name,token:'synthetic-'+name,isAdmin:true,expiresAt:Date.now()+600000});
const storage=()=>{const map=new Map();return {getItem:key=>map.get(key)||null,setItem:(key,value)=>map.set(key,value),removeItem:key=>map.delete(key)};};
const deferred=()=>{let resolve;const promise=new Promise(done=>resolve=done);return {promise,resolve};};
async function harness(fetchImpl=async()=>Response.json({ok:true}),pending=false,settings={}){
  const localStorage=storage(),sessionStorage=storage(),events=[],calls=[];
  const clock={now:Date.now()};
  const initialSession=Object.hasOwn(settings,'session')?settings.session:user('a');
  if(initialSession)sessionStorage.setItem(SESSION,JSON.stringify(initialSession));
  const queue={owner:settings.owner||'owner',view:{revision:1,variants:[]},queue:pending?[{mutationId:'retained',changes:[{field:'variants',id:'stock',before:null,after:{id:'stock',qty:1}}]}]:[],draft:null,blocked:null};
  if(pending||settings.cached)localStorage.setItem(OUTBOX,JSON.stringify(queue));
  class Element{
    constructor(tag){this.tagName=tag;this.children=[];this.style={};this.dataset={};this.attributes={};this.textContent='';}
    append(...nodes){for(const node of nodes){this.children.push(node);node.parentElement=this;}}
    appendChild(node){this.append(node);return node;}
    replaceChildren(...nodes){this.children=[];this.append(...nodes);}
    querySelectorAll(){return [];}
    setAttribute(key,value){this.attributes[key]=value;}
    focus(){}
  }
  const body=new Element('body'),walk=node=>[node,...node.children.flatMap(walk)];
  const document={body,documentElement:body,querySelectorAll:()=>[],createElement:tag=>new Element(tag),getElementById:id=>walk(body).find(node=>node.id===id),addEventListener(){},removeEventListener(){}};
  const context={console,URL,Headers,Response,Request,AbortSignal,Event,CustomEvent,Blob,crypto,localStorage,sessionStorage,document,
    Date:class extends Date{static now(){return clock.now;}},
    location:{href:'https://app.test/',reload(){}},navigator:{locks:{request:(_name,_options,fn)=>fn({})}},
    setTimeout,clearTimeout,queueMicrotask,requestAnimationFrame:fn=>queueMicrotask(fn),MutationObserver:class{observe(){}},
    dispatchEvent:event=>{events.push(event.type);return true;},addEventListener(){},
    fetch:async(url,options)=>{calls.push([url,options]);return url.endsWith('/session')&&!settings.customSession?Response.json({username:'a',isAdmin:true}):fetchImpl(url,options);}};
  vm.runInNewContext(source,context);
  const api=context.PanelStock,initUser=await api.init('https://api.test');
  return {api,initUser,clock,events,calls,queue,localStorage,sessionStorage,nodes:()=>walk(body)};
}
const login=async(h,name)=>{const response=await h.api.apiFetch('https://api.test/login',{method:'POST',body:JSON.stringify({username:name})});return response.json();};

test('an old 401 cannot sign out a newer account',async()=>{
  const old=deferred();
  const h=await harness((url,options)=>url.endsWith('/login')?Response.json(user(JSON.parse(options.body).username)):old.promise);
  const request=h.api.apiFetch('https://api.test/profile');const rejected=assert.rejects(request,/Session changed/);
  await login(h,'b');old.resolve(Response.json({error:'expired'},{status:401}));await rejected;
  assert.equal(h.api.username,'b');assert.equal(h.events.includes('panelstock-session-expired'),false);
  assert.equal(JSON.parse(h.sessionStorage.getItem(SESSION)).username,'b');
});
test('current-account 401 clears identity but retains pending stock changes',async()=>{
  const h=await harness(async()=>Response.json({error:'expired'},{status:401}),true);
  await h.api.apiFetch('https://api.test/profile');
  assert.equal(h.api.username,null);assert.equal(h.sessionStorage.getItem(SESSION),null);
  assert.ok(h.events.includes('panelstock-session-expired'));
  assert.equal(h.localStorage.getItem(OUTBOX),JSON.stringify(h.queue));
});
test('late success and delayed JSON are rejected after logout',async()=>{
  const old=deferred();
  const h=await harness(url=>url.endsWith('/logout')?Response.json({ok:true}):old.promise);
  const request=h.api.apiFetch('https://api.test/profile'),rejected=assert.rejects(request,/Session changed/);
  await h.api.logout();old.resolve(Response.json({private:'a'}));await rejected;
  const body=deferred(),j=await harness(async url=>url.endsWith('/logout')?Response.json({ok:true}):{ok:true,status:200,json:()=>body.promise,text:async()=>'',arrayBuffer:async()=>new ArrayBuffer(0),blob:async()=>new Blob(),clone(){return this;}});
  const response=await j.api.apiFetch('https://api.test/profile'),json=response.json(),jsonRejected=assert.rejects(json,/Session changed/);
  await j.api.logout();body.resolve({private:'a'});await jsonRejected;
});
test('a pending login cannot restore identity after logout or supersede a newer login',async()=>{
  for(const next of ['logout','login']){
    const old=deferred();let requests=0;
    const h=await harness(url=>url.endsWith('/login')?(++requests===1?old.promise:Response.json(user('c'))):Response.json({ok:true}));
    const first=login(h,'b'),rejected=assert.rejects(first,/Session changed/);
    if(next==='logout')await h.api.logout();else await login(h,'c');
    old.resolve(Response.json(user('b')));await rejected;assert.equal(h.api.username,next==='logout'?null:'c');
  }
});
test('slow sign-out revokes only its captured token and cannot clear the next account',async()=>{
  const old=deferred();
  const h=await harness((url,options)=>url.endsWith('/login')?Response.json(user(JSON.parse(options.body).username)):old.promise,true);
  const logout=h.api.logout();assert.equal(h.api.username,null);
  await login(h,'b');old.resolve(Response.json({ok:true}));await logout;
  assert.equal(h.api.username,'b');
  const call=h.calls.find(([url])=>url.endsWith('/logout'));
  assert.equal(call[1].headers.Authorization,'Bearer synthetic-a');assert.equal(call[1].body,'{}');
  assert.equal(h.localStorage.getItem(OUTBOX),JSON.stringify(h.queue));
});
test('wrong-owner recovery offers Switch user without discarding the queued work',async()=>{
  const h=await harness(async()=>{throw Error('offline');},true);
  const button=h.nodes().find(node=>node.tagName==='button'&&node.textContent==='Switch user');
  assert.ok(button);await button.onclick({currentTarget:button});
  assert.equal(h.api.username,null);assert.equal(h.sessionStorage.getItem(SESSION),null);
  assert.equal(h.localStorage.getItem(OUTBOX),JSON.stringify(h.queue));
  assert.match(h.nodes().map(node=>node.textContent).join(' '),/Server sign-out could not be confirmed/);
  assert.equal(h.nodes().find(node=>node.id==='panelstock-safety-notice').style.cssText.includes('inset:0'),false);
});
test('a delayed mutation error cannot mark the old owner’s queue as conflicted after switching accounts',async()=>{
  const body=deferred();
  const h=await harness(async(url,options)=>url.endsWith('/login')?Response.json(user(JSON.parse(options.body).username)):{ok:false,status:409,json:()=>body.promise,text:async()=>'',arrayBuffer:async()=>new ArrayBuffer(0),blob:async()=>new Blob(),clone(){return this;}},true);
  await login(h,'owner');
  const flush=h.api.flush();
  await new Promise(resolve=>setImmediate(resolve));
  await login(h,'b');body.resolve({error:'old conflict'});await flush;
  assert.equal(h.api.username,'b');
  assert.equal(h.api.outbox.state.blocked,null);
  assert.equal(h.localStorage.getItem(OUTBOX),JSON.stringify(h.queue));
});

test('snapshot does not return a previous owner’s cached stock',async()=>{
  const h=await harness(async()=>{throw Error('offline');},true);
  assert.equal(await h.api.snapshot(),null);assert.equal(h.localStorage.getItem(OUTBOX),JSON.stringify(h.queue));
});


for(const failure of [408,429,500,502,503,504,'network']){
  test('startup and snapshot recover the owner cache after '+failure,async()=>{
    const h=await harness(async()=>{if(failure==='network')throw TypeError('network unavailable');return Response.json({}, {status:failure});},true,{owner:'a',customSession:true});
    assert.equal(h.initUser.username,'a');assert.equal(h.initUser.offline,true);
    assert.equal(h.api.status,'offline');
    const view=await h.api.snapshot();
    assert.equal(JSON.stringify(view),JSON.stringify(h.queue.view));
    view.variants.push({id:'not-saved'});
    assert.equal(h.api.outbox.state.view.variants.length,0);
    assert.equal(h.localStorage.getItem(OUTBOX),JSON.stringify(h.queue));
  });
}
test('a synced cache also reopens during a server outage',async()=>{
  const h=await harness(async()=>Response.json({}, {status:503}),false,{owner:'a',cached:true,customSession:true});
  assert.equal(h.initUser.offline,true);assert.equal(h.api.pending,false);
  assert.equal((await h.api.snapshot()).revision,1);
});
for(const status of [400,401,403,404]){
  test('HTTP '+status+' is not treated as permission to restore cached stock',async()=>{
    const h=await harness(async url=>Response.json({}, {status:url.endsWith('/mutations')?503:status}),true,{owner:'a',customSession:true});
    assert.equal(h.initUser,null);assert.equal(await h.api.snapshot(),null);
    assert.equal(h.localStorage.getItem(OUTBOX),JSON.stringify(h.queue));
    if(status===401)assert.equal(h.api.username,null);
  });
}
test('offline startup cannot restore another owner or a missing cache',async()=>{
  for(const settings of [{owner:'other',cached:true},{owner:'a',cached:false}]){
    const h=await harness(async()=>{throw Error('offline');},false,{...settings,customSession:true});
    assert.equal(h.initUser,null);assert.equal(await h.api.snapshot(),null);
  }
});
test('missing, expired and undated sessions cannot open cached stock',async()=>{
  for(const session of [null,{...user('a'),expiresAt:Date.now()-1000},{...user('a'),expiresAt:undefined}]){
    const h=await harness(async()=>Response.json({}, {status:503}),true,{owner:'a',session,customSession:true});
    assert.equal(h.initUser,null);assert.equal(await h.api.snapshot(),null);
    assert.equal(h.api.username,null);
    assert.equal(h.localStorage.getItem(OUTBOX),JSON.stringify(h.queue));
    assert.equal(h.calls.length,0);
  }
});
test('a session expiring after load is cleared before a queued mutation can be sent',async()=>{
  const h=await harness(async()=>Response.json({}, {status:503}),true,{owner:'a'});
  h.clock.now+=700000;
  assert.equal(await h.api.snapshot(),null);assert.equal(h.api.username,null);
  assert.equal(h.calls.some(([url])=>url.endsWith('/mutations')),false);
  assert.equal(h.localStorage.getItem(OUTBOX),JSON.stringify(h.queue));
});
test('a session expiring during a failed request cannot return the cache',async()=>{
  const wait=deferred();
  const h=await harness(()=>wait.promise,false,{owner:'a',cached:true});
  const snapshot=h.api.snapshot();await new Promise(resolve=>setImmediate(resolve));
  h.clock.now+=700000;wait.resolve(Response.json({}, {status:503}));
  assert.equal(await snapshot,null);
});
test('delayed offline initialization and snapshots cannot restore an old account',async()=>{
  for(const method of ['init','snapshot']){
    const wait=deferred();let delayed=false;
    const h=await harness((url,options)=>{
      if(url.endsWith('/login'))return Response.json(user(JSON.parse(options.body).username));
      if(url.endsWith('/session')&&!delayed)return Response.json({username:'a',isAdmin:true});
      return wait.promise;
    },false,{owner:'a',cached:true,customSession:true});
    delayed=true;
    const request=method==='init'?h.api.init('https://api.test'):h.api.snapshot();
    await new Promise(resolve=>setImmediate(resolve));
    await login(h,'b');wait.resolve(Response.json({}, {status:503}));
    assert.equal(await request,null);assert.equal(h.api.username,'b');
  }
});

// Execute the real compiled startup effect so optional metadata cannot regress
// into a blocking await even when the shared client itself handles outages.
const html=fs.readFileSync(require.resolve('../index.html'),'utf8').replace(/\r\n/g,'\n');
const effectStart=html.indexOf('    useEffect(() => {\n      let active = true;\n      (async () => {');
assert.ok(effectStart>=0);
const startupEffect=html.slice(effectStart,html.indexOf('\n    useEffect(',effectStart+20));
async function runStartup(metadata){
  const finished=deferred(),state={},cache={revision:1,variants:[{id:'cached-stock',qty:9}]};
  const optionalCalls=[];
  const context={console,PanelStock:{username:'a',init:async()=>({username:'a',isAdmin:true,offline:true}),snapshot:async()=>cache,apiFetch:async url=>{optionalCalls.push(url);return metadata(url);}},
    BAKED_WORKER_URL:'https://api.test',CNC_PUBLIC_TOKEN:null,DEFAULT_EMAIL_CONFIG:{},STORAGE_KEYS:{},loadKey:async()=>'',saveKey(){},
    ensureMissingPanelReason:value=>value||[],useEffect:callback=>callback(),TABS:[{id:'soh',tasks:[]}],setTab(){}};
  for(const name of ['RememberedUsername','EmailConfig','OwnProfile','Variants','Offcuts','Transactions','Reasons','Catalog','Photos','CncPanels','Username','IsAdmin','TaskAccess'])context['set'+name]=value=>state[name]=value;
  context.setLoading=value=>{state.Loading=value;if(value===false)finished.resolve();};
  vm.runInNewContext(startupEffect,context);
  await finished.promise;
  return {state,optionalCalls};
}
for(const failure of ['rejected','slow','503']){
  test('the real startup effect restores stock without waiting for '+failure+' optional metadata',{timeout:2000},async()=>{
    const metadata=deferred();
    const result=await runStartup(()=>failure==='rejected'?Promise.reject(Error('offline')):failure==='slow'?metadata.promise:Response.json({}, {status:503}));
    assert.equal(result.state.Username,'a');assert.equal(result.state.Variants[0].id,'cached-stock');assert.equal(result.state.Loading,false);
    assert.ok(result.optionalCalls.some(url=>url.endsWith('/cnc-share')));
    assert.ok(result.optionalCalls.some(url=>url.endsWith('/config')));
    metadata.resolve(Response.json({}, {status:503}));
  });
}
