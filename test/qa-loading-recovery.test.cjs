const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8'),code=source.slice(source.indexOf('  function qaReportStatusLabel('),source.indexOf('  function AuditCenter('));
const settle=()=>new Promise(resolve=>setImmediate(resolve));
const deferred=()=>{let resolve;const promise=new Promise(done=>resolve=done);return {promise,resolve};};
function nodes(tree){if(Array.isArray(tree))return tree.flatMap(nodes);return tree&&typeof tree==='object'?[tree,...nodes(tree.children),...nodes(tree.props?.action)]:[];}
function text(tree){if(Array.isArray(tree))return tree.map(text).join(' ');return tree==null||typeof tree==='boolean'?'':typeof tree==='object'?text(tree.children):String(tree);}
const button=(tree,label)=>nodes(tree).find(node=>node.tag==='button'&&text(node).trim()===label);
function target(){const listeners=new Map();return {hidden:false,addEventListener(name,fn){if(!listeners.has(name))listeners.set(name,new Set());listeners.get(name).add(fn);},removeEventListener(name,fn){listeners.get(name)?.delete(fn);},emit(name){for(const fn of listeners.get(name)||[])fn();},count(){return [...listeners.values()].reduce((n,list)=>n+list.size,0);}};}
function fakeClock(){let now=0,next=0;const jobs=new Map();return {setTimeout(fn,delay){const id=++next;jobs.set(id,{fn,at:now+delay});return id;},clearTimeout(id){jobs.delete(id);},setInterval(fn,delay){const id=++next;jobs.set(id,{fn,at:now+delay,interval:delay});return id;},clearInterval(id){jobs.delete(id);},advance(ms){const end=now+ms;for(;;){const entry=[...jobs].filter(([,job])=>job.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!entry)break;const[id,job]=entry;now=job.at;if(job.interval)job.at+=job.interval;else jobs.delete(id);job.fn();}now=end;},deadlines(){return [...jobs.values()].filter(job=>!job.interval).length;},size(){return jobs.size;}};}
const image=name=>'data:image/jpeg;base64,'+Buffer.from(name).toString('base64');
const attempt=(id='check-old',extra={})=>({id,status:'approved',results:{finish:'pass'},notes:'Saved inspection notes',checkedBy:'inspector',checkedAt:'2026-11-22T01:00:00Z',photo:image(id),...extra});
function full(extra={}){const latest=attempt();return {id:'panel-one',kind:'panel',project:'Test project',orderNumber:'7',sheetNumber:'1',reference:'P1',status:'approved',quantity:1,latest,history:[latest],photoAdditions:[{id:'addition',attemptId:latest.id,photos:[image('addition')],addedBy:'later-inspector',addedAt:'2026-11-22T02:00:00Z'}],evidenceLoaded:true,...extra};}
function compact(item){const strip=value=>{const{photo,photos,...rest}=value;return rest;},count=entry=>[...(entry.photos||entry.photo?[entry.photo]:[]),...(item.photoAdditions||[]).filter(add=>add.attemptId===entry.id).flatMap(add=>add.photos||[])].length;return {...item,latest:item.latest?{...strip(item.latest),photoCount:count(item.latest)}:null,history:(item.history||[]).map(entry=>({...strip(entry),photoCount:count(entry)})),photoAdditions:(item.photoAdditions||[]).map(entry=>({...strip(entry),photoCount:(entry.photos||[]).length})),evidenceLoaded:false,hasPhotoEvidence:!!item.latest?.photo||!!item.photoAdditions?.length};}
const data=(items=[])=>({ok:true,items,dispatches:[],checklists:{panel:[['finish','Panel finish']],metalwork:[['finish','Metalwork finish']],gate:[]},settings:{},gateOrders:[],preQaCount:0});
function fixture({fetcher=async()=>Response.json(data()),initialReport=null}={}){
 const states=[],refs=[],effects=[],pending=[],calls=[],controllers=[],clock=fakeClock(),win=target(),doc=target();let cursor=0,refCursor=0,effectCursor=0;
 const context={Response,console,Date,Math,Array,Map,Set,AbortController:class extends AbortController{constructor(){super();controllers.push(this);}},setTimeout:clock.setTimeout,clearTimeout:clock.clearTimeout,setInterval:clock.setInterval,clearInterval:clock.clearInterval,window:win,document:doc,PanelStock:{username:'manager',apiFetch:async(url,options)=>{calls.push({url,options});return fetcher(url,options);}},BAKED_WORKER_URL:'https://worker.test',PageHeading:'heading',ClipboardList:'clipboard',ChevronRight:'chevron',Check:'check',Camera:'camera',Upload:'upload',import_react:{createElement:(tag,props,...children)=>({tag,props:props||{},children})},useState(initial){const i=cursor++;if(!(i in states))states[i]=typeof initial==='function'?initial():initial;return [states[i],value=>{states[i]=typeof value==='function'?value(states[i]):value;}];},useRef(initial){const i=refCursor++;return refs[i]||(refs[i]={current:initial});},useEffect(callback,deps){const i=effectCursor++,old=effects[i];if(!old||!deps||deps.some((value,j)=>value!==old.deps?.[j])){effects[i]={deps,cleanup:old?.cleanup};pending.push(()=>{effects[i].cleanup?.();effects[i].cleanup=callback();});}}};
 vm.createContext(context);vm.runInContext(code,context);
 function render(props={}){cursor=refCursor=effectCursor=0;const tree=context.QaCenter({username:'manager',isAdmin:true,canManage:true,canDispatch:false,initialReport,...props});while(pending.length)pending.shift()();return tree;}
 render();return {render,states,calls,controllers,clock,win,doc,context,unmount(){for(const effect of effects)effect.cleanup?.();}};
}
function counts(tree){return Object.fromEntries(['Awaiting QA','Recut required','Approved','QA not required'].map(label=>{const card=nodes(tree).find(node=>node.tag==='button'&&node.children.some(child=>child?.tag==='span'&&text(child)===label));return[label,text(nodes(card).find(node=>node.tag==='strong'))];}));}
function expand(view,props={}){let tree=view.render(props);for(const node of nodes(tree).filter(node=>node.tag==='button'&&node.props['aria-expanded']===false))node.props.onClick();return view.render(props);}
function approved(view){view.states[8]='approved';return expand(view);}

for(const stuck of ['fetch','body'])test(`20-second end-to-end deadline releases ${stuck} that ignores abort and enables retry with unknown counts`,async()=>{
 const never=new Promise(()=>{});let get=0;const view=fixture({fetcher:async()=>++get===1?(stuck==='fetch'?never:{ok:true,json:()=>never}):Response.json(data())});let tree=view.render();assert.deepEqual(counts(tree),{'Awaiting QA':'—','Recut required':'—','Approved':'—','QA not required':'—'});assert.equal(button(tree,'Refreshing…').props.disabled,false);view.clock.advance(19999);await settle();assert.match(text(view.render()),/Loading QA checks/);view.clock.advance(1);await settle();tree=view.render();assert.doesNotMatch(text(tree),/Loading QA checks/);assert.match(text(tree),/taking too long/);assert.ok(button(tree,'Retry QA checks'));assert.equal(view.controllers[0].signal.aborted,true);assert.equal(view.clock.deadlines(),0);await button(tree,'Retry QA checks').props.onClick();tree=view.render();assert.equal(view.calls[1].url,'https://worker.test/qa/queue');assert.deepEqual(counts(tree),{'Awaiting QA':'0','Recut required':'0','Approved':'0','QA not required':'0'});assert.equal(view.clock.deadlines(),0);view.unmount();assert.equal(view.clock.size(),0);
});

test('refresh event storms coalesce into one request without invalidating the initial successful queue',async()=>{
 const pending=deferred(),item=compact(full({status:'awaiting'})),view=fixture({fetcher:async()=>pending.promise});for(let i=0;i<30;i++){view.win.emit('panelstock-remote-change');view.win.emit('online');view.doc.emit('visibilitychange');}assert.equal(view.calls.length,1);pending.resolve(Response.json(data([item])));await settle();const tree=view.render();assert.doesNotMatch(text(tree),/Loading QA checks/);assert.equal(counts(tree)['Awaiting QA'],'1');assert.equal(view.clock.deadlines(),0);view.unmount();
});

test('explicit Refresh cancels and replaces a hung load while late results cannot overwrite the new queue',async()=>{
 const old=deferred();let get=0;const view=fixture({fetcher:async()=>++get===1?old.promise:Response.json(data([compact(full({status:'awaiting',project:'Current project'}))]))});await button(view.render(),'Refreshing…').props.onClick();assert.equal(view.controllers[0].signal.aborted,true);assert.equal(view.calls.length,2);assert.equal(view.clock.deadlines(),0);old.resolve(Response.json(data([compact(full({project:'Old project'}))])));await settle();assert.match(text(view.render()),/Current project/);assert.doesNotMatch(text(view.render()),/Old project/);view.unmount();
});

for(const failure of ['parse','body-rejection','invalid-envelope','invalid-status','http'])test(`${failure} preserves previously loaded data and shows an actionable retry instead of false zero counts`,async()=>{
 let get=0;const item=compact(full());const view=fixture({fetcher:async()=>++get===1?Response.json(data([item])):failure==='parse'?{ok:true,json:async()=>{throw SyntaxError('Unexpected token <');}}:failure==='body-rejection'?{ok:true,json:async()=>{throw Error('stream died');}}:failure==='invalid-envelope'?Response.json({ok:true}):failure==='invalid-status'?Response.json(data([{...item,status:'unknown-state'}])):Response.json({error:'QA is temporarily unavailable'},{status:503})});await settle();assert.equal(counts(view.render()).Approved,'1');await button(view.render(),'Refresh').props.onClick();const tree=view.render();assert.equal(counts(tree).Approved,'1');assert.ok(button(tree,'Retry QA checks'));assert.ok(nodes(tree).find(node=>node.props.role==='alert'));assert.doesNotMatch(text(tree),/Unexpected token|stream died/);assert.equal(view.states[0][0].id,item.id);assert.equal(view.clock.deadlines(),0);view.unmount();
});

test('unmount aborts pending fetch/body deadlines, removes refresh listeners and ignores late data',async()=>{
 const body=deferred(),view=fixture({fetcher:async()=>({ok:true,json:()=>body.promise})});await settle();assert.equal(view.clock.deadlines(),1);view.unmount();const before=JSON.stringify(view.states);await settle();assert.equal(view.clock.size(),0);assert.equal(view.win.count(),0);assert.equal(view.doc.count(),0);body.resolve(data([compact(full())]));await settle();assert.equal(JSON.stringify(view.states),before);view.win.emit('online');assert.equal(view.calls.length,1);
});

test('account change prevents publication and further requests from the old QA owner',async()=>{
 const pending=deferred(),view=fixture({fetcher:async()=>pending.promise});view.context.PanelStock.username='another-account';const before=JSON.stringify(view.states);pending.resolve(Response.json(data([compact(full())])));await settle();await button(view.render(),'Refreshing…').props.onClick();assert.equal(JSON.stringify(view.states),before);assert.equal(view.calls.length,1);assert.equal(view.clock.deadlines(),0);view.unmount();
});

test('reports load full evidence lazily and compact polls never replace the active full report',async()=>{
 const item=full(),summary=compact(item);let queues=0;const view=fixture({fetcher:async url=>url.includes('/qa/items/')?Response.json({ok:true,item,evidenceLoaded:true}):Response.json(data([queues++?{...summary,photoAdditions:[]}:summary]))});await settle();let tree=approved(view);assert.equal(view.calls.length,1);button(tree,'View report').props.onClick();await settle();tree=view.render();assert.equal(view.calls[1].url,'https://worker.test/qa/items/panel-one');assert.match(text(tree),/Saved inspection notes/);assert.match(text(tree),/Added by later-inspector/);assert.deepEqual(nodes(tree).filter(node=>node.tag==='img').map(node=>node.props.src),[image('check-old'),image('addition')]);view.win.emit('panelstock-remote-change');await settle();tree=view.render();assert.deepEqual(nodes(tree).filter(node=>node.tag==='img').map(node=>node.props.src),[image('check-old'),image('addition')]);assert.equal(view.states[0][0].evidenceLoaded,false);assert.equal(view.states[19].evidenceLoaded,true);view.unmount();
});

test('Add photos uses the originally clicked inspection ID from fresh full history when latest changed',async()=>{
 const old=attempt('old-check'),latest=attempt('new-check'),summary=compact(full({latest:old,history:[old],photoAdditions:[]})),item=full({latest,history:[old,latest],photoAdditions:[]});const view=fixture({fetcher:async url=>url.includes('/qa/items/')?Response.json({ok:true,item,evidenceLoaded:true}):Response.json(data([summary]))});await settle();button(approved(view),'Add photos').props.onClick();await settle();const opened=view.render();assert.equal(opened.tag,view.context.QaAppendPhotos);assert.equal(opened.props.attempt.id,'old-check');assert.equal(opened.props.item.latest.id,'new-check');assert.equal(opened.props.item.evidenceLoaded,true);view.unmount();
});

test('photo-count metadata and evidence flags preserve Add photos and Delete eligibility without image bytes',async()=>{
 const fullAtLimit=full({latest:attempt('limit',{photos:Array.from({length:10},(_,i)=>image('photo-'+i)),photo:''}),photoAdditions:[]}),atLimit=compact(fullAtLimit);atLimit.latest.photoCount=10;const untouched={id:'manual',kind:'metalwork',project:'Test project',orderNumber:'7',reference:'Manual',status:'awaiting',latest:null,history:[],photoAdditions:[],evidenceLoaded:false,hasPhotoEvidence:false};const protectedItem={...untouched,id:'evidence',hasPhotoEvidence:true};const view=fixture({fetcher:async()=>Response.json(data([atLimit,untouched,protectedItem]))});await settle();assert.equal(button(approved(view),'Add photos').props.disabled,true);view.states[8]='awaiting';const tree=expand(view);const rows=nodes(tree).filter(node=>node.tag==='article');assert.ok(button(rows.find(row=>row.props.key==='manual'),'Delete'));assert.equal(button(rows.find(row=>row.props.key==='evidence'),'Delete'),undefined);assert.equal(view.calls.length,1);view.unmount();
});

test('Recheck loads the full failed inspection before prefilling results and notes',async()=>{
 const item=full({id:'manual',kind:'metalwork',status:'recut',latest:attempt('failed',{status:'recut',results:{finish:'fail'},notes:'Failure needs correction'})}),summary=compact(item),view=fixture({fetcher:async url=>url.includes('/qa/items/')?Response.json({ok:true,item,evidenceLoaded:true}):Response.json(data([summary]))});await settle();view.states[8]='recut';button(expand(view),'Recheck').props.onClick();await settle();const tree=view.render();assert.match(text(tree),/Metalwork QA/);assert.equal(nodes(tree).find(node=>node.tag==='textarea').props.value,'Failure needs correction');assert.equal(view.calls[1].url,'https://worker.test/qa/items/manual');view.unmount();
});

for(const change of ['close','account','timeout'])test(`lazy evidence ${change} cannot leave an infinite spinner or apply a late detail response`,async()=>{
 const pending=deferred(),item=full(),view=fixture({fetcher:async url=>url.includes('/qa/items/')?pending.promise:Response.json(data([compact(item)]))});await settle();button(approved(view),'View report').props.onClick();if(change==='close')button(view.render(),'← Back to QA Centre').props.onClick();if(change==='account')view.context.PanelStock.username='other-user';if(change==='timeout'){view.clock.advance(20000);await settle();assert.ok(button(view.render(),'Retry inspection'));assert.doesNotMatch(text(view.render()),/Loading inspection evidence/);}const before=JSON.stringify(view.states);pending.resolve(Response.json({ok:true,item,evidenceLoaded:true}));await settle();assert.equal(JSON.stringify(view.states),before);view.unmount();assert.equal(view.clock.size(),0);
});


test('successful photo save replaces a pending queue read and leaves later automatic refreshes usable',async()=>{
 const item=full(),summary=compact(item),oldQueue=deferred(),freshQueue=deferred(),newPhoto={id:'new-addition',attemptId:item.latest.id,photos:[image('new-photo')],addedBy:'manager',addedAt:'2026-11-23T00:00:00Z'},updated={...item,photoAdditions:[...item.photoAdditions,newPhoto]};let queues=0;
 const view=fixture({initialReport:item,fetcher:async url=>{assert.ok(url.endsWith('/qa/queue'));queues++;if(queues===1)return Response.json(data([summary]));if(queues===2)return oldQueue.promise;if(queues===3)return freshQueue.promise;return Response.json(data([compact(updated)]));}});await settle();button(view.render(),'Add photos').props.onClick();const opened=view.render();view.win.emit('panelstock-remote-change');assert.equal(queues,2);opened.props.onSaved({ok:true,item:updated,addition:newPhoto,checklists:data().checklists});assert.equal(queues,3);assert.equal(view.controllers[1].signal.aborted,true);
 oldQueue.resolve(Response.json(data([summary])));await settle();view.win.emit('online');assert.equal(queues,3,'old finally cannot clear the replacement request while it is pending');freshQueue.resolve(Response.json(data([compact(updated)])));await settle();assert.equal(view.clock.deadlines(),0);view.win.emit('panelstock-remote-change');await settle();assert.equal(queues,4,'new automatic polls still run after the mutation and stale response');assert.equal(view.states[0][0].photoAdditions.length,2);assert.match(text(view.render()),/new-addition|Added by manager/);view.unmount();
});

for (const permissions of [
 {isAdmin:false,canManage:false},
 {isAdmin:false,canManage:true},
 {isAdmin:true,canManage:true}
]) test(`manual metalwork creation is unavailable for ${JSON.stringify(permissions)}`,async()=>{
 const view=fixture();
 await settle();
 const tree=view.render(permissions);
 assert.equal(button(tree,'Add metalwork'),undefined);
 assert.equal(nodes(tree).find(node=>node.tag==='form'),undefined);
 assert.ok(button(tree,'Refresh'));
 assert.ok(button(tree,'Import panel m² PDF'));
 assert.equal(view.calls.filter(call=>call.options?.method==='POST').length,0);
 view.unmount();
});
