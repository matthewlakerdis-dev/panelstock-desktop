const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

const source=fs.readFileSync(require('node:path').join(__dirname,'../workshop-stock.js'),'utf8');
const pendingKey='panelstock:stocktake-settings-pending:/api:admin';
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const walk=node=>!node||typeof node!=='object'?[]:[node,...(node.children||[]).flat(Infinity).flatMap(walk)];
const text=node=>node==null?'':typeof node==='string'||typeof node==='number'?String(node):(node.children||[]).flat(Infinity).map(text).join('');
const settings=(revision=4,label='Shared cladding',code='00123')=>({version:1,revision,cosGroups:[{id:'cladding',label,accountCode:code},{id:'cos-custom',label:'Custom workshop COS',accountCode:'00077'}],assetAccountCode:'0011350',trackingName:'Department',trackingOption:'Factory North',direction:'asset-debit'});
const view=(revision,config,qty)=>({revision,movements:[],stocktakes:[],items:[{id:'spacer',sku:'KASP24',name:'Spacer',category:'extrusions',unit:'each',qty,reserved:0,available:qty,xeroGroup:'cladding'}],...(config?{stocktakeSettings:config}:{})});
const pendingRequest=()=>({expectedRevision:4,mutationId:'original-settings-mutation',cosGroups:settings().cosGroups,assetAccountCode:'0011350',trackingName:'Department',trackingOption:'Factory North',direction:'asset-credit'});
function hooks(){
 const states=[],effects=[];let cursor=0,effectCursor=0;
 const React={Fragment:'fragment',createElement:(type,props,...children)=>({type,props:props||{},children}),useState(initial){const index=cursor++;if(!(index in states))states[index]=typeof initial==='function'?initial():initial;return [states[index],next=>states[index]=typeof next==='function'?next(states[index]):next];},useEffect(callback,deps){const index=effectCursor++,previous=effects[index],changed=!previous||!deps||deps.some((value,i)=>!Object.is(value,previous.deps?.[i]));if(changed)effects[index]={callback,deps,run:true,cleanup:previous?.cleanup};}};
 return {React,states,begin(){cursor=0;effectCursor=0;},flush(){for(const effect of effects)if(effect.run){effect.run=false;effect.cleanup?.();effect.cleanup=effect.callback();}},unmount(){effects.forEach(effect=>effect.cleanup?.());}};
}
function baseContext(storage=new Map()){
 const listeners=new Map(),window={addEventListener(type,callback){if(!listeners.has(type))listeners.set(type,new Set());listeners.get(type).add(callback);},removeEventListener(type,callback){listeners.get(type)?.delete(callback);},dispatchEvent(event){for(const callback of listeners.get(event.type)||[])callback(event);return true;}};
 return {window,document:{addEventListener(){},removeEventListener(){}},localStorage:{getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,String(value)),removeItem:key=>storage.delete(key)},crypto:{randomUUID:()=> 'new-settings-mutation'},TextEncoder,Blob,atob};
}
function merger(){const context=baseContext();vm.runInNewContext(source,context);assert.equal(typeof context.mergeWorkshopStockViews,'function');return (current,incoming)=>structuredClone(context.mergeWorkshopStockViews(current,incoming));}
function settingsHarness({storage=new Map(),get,isAdmin=true,post}={}){
 const lifecycle=hooks(),requests=[];let server=settings(),getCount=0;
 const reply=()=>({ok:true,status:200,json:async()=>({ok:true,stocktakeSettings:structuredClone(server)})});
 const context={...baseContext(storage),PanelStock:{username:'admin',apiFetch:async(url,options)=>{assert.equal(url,'/api/stocktake/settings');const request={method:options?.method||'GET',body:options?.body,payload:options?.body?JSON.parse(options.body):undefined};requests.push(request);if(!options){getCount++;return get?get(getCount,reply):reply();}if(post)return post(request,reply);server={version:1,revision:server.revision+1,cosGroups:structuredClone(request.payload.cosGroups),assetAccountCode:request.payload.assetAccountCode,trackingName:request.payload.trackingName,trackingOption:request.payload.trackingOption,direction:request.payload.direction};return reply();}}};
 vm.runInNewContext(source,context);const C=context.window.createStocktakeSettings(lifecycle.React);
 const render=()=>{lifecycle.begin();return walk(C({workerUrl:'/api',isAdmin}));};
 const button=label=>render().find(node=>node.type==='button'&&text(node)===label),field=label=>render().find(node=>node.props['aria-label']===label),error=()=>render().filter(node=>node.props.role==='alert').map(text).join(' ');
 render();lifecycle.flush();
 return {storage,requests,render,button,field,error,posts:()=>requests.filter(request=>request.method==='POST'),async ready(){await tick();render();lifecycle.flush();await tick();return render();},set(label,value){field(label).props.onChange({target:{value}});},submit(){const form=render().find(node=>node.type==='form');return form?.props.onSubmit({preventDefault(){}});}};
}

test('Workshop merging keeps newer settings when a newer stock response carries older COS configuration',()=>{
 const merge=merger(),current=view(10,settings(6,'Newest COS','00999'),100),incoming=view(11,settings(4,'Older COS','00123'),200),before=structuredClone({current,incoming}),result=merge(current,incoming);
 assert.equal(result.revision,11);assert.equal(result.items[0].qty,200);assert.equal(result.stocktakeSettings.revision,6);assert.equal(result.stocktakeSettings.cosGroups[0].label,'Newest COS');assert.equal(result.stocktakeSettings.cosGroups[0].accountCode,'00999');assert.deepEqual({current,incoming},before);
});

test('Workshop merging independently accepts newer settings without reverting stock or its item assignments',()=>{
 const merge=merger(),current=view(12,settings(6),200),incoming=view(11,settings(7,'Renamed shared COS','00088'),100);current.items[0].xeroGroup='cos-custom';const result=merge(current,incoming);
 assert.equal(result.revision,12);assert.equal(result.items[0].qty,200);assert.equal(result.items[0].xeroGroup,'cos-custom');assert.equal(result.stocktakeSettings.revision,7);assert.equal(result.stocktakeSettings.cosGroups[0].accountCode,'00088');
});

test('Workshop merging accepts initial and equal stock revisions while preserving already-known shared settings if a legacy response omits them',()=>{
 const merge=merger(),initial=view(10,settings(6),100);assert.deepEqual(merge(null,initial),initial);
 const same=view(10,settings(7),100);same.stocktakeMonth={key:'2026-12',label:'December 2026',timeZone:'Australia/Brisbane'};const equal=merge(initial,same);assert.equal(equal.stocktakeSettings.revision,7);assert.equal(equal.stocktakeMonth.key,'2026-12');
 const legacy=merge(initial,view(11,null,200));assert.equal(legacy.revision,11);assert.equal(legacy.items[0].qty,200);assert.deepEqual(legacy.stocktakeSettings,initial.stocktakeSettings);
});

test('a late Workshop GET cannot revert the shared COS names/codes or stock accepted from a newer settings refresh',async()=>{
 const lifecycle=hooks(),gets=[],context={...baseContext(),PanelStock:{username:'admin',apiFetch:async(url,options)=>{assert.equal(url,'/api/workshop-stock');assert.equal(options,undefined);return new Promise(resolve=>gets.push(resolve));}}};
 vm.runInNewContext(source,context);const C=context.window.createWorkshopStock(lifecycle.React),render=()=>{lifecycle.begin();return walk(C({workerUrl:'/api',isAdmin:true}));};render();lifecycle.flush();await tick();assert.equal(gets.length,1);
 context.window.dispatchEvent({type:'panelstock-stocktake-settings-changed'});assert.equal(gets.length,2);
 gets[1]({ok:true,json:async()=>view(11,settings(6,'New shared COS','00999'),200)});await tick();render();gets[0]({ok:true,json:async()=>view(10,settings(4,'Old shared COS','00123'),100)});await tick();
 assert.equal(lifecycle.states[0].revision,11);assert.equal(lifecycle.states[0].items[0].qty,200);assert.equal(lifecycle.states[0].stocktakeSettings.revision,6);
 render().find(node=>node.props['aria-label']==='Stock action for Spacer').props.onChange({target:{value:'metadata'}});const group=render().find(node=>node.props.key==='xeroGroup'),labels=walk(group).filter(node=>node.type==='option').map(text);assert.ok(labels.includes('New shared COS · 00999'));assert.equal(labels.includes('Old shared COS · 00123'),false);lifecycle.unmount();
});

test('malformed pending settings remain protected through Reload until the original request can be recovered and retried',async()=>{
 const storage=new Map([[pendingKey,'{invalid pending JSON']]),x=settingsHarness({storage,post:(request,reply)=>reply()});await x.ready();assert.match(x.error(),/pending|JSON|Unexpected/i);assert.equal(x.posts().length,0);assert.equal(x.field('COS name 1'),undefined);
 await x.button('Reload settings').props.onClick();await x.ready();assert.equal(storage.get(pendingKey),'{invalid pending JSON');assert.equal(x.posts().length,0);assert.equal(x.field('COS name 1'),undefined,'Reload must not expose an editable draft over unrecovered pending data');
 const original=JSON.stringify(pendingRequest());storage.set(pendingKey,original);await x.button('Reload settings').props.onClick();await x.ready();assert.equal(x.posts().length,0);assert.equal(x.button('Retry save').props.disabled,false);assert.equal(x.field('COS name 1').props.disabled,true);assert.equal(storage.get(pendingKey),original);await x.submit();assert.equal(x.posts().length,1);assert.equal(x.posts()[0].body,original);assert.equal(storage.has(pendingKey),false);
});

test('a loaded settings draft cannot overwrite unreadable pending storage discovered during Reload',async()=>{
 const x=settingsHarness();await x.ready();x.set('COS name 1','Existing local draft');x.storage.set(pendingKey,'{unreadable pending request');await x.button('Reload settings').props.onClick();await x.ready();assert.match(x.error(),/pending.*recover|browser storage/i);assert.equal(x.field('COS name 1').props.disabled,true);await x.submit();assert.equal(x.posts().length,0);assert.equal(x.storage.get(pendingKey),'{unreadable pending request');
 x.storage.delete(pendingKey);await x.button('Reload settings').props.onClick();await x.ready();assert.equal(x.field('COS name 1').props.disabled,false);x.set('COS name 1','New draft after successful recovery');await x.submit();assert.equal(x.posts().length,1);assert.equal(x.posts()[0].payload.cosGroups[0].label,'New draft after successful recovery');
});

test('ordinary settings GET failures can reload and save without being mistaken for pending-storage corruption',async()=>{
 const x=settingsHarness({get:(count,reply)=>{if(count===1)throw Error('Network unavailable while reading settings');return reply();}});await x.ready();assert.match(x.error(),/Network unavailable/);assert.equal(x.posts().length,0);await x.button('Reload settings').props.onClick();await x.ready();assert.equal(x.field('COS name 1').props.disabled,false);assert.equal(x.button('Save stocktake settings').props.disabled,false);x.set('COS name 1','Saved after GET recovery');await x.submit();assert.equal(x.posts().length,1);assert.equal(x.posts()[0].payload.expectedRevision,4);assert.equal(x.posts()[0].payload.cosGroups[0].label,'Saved after GET recovery');assert.equal(x.storage.has(pendingKey),false);
});

test('a restored pending save can still retry unchanged if reading the current shared settings fails',async()=>{
 const original=JSON.stringify(pendingRequest()),storage=new Map([[pendingKey,original]]),x=settingsHarness({storage,get:()=>{throw Error('Current settings unavailable');},post:(request,reply)=>reply()});await x.ready();assert.match(x.error(),/Current settings unavailable/);assert.equal(x.button('Retry save').props.disabled,false);assert.equal(x.field('COS name 1').props.disabled,true);await x.submit();assert.equal(x.posts().length,1);assert.equal(x.posts()[0].body,original);assert.equal(storage.has(pendingKey),false);
});

test('non-admin settings cannot submit or erase a restored administrator pending request',async()=>{
 const original=JSON.stringify(pendingRequest()),storage=new Map([[pendingKey,original]]),x=settingsHarness({storage,isAdmin:false});await x.ready();assert.equal(x.button('Retry save'),undefined);assert.equal(x.field('COS name 1').props.disabled,true);await x.submit();assert.equal(x.posts().length,0);assert.equal(storage.get(pendingKey),original);
});
