const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8'),qaCode=source.slice(source.indexOf('  function qaReportStatusLabel('),source.indexOf('  function AuditCenter(')),dispatchCode=source.slice(source.indexOf('  function PanelDispatchLoads()'),source.indexOf('  function DispatchPage('));
const settle=()=>new Promise(resolve=>setImmediate(resolve));
const deferred=()=>{let resolve;const promise=new Promise(done=>resolve=done);return {promise,resolve};};
function nodes(tree){if(Array.isArray(tree))return tree.flatMap(nodes);return tree&&typeof tree==='object'?[tree,...nodes(tree.children),...nodes(tree.props?.action)]:[];}
function text(tree){if(Array.isArray(tree))return tree.map(text).join(' ');return tree===undefined||tree===null||typeof tree==='boolean'?'':typeof tree==='object'?text(tree.children):String(tree);}
const button=(tree,label)=>nodes(tree).find(node=>node.tag==='button'&&text(node).trim()===label);
const statusCard=(tree,label)=>nodes(tree).find(node=>node.tag==='button'&&node.children.some(child=>child?.tag==='span'&&text(child)===label));
const field=(tree,label)=>nodes(tree).find(node=>node.props['aria-label']===label);
const checkbox=(tree,id)=>nodes(tree).find(node=>node.tag==='label'&&node.props.key===id)?.children.find(node=>node?.tag==='input');
const form=tree=>nodes(tree).find(node=>node.tag==='form');
const submitButton=tree=>nodes(tree).find(node=>node.tag==='button'&&node.props.type==='submit');
const submit=tree=>form(tree).props.onSubmit({preventDefault(){}});
const reason=(view,value)=>field(view.render(),'QA requirement reason').props.onChange({target:{value}});
const choose=(view,id)=>checkbox(view.render(),id).props.onChange({target:{checked:true}});
const exemption={id:'grant-one',reason:'QA is not required for this scope',by:'manager',at:'2026-10-29T03:00:00Z',cutAt:'2026-10-29T00:00:00Z',productionSignature:'production-granted',active:true};
const panel=(id,extra={})=>({id,kind:'panel',project:'Project Alpha',orderNumber:'007',sheetNumber:'1',reference:id,cutBy:'operator',cutAt:'2026-10-29T00:00:00Z',status:'awaiting',latest:null,history:[],qaExemption:null,qaExemptionHistory:[],qaProductionSignature:'production-'+id,qaExemptionEligible:true,qaExemptionRevocable:false,...extra});
const granted=extra=>panel('granted',{status:'not_required',qaExemption:exemption,qaExemptionEligible:false,qaExemptionRevocable:true,qaExemptionHistory:[{...exemption,id:'event-grant',action:'grant',exemptionId:exemption.id}],...extra});
const candidates=()=>[panel('new'),panel('legacy',{cutAt:null,status:'pre_qa',project:'Project Beta'}),granted(),panel('failed',{status:'recut',qaExemptionEligible:false}),panel('approved',{status:'approved',qaExemptionEligible:false})];
function target(){const listeners=new Map();return {hidden:false,addEventListener(name,fn){if(!listeners.has(name))listeners.set(name,new Set());listeners.get(name).add(fn);},removeEventListener(name,fn){listeners.get(name)?.delete(fn);},emit(name){for(const fn of listeners.get(name)||[])fn();}};}
function fixture({kind='dialog',items=candidates(),fetcher,initialPanelId=null,initialAction='grant',live=kind==='dialog'}={}){
 const states=[],refs=[],effects=[],pending=[],requests=[],saved=[],closed=[],win=target(),doc=target();let cursor=0,refCursor=0,effectCursor=0;
 const qaData=()=>({ok:true,items,dispatches:[],settings:{},preQaCount:0,checklists:{panel:[['finish','Finish check']],metalwork:[],gate:[]}});
 const context={Response,console,Date,Math,Map,Set,PanelStock:{username:'admin',apiFetch:async(url,options)=>{requests.push({url,options});return fetcher?fetcher(url,options):Response.json(kind==='dialog'?{ok:true,items}:qaData());}},BAKED_WORKER_URL:'https://worker.test',PageHeading:'heading',ClipboardList:'clipboard',ChevronRight:'chevron',Truck:'truck',Check:'check',Camera:'camera',Upload:'upload',window:win,document:doc,setInterval:()=>1,clearInterval(){},import_react:{createElement:(tag,props,...children)=>({tag,props:props||{},children})},useState(initial){const i=cursor++;if(!(i in states))states[i]=typeof initial==='function'?initial():initial;return [states[i],value=>{states[i]=typeof value==='function'?value(states[i]):value;}];},useRef(initial){const i=refCursor++;return refs[i]||(refs[i]={current:initial});},useEffect(callback,deps){const i=effectCursor++,old=effects[i];if(!old||!deps||deps.some((value,j)=>value!==old.deps?.[j])){effects[i]={deps,cleanup:old?.cleanup};if(live)pending.push(()=>{effects[i].cleanup?.();effects[i].cleanup=callback();});}}};
 vm.createContext(context);vm.runInContext(qaCode+dispatchCode,context);
 function render(props={}){cursor=refCursor=effectCursor=0;const tree=kind==='dialog'?context.QaPanelRequirements({initialPanelId,initialAction,onSaved:value=>saved.push(value),onClose:()=>closed.push(true),...props}):context.QaCenter({username:'admin',isAdmin:true,canManage:true,canDispatch:false,...props});while(pending.length)pending.shift()();return tree;}
 render();if(kind==='qa'&&!live){states[0]=items;states[2]=qaData().checklists;states[5]=false;}
 return {render,states,refs,requests,saved,closed,context,win,qaData,unmount(){for(const effect of effects)effect.cleanup?.();},posts:()=>requests.filter(request=>request.options)};
}
const selectedIds=tree=>nodes(tree).filter(node=>node.tag==='label'&&node.props.key&&node.children.some(child=>child?.tag==='input'&&child.props.checked)).map(node=>node.props.key);
function expand(view){let tree=view.render();nodes(tree).find(node=>node.tag==='button'&&node.props['aria-expanded']===false)?.props.onClick();return view.render();}

test('management lists eligible completed and Pre-QA panels with no default selection; grant posts exact selected versions atomically',async()=>{
 const items=candidates(),view=fixture({items});await settle();let tree=view.render();assert.ok(checkbox(tree,'new'));assert.ok(checkbox(tree,'legacy'));assert.equal(checkbox(tree,'failed'),undefined);assert.equal(checkbox(tree,'approved'),undefined);assert.equal(checkbox(tree,'granted'),undefined);assert.deepEqual(selectedIds(tree),[]);assert.equal(submitButton(tree).props.disabled,true);
 field(tree,'Search panels for QA requirement').props.onChange({target:{value:'Alpha'}});button(view.render(),'Select all filtered').props.onClick();assert.deepEqual(selectedIds(view.render()),['new']);
 field(view.render(),'Search panels for QA requirement').props.onChange({target:{value:'Beta'}});button(view.render(),'Select all filtered').props.onClick();assert.match(text(view.render()),/2 panels selected/);reason(view,'  QA not included in this order scope  ');await submit(view.render());
 assert.equal(view.posts().length,1);const request=view.posts()[0];assert.equal(request.url,'https://worker.test/qa/panels/exemptions');assert.deepEqual(JSON.parse(request.options.body),{action:'grant',reason:'QA not included in this order scope',panels:[{id:'new',cutAt:items[0].cutAt,productionSignature:items[0].qaProductionSignature,expectedExemptionId:null},{id:'legacy',cutAt:null,productionSignature:items[1].qaProductionSignature,expectedExemptionId:null}]});assert.equal(view.saved.length,1);
});

test('a failed bulk grant preserves every selected panel and the reason for review and retry',async()=>{
 const view=fixture({fetcher:async(url,options)=>options?Response.json({error:'A selected panel now has an inspection. Refresh and review.'},{status:409}):Response.json({items:candidates()})});await settle();choose(view,'new');choose(view,'legacy');reason(view,'No QA inspection required for this scope');await submit(view.render());const tree=view.render();assert.deepEqual(selectedIds(tree),['new','legacy']);assert.equal(field(tree,'QA requirement reason').props.value,'No QA inspection required for this scope');assert.match(text(tree),/now has an inspection/);assert.equal(submitButton(tree).props.disabled,false);assert.equal(view.saved.length,0);assert.equal(JSON.parse(view.posts()[0].options.body).panels.length,2);
});

test('per-panel undo preselects the exact exemption and requires its own recorded reason',async()=>{
 const view=fixture({initialPanelId:'granted',initialAction:'revoke'});await settle();let tree=view.render();assert.deepEqual(selectedIds(tree),['granted']);assert.equal(checkbox(tree,'new'),undefined);assert.equal(submitButton(tree).props.disabled,true);reason(view,'  ');await submit(view.render());assert.equal(view.posts().length,0);reason(view,'Scope changed; inspection required');await submit(view.render());assert.deepEqual(JSON.parse(view.posts()[0].options.body),{action:'revoke',reason:'Scope changed; inspection required',panels:[{id:'granted',cutAt:exemption.cutAt,productionSignature:'production-granted',expectedExemptionId:exemption.id}]});
});

test('expired exemptions retain their expected ID when granting again, and stale row shortcuts cannot silently select another panel',async()=>{
 const expired=granted({status:'awaiting',qaExemption:{...exemption,active:false},qaExemptionEligible:true,qaExemptionRevocable:true}),view=fixture({items:[expired],initialPanelId:'granted'});await settle();reason(view,'Scope still excludes QA');await submit(view.render());assert.equal(JSON.parse(view.posts()[0].options.body).panels[0].expectedExemptionId,exemption.id);
 const stale=fixture({initialPanelId:'failed'});await settle();assert.deepEqual(selectedIds(stale.render()),[]);assert.match(text(stale.render()),/QA requirement changed/);assert.equal(submitButton(stale.render()).props.disabled,true);
});

test('changing action clears prior selection and reason; refreshed invalid selections block the entire mutation',async()=>{
 let count=0;const view=fixture({fetcher:async()=>Response.json({items:++count===1?candidates():[panel('new',{qaExemptionEligible:false})]})});await settle();choose(view,'new');reason(view,'Original reason');field(view.render(),'QA requirement action').props.onChange({target:{value:'revoke'}});assert.deepEqual(selectedIds(view.render()),[]);assert.equal(field(view.render(),'QA requirement reason').props.value,'');field(view.render(),'QA requirement action').props.onChange({target:{value:'grant'}});choose(view,'new');reason(view,'Keep this reason');await button(view.render(),'Refresh panels').props.onClick();let tree=view.render();assert.match(text(tree),/selected panel is no longer eligible/);assert.equal(submitButton(tree).props.disabled,true);await submit(tree);assert.equal(view.posts().length,0);assert.equal(field(tree,'QA requirement reason').props.value,'Keep this reason');button(tree,'Clear selection').props.onClick();assert.doesNotMatch(text(view.render()),/selected panel is no longer eligible/);
});

test('selection above the atomic batch limit is visible and cannot silently truncate the request',async()=>{
 const view=fixture({items:Array.from({length:501},(_,i)=>panel('p'+i))});await settle();button(view.render(),'Select all filtered').props.onClick();reason(view,'QA is not required');assert.match(text(view.render()),/501 panels selected/);assert.match(text(view.render()),/up to 500 panels/);assert.equal(submitButton(view.render()).props.disabled,true);await submit(view.render());assert.equal(view.posts().length,0);
});

test('failed loading offers a retry without exposing stale editable candidates',async()=>{
 let count=0;const view=fixture({fetcher:async()=>++count===1?Response.json({error:'Could not connect to QA'},{status:503}):Response.json({items:candidates()})});await settle();assert.match(text(view.render()),/Could not connect/);assert.equal(submitButton(view.render()).props.disabled,true);await button(view.render(),'Refresh panels').props.onClick();assert.ok(checkbox(view.render(),'legacy'));
});

for(const outcome of ['success','failure'])test(`closing the manager ignores a late ${outcome} mutation response`,async()=>{
 const pending=deferred(),view=fixture({fetcher:async(url,options)=>options?pending.promise:Response.json({items:candidates()})});await settle();choose(view,'new');reason(view,'No QA required');const saving=submit(view.render());button(view.render(),'Cancel').props.onClick();const before=view.states.slice();pending.resolve(outcome==='success'?Response.json({ok:true,items:[]}):Response.json({error:'Old mutation failed'},{status:409}));await saving;assert.equal(view.closed.length,1);assert.equal(view.saved.length,0);assert.deepEqual(view.states,before);
});

test('late loads after unmount or account change cannot reveal or replace management data',async()=>{
 for(const change of ['unmount','account']){const pending=deferred(),view=fixture({fetcher:async()=>pending.promise});if(change==='unmount')view.unmount();else view.context.PanelStock.username='other-account';const before=view.states.slice();pending.resolve(Response.json({items:candidates()}));await settle();assert.deepEqual(view.states,before);}
});

test('QA requirements entry is admin-only, includes an empty regular queue, and per-panel shortcuts select the intended action',()=>{
 const view=fixture({kind:'qa',items:[panel('new'),granted()]});assert.ok(button(view.render(),'QA requirements'));assert.equal(button(view.render({isAdmin:false}),'QA requirements'),undefined);let tree=expand(view);button(tree,'QA not required…').props.onClick();let opened=view.render();assert.equal(opened.tag,view.context.QaPanelRequirements);assert.equal(opened.props.initialPanelId,'new');assert.equal(opened.props.initialAction,'grant');opened.props.onClose();
 tree=view.render();statusCard(tree,'QA not required').props.onClick();tree=expand(view);assert.equal(button(tree,'Open check'),undefined);button(tree,'Require QA again').props.onClick();opened=view.render();assert.equal(opened.props.initialAction,'revoke');assert.equal(opened.props.initialPanelId,'granted');
 const empty=fixture({kind:'qa',items:[]});assert.ok(button(empty.render(),'QA requirements'));
});

test('exemptions have their own count and history report without a fabricated QA approval or inspection',()=>{
 const view=fixture({kind:'qa',items:[granted(),panel('approved',{status:'approved',qaExemptionEligible:false})]});let tree=view.render();const count=label=>{const card=nodes(tree).find(node=>node.tag==='button'&&node.children.some(child=>child?.tag==='span'&&text(child)===label));return Number(text(nodes(card).find(node=>node.tag==='strong')));};assert.equal(count('Approved'),1);assert.equal(count('QA not required'),1);statusCard(tree,'QA not required').props.onClick();tree=expand(view);assert.match(text(tree),/QA not required · manager/);assert.match(text(tree),/QA is not required for this scope/);assert.ok(button(tree,'View report'));button(tree,'View report').props.onClick();tree=view.render();assert.match(text(tree),/QA requirement changes/);assert.match(text(tree),/QA not required recorded/);assert.doesNotMatch(text(tree),/Inspection 1|Checked by manager/);
});

test('order preview separates exemption decisions from inspection attempts and preserves revoked history',()=>{
 const view=fixture({kind:'qa'}),events=[{...exemption,id:'grant-event',action:'grant'},{...exemption,id:'revoke-event',action:'revoke',reason:'Now require an inspection'}],item=granted({qaExemptionHistory:events});view.states.length=0;let tree=view.context.QaOrderReport({report:{project:'Project Alpha',orderNumber:'007',items:[item],checklists:{panel:[]}},onClose(){}});assert.match(text(tree),/QA not required — no QA inspection recorded/);assert.match(text(tree),/QA not required recorded/);assert.match(text(tree),/QA required again/);assert.match(text(tree),/Now require an inspection/);assert.doesNotMatch(text(tree),/Inspection 1/);
 const revoked=panel('old',{qaExemption:{...exemption,active:false},qaExemptionHistory:events});const details=view.context.qaRequirementDetails(revoked);assert.match(text(details),/previous QA exemption is no longer active/);assert.doesNotMatch(text(details),/QA not required · manager/);
});

test('a successful management save invalidates an earlier QA refresh and reloads the regular queue instead of adopting management candidates',async()=>{
 const stale=deferred();let get=0;const old=panel('new'),current=granted({id:'new',reference:'new'});const view=fixture({kind:'qa',live:true,items:[old],fetcher:async()=>++get===1?Response.json({items:[old],checklists:{panel:[]}}):get===2?stale.promise:Response.json({items:[current],checklists:{panel:[]}})});await settle();view.win.emit('panelstock-remote-change');button(view.render(),'QA requirements').props.onClick();const opened=view.render();opened.props.onSaved({items:[panel('management-preqa',{status:'pre_qa'})]});await settle();stale.resolve(Response.json({items:[old]}));await settle();const tree=view.render();assert.equal(view.states[0].length,1);assert.equal(view.states[0][0].status,'not_required');assert.equal(view.states[0][0].id,'new');assert.doesNotMatch(text(tree),/management-preqa/);view.unmount();
});

test('Dispatch labels exempt panels truthfully while keeping routing, coating and final QA gates server-driven',()=>{
 const view=fixture({kind:'qa'}),loads=[{id:'load',project:'Project Alpha',orderNumber:'007',status:'waiting',routing:false,qaComplete:true,fabricationComplete:false,ready:false,requiresPowderCoating:true,legs:[],items:[{id:'granted',reference:'granted',sheetNumber:'1',routing:false,qa:true,qaStatus:'not_required',qaExemption:exemption}]}];let cursor=0;view.context.useState=()=>[[loads,false,'',null,{},'','active'][cursor++],()=>{}];view.context.useEffect=()=>{};let tree=view.context.PanelDispatchLoads();assert.match(text(tree),/QA not required · manager/);assert.match(text(tree),/Awaiting routing/);assert.doesNotMatch(text(tree),/QA approved/);assert.equal(button(tree,'Send to powder coaters').props.disabled,true);
 loads[0]={...loads[0],status:'awaiting_final_qa',routing:true,fabricationComplete:true,ready:false,coatingCompleted:{by:'coater'},items:[{...loads[0].items[0],routing:true}]};cursor=0;tree=view.context.PanelDispatchLoads();assert.ok(button(tree,'Approve final QA'));assert.equal(button(tree,'Dispatch to site'),undefined);assert.match(text(tree),/Confirmed by QA or exemption/);
});
