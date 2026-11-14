const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require.resolve('../purchase-requests.js'),'utf8');
const wait=()=>new Promise(resolve=>setImmediate(resolve));
function deferred(){let resolve;const promise=new Promise(done=>resolve=done);return{promise,resolve};}
function directory(revision='v1',updatedAt=new Date(Date.now()-1000).toISOString()){
 return{projectPageId:60,revision,updatedAt,suppliers:[{id:'225',text:'Supplier'}],services:[{id:'8',name:'Supply'}],breakdowns:[{id:'b_20',name:'Cladding'},{id:'b_70',name:'Miscellaneous'}],accounts:[{id:'51097',name:'Materials'}],taxes:[{id:'1',name:'GST',rate:10},{id:'0',name:'No GST',rate:0}]};
}
async function harness({saved=null,shared=()=>({sharedChoices:directory()})}={}){
 const calls=[],timers=new Map();let timerId=0,owner='requestor',lookup=()=>({lookup:{id:'lookup',projectPageId:60,state:'ready'},catalog:directory()}),submission=()=>{throw Error('Synthetic ambiguous submit');};
 let instant=Date.now(),sharedLookup=shared;
 class ClockDate extends Date{constructor(...args){super(...(args.length?args:[instant]));}static now(){return instant;}}
 class Node{
  constructor(tag){this.tagName=tag;this.children=[];this.events={};this._value='';this.textContent='';this.classList={toggle(){}};this.ownerDocument=doc;}
  appendChild(node){this.children.push(node);node.parentNode=this;return node;}
  replaceChildren(...nodes){this.children=[];if(this.tagName==='select')this._value='';for(const node of nodes)this.appendChild(node);}
  remove(){if(this.parentNode)this.parentNode.children=this.parentNode.children.filter(node=>node!==this);}
  setAttribute(name,value){this[name]=value;}
  addEventListener(name,callback){(this.events[name]||=([])).push(callback);}
  emit(name){for(const callback of this.events[name]||[])callback({preventDefault(){},target:this});}
  get options(){return this.tagName==='select'?this.children:[];}
  get value(){return this.tagName==='select'&&!this.children.some(node=>node.value===this._value)?'':this._value;}
  set value(value){this._value=String(value);}
  querySelector(selector){const name=selector.match(/^\[name=([^\]]+)\]$/)?.[1];return walk(this).find(node=>node.name===name)||null;}
  reportValidity(){return true;}
  reset(){for(const node of walk(this))if(node.name)node.value='';}
 }
 const doc={hidden:false,createElement:tag=>new Node(tag)};doc.body=new Node('body');
 const walk=node=>[node,...node.children.flatMap(walk)],host=new Node('div');
 const context={Date:ClockDate,Intl,JSON,TextDecoder,Uint8Array,URL,Blob,AbortController,crypto,console,
  setTimeout(callback,delay){const id=++timerId;timers.set(id,{callback,delay});return id;},clearTimeout:id=>timers.delete(id)};
 vm.runInNewContext(source,context);
 const apiFetch=async(url,options={})=>{
  const path=new URL(url).pathname;calls.push({path,options});let data;
  if(path==='/purchase-requests'&&options.method!=='POST')data={ok:true,requests:[],projects:[{projectPageId:60,name:'Jardin building'},{projectPageId:59,name:'Salacia building'}],profile:{name:'Requestor',email:'requestor@example.test'},permissions:{create:true,manage:false},connection:{connected:true}};
  else if(path==='/purchase-requests/shared-choices'){data=await sharedLookup();if(data.status)return{ok:false,status:data.status,json:async()=>({})};}
  else if(path==='/purchase-requests/lookups')data={ok:true,...await lookup()};
  else if(path.startsWith('/purchase-requests/lookups/'))data={ok:true,...await lookup()};
  else if(path==='/purchase-requests'&&options.method==='POST')return await submission(options);
  else return{ok:false,status:404,json:async()=>({})};
  return{ok:true,status:200,json:async()=>data};
 };
 const view=context.PanelStockPurchaseRequests.mount(host,{username:'requestor',workerUrl:'https://api.example.test',currentUsername:()=>owner,apiFetch,storage:{read:async()=>saved,write:async body=>{saved=JSON.parse(JSON.stringify(body));},clear:async()=>{saved=null;}}});
 await wait();
 const byName=name=>walk(host).find(node=>node.name===name),byText=text=>walk(host).find(node=>node.textContent===text);
 const timer=async delay=>{const entry=[...timers].find(([,item])=>item.delay===delay);assert.ok(entry,'timer '+delay+' exists');timers.delete(entry[0]);entry[1].callback();await wait();};
 return{host,view,calls,timers,byName,byText,walk:()=>walk(host),timer,setLookup:callback=>{lookup=callback;},setShared:callback=>{sharedLookup=callback;},now:()=>instant,advance:ms=>{instant+=ms;},setSubmission:callback=>{submission=callback;},setHidden:value=>{doc.hidden=value;},changeOwner:value=>{owner=value;},async selectProject(id='60'){byName('project').value=id;byName('project').emit('change');await wait();}};
}

function choiceState(h,disabled,placeholder,names=['supplier','service','account','tax']){
 for(const node of h.walk().filter(node=>node.tagName==='select'&&names.includes(node.name))){
  assert.equal(node.disabled,disabled,node.name+' availability');
  if(placeholder)assert.equal(node.options.find(option=>option.value==='').textContent,placeholder,node.name+' placeholder');
 }
}

test('common choices are ready before project selection and remain usable while EOW loads, including added lines',async()=>{
 const h=await harness();choiceState(h,false,'Select…');choiceState(h,true,'Select a project first',['breakdown']);assert.notEqual(h.byName('project').disabled,true);
 h.setLookup(()=>({lookup:{id:'queued',projectPageId:60,state:'queued'}}));await h.selectProject();
 choiceState(h,false,'Select…');choiceState(h,true,'Loading choices…',['breakdown']);assert.ok(h.byText('Loading this project’s extents of work…'));
 h.byText('Add line').emit('click');choiceState(h,false,'Select…');
 assert.equal(h.walk().filter(node=>node.name==='account').length,2);assert.notEqual(h.byName('description').disabled,true);
 h.byName('description').value='Entered while loading';
 h.setLookup(()=>({lookup:{id:'queued',projectPageId:60,state:'ready'},catalog:directory()}));await h.timer(1000);
 choiceState(h,false,'Select…');assert.equal(h.byName('description').value,'Entered while loading');assert.equal(h.byName('tax').value,'1');
 assert.equal(h.byText('Submit purchase request').disabled,false);h.view.destroy();
});

test('editing the project search pauses only EOW without clearing common choices or zero GST',async()=>{
 const h=await harness();await h.selectProject();h.byName('supplier').value='225';h.byName('tax').value='0';
 const before=h.calls.filter(call=>call.path==='/purchase-requests/lookups').length;
 h.byName('project').value='';h.byName('project').emit('input');choiceState(h,false,'Select…');choiceState(h,true,'Select a project first',['breakdown']);
 assert.equal(h.byText('Submit purchase request').disabled,true);
 h.byName('project').value='60';h.byName('project').emit('input');choiceState(h,false,'Select…');
 assert.equal(h.byName('supplier').value,'225');assert.equal(h.byName('tax').value,'0');assert.equal(h.byText('Submit purchase request').disabled,false);
 assert.equal(h.calls.filter(call=>call.path==='/purchase-requests/lookups').length,before,'search input does not queue lookups');h.view.destroy();
});

test('project choices have no normal refresh control and the recovery control stays hidden while loading or ready',async()=>{
 const h=await harness(),retry=h.byText('Retry project choices');assert.equal(retry.hidden,true);assert.equal(h.byText('Refresh project choices'),undefined);
 const pending=deferred();h.setLookup(()=>pending.promise);await h.selectProject();assert.equal(retry.hidden,true);
 pending.resolve({lookup:{id:'lookup',projectPageId:60,state:'ready'},catalog:directory()});await wait();
 assert.equal(retry.hidden,true);assert.ok(h.byText('Project choices are ready.'));h.view.destroy();
});

test('extent of work display cleanup preserves its catalog identity, revision and submitted line values',async()=>{
 const h=await harness(),full=directory('exact-source-revision');full.breakdowns=[{id:'ew_234',name:'Permits · ew_234'}];
 h.setLookup(()=>({lookup:{id:'lookup',projectPageId:60,state:'ready'},catalog:full}));await h.selectProject();
 assert.ok(h.byText('Extent of work *'));assert.equal(h.byName('breakdown').options.find(option=>option.value==='ew_234').textContent,'Permits');
 for(const[name,value]of Object.entries({supplier:'225',service:'8',breakdown:'ew_234',account:'51097',tax:'0',description:'Existing source identity',price:'10'}))h.byName(name).value=value;
 h.walk().find(node=>node.tagName==='form').emit('submit');await wait();
 const saved=JSON.parse(h.calls.find(call=>call.path==='/purchase-requests'&&call.options.method==='POST').options.body);
 assert.equal(saved.breakdownType,'ew_234');assert.equal(saved.lines[0].breakdownType,'ew_234');assert.equal(saved.catalogRevision,'exact-source-revision');
 assert.equal(full.breakdowns[0].name,'Permits · ew_234');assert.equal(full.revision,'exact-source-revision');h.view.destroy();
});

test('project selection accepts fresh cached choices while automatic refresh and explicit retry request current Nexvia data',async()=>{
 const h=await harness();await h.selectProject();
 const payloads=()=>h.calls.filter(call=>call.path==='/purchase-requests/lookups').map(call=>JSON.parse(call.options.body));
 assert.deepEqual(payloads(),[{projectPageId:60}]);
 await h.timer(300000);assert.deepEqual(payloads().at(-1),{projectPageId:60,refresh:true});
 h.setLookup(()=>{throw Error('Synthetic refresh failure');});await h.timer(300000);
 h.setLookup(()=>({lookup:{id:'retry',projectPageId:60,state:'ready'},catalog:directory('new')}));
 h.byText('Retry project choices').emit('click');await wait();assert.deepEqual(payloads().at(-1),{projectPageId:60,refresh:true});
 assert.ok(h.byText('Project choices are ready.'));h.view.destroy();
});

test('five-minute refresh keeps entered fields and zero GST while disabling submit until current choices return',async()=>{
 const h=await harness();await h.selectProject();
 h.byName('supplier').value='225';h.byName('service').value='8';h.byName('breakdown').value='b_20';h.byName('account').value='51097';h.byName('tax').value='0';
 h.byName('description').value='Keep my cladding description';h.byName('quantity').value='2.5';h.byName('price').value='19.95';h.byName('requestorName').value='Edited name';h.byName('supplierReference').value='QUOTE-123';
 const pending=deferred();h.setLookup(()=>pending.promise);await h.timer(300000);
 choiceState(h,false,'Select…');choiceState(h,true,'Loading choices…',['breakdown']);
 assert.equal(h.byText('Submit purchase request').disabled,true);assert.equal(h.byName('supplier').value,'225');assert.equal(h.byName('tax').value,'0');
 h.byName('description').value='Edited while refreshing';
 pending.resolve({lookup:{id:'refresh',projectPageId:60,state:'ready'},catalog:directory('v2')});await wait();
 choiceState(h,false,'Select…');
 for(const [name,value] of Object.entries({supplier:'225',service:'8',breakdown:'b_20',account:'51097',tax:'0',description:'Edited while refreshing',quantity:'2.5',price:'19.95',requestorName:'Edited name',supplierReference:'QUOTE-123'}))assert.equal(h.byName(name).value,value,name+' retained');
 assert.equal(h.byText('Submit purchase request').disabled,false);
 await h.timer(300000);assert.equal(h.byName('tax').value,'0','unchanged catalog revisions also preserve zero GST');assert.equal(h.byName('breakdown').value,'b_20');
 assert.equal(h.calls.filter(call=>call.path==='/purchase-requests'&&call.options.method==='POST').length,0);
 h.view.destroy();assert.equal(h.timers.size,0);
});

test('refresh removes unavailable IDs and never substitutes the default tax for a removed zero-GST choice',async()=>{
 const h=await harness();await h.selectProject();
 for(const [name,value] of Object.entries({supplier:'225',service:'8',breakdown:'b_20',account:'51097',tax:'0'}))h.byName(name).value=value;
 h.byName('description').value='Retained item';
 const catalog=directory('v2');catalog.suppliers=[{id:'225',text:'Supplier paused',disabled:true}];catalog.services=[{id:'9',name:'Replacement service'}];catalog.breakdowns=[{id:'b_70',name:'Miscellaneous'}];catalog.accounts=[{id:'51098',name:'Replacement account'}];catalog.taxes=[{id:'1',name:'GST',rate:10}];
 h.setShared(()=>({sharedChoices:catalog}));h.setLookup(()=>({lookup:{id:'refresh',projectPageId:60,state:'ready'},catalog}));await h.timer(300000);
 for(const name of ['supplier','service','breakdown','account','tax'])assert.equal(h.byName(name).value,'',name+' requires a current selection');
 assert.equal(h.byName('description').value,'Retained item');h.view.destroy();
});

test('a failed automatic refresh retains the draft and blocks submission until a successful retry',async()=>{
 const h=await harness();await h.selectProject();h.byName('tax').value='0';h.byName('description').value='Retained after timeout';
 h.setLookup(()=>{throw Error('Synthetic timeout');});await h.timer(300000);
 choiceState(h,false,'Select…');choiceState(h,true,'Choices unavailable',['breakdown']);
 assert.equal(h.byName('tax').value,'0');assert.equal(h.byName('description').value,'Retained after timeout');assert.equal(h.byText('Submit purchase request').disabled,true);
 assert.equal(h.byText('Retry project choices').hidden,false);
 const pending=deferred();h.setLookup(()=>pending.promise);h.byText('Retry project choices').emit('click');await wait();assert.equal(h.byText('Retry project choices').hidden,true);
 pending.resolve({lookup:{id:'retry',projectPageId:60,state:'ready'},catalog:directory('v2')});await wait();
 choiceState(h,false,'Select…');
 assert.equal(h.byName('tax').value,'0');assert.equal(h.byName('description').value,'Retained after timeout');assert.equal(h.byText('Submit purchase request').disabled,false);assert.equal(h.byText('Retry project choices').hidden,true);h.view.destroy();
});

test('review recovery offers Retry and clears unavailable selections while preserving zero GST and entered text',async()=>{
 const h=await harness();await h.selectProject();h.byName('supplier').value='225';h.byName('account').value='51097';h.byName('tax').value='0';h.byName('description').value='Keep this item';
 h.setLookup(()=>({lookup:{id:'review',projectPageId:60,state:'needs_review',message:'Connection needs attention'}}));await h.timer(300000);
 assert.equal(h.byText('Retry project choices').hidden,false);
 const catalog=directory('current');catalog.accounts=[{id:'51098',name:'Replacement account'}];catalog.suppliers=[];
 h.setShared(()=>({sharedChoices:catalog}));h.setLookup(()=>({lookup:{id:'retry',projectPageId:60,state:'ready'},catalog}));h.byText('Retry project choices').emit('click');await wait();
 assert.equal(h.byName('account').value,'');assert.equal(h.byName('supplier').value,'');assert.equal(h.byName('tax').value,'0');assert.equal(h.byName('description').value,'Keep this item');assert.equal(h.byText('Retry project choices').hidden,true);h.view.destroy();
});

test('a proven unsaved stale-choice rejection offers recovery without discarding valid draft selections',async()=>{
 const h=await harness();await h.selectProject();
 for(const[name,value]of Object.entries({supplier:'225',service:'8',breakdown:'b_20',account:'51097',tax:'0',description:'Retained after stale rejection',price:'10'}))h.byName(name).value=value;
 h.setSubmission(()=>({ok:false,status:409,json:async()=>({code:'PURCHASE_REQUEST_CHOICES_CHANGED',error:'Project choices changed'})}));
 h.walk().find(node=>node.tagName==='form').emit('submit');await wait();
 assert.equal(h.byText('Retry project choices').hidden,false);assert.equal(h.byName('tax').value,'0');assert.equal(h.byName('supplier').value,'225');assert.equal(h.byText('Submit purchase request').disabled,true);
 h.setLookup(()=>({lookup:{id:'retry',projectPageId:60,state:'ready'},catalog:directory('current')}));h.byText('Retry project choices').emit('click');await wait();
 assert.equal(h.byName('tax').value,'0');assert.equal(h.byName('description').value,'Retained after stale rejection');assert.equal(h.byText('Retry project choices').hidden,true);assert.equal(h.calls.filter(call=>call.path==='/purchase-requests'&&call.options.method==='POST').length,1);h.view.destroy();
});

test('hidden pages skip automatic project refresh and resume on the unchanged five-minute cadence',async()=>{
 const h=await harness();await h.selectProject();h.byName('tax').value='0';const before=h.calls.filter(call=>call.path==='/purchase-requests/lookups').length;
 h.setHidden(true);await h.timer(300000);assert.equal(h.calls.filter(call=>call.path==='/purchase-requests/lookups').length,before);assert.equal(h.byText('Retry project choices').hidden,true);
 h.setHidden(false);await h.timer(300000);assert.equal(h.calls.filter(call=>call.path==='/purchase-requests/lookups').length,before+1);assert.equal(h.byName('tax').value,'0');h.view.destroy();
});

test('lookup completion cannot replace a changed account and destroy clears all refresh timers',async()=>{
 const h=await harness();await h.selectProject();h.byName('tax').value='0';
 const pending=deferred();h.setLookup(()=>pending.promise);await h.timer(300000);h.changeOwner('another-account');
 const changed=directory('v2');changed.taxes=[];pending.resolve({lookup:{id:'late',projectPageId:60,state:'ready'},catalog:changed});await wait();
 assert.equal(h.byName('tax').value,'0');const before=h.calls.length;
 await h.timer(300000);assert.equal(h.calls.length,before);h.view.destroy();assert.equal(h.timers.size,0);
});

test('an old project lookup cannot restore stale choices after the selected project changes',async()=>{
 const h=await harness();await h.selectProject();const pending=deferred();h.setLookup(()=>pending.promise);await h.timer(300000);
 h.byName('project').value='';h.byName('project').emit('change');await wait();
 pending.resolve({lookup:{id:'late',projectPageId:60,state:'ready'},catalog:directory('late')});await wait();
 assert.equal(h.byName('project').value,'');assert.equal(h.byName('supplier').value,'');assert.equal(h.byText('Submit purchase request').disabled,true);h.view.destroy();
});

test('frozen ambiguous submissions skip automatic project lookups and preserve the exact saved payload',async()=>{
 const h=await harness();await h.selectProject();h.byName('supplier').value='225';h.byName('service').value='8';h.byName('breakdown').value='b_20';h.byName('account').value='51097';h.byName('description').value='Submitted once';h.byName('price').value='10';
 h.walk().find(node=>node.tagName==='form').emit('submit');await wait();
 const submitted=h.calls.find(call=>call.path==='/purchase-requests'&&call.options.method==='POST');assert.ok(submitted);
 const before=h.calls.filter(call=>call.path==='/purchase-requests/lookups').length;await h.timer(300000);
 assert.equal(h.calls.filter(call=>call.path==='/purchase-requests/lookups').length,before);assert.equal(h.calls.filter(call=>call.path==='/purchase-requests'&&call.options.method==='POST').length,1);
 assert.equal(JSON.parse(submitted.options.body).lines[0].description,'Submitted once');assert.equal(h.byText('Retry project choices').hidden,true);h.view.destroy();
});

test('changing projects preserves shared selections and draft text while clearing only project EOW',async()=>{
 const h=await harness();await h.selectProject();
 for(const[name,value]of Object.entries({supplier:'225',service:'8',breakdown:'b_70',account:'51097',tax:'0',description:'Keep my item',quantity:'2',price:'10',supplierReference:'QUOTE-A'}))h.byName(name).value=value;
 const pending=deferred();h.setLookup(()=>pending.promise);await h.selectProject('59');
 for(const[name,value]of Object.entries({supplier:'225',service:'8',account:'51097',tax:'0',description:'Keep my item',quantity:'2',price:'10',supplierReference:'QUOTE-A'}))assert.equal(h.byName(name).value,value,name+' retained');
 assert.equal(h.byName('breakdown').value,'');choiceState(h,false,'Select…');choiceState(h,true,'Loading choices…',['breakdown']);assert.equal(h.byText('Submit purchase request').disabled,true);
 h.byText('Add line').emit('click');assert.equal(h.walk().filter(node=>node.name==='account').length,2);choiceState(h,false,'Select…');
 pending.resolve({lookup:{id:'b',projectPageId:59,state:'needs_review',message:'EOW temporarily unavailable'}});await wait();
 choiceState(h,false,'Select…');choiceState(h,true,'Choices unavailable',['breakdown']);assert.equal(h.byName('tax').value,'0');assert.equal(h.byText('Retry project choices').hidden,false);
 const b={...directory('project-B'),projectPageId:59,breakdowns:[{id:'b_70',name:'Miscellaneous in B'},{id:'ew_729',name:'Cladding in B'}]};
 h.setLookup(()=>({lookup:{id:'b',projectPageId:59,state:'ready'},catalog:b}));h.byText('Retry project choices').emit('click');await wait();
 assert.equal(h.byName('breakdown').value,'','same EOW ID across projects is never automatically retained');assert.equal(h.byName('supplier').value,'225');assert.equal(h.byName('tax').value,'0');h.view.destroy();
});

test('newer shared choices never regress to an older GET and shared menus are not fetched with history polling',async()=>{
 const newer=directory('new',new Date(Date.now()-100).toISOString());newer.suppliers=[{id:'225',text:'New supplier name'}];
 const h=await harness({shared:()=>({sharedChoices:newer})});assert.equal(h.byName('supplier').options[1].textContent,'New supplier name');
 h.setShared(()=>({sharedChoices:directory('old',new Date(h.now()-2000).toISOString())}));await h.timer(300000);
 assert.equal(h.byName('supplier').options[1].textContent,'New supplier name');choiceState(h,false,'Select…');
 const before=h.calls.filter(call=>call.path==='/purchase-requests/shared-choices').length;await h.timer(10000);
 assert.equal(h.calls.filter(call=>call.path==='/purchase-requests/shared-choices').length,before);h.view.destroy();
});

test('older conflicting full catalogs trigger only one forced reconciliation and never replace newer shared menus',async()=>{
 const newer=directory('new',new Date(Date.now()-100).toISOString());newer.suppliers.push({id:'226',text:'New supplier'});
 const h=await harness({shared:()=>({sharedChoices:newer})});
 const old=directory('old',new Date(h.now()-2000).toISOString());h.setLookup(()=>({lookup:{id:'a',projectPageId:60,state:'ready'},catalog:old}));await h.selectProject();
 const posts=h.calls.filter(call=>call.path==='/purchase-requests/lookups');assert.equal(posts.length,2);assert.equal(JSON.parse(posts[1].options.body).refresh,true);
 assert.ok(h.byName('supplier').options.some(row=>row.value==='226'));choiceState(h,false,'Select…');assert.equal(h.byText('Submit purchase request').disabled,true);assert.equal(h.byText('Retry project choices').hidden,false);
 const current={...newer,updatedAt:new Date(h.now()-50).toISOString(),revision:'project-A-current'};
 h.setLookup(()=>({lookup:{id:'a',projectPageId:60,state:'ready'},catalog:current}));h.byText('Retry project choices').emit('click');await wait();
 assert.ok(h.byText('Project choices are ready.'));assert.equal(h.byText('Submit purchase request').disabled,false);h.view.destroy();
});

test('late shared null and error responses cannot invalidate a full catalog accepted after their GET began',async()=>{
 for(const failure of ['null','error']){
  const pending=deferred(),h=await harness({shared:()=>pending.promise});await h.selectProject();choiceState(h,false,'Select…');
  if(failure==='null')pending.resolve({sharedChoices:null});else pending.resolve(Promise.reject(Error('Synthetic timeout')));
  await wait();choiceState(h,false,'Select…');assert.equal(h.byText('Submit purchase request').disabled,false);h.view.destroy();
 }
});

test('shared failures and expiry pause common choices without clearing selected IDs or draft entries',async()=>{
 const h=await harness();h.byName('supplier').value='225';h.byName('service').value='8';h.byName('tax').value='0';h.byName('description').value='Keep my draft';
 h.setShared(()=>({sharedChoices:null}));await h.timer(300000);choiceState(h,true,'Choices unavailable');assert.equal(h.byName('tax').value,'0');assert.equal(h.byName('supplier').value,'225');
 assert.equal(h.byText('Submit purchase request').disabled,true);assert.equal(h.byText('Retry project choices').hidden,false);
 h.setShared(()=>({sharedChoices:directory('recovered',new Date(h.now()-500).toISOString())}));h.byText('Retry project choices').emit('click');await wait();choiceState(h,false,'Select…');assert.equal(h.byName('tax').value,'0');
 h.advance(300001);await h.view.refresh();choiceState(h,true,'Choices unavailable');assert.equal(h.byName('description').value,'Keep my draft');assert.equal(h.byName('tax').value,'0');h.view.destroy();
});

test('shared HTTP failures and future timestamps cannot authorize common choices or discard selected values',async()=>{
 for(const mode of ['error','future']){
  const h=await harness();h.byName('supplier').value='225';h.byName('tax').value='0';
  h.setShared(()=>{if(mode==='error')throw Error('Synthetic shared lookup failure');return{sharedChoices:directory('future',new Date(h.now()+60000).toISOString())};});
  await h.timer(300000);choiceState(h,true,'Choices unavailable');assert.equal(h.byName('supplier').value,'225');assert.equal(h.byName('tax').value,'0');assert.equal(h.byText('Submit purchase request').disabled,true);h.view.destroy();
 }
});

test('a null initial shared snapshot waits normally for project selection, with a fallback for older deployments',async()=>{
 for(const shared of [()=>({sharedChoices:null}),()=>({status:404})]){
  const h=await harness({shared});choiceState(h,true,'Select a project first');assert.ok(h.byText('Select a project to load shared choices.'));assert.equal(h.byText('Retry project choices').hidden,true);
  const pending=deferred();h.setLookup(()=>pending.promise);await h.selectProject();choiceState(h,true,'Loading choices…');assert.equal(h.byText('Retry project choices').hidden,true);
  pending.resolve({lookup:{id:'a',projectPageId:60,state:'ready'},catalog:directory()});await wait();choiceState(h,false,'Select…');assert.ok(h.byText('Project choices are ready.'));h.view.destroy();
 }
});

test('removing zero GST on a project change requires reselection while newly added lines retain the normal GST default',async()=>{
 const h=await harness();await h.selectProject();h.byName('tax').value='0';
 const b={...directory('B',new Date(h.now()-100).toISOString()),projectPageId:59,taxes:[{id:'1',name:'GST',rate:10}]};
 h.setLookup(()=>({lookup:{id:'b',projectPageId:59,state:'ready'},catalog:b}));await h.selectProject('59');assert.equal(h.byName('tax').value,'');
 h.byText('Add line').emit('click');const taxes=h.walk().filter(node=>node.name==='tax');assert.equal(taxes[0].value,'');assert.equal(taxes[1].value,'1');h.view.destroy();
});

test('submission uses the matching project revision and validates preserved shared IDs before saving',async()=>{
 const h=await harness();await h.selectProject();
 const b={...directory('B-revision'),projectPageId:59,breakdowns:[{id:'ew_729',name:'B cladding'}]};h.setLookup(()=>({lookup:{id:'b',projectPageId:59,state:'ready'},catalog:b}));await h.selectProject('59');
 for(const[name,value]of Object.entries({supplier:'225',service:'8',breakdown:'ew_729',account:'51097',tax:'0',description:'B item',price:'10'}))h.byName(name).value=value;
 h.walk().find(node=>node.tagName==='form').emit('submit');await wait();const call=h.calls.find(row=>row.path==='/purchase-requests'&&row.options.method==='POST');assert.ok(call);
 const saved=JSON.parse(call.options.body);assert.equal(saved.projectPageId,59);assert.equal(saved.catalogRevision,'B-revision');assert.equal(saved.lines[0].taxRateId,'0');assert.equal(saved.lines[0].breakdownType,'ew_729');
 const before=h.calls.length;await h.timer(300000);assert.equal(h.calls.length,before,'shared and EOW refresh both skip frozen ambiguous submissions');h.view.destroy();
});

test('late shared data never mutates a frozen submitted draft and a new request reuses menus with cleared selections',async()=>{
 const h=await harness();await h.selectProject();
 for(const[name,value]of Object.entries({supplier:'225',service:'8',breakdown:'b_70',account:'51097',tax:'0',description:'Submitted item',price:'10'}))h.byName(name).value=value;
 const pending=deferred();h.setShared(()=>pending.promise);
 h.byName('project').value='';h.byName('project').emit('input');await h.timer(300000);
 h.byName('project').value='60';h.byName('project').emit('input');assert.equal(h.byText('Submit purchase request').disabled,false);
 h.setSubmission(options=>{const body=JSON.parse(options.body);return{ok:true,status:201,json:async()=>({request:{id:body.requestId,reference:'SYNTHETIC-1',state:'queued',createdAt:'2026-11-14T00:00:00Z',project:'Jardin',requestor:body.requestor,supplierName:'Supplier',serviceName:'Supply',breakdownName:'Miscellaneous',date:body.date,totalCents:1000,lines:body.lines}})}});
 h.walk().find(node=>node.tagName==='form').emit('submit');await wait();
 const changed=directory('changed',new Date(h.now()-20).toISOString());changed.suppliers=[];changed.taxes=[{id:'1',name:'GST',rate:10}];pending.resolve({sharedChoices:changed});await wait();
 assert.equal(h.byName('supplier').value,'225');assert.equal(h.byName('tax').value,'0');assert.equal(h.byName('description').value,'Submitted item');
 h.walk().find(node=>node.tagName==='button'&&node.textContent==='New purchase request').emit('click');assert.equal(h.byName('supplier').value,'');assert.equal(h.byName('service').value,'');assert.equal(h.byName('project').value,'');assert.equal(h.byName('breakdown').value,'');assert.equal(h.byName('description').value,'');assert.equal(h.byName('tax').value,'1');choiceState(h,false,'Select…');assert.equal(h.walk().filter(node=>node.name==='tax').length,1);h.view.destroy();
});
