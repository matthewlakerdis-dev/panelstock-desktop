const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8'),code=source.slice(source.indexOf('  function qaReportStatusLabel('),source.indexOf('  function AuditCenter('));
const settle=()=>new Promise(resolve=>setImmediate(resolve));
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
function nodes(tree){if(Array.isArray(tree))return tree.flatMap(nodes);return tree&&typeof tree==='object'?[tree,...nodes(tree.children),...nodes(tree.props?.action)]:[];}
function text(tree){if(Array.isArray(tree))return tree.map(text).join(' ');return tree==null||typeof tree==='boolean'?'':typeof tree==='object'?text(tree.children):String(tree);}
const button=(tree,label)=>nodes(tree).find(node=>node.tag==='button'&&text(node).trim()===label);
const section=(tree,label)=>nodes(tree).find(node=>node.tag==='section'&&node.props['aria-label']===label);
const chooser=tree=>nodes(tree).find(node=>node.tag==='input'&&node.props.type==='file'&&!node.props.capture);
const camera=tree=>nodes(tree).find(node=>node.tag==='input'&&node.props.capture==='environment');
const gallery=tree=>nodes(section(tree,'New inspection photos')).filter(node=>node.tag==='img').map(node=>node.props.src);
const savedGallery=tree=>nodes(section(tree,'Saved inspection photos')).filter(node=>node.tag==='img').map(node=>node.props.src);
const file=name=>new File([name],name+'.jpg',{type:'image/jpeg'});
const encoded=name=>'data:image/jpeg;base64,'+Buffer.from(name).toString('base64');
const inspection=(extra={})=>({id:'inspection-one',status:'approved',checkedBy:'original-reviewer',checkedAt:'2026-11-08T00:00:00Z',results:{finish:'pass'},notes:'Original inspection notes',photo:encoded('original'),...extra});
const record=(extra={})=>{const latest=inspection();return {id:'panel-one',kind:'panel',project:'Test project',orderNumber:'9',sheetNumber:'1',reference:'P1',quantity:1,cutBy:'operator',cutAt:'2026-11-07T00:00:00Z',status:'approved',latest,history:[latest],photoAdditions:[],...extra};};
const addition=(extra={})=>({id:'addition-one',attemptId:'inspection-one',photos:[encoded('previous-addition')],addedBy:'later-reviewer',addedAt:'2026-11-08T01:00:00Z',mutationId:'older-mutation',...extra});
const checklists={panel:[['finish','Finish check']],metalwork:[],gate:[]};
function reply(item,body){const event=addition({photos:body.photos,attemptId:body.attemptId,mutationId:body.mutationId});return {ok:true,item:{...item,photoAdditions:[...(item.photoAdditions||[]),event]},addition:event,idempotent:false,checklists};}
function eventTarget(){const listeners=new Map();return {hidden:false,addEventListener(name,fn){if(!listeners.has(name))listeners.set(name,new Set());listeners.get(name).add(fn);},removeEventListener(name,fn){listeners.get(name)?.delete(fn);},emit(name){for(const fn of listeners.get(name)||[])fn();}};}
function fixture({kind='dialog',item=record(),attempt=item.latest,items=[item],processor=async value=>({data:encoded(await value.text())}),fetcher,live=kind==='dialog'}={}){
 const states=[],refs=[],effects=[],pendingEffects=[],calls=[],saved=[],closed=[],processed=[],win=eventTarget(),doc=eventTarget();let cursor=0,refCursor=0,effectCursor=0,mutation=0;
 const data=()=>({ok:true,items,dispatches:[],checklists,settings:{requireQaPhoto:false}});
 const context={Response,File,console,Date,Math,Array,Map,Set,crypto:{randomUUID:()=>`00000000-0000-4000-8000-${String(++mutation).padStart(12,'0')}`},window:win,document:doc,setInterval:()=>1,clearInterval(){},PageHeading:'heading',ClipboardList:'clipboard',ChevronRight:'chevron',Check:'check',Camera:'camera',Upload:'upload',BAKED_WORKER_URL:'https://worker.test',processImageFile:async value=>{assert.ok(value instanceof File);processed.push(value.name);return processor(value);},PanelStock:{username:'inspector',apiFetch:async(url,options)=>{calls.push({url,options});return fetcher?fetcher(url,options):Response.json(options?reply(item,JSON.parse(options.body)):data());}},import_react:{createElement:(tag,props,...children)=>({tag,props:props||{},children})},useState(initial){const i=cursor++;if(!(i in states))states[i]=typeof initial==='function'?initial():initial;return [states[i],value=>{states[i]=typeof value==='function'?value(states[i]):value;}];},useRef(initial){const i=refCursor++;return refs[i]||(refs[i]={current:initial});},useEffect(callback,deps){const i=effectCursor++,old=effects[i];if(!old||!deps||deps.some((value,j)=>value!==old.deps?.[j])){effects[i]={deps,cleanup:old?.cleanup};if(live)pendingEffects.push(()=>{effects[i].cleanup?.();effects[i].cleanup=callback();});}}};
 vm.createContext(context);vm.runInContext(code,context);
 function render(props={}){cursor=refCursor=effectCursor=0;const tree=kind==='dialog'?context.QaAppendPhotos({item,attempt,username:'inspector',onSaved:result=>saved.push(result),onClose:()=>closed.push(true),...props}):context.QaCenter({username:'inspector',isAdmin:false,canManage:false,canDispatch:false,...props});while(pendingEffects.length)pendingEffects.shift()();return tree;}
 render();if(kind==='qa'&&!live){states[0]=items;states[2]=checklists;states[5]=false;states[8]='approved';}
 return {render,states,refs,calls,saved,closed,context,win,processed,data,unmount(){for(const effect of effects)effect.cleanup?.();},posts:()=>calls.filter(call=>call.options)};
}
const form=tree=>nodes(tree).find(node=>node.tag==='form');
const submitButton=tree=>nodes(tree).find(node=>node.tag==='button'&&node.props.type==='submit');
const submit=tree=>form(tree).props.onSubmit({preventDefault(){}});
async function select(input,files){const target={files,value:'selected'};const pending=input.props.onChange({target});assert.equal(target.value,'');await pending;}
function expand(view,props={}){let tree=view.render(props);nodes(tree).find(node=>node.tag==='button'&&node.props['aria-expanded']===false)?.props.onClick();return view.render(props);}

test('ordinary QA team can view completed reports and append latest photos without reopening or approval access',()=>{
 const view=fixture({kind:'qa'});let tree=expand(view);assert.ok(button(tree,'View report'));assert.ok(button(tree,'Add photos'));assert.equal(button(tree,'Reopen'),undefined);assert.equal(button(tree,'Completed').props.disabled,true);assert.equal(button(tree,'Generate QA report'),undefined);button(tree,'Add photos').props.onClick();let opened=view.render();assert.equal(opened.tag,view.context.QaAppendPhotos);assert.equal(opened.props.attempt.id,'inspection-one');opened.props.onClose();tree=view.render();button(tree,'View report').props.onClick();tree=view.render();assert.match(text(tree),/Original inspection notes/);button(tree,'Add photos').props.onClick();opened=view.render();assert.equal(opened.props.item.id,'panel-one');assert.equal(opened.props.attempt.id,'inspection-one');
});

test('report supports each saved attempt and disables missing inspection IDs without inventing a new inspection',()=>{
 const old=inspection({id:'old-check',status:'recut',results:{finish:'fail'},notes:'Original failure'}),latest=inspection({id:'new-check'}),view=fixture({kind:'qa',item:record({latest,history:[old,latest,inspection({id:undefined,status:'approved'})]})});let tree=expand(view);button(tree,'View report').props.onClick();tree=view.render();const attempts=nodes(tree).filter(node=>node.tag==='article');assert.equal(attempts.length,3);assert.equal(button(attempts[0],'Add photos').props.disabled,true);button(attempts[2],'Add photos').props.onClick();const opened=view.render();assert.equal(opened.props.attempt.id,'old-check');assert.equal(opened.props.attempt.status,'recut');
});

test('append gallery shows saved originals and additions read-only, supports batch/camera/removal and sends only new photos',async()=>{
 const item=record({photoAdditions:[addition(),addition({id:'other',attemptId:'other-check',photos:[encoded('not-this-inspection')]})]}),original=JSON.stringify(item),view=fixture({item});let tree=view.render();assert.deepEqual(savedGallery(tree),[encoded('original'),encoded('previous-addition')]);assert.equal(nodes(section(tree,'Saved inspection photos')).some(node=>node.tag==='button'),false);assert.match(text(tree),/Added by later-reviewer/);assert.equal(chooser(tree).props.multiple,true);
 await select(chooser(tree),[file('front'),file('rear')]);await select(camera(view.render()),[file('hinges')]);tree=view.render();nodes(tree).find(node=>node.props['aria-label']==='Remove new photo 2').props.onClick();tree=view.render();assert.deepEqual(gallery(tree),[encoded('front'),encoded('hinges')]);assert.match(text(tree),/4 of 10 photos · 2 new/);await submit(tree);const request=view.posts()[0];assert.equal(request.url,'https://worker.test/qa/photos');const body=JSON.parse(request.options.body);assert.deepEqual(body,{id:'panel-one',kind:'panel',attemptId:'inspection-one',photos:[encoded('front'),encoded('hinges')],mutationId:'00000000-0000-4000-8000-000000000001'});assert.equal(JSON.stringify(item),original);assert.deepEqual(view.saved[0].item.latest,item.latest);assert.deepEqual(view.saved[0].item.history,item.history);
});

test('definite rejection retains pending photos and permits a corrected draft with a new mutation key',async()=>{
 let count=0;const view=fixture({fetcher:async(url,options)=>{const body=JSON.parse(options.body);return ++count===1?Response.json({error:'Photo limit changed; remove a new photo.'},{status:409}):Response.json(reply(record(),body));}});await select(chooser(view.render()),[file('front'),file('rear')]);await submit(view.render());let tree=view.render();assert.match(text(tree),/Photo limit changed/);assert.deepEqual(gallery(tree),[encoded('front'),encoded('rear')]);assert.equal(chooser(tree).props.disabled,false);nodes(tree).find(node=>node.props['aria-label']==='Remove new photo 2').props.onClick();await submit(view.render());const bodies=view.posts().map(call=>JSON.parse(call.options.body));assert.notEqual(bodies[0].mutationId,bodies[1].mutationId);assert.deepEqual(bodies[1].photos,[encoded('front')]);assert.equal(view.saved.length,1);
});

for(const failure of ['network','server','unconfirmed'])test(`${failure} failure preserves the exact retry request and locks editing until its outcome is confirmed`,async()=>{
 const item=record();let count=0;const view=fixture({item,fetcher:async(url,options)=>{const body=JSON.parse(options.body);if(++count===1){if(failure==='network')throw Error('Connection lost');if(failure==='unconfirmed')return Response.json({ok:true});return Response.json({error:'Temporarily unavailable'},{status:503});}return Response.json({...reply(item,body),idempotent:true});}});await select(chooser(view.render()),[file('new')]);const priorRemove=nodes(view.render()).find(node=>node.props['aria-label']==='Remove new photo 1');await submit(view.render());let tree=view.render();assert.match(text(tree),/Retry to confirm the same photos/);assert.deepEqual(gallery(tree),[encoded('new')]);assert.equal(chooser(tree).props.disabled,true);assert.equal(priorRemove.props.disabled,false);priorRemove.props.onClick();assert.deepEqual(gallery(view.render()),[encoded('new')]);assert.equal(button(tree,'Retry adding photos').props.disabled,false);await submit(tree);assert.equal(view.posts()[0].options.body,view.posts()[1].options.body);assert.equal(view.saved.length,1);assert.equal(view.saved[0].idempotent,true);
});

test('processing and save locks reject concurrent adds, removals and duplicate submits',async()=>{
 const image=deferred(),upload=deferred(),view=fixture({processor:async value=>value.name==='slow.jpg'?image.promise:{data:encoded(await value.text())},fetcher:async()=>upload.promise});await select(chooser(view.render()),[file('existing')]);const staleChooser=chooser(view.render()),staleRemove=nodes(view.render()).find(node=>node.props['aria-label']==='Remove new photo 1');const reading=select(staleChooser,[file('slow')]);let tree=view.render();assert.equal(submitButton(tree).props.disabled,true);staleRemove.props.onClick();await submit(tree);await select(staleChooser,[file('racing')]);assert.deepEqual(view.processed,['existing.jpg','slow.jpg']);assert.equal(view.posts().length,0);image.resolve({data:encoded('slow')});await reading;const ready=view.render(),saving=submit(ready);await submit(ready);assert.equal(view.posts().length,1);assert.equal(chooser(view.render()).props.disabled,true);upload.resolve(Response.json(reply(record(),JSON.parse(view.posts()[0].options.body))));await saving;assert.equal(view.saved.length,1);
});

test('saved photos and previous additions count toward the ten-photo total; extra selections are never silently truncated',async()=>{
 const item=record({latest:inspection({photo:encoded('original-0'),photos:Array.from({length:8},(_,i)=>encoded('original-'+i))}),photoAdditions:[addition()]}),view=fixture({item});await select(chooser(view.render()),[file('first'),file('second')]);assert.match(text(view.render()),/up to 10 photos/);assert.deepEqual(gallery(view.render()),[]);assert.equal(view.processed.length,0);await select(chooser(view.render()),[file('last')]);assert.match(text(view.render()),/10 of 10 photos/);assert.equal(chooser(view.render()).props.disabled,true);
});

test('image and aggregate size failures keep the whole pending batch unchanged, including saved evidence in totals',async()=>{
 const large='data:image/jpeg;base64,'+'A'.repeat(1499900),view=fixture({item:record({latest:inspection({photos:[large,large,large]})}),processor:async value=>{if(value.name==='broken.jpg')throw Error('Unreadable image');if(value.name==='invalid.jpg')return {data:'bad data'};if(value.name==='oversize.jpg')return {data:large+'A'.repeat(100)};return {data:large};}});await select(chooser(view.render()),[file('one')]);assert.equal(gallery(view.render()).length,1);for(const name of ['broken','invalid','oversize','total']){await select(chooser(view.render()),[file(name)]);assert.equal(gallery(view.render()).length,1);assert.ok(nodes(view.render()).find(node=>node.props.role==='alert'));}assert.equal(view.posts().length,0);
});

for(const change of ['cancel','unmount','account'])test(`${change} ignores late image processing and never transfers photos into another session`,async()=>{
 const pending=deferred(),view=fixture({processor:async()=>pending.promise});const reading=select(chooser(view.render()),[file('late')]);if(change==='cancel')button(view.render(),'Cancel').props.onClick();else if(change==='unmount')view.unmount();else view.context.PanelStock.username='other-user';const before=view.states.slice();pending.resolve({data:encoded('late')});await reading;assert.deepEqual(view.states,before);assert.equal(view.saved.length,0);assert.deepEqual(gallery(view.render()),[]);
});

for(const outcome of ['success','error'])test(`late upload ${outcome} after closing does not update the item or expose an error in another inspection`,async()=>{
 const pending=deferred(),view=fixture({fetcher:async()=>pending.promise});await select(chooser(view.render()),[file('pending')]);const saving=submit(view.render());button(view.render(),'Cancel').props.onClick();const before=view.states.slice();pending.resolve(outcome==='success'?Response.json(reply(record(),JSON.parse(view.posts()[0].options.body))):Response.json({error:'Old response error'},{status:409}));await saving;assert.deepEqual(view.states,before);assert.equal(view.saved.length,0);
});

test('account changes during upload block late success and new submissions from the old session',async()=>{
 const pending=deferred(),view=fixture({fetcher:async()=>pending.promise});await select(chooser(view.render()),[file('pending')]);const saving=submit(view.render());view.context.PanelStock.username='another-user';const before=view.states.slice();pending.resolve(Response.json(reply(record(),JSON.parse(view.posts()[0].options.body))));await saving;await submit(view.render());assert.deepEqual(view.states,before);assert.equal(view.saved.length,0);assert.equal(view.posts().length,1);
});

test('updated report and queue retain the original results and all photos despite an older poll completing after append',async()=>{
 const item=record(),stale=deferred();let get=0;const response=reply(item,{attemptId:item.latest.id,photos:[encoded('new')],mutationId:'mutation'});const view=fixture({kind:'qa',item,live:true,fetcher:async()=>++get===1?Response.json({items:[item],checklists}):get===2?stale.promise:Response.json({items:[response.item],checklists})});await settle();view.states[8]='approved';let tree=expand(view);button(tree,'View report').props.onClick();tree=view.render();button(tree,'Add photos').props.onClick();const opened=view.render();view.win.emit('panelstock-remote-change');opened.props.onSaved(response);await settle();stale.resolve(Response.json({items:[item],checklists}));await settle();tree=view.render();assert.match(text(tree),/Original inspection notes/);assert.match(text(tree),/Added by later-reviewer/);assert.deepEqual(nodes(tree).filter(node=>node.tag==='img').map(node=>node.props.src),[encoded('original'),encoded('new')]);assert.equal(view.states[0][0].status,'approved');assert.equal(view.states[0][0].photoAdditions.length,1);view.unmount();
});

test('completed dispatched Gate reports remain open after photo success even when a later queue response omits the record',async()=>{
 const item=record({kind:'metalwork',gateOrderId:'dispatched-gate',reference:'Gate ENTRY'}),response=reply(item,{attemptId:item.latest.id,photos:[encoded('site-photo')],mutationId:'mutation'}),view=fixture({kind:'qa',item,fetcher:async()=>Response.json({items:[],checklists})});let tree=expand(view);button(tree,'View report').props.onClick();tree=view.render();button(tree,'Add photos').props.onClick();view.render().props.onSaved(response);await settle();tree=view.render();assert.match(text(tree),/Gate ENTRY/);assert.deepEqual(nodes(tree).filter(node=>node.tag==='img').map(node=>node.props.src),[encoded('original'),encoded('site-photo')]);
});

test('order preview includes supplemental photos with provenance and keeps the original inspection snapshot',()=>{
 const item=record({photoAdditions:[addition()]}),view=fixture({kind:'qa'});view.states.length=0;const tree=view.context.QaOrderReport({report:{project:item.project,orderNumber:item.orderNumber,items:[item],checklists},onClose(){}});assert.match(text(tree),/Original inspection photos/);assert.match(text(tree),/Added by later-reviewer/);assert.deepEqual(nodes(tree).filter(node=>node.tag==='img'&&node.props.src.startsWith('data:')).map(node=>node.props.src),[encoded('original'),encoded('previous-addition')]);assert.equal(item.latest.photo,encoded('original'));assert.equal(item.history[0].photo,encoded('original'));
});


test('distinct legacy photo and photos array are all retained while an existing photo alias counts once',()=>{
 const photo=encoded('legacy-single'),other=encoded('array-entry'),view=fixture({item:record({latest:inspection({photo,photos:[other]}),photoAdditions:[addition()]})});assert.deepEqual(savedGallery(view.render()),[photo,other,encoded('previous-addition')]);assert.match(text(view.render()),/3 of 10 photos/);
 const alias=fixture({item:record({latest:inspection({photo,photos:[photo,other]})})});assert.deepEqual(savedGallery(alias.render()),[photo,other]);assert.match(text(alias.render()),/2 of 10 photos/);
 const full=fixture({item:record({latest:inspection({photo,photos:Array.from({length:9},(_,i)=>encoded('array-'+i))})})});assert.equal(savedGallery(full.render()).length,10);assert.equal(chooser(full.render()).props.disabled,true);
});


for(const mismatch of ['kind','mutation','photos'])test(`a response with mismatched ${mismatch} cannot confirm an append to this exact inspection`,async()=>{
 const item=record(),view=fixture({item,fetcher:async(url,options)=>{const result=reply(item,JSON.parse(options.body));if(mismatch==='kind')result.item.kind='metalwork';else if(mismatch==='mutation')result.addition.mutationId='another-mutation';else result.addition.photos=[encoded('different-photo')];return Response.json(result);}});await select(chooser(view.render()),[file('new')]);await submit(view.render());assert.equal(view.saved.length,0);assert.match(text(view.render()),/upload could not be confirmed/);assert.equal(chooser(view.render()).props.disabled,true);assert.deepEqual(gallery(view.render()),[encoded('new')]);
});

test('single-item success updates only the matching kind when legacy IDs collide',async()=>{
 const panel=record(),metal=record({kind:'metalwork',reference:'Separate metalwork'}),response=reply(panel,{attemptId:panel.latest.id,photos:[encoded('new')],mutationId:'mutation'}),view=fixture({kind:'qa',item:panel,items:[panel,metal],fetcher:async()=>Response.json({items:[response.item,metal],checklists})});let tree=expand(view);button(tree,'Add photos').props.onClick();view.render().props.onSaved(response);await settle();assert.equal(view.states[0].find(item=>item.kind==='panel').photoAdditions.length,1);assert.equal(view.states[0].find(item=>item.kind==='metalwork').photoAdditions.length,0);assert.equal(view.states[0].find(item=>item.kind==='metalwork').reference,'Separate metalwork');
});


test('photo success preserves existing dispatch quantities and status when the background refresh fails',async()=>{
 const derived={remainingQuantity:0,dispatchedQuantity:1,dispatchStatus:'dispatched',replacementReference:'Replacement P1',remakeOfReference:'Original P1'},item=record(derived),response=reply(item,{attemptId:item.latest.id,photos:[encoded('new')],mutationId:'mutation'});for(const key of Object.keys(derived))delete response.item[key];
 const view=fixture({kind:'qa',item,fetcher:async()=>{throw Error('QA refresh unavailable');}});let tree=expand(view);button(tree,'View report').props.onClick();tree=view.render();button(tree,'Add photos').props.onClick();view.render().props.onSaved(response);await settle();
 for(const [key,value] of Object.entries(derived))assert.equal(view.states[0][0][key],value,key+' retained in queue');assert.equal(view.states[0][0].photoAdditions.length,1);tree=view.render();button(tree,'Add photos').props.onClick();const opened=view.render();for(const [key,value] of Object.entries(derived))assert.equal(opened.props.item[key],value,key+' retained in report');assert.equal(opened.props.item.photoAdditions.length,1);
});
