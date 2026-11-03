const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

const source=fs.readFileSync(require('node:path').join(__dirname,'../workshop-stock.js'),'utf8');
const key=user=>'panelstock:workshop-pending:'+user,marker='__panelstockPendingStorage';
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const walk=n=>!n||typeof n!=='object'?[]:[n,...(n.children||[]).flat(Infinity).flatMap(walk)];
const stock={revision:7,movements:[],items:[{id:'spacer',name:'Spacer',sku:'KASP24',category:'extrusions',unit:'each',qty:100,reserved:0,available:100,image:''}]};
const payload=(mutationId='pending-image')=>({action:'metadata',itemId:'spacer',name:'Spacer',image:'data:image/png;base64,'+Buffer.alloc(2*1024*1024,120).toString('base64'),unit:'each',expectedRevision:7,mutationId});
function localStorageMock({values=new Map(),limit=Infinity,unavailable=false}={}){
 return {values,getItem(name){if(unavailable)throw Error('Storage denied');return values.get(name)??null;},setItem(name,value){if(unavailable)throw Error('Storage denied');if(String(value).length>limit)throw Object.assign(Error('Quota exceeded'),{name:'QuotaExceededError'});values.set(name,String(value));},removeItem(name){if(unavailable)throw Error('Storage denied');values.delete(name);}};
}
function indexedMock({values=new Map(),mode='ready',hold,abortPut=false}={}){
 const controls={values,mode,pending:[],events:[],closed:0};let created=false;
 controls.open=()=>{
  const request={};queueMicrotask(()=>{
   if(controls.mode==='blocked'){request.onblocked?.();return;}
   if(controls.mode==='error'){request.error=Error('IDB denied');request.onerror?.();return;}
   const db={objectStoreNames:{contains:()=>created},createObjectStore(){created=true;},close(){controls.closed++;},transaction(name,kind){
    assert.equal(name,'requests');const transaction={objectStore:()=>Object.fromEntries(['get','put','delete'].map(action=>[action,(...args)=>{
     const op={},entryKey=action==='put'?args[1]:args[0],value=action==='put'?args[0]:undefined;
     const complete=()=>{
      if(action==='put'&&abortPut){transaction.error=Error('IDB quota exceeded');transaction.onabort?.();return;}
      if(action==='put')values.set(entryKey,value);if(action==='delete')values.delete(entryKey);
      op.result=action==='get'?values.get(entryKey):undefined;controls.events.push({action,key:entryKey,kind});op.onsuccess?.();transaction.oncomplete?.();
     };
     queueMicrotask(()=>hold?.(action)?controls.pending.push({action,complete}):complete());return op;
    }]))};return transaction;
   }};
   request.result=db;if(!created)request.onupgradeneeded?.();request.onsuccess?.();
  });return request;
 };
 controls.release=action=>{const index=controls.pending.findIndex(entry=>!action||entry.action===action);assert.ok(index>=0,'a held IDB transaction exists');controls.pending.splice(index,1)[0].complete();};
 return controls;
}
function harness({storage=localStorageMock(),indexedDB,indexedSupported=true,username='admin',post=async()=>({ok:true,status:200,json:async()=>stock}),get=async()=>({ok:true,json:async()=>stock})}={}){
 const states=[],effects=[],requests=[];let cursor=0,effectCursor=0,ids=0;
 const React={Fragment:'fragment',createElement:(type,props,...children)=>({type,props:props||{},children}),useState(initial){const index=cursor++;if(!(index in states))states[index]=typeof initial==='function'?initial():initial;return [states[index],value=>states[index]=typeof value==='function'?value(states[index]):value];},useEffect(callback,deps){const index=effectCursor++,previous=effects[index],changed=!previous||!deps||deps.some((value,i)=>!Object.is(value,previous.deps?.[i]));if(changed)effects[index]={callback,deps,run:true,cleanup:previous?.cleanup};}};
 const context={window:{},document:{addEventListener(){},removeEventListener(){}},localStorage:storage,crypto:{randomUUID:()=>username+'-mutation-'+(++ids)},PanelStock:{username,apiFetch:async(url,options)=>{if(options){requests.push(JSON.parse(options.body));return post(url,options);}return get(url);}},Blob,TextEncoder,atob};
 if(indexedSupported&&indexedDB)context.indexedDB=indexedDB;
 vm.runInNewContext(source,context);const Component=context.window.createWorkshopStock(React);
 const render=()=>{cursor=0;effectCursor=0;return walk(Component({isAdmin:true,workerUrl:'/api'}));};
 const flush=()=>{for(const entry of effects)if(entry.run){entry.run=false;entry.cleanup?.();entry.cleanup=entry.callback();}};
 const node=predicate=>render().find(predicate);
 const form=()=>node(n=>n.type==='form'&&n.props.role==='dialog');
 const error=()=>render().filter(n=>n.props.role==='alert').map(n=>n.children.join('')).join(' ');
 render();flush();
 return {states,requests,context,storage,render,flush,node,form,error,async ready(){await tick();return render();},open(){node(n=>n.props['aria-label']==='Stock action for Spacer').props.onChange({target:{value:'metadata'}});},setImage(image){const input=node(n=>n.type==='input'&&n.props.type==='file');assert.ok(input);states[8]={...states[8],image};},submit(){return form().props.onSubmit({preventDefault(){}});},unmount(){effects.forEach(entry=>entry.cleanup?.());}};
}

test('legacy localStorage requests load and retry unchanged without IndexedDB support',async()=>{
 const saved={...payload('legacy-request'),image:'data:image/png;base64,b2xk'},storage=localStorageMock({values:new Map([[key('admin'),JSON.stringify(saved)]])}),x=harness({storage,indexedSupported:false});
 await x.ready();assert.equal(x.requests.length,0);assert.equal(x.form().props['aria-label'],'Edit stock details');assert.equal(x.node(n=>n.type==='button'&&n.props.type==='submit').children.join(''),'Retry save');await x.submit();assert.deepEqual(x.requests,[saved]);assert.equal(storage.getItem(key('admin')),null);assert.equal(x.form(),undefined);
});

test('a 2 MiB image survives localStorage quota failure, a failed POST, reload and an identical retry',async()=>{
 const storage=localStorageMock({limit:1024*1024}),idb=indexedMock(),x=harness({storage,indexedDB:idb,post:async()=>{throw Error('Offline');}});await x.ready();x.open();const image=payload().image;x.setImage(image);const original=structuredClone(stock);await x.submit();
 assert.equal(x.requests.length,1);const sent=x.requests[0];assert.equal(sent.image,image);assert.equal(sent.expectedRevision,7);assert.equal(JSON.parse(idb.values.get(key('admin'))).mutationId,sent.mutationId);assert.equal(JSON.parse(storage.getItem(key('admin')))[marker],'indexeddb');assert.match(x.error(),/Offline.*retry the same save/);assert.deepEqual(stock,original);
 const restored=harness({storage,indexedDB:idb});await restored.ready();assert.equal(restored.requests.length,0,'recovery does not send in the background');assert.equal(restored.states[8].image,image);assert.equal(restored.node(n=>n.type==='input'&&n.props.type==='file').props.disabled,true);await restored.submit();assert.deepEqual(restored.requests,[sent]);assert.equal(idb.values.has(key('admin')),false);assert.equal(storage.getItem(key('admin')),null);assert.equal(restored.form(),undefined);
});

test('the POST waits until the IndexedDB fallback transaction has committed',async()=>{
 const storage=localStorageMock({limit:64}),idb=indexedMock({hold:action=>action==='put'}),x=harness({storage,indexedDB:idb});await x.ready();x.open();x.setImage(payload().image);const saving=x.submit();await tick();assert.equal(x.requests.length,0);assert.equal(idb.values.has(key('admin')),false);assert.equal(x.node(n=>n.type==='button'&&n.props.type==='submit').props.disabled,true);idb.release('put');await saving;assert.equal(x.requests.length,1);assert.equal(idb.values.has(key('admin')),false);
});

test('both unavailable storage mechanisms or an aborted fallback prevent every POST',async()=>{
 for(const [storage,idb] of [[localStorageMock({limit:0}),indexedMock({mode:'error'})],[localStorageMock({limit:0}),indexedMock({abortPut:true})]]){
  const x=harness({storage,indexedDB:idb});await x.ready();x.open();await x.submit();assert.equal(x.requests.length,0);assert.match(x.error(),/Browser storage is unavailable. No stock changes were sent/);assert.equal(x.node(n=>n.type==='button'&&n.props.type==='submit').props.disabled,false);assert.equal(idb.values.has(key('admin')),false);
 }
 const denied=harness({storage:localStorageMock({unavailable:true}),indexedDB:indexedMock({mode:'error'})});await denied.ready();assert.match(denied.error(),/Could not read the pending stock save/);assert.equal(denied.node(n=>n.type==='button'&&n.children.flat(Infinity).includes('Add stock item')).props.disabled,true);assert.equal(denied.requests.length,0);
});

test('4xx validation errors clear local and IndexedDB pending requests and release the form for correction',async()=>{
 const storage=localStorageMock({limit:1024*1024}),idb=indexedMock(),x=harness({storage,indexedDB:idb,post:async()=>({ok:false,status:400,json:async()=>({error:'Invalid image'})})});await x.ready();x.open();x.setImage(payload().image);await x.submit();assert.equal(x.requests.length,1);assert.equal(idb.values.has(key('admin')),false);assert.equal(storage.getItem(key('admin')),null);assert.match(x.error(),/Invalid image/);assert.equal(x.node(n=>n.type==='input'&&n.props.type==='file').props.disabled,false);assert.equal(x.node(n=>n.type==='button'&&n.props.type==='submit').children.join(''),'Save');
});

test('a later localStorage save stays authoritative even when an older IndexedDB record cannot be removed',async()=>{
 const previous={...payload('older'),image:'old'},next={...previous,mutationId:'newer',image:'new'},storage=localStorageMock(),idb=indexedMock({values:new Map([[key('admin'),JSON.stringify(previous)]]),mode:'blocked'}),x=harness({storage,indexedDB:idb});await x.ready();const store=x.context.workshopPendingStorage(key('admin'));await store.write(next);assert.deepEqual(JSON.parse(storage.getItem(key('admin'))),next);idb.mode='ready';const restored=harness({storage,indexedDB:idb});await restored.ready();assert.equal(restored.states[8].image,'new');await restored.submit();assert.deepEqual(restored.requests,[next]);assert.equal(idb.values.has(key('admin')),false);
});

test('a cleared marker prevents replay when cleanup cannot currently access an older IndexedDB entry',async()=>{
 const saved={...payload('already-saved'),image:'small'},storage=localStorageMock({values:new Map([[key('admin'),JSON.stringify(saved)]])}),idb=indexedMock({values:new Map([[key('admin'),JSON.stringify(saved)]])}),x=harness({storage,indexedDB:idb,post:async()=>{idb.mode='blocked';return {ok:true,status:200,json:async()=>stock};}});await x.ready();await x.submit();assert.equal(x.requests.length,1);assert.equal(JSON.parse(storage.getItem(key('admin')))[marker],'cleared');assert.equal(x.form(),undefined);idb.mode='ready';const restored=harness({storage,indexedDB:idb});await restored.ready();assert.equal(restored.form(),undefined);assert.equal(restored.requests.length,0);restored.open();await restored.submit();assert.equal(idb.values.has(key('admin')),false);assert.equal(storage.getItem(key('admin')),null);
});

test('an accessible empty IDB allows first-use edits when localStorage is denied',async()=>{
 const storage=localStorageMock({unavailable:true}),idb=indexedMock(),x=harness({storage,indexedDB:idb,post:async()=>{throw Error('Offline');}});await x.ready();assert.equal(x.error(),'');assert.equal(x.node(n=>n.type==='button'&&n.children.flat(Infinity).includes('Add stock item')).props.disabled,false);x.open();x.setImage(payload().image);await x.submit();assert.equal(x.requests.length,1);assert.equal(JSON.parse(idb.values.get(key('admin'))).mutationId,x.requests[0].mutationId);assert.match(x.error(),/Offline/);
});

test('IDB payloads recover without a local marker when localStorage is entirely unavailable',async()=>{
 const saved=payload('idb-only'),storage=localStorageMock({unavailable:true}),idb=indexedMock(),x=harness({storage,indexedDB:idb});await x.ready();const store=x.context.workshopPendingStorage(key('admin'));await store.write(saved);assert.equal(idb.values.get(key('admin')),JSON.stringify(saved));const restored=harness({storage,indexedDB:idb});await restored.ready();assert.equal(restored.states[8].image,saved.image);assert.equal(restored.requests.length,0);
});

test('blocked IDB recovery fails promptly for a marked pending request and preserves the error if stock loading finishes later',async()=>{
 const storage=localStorageMock({values:new Map([[key('admin'),JSON.stringify({[marker]:'indexeddb',mutationId:'lost'})]])}),idb=indexedMock({mode:'blocked'});let finishGet;const x=harness({storage,indexedDB:idb,get:()=>new Promise(resolve=>{finishGet=resolve;})});await x.ready();assert.match(x.error(),/Could not read the pending stock save/);finishGet({ok:true,json:async()=>stock});await tick();assert.match(x.error(),/Could not read the pending stock save/);assert.equal(x.node(n=>n.type==='button'&&n.children.flat(Infinity).includes('Add stock item')).props.disabled,true);assert.equal(x.requests.length,0);
});

test('corrupted local JSON and missing or mismatched IDB payloads preserve a visible recovery error',async()=>{
 for(const [text,values] of [['{broken',new Map()],[JSON.stringify({[marker]:'indexeddb',mutationId:'expected'}),new Map()],[JSON.stringify({[marker]:'indexeddb',mutationId:'expected'}),new Map([[key('admin'),JSON.stringify({...payload('different'),image:'small'})]])]]){
  const storage=localStorageMock({values:new Map([[key('admin'),text]])}),x=harness({storage,indexedDB:indexedMock({values})});await x.ready();assert.match(x.error(),/Could not read the pending stock save/);assert.equal(x.node(n=>n.type==='button'&&n.children.flat(Infinity).includes('Add stock item')).props.disabled,true);assert.equal(x.requests.length,0);assert.equal(storage.getItem(key('admin')),text);
 }
});

test('pending payloads remain isolated by user and late recovery does not update an unmounted screen',async()=>{
 const admin=payload('admin-only'),other={...payload('other-only'),name:'Other'},values=new Map([[key('admin'),JSON.stringify(admin)],[key('worker'),JSON.stringify(other)]]),idb=indexedMock({values,hold:action=>action==='get'}),storage=localStorageMock(),x=harness({storage,indexedDB:idb,username:'worker'});await tick();assert.equal(x.form(),undefined);assert.equal(x.node(n=>n.type==='button'&&n.children.flat(Infinity).includes('Add stock item')).props.disabled,true);idb.release('get');await x.ready();assert.equal(x.states[8].name,'Other');await x.submit();assert.equal(idb.values.has(key('worker')),false);assert.equal(idb.values.get(key('admin')),JSON.stringify(admin));
 const gone=harness({storage,indexedDB:idb});await tick();gone.unmount();idb.release('get');await tick();assert.equal(gone.states[8],null);assert.equal(gone.requests.length,0);
});
