const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../workshop-stock.js'),'utf8');
const key='panelstock:workshop-pending:admin';
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const walk=n=>!n||typeof n!=='object'?[]:[n,...(n.children||[]).flat(Infinity).flatMap(walk)];
const text=n=>n===null||n===undefined?'':typeof n==='string'||typeof n==='number'?String(n):(n.children||[]).flat(Infinity).map(text).join('');
const fixture=(revision=9)=>({revision,movements:[],items:[
 {id:'angle',name:'Angle',sku:'ANG',category:'extrusions',unit:'lengths',qty:50,reserved:5,available:45,unitCost:3,costBasis:'unit'},
 {id:'bolt',name:'Bolt',sku:'BOLT',category:'fixings',unit:'each',qty:100,reserved:10,available:90,unitCost:5,costBasis:'unit'}
]});
function harness({storage=new Map(),post,stock=fixture()}={}){
 const states=[],effects=[],posts=[],gets=[];let cursor=0,effectCursor=0,ids=0;
 const React={Fragment:'fragment',createElement:(type,props,...children)=>({type,props:props||{},children}),useState(initial){const index=cursor++;if(!(index in states))states[index]=typeof initial==='function'?initial():initial;return [states[index],value=>states[index]=typeof value==='function'?value(states[index]):value];},useEffect(callback,deps){const index=effectCursor++,previous=effects[index],changed=!previous||!deps||deps.some((value,i)=>!Object.is(value,previous.deps?.[i]));if(changed)effects[index]={callback,deps,run:true,cleanup:previous?.cleanup};}};
 const success=payload=>({ok:true,status:200,json:async()=>({...structuredClone(stock),revision:stock.revision+1,items:stock.items.map(item=>({...item,unitCost:payload.changes.unitCost===''?null:Number(payload.changes.unitCost)}))})});
 const context={window:{},TextEncoder,Blob,atob,document:{addEventListener(){},removeEventListener(){}},localStorage:{getItem:name=>storage.get(name)??null,setItem:(name,value)=>storage.set(name,String(value)),removeItem:name=>storage.delete(name)},crypto:{randomUUID:()=> 'bulk-price-mutation-'+(++ids)},PanelStock:{username:'admin',apiFetch:async(url,options)=>{if(!options){gets.push(url);return {ok:true,status:200,json:async()=>structuredClone(stock)};}const request={body:options.body,payload:JSON.parse(options.body),method:options.method,url};posts.push(request);return post?post(request,posts.length,success):success(request.payload);}}};
 vm.runInNewContext(source,context);const C=context.window.createWorkshopStock(React),render=()=>{cursor=0;effectCursor=0;return walk(C({isAdmin:true,workerUrl:'/api'}));};
 const flush=()=>{for(const effect of effects)if(effect.run){effect.run=false;effect.cleanup?.();effect.cleanup=effect.callback();}};
 const node=label=>render().find(n=>n.props['aria-label']===label),button=label=>render().find(n=>n.type==='button'&&n.children.includes(label)),form=()=>render().find(n=>n.type==='form'),price=()=>node('Unit cost (AUD ex GST)'),save=()=>render().find(n=>n.type==='button'&&n.props.type==='submit');
 render();flush();
 return {states,posts,gets,storage,render,flush,node,button,form,price,save,async ready(){await tick();render();flush();await tick();return render();},openBulk(value='25.50'){node('Select Angle ANG').props.onChange({target:{checked:true}});node('Select Bolt BOLT').props.onChange({target:{checked:true}});button('Bulk edit').props.onClick();const field=render().find(n=>n.props.className==='ws-bulk-field'&&n.props.key==='unitCost'),checkbox=walk(field).find(n=>n.type==='input'&&n.props.type==='checkbox');assert.equal(checkbox.props.disabled,false);checkbox.props.onChange({target:{checked:true}});price().props.onChange({target:{value}});},setPrice(value){price().props.onChange({target:{value}});},submit(){return form().props.onSubmit({preventDefault(){}});},error(){return render().filter(n=>n.props.role==='alert').map(text).join(' ');},unmount(){effects.forEach(effect=>effect.cleanup?.());}};
}
function assertPending(x,body){assert.equal(x.storage.get(key),body);assert.equal(text(x.save()),'Retry save');assert.equal(x.save().props.disabled,false);assert.equal(x.price().props.disabled,true);assert.equal(x.button('Cancel').props.disabled,true);}

function connectionFailure(){return new TypeError('Failed to fetch');}

test('a failed bulk price save retains the original request and an explicit retry sends the exact body, revision and mutation',async()=>{
 const x=harness({post:(request,index,success)=>{if(index===1)throw connectionFailure();return success(request.payload);}});await x.ready();x.openBulk();const before=structuredClone(x.states[0]);await x.submit();assert.equal(x.posts.length,1);const first=x.posts[0];assert.equal(first.method,'POST');assert.equal(first.payload.action,'bulk_metadata');assert.deepEqual(first.payload.itemIds,['angle','bolt']);assert.deepEqual(first.payload.changes,{unitCost:'25.50'});assert.equal(first.payload.expectedRevision,9);assert.equal(first.payload.mutationId,'bulk-price-mutation-1');assertPending(x,first.body);assert.match(x.error(),/Your original request is saved on this device\./);assert.match(x.error(),/Use Retry save to check or finish it safely\./);assert.doesNotMatch(x.error(),/TypeError|Failed to fetch/);assert.deepEqual(x.states[0],before);
 x.render();x.flush();await tick();assert.equal(x.posts.length,1,'no automatic POST after a failed save');x.states[0].revision=500;await x.submit();assert.equal(x.posts.length,2);assert.equal(x.posts[1].body,first.body);assert.equal(x.storage.has(key),false);assert.equal(x.form(),undefined);assert.equal(x.states[0].revision,10);assert.equal(x.states[0].items[0].unitCost,25.5);assert.deepEqual(x.states[0].items.map(i=>[i.qty,i.reserved,i.available]),before.items.map(i=>[i.qty,i.reserved,i.available]));assert.ok(x.render().some(n=>n.props.role==='status'&&text(n).includes('Updated 2 stock items.')));
});

test('zero and blank bulk prices remain distinct and unchanged through a failed save and retry',async()=>{
 for(const value of ['0','']){const x=harness({post:(request,index,success)=>{if(index===1)throw connectionFailure();return success(request.payload);}});await x.ready();x.openBulk(value);await x.submit();const first=x.posts[0];assert.equal(first.payload.changes.unitCost,value);assertPending(x,first.body);await x.submit();assert.equal(x.posts[1].body,first.body);assert.equal(x.states[0].items[0].unitCost,value===''?null:0);assert.equal(x.storage.has(key),false);assert.equal(x.form(),undefined);}
});

test('timeout, server failure and unreadable response bodies keep bulk requests pending for an identical retry',async()=>{
 const timeout=Object.assign(new Error('The request timed out'),{name:'TimeoutError'});
 const cases=[
  ['timeout',()=>{throw timeout;}],
  ['503',()=>({ok:false,status:503,json:async()=>({error:'Service temporarily unavailable'})})],
  ['408',()=>({ok:false,status:408,json:async()=>({error:'Request timeout'})})],
  ['429',()=>({ok:false,status:429,json:async()=>({error:'Too many requests'})})],
  ['success body unreadable',()=>({ok:true,status:200,json:async()=>{throw new SyntaxError('Unexpected end of JSON input');}})],
  ['400 body unreadable',()=>({ok:false,status:400,json:async()=>{throw new SyntaxError('Unexpected token <');}})],
  ['null JSON',()=>({ok:true,status:200,json:async()=>null})],
  ['array JSON',()=>({ok:true,status:200,json:async()=>[]})]
 ];
 for(const [name,failure] of cases){const x=harness({post:(request,index,success)=>index===1?failure():success(request.payload)});await x.ready();x.openBulk();await x.submit();assert.equal(x.posts.length,1,name);const first=x.posts[0];assertPending(x,first.body);assert.ok(x.error(),name+' reports a visible error');if(name==='timeout')assert.match(x.error(),/The save timed out before confirmation/);if(name.includes('unreadable')||name.endsWith('JSON'))assert.match(x.error(),/The stock service returned an unreadable response/);x.render();x.flush();await tick();assert.equal(x.posts.length,1,name+' does not post automatically');await x.submit();assert.equal(x.posts.length,2,name);assert.equal(x.posts[1].body,first.body,name);assert.equal(x.storage.has(key),false,name);assert.equal(x.form(),undefined,name);}
});

test('a readable 400 validation error clears the pending request and allows correction with a new mutation',async()=>{
 const x=harness({post:(request,index,success)=>index===1?{ok:false,status:400,json:async()=>({error:'Enter a valid unit cost'})}:success(request.payload)});await x.ready();x.openBulk();await x.submit();assert.equal(x.posts.length,1);assert.equal(x.storage.has(key),false);assert.equal(x.price().props.disabled,false);assert.equal(text(x.save()),'Apply to 2 items');assert.match(x.error(),/Enter a valid unit cost/);assert.doesNotMatch(x.error(),/original.*(?:saved|kept)/i);
 x.setPrice('26.00');await x.submit();assert.equal(x.posts.length,2);assert.equal(x.posts[1].payload.changes.unitCost,'26.00');assert.equal(x.posts[1].payload.expectedRevision,9);assert.notEqual(x.posts[1].payload.mutationId,x.posts[0].payload.mutationId);assert.equal(x.form(),undefined);
});

test('reloading restores the saved bulk request without posting and retries it against fresh data without rewriting its revision',async()=>{
 const storage=new Map(),first=harness({storage,post:()=>{throw connectionFailure();}});await first.ready();first.openBulk();await first.submit();const original=first.posts[0];assertPending(first,original.body);first.unmount();
 const restored=harness({storage,stock:fixture(99)});await restored.ready();assert.equal(restored.gets.length,1);assert.equal(restored.posts.length,0);assert.ok(restored.form());assert.equal(restored.form().props['aria-label'],'Bulk edit stock');assert.equal(restored.price().props.value,'25.50');assert.equal(restored.states[0].revision,99);assertPending(restored,original.body);await restored.submit();assert.equal(restored.posts.length,1);assert.equal(restored.posts[0].body,original.body);assert.equal(restored.posts[0].payload.expectedRevision,9);assert.equal(storage.has(key),false);assert.equal(restored.form(),undefined);assert.equal(restored.states[0].revision,100);
});
