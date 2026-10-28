const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const qaCode=source.slice(source.indexOf('  function qaReportStatusLabel('),source.indexOf('  function AuditCenter('));
const dispatchCode=source.slice(source.indexOf('  function PanelDispatchLoads()'),source.indexOf('  function DispatchPage('));
function nodes(tree){if(Array.isArray(tree))return tree.flatMap(nodes);return tree&&typeof tree==='object'?[tree,...nodes(tree.children),...nodes(tree.props?.action)]:[];}
function text(tree){if(Array.isArray(tree))return tree.map(text).join(' ');if(tree===null||tree===undefined||typeof tree==='boolean')return '';return typeof tree==='object'?text(tree.children):String(tree);}
function button(tree,label){return nodes(tree).find(node=>node.tag==='button'&&text(node).trim()===label);}
function deferred(){let resolve;const promise=new Promise(done=>resolve=done);return {promise,resolve};}
function eventTarget(){const listeners=new Map();return {visibilityState:'visible',get hidden(){return this.visibilityState==='hidden';},addEventListener(type,callback){if(!listeners.has(type))listeners.set(type,new Set());listeners.get(type).add(callback);},removeEventListener(type,callback){listeners.get(type)?.delete(callback);},emit(type){for(const callback of [...(listeners.get(type)||[])])callback({type});},count(){return [...listeners.values()].reduce((sum,set)=>sum+set.size,0);}};}
const settle=()=>new Promise(resolve=>setImmediate(resolve));
const panel=(id,reference,extra={})=>({id,kind:'panel',project:'Example project',orderNumber:'007',sheetNumber:id,reference,quantity:1,cutAt:'2026-10-25T00:00:00Z',cutBy:'CNC operator',status:'approved',qaResolved:true,qaBlocker:'',latest:{id:'qa-'+id,status:'approved',checkedAt:'2026-10-25T01:00:00Z',checkedBy:'Reviewer'},history:[],...extra});
const blocked=()=>panel('original','A-99',{status:'replaced',qaResolved:false,qaBlocker:'Approved replacement required',resolvedSeparatelyAt:'2026-10-26T02:00:00Z',resolvedSeparatelyBy:'Admin',latest:{id:'failed-check',status:'recut',checkedAt:'2026-10-26T00:00:00Z',checkedBy:'Reviewer'}});
function qaData(items){return {ok:true,items,dispatches:[],settings:{},checklists:{panel:[['finish','Finish check']],metalwork:[]},preQaCount:0};}
function loadFor(items){return {id:'load-one',project:'Example project',orderNumber:'007',status:'waiting',legs:[],routing:true,qaComplete:items.every(item=>item.qaResolved),fabricationComplete:items.every(item=>item.qaResolved),ready:items.every(item=>item.qaResolved),items:items.map(item=>({id:item.id,reference:item.reference,sheetNumber:item.sheetNumber,routing:true,qa:item.qaResolved,replaced:false,qaResolved:item.qaResolved,qaBlocker:item.qaBlocker}))};}
function harness({kind='qa',items=[],loads=[],fetcher,live=false}={}){
  const states=kind==='qa'?[items,[],qaData(items).checklists,0,{},false]:[loads,false,'',null,{},'','active'],refs=[],effects=[],pendingEffects=[],requests=[];
  const win=eventTarget(),doc=eventTarget(),timers=new Map();let timerId=0,stateIndex=0,refIndex=0,effectIndex=0;
  const context={console,window:win,document:doc,setInterval(callback){const id=++timerId;timers.set(id,callback);return id;},clearInterval(id){timers.delete(id);},import_react:{createElement:(tag,props,...children)=>({tag,props,children})},useState(initial){const index=stateIndex++;if(!(index in states))states[index]=typeof initial==='function'?initial():initial;return [states[index],value=>{states[index]=typeof value==='function'?value(states[index]):value;}];},useRef(initial){const index=refIndex++;return refs[index]||(refs[index]={current:initial});},useEffect(callback,deps){const index=effectIndex++,old=effects[index];if(!old||!deps||deps.some((value,j)=>value!==old.deps?.[j])){effects[index]={deps,cleanup:old?.cleanup};if(live)pendingEffects.push(()=>{effects[index].cleanup?.();effects[index].cleanup=callback();});}},PanelStock:{apiFetch:async(url,options)=>{requests.push({url,options});return fetcher?fetcher(url,options):{ok:true,json:async()=>kind==='qa'?qaData(items):{ok:true,loads}};}},BAKED_WORKER_URL:'https://worker.example.test',PageHeading:'heading',ClipboardList:'clipboard',ChevronRight:'chevron',Truck:'truck',Check:'check',Camera:'camera',Upload:'upload'};
  vm.createContext(context);vm.runInContext(kind==='qa'?qaCode:dispatchCode,context);
  function render(props={}){stateIndex=refIndex=effectIndex=0;const result=kind==='qa'?context.QaCenter({username:'admin',isAdmin:true,canManage:true,canDispatch:false,...props}):context.PanelDispatchLoads();while(pendingEffects.length)pendingEffects.shift()();return result;}
  function unmount(){for(const effect of effects)effect.cleanup?.();}
  return {render,states,refs,requests,win,doc,timers,unmount};
}
function counts(tree){const result={};for(const label of ['Awaiting QA','Recut required','Approved']){const card=nodes(tree).find(node=>node.tag==='button'&&node.children.some(child=>child?.tag==='span'&&text(child)===label));result[label]=Number(text(nodes(card).find(node=>node.tag==='strong')));}return result;}
function expand(tree){nodes(tree).find(node=>node.tag==='button'&&node.props?.['aria-expanded']===false)?.props.onClick();}
function originalRow(tree){return nodes(tree).find(node=>node.tag==='article'&&node.props?.key==='original');}
function linkAction(tree){return nodes(tree).find(node=>node.tag==='button'&&/link.*replacement/i.test(text(node)));}

test('the 18-panel QA list and dispatch load both identify an unlinked separate recut without claiming approval',()=>{
  const original=blocked(),items=[...Array.from({length:17},(_,index)=>panel('approved-'+index,'P-'+index)),original],view=harness({items});
  let tree=view.render();assert.deepEqual(counts(tree),{'Awaiting QA':1,'Recut required':0,Approved:17});
  expand(tree);tree=view.render();const row=originalRow(tree);assert.ok(row);assert.match(text(row),/Approved replacement required/);assert.match(text(row),/Separate recut recorded by Admin/);
  assert.ok(linkAction(row));
  assert.equal(nodes(row).some(node=>node.tag==='button'&&!node.props.disabled&&/^(?:Open check|Reopen|Recheck|Approve QA)$/.test(text(node).trim())),false,'failed original cannot be approved directly');
  const dispatch=harness({kind:'dispatch',loads:[loadFor(items)]}).render();
  assert.match(text(dispatch),/Approved replacement required/);assert.equal(button(dispatch,'Dispatch load').props.disabled,true);
  const staff=harness({items:[original]});expand(staff.render({isAdmin:false}));assert.equal(linkAction(staff.render({isAdmin:false})),undefined);
});

function candidateFixture(){
  const original=blocked(),approved=panel('valid','A-99',{cutAt:'2026-10-27T00:00:00Z',latest:{id:'valid-check',status:'approved',checkedAt:'2026-10-27T01:00:00Z'}}),claimed=panel('claimed','A-99',{cutAt:'2026-10-27T00:00:00Z'});
  return {original,approved,items:[original,approved,claimed,panel('claiming-original','OTHER',{status:'replaced',replacementId:'claimed'}),panel('wrong-project','A-99',{project:'Other project',cutAt:approved.cutAt}),panel('wrong-order','A-99',{orderNumber:'008',cutAt:approved.cutAt}),panel('wrong-ref','A-98',{cutAt:approved.cutAt}),panel('not-approved','A-99',{status:'awaiting',qaResolved:false,cutAt:approved.cutAt}),panel('not-completed','A-99',{cutAt:null}),panel('before-failure','A-99',{cutAt:'2026-10-25T23:00:00Z'}),panel('other-remake','A-99',{cutAt:approved.cutAt,remakeOf:'another-original'}),panel('metal','A-99',{kind:'metalwork',cutAt:approved.cutAt})]};
}
function openReplacement(view){let tree=view.render();expand(tree);tree=view.render();const action=linkAction(originalRow(tree));assert.ok(action);action.props.onClick();return view.render();}

test('replacement dropdown offers only completed approved matching panels that are unclaimed and newer than the failure',()=>{
  const {items,approved}=candidateFixture(),view=harness({items}),tree=openReplacement(view);
  const select=nodes(tree).find(node=>node.tag==='select');assert.ok(select);
  const options=nodes(select).filter(node=>node.tag==='option'&&node.props.value);
  assert.deepEqual(options.map(node=>node.props.value),[approved.id]);
  assert.equal(linkAction(tree).props.disabled,true,'explicit selection is required');
});

test('a linked replacement awaiting QA opens that replacement rather than the failed original',()=>{
  const replacement=panel('pending-replacement','A-99',{status:'awaiting',qaResolved:false,qaBlocker:'Awaiting QA',cutAt:'2026-10-27T00:00:00Z'}),original={...blocked(),replacementId:replacement.id},view=harness({items:[original,replacement]});
  let tree=view.render();expand(tree);tree=view.render();const row=originalRow(tree),action=button(row,'Check replacement QA');assert.ok(action);action.props.onClick();tree=view.render();
  assert.match(text(tree),/Sheet pending-replacement/);assert.doesNotMatch(text(tree),/Sheet original/);
});

test('recording a separate recut remains available only for an unresolved raw recut',()=>{
  const raw={...blocked(),status:'recut',qaBlocker:'Recut required',resolvedSeparatelyAt:null},view=harness({items:[raw]});let tree=view.render();nodes(tree).find(node=>node.tag==='button'&&node.children.some(child=>child?.tag==='span'&&text(child)==='Recut required')).props.onClick();tree=view.render();expand(tree);tree=view.render();
  const action=button(originalRow(tree),'Resolve recut');assert.ok(action);action.props.onClick();tree=view.render();assert.ok(button(tree,'Record separate recut'));
  const replaced=harness({items:[blocked()]});assert.equal(button(openReplacement(replaced),'Record separate recut'),undefined);
});

test('explicit replacement linking posts the selected approval and updates QA counts from the server response',async()=>{
  const {items,original,approved}=candidateFixture(),updated={...original,replacementId:approved.id,replacementReference:approved.reference,qaResolved:true,qaBlocker:''};
  const view=harness({items,fetcher:async()=>({ok:true,json:async()=>qaData([updated,approved])})});
  let tree=openReplacement(view);nodes(tree).find(node=>node.tag==='select').props.onChange({target:{value:approved.id}});tree=view.render();
  nodes(tree).find(node=>node.tag==='form').props.onSubmit({preventDefault(){}});await settle();
  assert.equal(view.requests.length,1);assert.equal(view.requests[0].url,'https://worker.example.test/qa/recut/resolve');
  assert.deepEqual(JSON.parse(view.requests[0].options.body),{id:original.id,replacementId:approved.id,reason:'Approved replacement selected in QA Centre'});
  tree=view.render();assert.deepEqual(counts(tree),{'Awaiting QA':0,'Recut required':0,Approved:2});
});

test('a refresh started before linking cannot overwrite the successful replacement response',async()=>{
  const {items,original,approved}=candidateFixture(),stale=deferred(),updated={...original,replacementId:approved.id,qaResolved:true,qaBlocker:''};let getCount=0;
  const view=harness({items,live:true,fetcher:async(url,options)=>options?{ok:true,json:async()=>qaData([updated,approved])}:++getCount===1?{ok:true,json:async()=>qaData(items)}:stale.promise});
  view.render();await settle();view.win.emit('panelstock-remote-change');let tree=openReplacement(view);nodes(tree).find(node=>node.tag==='select').props.onChange({target:{value:approved.id}});tree=view.render();nodes(tree).find(node=>node.tag==='form').props.onSubmit({preventDefault(){}});await settle();
  assert.deepEqual(counts(view.render()),{'Awaiting QA':0,'Recut required':0,Approved:2});stale.resolve({ok:true,json:async()=>qaData(items)});await settle();assert.deepEqual(counts(view.render()),{'Awaiting QA':0,'Recut required':0,Approved:2});view.unmount();
});

test('a rejected link retains the selected replacement and the form so an operator can retry safely',async()=>{
  const {items,approved}=candidateFixture(),view=harness({items,fetcher:async()=>({ok:false,json:async()=>({error:'This replacement was claimed by another panel. Refresh and choose another.'})})});
  let tree=openReplacement(view);nodes(tree).find(node=>node.tag==='select').props.onChange({target:{value:approved.id}});tree=view.render();nodes(tree).find(node=>node.tag==='form').props.onSubmit({preventDefault(){}});await settle();tree=view.render();
  assert.match(text(tree),/This replacement was claimed by another panel/);assert.equal(nodes(tree).find(node=>node.tag==='select').props.value,approved.id);assert.equal(linkAction(tree).props.disabled,false);assert.equal(view.requests.length,1);
});

for(const kind of ['qa','dispatch'])test(`${kind} has an explicit Refresh action that reloads its endpoint`,async()=>{
  const view=harness({kind,live:true});view.render();await settle();
  const refresh=button(view.render(),'Refresh');assert.ok(refresh);assert.equal(refresh.props.disabled,false);
  await refresh.props.onClick();await settle();assert.equal(view.requests.length,2);
  assert.equal(view.requests[1].options,undefined);view.unmount();
});

for(const kind of ['qa','dispatch'])test(`${kind} refresh listeners are removed on unmount and late responses cannot change state`,async()=>{
  const pending=[],view=harness({kind,live:true,fetcher:async()=>{const request=deferred();pending.push(request);return request.promise;}});
  view.render();assert.equal(view.requests.length,1);
  view.win.emit('panelstock-remote-change');view.win.emit('online');view.doc.emit('visibilitychange');assert.equal(view.requests.length,4);
  view.doc.visibilityState='hidden';view.doc.emit('visibilitychange');assert.equal(view.requests.length,4);
  assert.ok(view.win.count()>0);assert.ok(view.doc.count()>0);view.unmount();assert.equal(view.win.count(),0);assert.equal(view.doc.count(),0);assert.equal(view.timers.size,0);
  const before=JSON.stringify(view.states);for(const request of pending)request.resolve({ok:true,json:async()=>kind==='qa'?qaData([panel('late','LATE')]):{loads:[loadFor([panel('late','LATE')])]}});await settle();
  assert.equal(JSON.stringify(view.states),before);view.win.emit('online');assert.equal(view.requests.length,4);
});

for(const kind of ['qa','dispatch'])test(`${kind} ignores an older GET that completes after a newer refresh`,async()=>{
  const pending=[],view=harness({kind,live:true,fetcher:async()=>{const request=deferred();pending.push(request);return request.promise;}});
  view.render();view.win.emit('panelstock-remote-change');assert.equal(pending.length,2);
  const body=item=>kind==='qa'?qaData([item]):{loads:[{...loadFor([item]),project:item.project}]};
  pending[1].resolve({ok:true,json:async()=>body(panel('new','NEW',{project:'Newest project',status:'awaiting',qaResolved:false,qaBlocker:'Awaiting QA'}))});await settle();assert.match(text(view.render()),/Newest project/);
  pending[0].resolve({ok:true,json:async()=>body(panel('old','OLD',{project:'Older project',status:'awaiting',qaResolved:false,qaBlocker:'Awaiting QA'}))});await settle();const content=text(view.render());assert.match(content,/Newest project/);assert.doesNotMatch(content,/Older project/);view.unmount();
});

test('an uncut dispatch panel still shows routing as the next step even without a QA record',()=>{
  const load=loadFor([panel('pending-cut','PENDING',{status:'awaiting',qaResolved:false,qaBlocker:'Awaiting QA'})]);
  load.routing=false;load.items[0].routing=false;
  const tree=harness({kind:'dispatch',loads:[load]}).render();
  assert.match(text(tree),/Awaiting routing/);assert.doesNotMatch(text(tree),/Awaiting QA/);
  assert.equal(button(tree,'Dispatch load').props.disabled,true);
});
