const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require.resolve('../purchase-requests.js'),'utf8');
const wait=()=>new Promise(resolve=>setImmediate(resolve));
function deferred(){let resolve;const promise=new Promise(done=>resolve=done);return{promise,resolve};}
function directory(revision='v1'){
 return{projectPageId:60,revision,suppliers:[{id:'225',text:'Supplier'}],services:[{id:'8',name:'Supply'}],breakdowns:[{id:'b_20',name:'Cladding'},{id:'b_70',name:'Miscellaneous'}],accounts:[{id:'51097',name:'Materials'}],taxes:[{id:'1',name:'GST',rate:10},{id:'0',name:'No GST',rate:0}]};
}
async function harness({saved=null}={}){
 const calls=[],timers=new Map();let timerId=0,owner='requestor',lookup=()=>({lookup:{id:'lookup',projectPageId:60,state:'ready'},catalog:directory()});
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
 }
 const doc={createElement:tag=>new Node(tag)};doc.body=new Node('body');
 const walk=node=>[node,...node.children.flatMap(walk)],host=new Node('div');
 const context={Intl,JSON,TextDecoder,Uint8Array,URL,Blob,AbortController,crypto,console,
  setTimeout(callback,delay){const id=++timerId;timers.set(id,{callback,delay});return id;},clearTimeout:id=>timers.delete(id)};
 vm.runInNewContext(source,context);
 const apiFetch=async(url,options={})=>{
  const path=new URL(url).pathname;calls.push({path,options});let data;
  if(path==='/purchase-requests'&&options.method!=='POST')data={ok:true,requests:[],projects:[{projectPageId:60,name:'Jardin building'}],profile:{name:'Requestor',email:'requestor@example.test'},permissions:{create:true,manage:false},connection:{connected:true}};
  else if(path==='/purchase-requests/lookups')data={ok:true,...await lookup()};
  else if(path.startsWith('/purchase-requests/lookups/'))data={ok:true,...await lookup()};
  else if(path==='/purchase-requests'&&options.method==='POST')throw Error('Synthetic ambiguous submit');
  else return{ok:false,status:404,json:async()=>({})};
  return{ok:true,status:200,json:async()=>data};
 };
 const view=context.PanelStockPurchaseRequests.mount(host,{username:'requestor',workerUrl:'https://api.example.test',currentUsername:()=>owner,apiFetch,storage:{read:async()=>saved,write:async body=>{saved=JSON.parse(JSON.stringify(body));},clear:async()=>{saved=null;}}});
 await wait();
 const byName=name=>walk(host).find(node=>node.name===name),byText=text=>walk(host).find(node=>node.textContent===text);
 const timer=async delay=>{const entry=[...timers].find(([,item])=>item.delay===delay);assert.ok(entry,'timer '+delay+' exists');timers.delete(entry[0]);entry[1].callback();await wait();};
 return{host,view,calls,timers,byName,byText,walk:()=>walk(host),timer,setLookup:callback=>{lookup=callback;},changeOwner:value=>{owner=value;},async selectProject(){byName('project').value='60';byName('project').emit('change');await wait();}};
}

test('five-minute refresh keeps entered fields and zero GST while disabling submit until current choices return',async()=>{
 const h=await harness();await h.selectProject();
 h.byName('supplier').value='225';h.byName('service').value='8';h.byName('breakdown').value='b_20';h.byName('account').value='51097';h.byName('tax').value='0';
 h.byName('description').value='Keep my cladding description';h.byName('quantity').value='2.5';h.byName('price').value='19.95';h.byName('requestorName').value='Edited name';h.byName('supplierReference').value='QUOTE-123';
 const pending=deferred();h.setLookup(()=>pending.promise);await h.timer(300000);
 assert.equal(h.byText('Submit purchase request').disabled,true);assert.equal(h.byName('supplier').value,'225');assert.equal(h.byName('tax').value,'0');
 h.byName('description').value='Edited while refreshing';
 pending.resolve({lookup:{id:'refresh',projectPageId:60,state:'ready'},catalog:directory('v2')});await wait();
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
 const catalog=directory('v2');catalog.suppliers=[{id:'225',text:'Supplier paused',disabled:true}];catalog.services=[];catalog.breakdowns=[{id:'b_70',name:'Miscellaneous'}];catalog.accounts=[];catalog.taxes=[{id:'1',name:'GST',rate:10}];
 h.setLookup(()=>({lookup:{id:'refresh',projectPageId:60,state:'ready'},catalog}));await h.timer(300000);
 for(const name of ['supplier','service','breakdown','account','tax'])assert.equal(h.byName(name).value,'',name+' requires a current selection');
 assert.equal(h.byName('description').value,'Retained item');h.view.destroy();
});

test('a failed automatic refresh retains the draft and blocks submission until a successful retry',async()=>{
 const h=await harness();await h.selectProject();h.byName('tax').value='0';h.byName('description').value='Retained after timeout';
 h.setLookup(()=>{throw Error('Synthetic timeout');});await h.timer(300000);
 assert.equal(h.byName('tax').value,'0');assert.equal(h.byName('description').value,'Retained after timeout');assert.equal(h.byText('Submit purchase request').disabled,true);
 h.setLookup(()=>({lookup:{id:'retry',projectPageId:60,state:'ready'},catalog:directory('v2')}));h.byText('Refresh project choices').emit('click');await wait();
 assert.equal(h.byName('tax').value,'0');assert.equal(h.byText('Submit purchase request').disabled,false);h.view.destroy();
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
 assert.equal(JSON.parse(submitted.options.body).lines[0].description,'Submitted once');h.view.destroy();
});
