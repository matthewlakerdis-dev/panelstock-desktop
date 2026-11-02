const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../workshop-stock.js'),'utf8');
const walk=n=>!n||typeof n!=='object'?[]:[n,...(n.children||[]).flat(Infinity).flatMap(walk)];
const text=n=>n==null||n===false?'':typeof n!=='object'?String(n):(n.children||[]).flat(Infinity).map(text).join(' ');
const stock=(patch={})=>({id:'a',name:'Unused angle',sku:'ANG',category:'extrusions',qty:0,reserved:0,available:0,unit:'lengths',...patch});
function harness({isAdmin=true,item=stock()}={}){
 const states=[],storage=new Map(),posts=[];let cursor=0,nextMutation=0;
 const data={revision:3,items:[item],movements:[{id:'old',itemId:item.id,action:'receive',quantity:2}],stocktakes:[]};
 let responder=async()=>({ok:true,json:async()=>({...data,revision:4,items:[],movements:[{id:'archive',itemId:item.id,action:'archive',quantity:0},...data.movements]})});
 const React={createElement:(type,props,...children)=>({type,props:props||{},children}),useState:v=>{const i=cursor++;if(!(i in states))states[i]=typeof v==='function'?v():v;return [states[i],v=>states[i]=typeof v==='function'?v(states[i]):v];},useEffect(){},Fragment:'fragment'};
 const context={window:{},TextEncoder,Blob,crypto:{randomUUID:()=> 'mutation-'+(++nextMutation)},PanelStock:{username:isAdmin?'admin':'worker',apiFetch:async(url,options)=>{if(!options)return {ok:true,json:async()=>data};const payload=JSON.parse(options.body);posts.push(payload);return responder(payload);}},localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)}};
 vm.runInNewContext(source,context);const C=context.window.createWorkshopStock(React),render=()=>{cursor=0;return walk(C({workerUrl:'/api',isAdmin,taskAccess:{'factory.stock':true,'factory.dispatch':true}}));};
 render();states[0]=data;
 const open=()=>{const nodes=render(),select=nodes.find(n=>n.props['aria-label']==='Stock action for '+item.name);select.props.onChange({target:{value:'archive'}});return render();};
 return {data,states,storage,posts,render,open,setResponder:fn=>{responder=fn;}};
}
test('admin confirms removal before posting and displays the returned active stock without altering old history',async()=>{
 const x=harness();let nodes=x.render();const select=nodes.find(n=>n.props['aria-label']==='Stock action for Unused angle');
 assert.ok(walk(select).some(n=>n.type==='option'&&n.props.value==='archive'&&text(n)==='Remove stock item'));
 nodes=x.open();assert.equal(x.posts.length,0);assert.ok(nodes.some(n=>n.props['aria-label']==='Remove stock item'));
 assert.ok(nodes.some(n=>n.type==='p'&&text(n).includes('movement history and completed stocktake reports will be retained')));
 const confirm=nodes.find(n=>n.type==='button'&&n.props.type==='submit');assert.equal(text(confirm),'Remove item');assert.equal(confirm.props.disabled,false);
 const before=JSON.stringify(x.data);await nodes.find(n=>n.type==='form').props.onSubmit({preventDefault(){}});
 assert.equal(x.posts.length,1);assert.equal(x.posts[0].action,'archive');assert.equal(x.posts[0].itemId,'a');assert.equal(x.posts[0].expectedRevision,3);
 assert.equal(JSON.stringify(x.data),before);assert.equal(x.states[0].items.length,0);assert.ok(x.states[0].movements.some(m=>m.id==='old'));
 nodes=x.render();assert.ok(!nodes.some(n=>n.props['aria-label']==='Remove stock item'));assert.ok(!nodes.some(n=>n.props['aria-label']==='Stock action for Unused angle'));
 assert.ok(nodes.some(n=>text(n).includes('Item removed from active stock. Its history and completed reports are retained.')));
 assert.equal(x.storage.size,0);
});
test('nonzero stock and reservations block the removal confirmation with an actionable reason',()=>{
 for(const item of [stock({qty:2,available:2}),stock({reserved:1})]){
  const x=harness({item}),nodes=x.open();assert.equal(nodes.find(n=>n.type==='button'&&n.props.type==='submit').props.disabled,true);
  const messages=nodes.filter(n=>n.props.role==='alert').map(text).join(' ');
  assert.match(messages,item.qty?/Record usage, damage or a stocktake adjustment/:/Release its reservations/);assert.equal(x.posts.length,0);
 }
});
test('workers and legacy panel records do not expose workshop removal',()=>{
 for(const opts of [{isAdmin:false},{isAdmin:true,item:stock({id:'variant:p',name:'Panel',legacy:true,category:'panels'})}]){
  const x=harness(opts),nodes=x.render();assert.ok(!nodes.some(n=>n.type==='option'&&n.props.value==='archive'));
 }
});
test('an uncertain removal retries its identical saved mutation and keeps the active item until confirmed',async()=>{
 const x=harness();let calls=0;x.setResponder(async()=>{if(++calls===1)throw Error('Network unavailable');return {ok:true,json:async()=>({...x.data,revision:4,items:[]})};});
 let nodes=x.open();await nodes.find(n=>n.type==='form').props.onSubmit({preventDefault(){}});
 assert.equal(x.states[0].items.length,1);assert.equal(x.posts.length,1);assert.equal(x.storage.size,1);
 nodes=x.render();const retry=nodes.find(n=>n.type==='button'&&n.props.type==='submit');assert.equal(text(retry),'Retry save');assert.equal(retry.props.disabled,false);
 assert.equal(nodes.find(n=>n.type==='button'&&text(n)==='Cancel').props.disabled,true);
 await nodes.find(n=>n.type==='form').props.onSubmit({preventDefault(){}});
 assert.equal(x.posts.length,2);assert.deepEqual(x.posts[1],x.posts[0]);assert.equal(x.states[0].items.length,0);assert.equal(x.storage.size,0);
});
