const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8'),code=source.slice(source.indexOf('  function qaReportStatusLabel('),source.indexOf('  function AuditCenter('));
const settle=()=>new Promise(resolve=>setImmediate(resolve));
const deferred=()=>{let resolve;const promise=new Promise(done=>resolve=done);return {promise,resolve};};
function nodes(tree){if(Array.isArray(tree))return tree.flatMap(nodes);return tree&&typeof tree==='object'?[tree,...nodes(tree.children)]:[];}
function text(tree){if(Array.isArray(tree))return tree.map(text).join(' ');return tree===undefined||tree===null||typeof tree==='boolean'?'':typeof tree==='object'?text(tree.children):String(tree);}
const button=(tree,label)=>nodes(tree).find(node=>node.tag==='button'&&text(node).trim()===label);
const chooser=tree=>nodes(tree).find(node=>node.tag==='input'&&node.props.type==='file'&&!node.props.capture);
const camera=tree=>nodes(tree).find(node=>node.tag==='input'&&node.props.capture==='environment');
const gallery=tree=>nodes(tree).filter(node=>node.tag==='img'&&/^Gate QA photo/.test(node.props.alt)).map(node=>node.props.src);
const file=name=>new File([name],name+'.jpg',{type:'image/jpeg'});
const encoded=name=>'data:image/jpeg;base64,'+Buffer.from(name).toString('base64');
const gate=(extra={})=>({id:'gate',kind:'metalwork',gateOrderId:'site-order',checklistKind:'gate',project:'Test project',orderNumber:'9',reference:'Gate ENTRY',quantity:1,drawnBy:'drafter',status:'awaiting',history:[],...extra});
const checklists={panel:[['finish','Panel finish']],metalwork:[['finish','Metalwork finish']],gate:[['latch','Gate latch']]};
function fixture({items=[gate()],required=false,processor=async value=>({data:'data:image/jpeg;base64,'+Buffer.from(await value.arrayBuffer()).toString('base64')}),post,live=false}={}){
 const states=[],refs=[],effects=[],calls=[],processCalls=[];let cursor=0,refCursor=0,effectCursor=0;
 const viewData=()=>({ok:true,items,settings:{requireQaPhoto:required,requireFailurePhoto:false},checklists});
 const context={Response,File,console,Date,Math,Array,PageHeading:'heading',ClipboardList:'clipboard',ChevronRight:'chevron',Check:'check',Camera:'camera',Upload:'upload',window:{addEventListener(){},removeEventListener(){}},document:{hidden:false,addEventListener(){},removeEventListener(){}},setInterval:()=>1,clearInterval(){},BAKED_WORKER_URL:'https://worker.test',processImageFile:async value=>{assert.ok(value instanceof File);processCalls.push(value.name);return processor(value);},PanelStock:{apiFetch:async(url,options)=>{calls.push({url,options});return options&&post?post(JSON.parse(options.body)):Response.json(viewData());}},import_react:{createElement:(tag,props,...children)=>({tag,props:props||{},children})},useState(initial){const i=cursor++;if(!(i in states))states[i]=typeof initial==='function'?initial():initial;return [states[i],value=>{states[i]=typeof value==='function'?value(states[i]):value;}];},useRef(initial){const i=refCursor++;return refs[i]||(refs[i]={current:initial});},useEffect(callback){const i=effectCursor++;if(!(i in effects))effects[i]={callback};}};
 vm.createContext(context);vm.runInContext(code,context);
 function render(){cursor=refCursor=effectCursor=0;return context.QaCenter({username:'inspector',isAdmin:true,canManage:true,canDispatch:false});}
 render();states[0]=items;states[2]=checklists;states[4]=viewData().settings;states[5]=false;
 if(live)for(const effect of effects)effect.cleanup=effect.callback();
 return {render,states,calls,processCalls,context,unmount(){for(const effect of effects)effect.cleanup?.();},posts:()=>calls.filter(call=>call.options)};
}
function expand(view){const tree=view.render();nodes(tree).find(node=>node.tag==='button'&&node.props['aria-expanded']===false)?.props.onClick();return view.render();}
function open(view,id='gate'){
 let tree=expand(view);const row=nodes(tree).find(node=>node.tag==='article'&&node.props.key===id);button(row,'Open check')?.props.onClick();tree=view.render();button(tree,'Complete all').props.onClick();return view.render();
}
async function select(input,files){const target={files,value:'selected'};const promise=input.props.onChange({target});assert.equal(target.value,'');await promise;}
const form=tree=>nodes(tree).find(node=>node.tag==='form');
const submitButton=tree=>nodes(tree).find(node=>node.tag==='button'&&node.props.type==='submit');
const save=tree=>form(tree).props.onSubmit({preventDefault(){}});

 test('Gate photos support selecting several, appending camera shots, removing one and saving every remaining photo',async()=>{
 let saved;
 const view=fixture({required:true,post:async body=>{saved=body;const attempt={id:'inspection',status:'approved',results:body.results,photos:body.photos,photo:body.photos[0]};return Response.json({ok:true,item:{status:'approved'},items:[gate({status:'approved',latest:attempt,history:[attempt]})],checklists});}});
 let tree=open(view);assert.equal(chooser(tree).props.multiple,true);assert.equal(camera(tree).props.multiple,undefined);assert.equal(button(tree,'Approve QA').props.disabled,true);
 await select(chooser(tree),[file('front'),file('rear')]);tree=view.render();assert.deepEqual(gallery(tree),[encoded('front'),encoded('rear')]);assert.match(text(tree),/2 of 10 photos/);assert.equal(button(tree,'Approve QA').props.disabled,false);
 await select(camera(tree),[file('hinges')]);tree=view.render();assert.deepEqual(gallery(tree),[encoded('front'),encoded('rear'),encoded('hinges')]);nodes(tree).find(node=>node.props['aria-label']==='Remove photo 2').props.onClick();tree=view.render();assert.deepEqual(gallery(tree),[encoded('front'),encoded('hinges')]);
 await save(tree);assert.equal(saved.kind,'metalwork');assert.equal(saved.id,'gate');assert.deepEqual(saved.photos,[encoded('front'),encoded('hinges')]);assert.equal(Object.hasOwn(saved,'photo'),false);assert.match(text(view.render()),/QA check approved/);
 view.states[8]='approved';tree=expand(view);button(tree,'View report').props.onClick();tree=view.render();const images=nodes(tree).filter(node=>node.tag==='img');assert.deepEqual(images.map(node=>node.props.src),saved.photos,'compatibility photo does not duplicate the first array entry');
 const reload=fixture({items:[gate({status:'approved',history:[{id:'stored',status:'approved',photos:saved.photos,photo:saved.photos[0]}],latest:{status:'approved'}})]});reload.states[8]='approved';tree=expand(reload);button(tree,'View report').props.onClick();assert.deepEqual(nodes(reload.render()).filter(node=>node.tag==='img').map(node=>node.props.src),saved.photos);
 button(view.render(),'← Back to QA Centre').props.onClick();tree=expand(view);button(tree,'Reopen').props.onClick();assert.deepEqual(gallery(view.render()),[],'a new inspection starts with fresh evidence');
});

test('failed submission retains all selected Gate photos and results for retry',async()=>{
 const view=fixture({post:async()=>Response.json({error:'Connection failed. Retry this check.'},{status:503})});let tree=open(view);await select(chooser(tree),[file('front'),file('rear')]);tree=view.render();await save(tree);tree=view.render();assert.match(text(tree),/Connection failed/);assert.deepEqual(gallery(tree),[encoded('front'),encoded('rear')]);assert.equal(button(tree,'Approve QA').props.disabled,false);assert.equal(button(tree,'Complete all').props['aria-checked'],true);
 nodes(tree).find(node=>node.props['aria-label']==='Remove photo 1').props.onClick();tree=view.render();nodes(tree).find(node=>node.props['aria-label']==='Remove photo 1').props.onClick();view.states[4]={requireQaPhoto:true};assert.equal(button(view.render(),'Approve QA').props.disabled,true);
});

test('processing blocks submit and serializes add/remove actions without losing current photos',async()=>{
 const slow=deferred();const view=fixture({processor:async value=>value.name==='slow.jpg'?slow.promise:{data:encoded(await value.text())}});let tree=open(view);await select(chooser(tree),[file('existing')]);tree=view.render();const staleRemove=nodes(tree).find(node=>node.props['aria-label']==='Remove photo 1'),staleChooser=chooser(tree);const pending=select(staleChooser,[file('slow')]);tree=view.render();assert.equal(chooser(tree).props.disabled,true);assert.equal(camera(tree).props.disabled,true);assert.equal(button(tree,'Approve QA').props.disabled,true);assert.equal(nodes(tree).find(node=>node.props['aria-label']==='Remove photo 1').props.disabled,true);
 staleRemove.props.onClick();await save(tree);await select(staleChooser,[file('racing')]);assert.equal(view.posts().length,0);assert.deepEqual(view.processCalls,['existing.jpg','slow.jpg']);assert.match(text(view.render()),/still being prepared/);assert.deepEqual(gallery(view.render()),[encoded('existing')]);slow.resolve({data:encoded('slow')});await pending;assert.deepEqual(gallery(view.render()),[encoded('existing'),encoded('slow')]);assert.equal(button(view.render(),'Approve QA').props.disabled,false);
});

test('cancelling or changing inspections resets photos and rejects late file results',async()=>{
 const slow=deferred(),view=fixture({items:[gate(),gate({id:'other',reference:'Gate OTHER'})],processor:async()=>slow.promise});let tree=open(view);const pending=select(chooser(tree),[file('old inspection')]);button(view.render(),'Cancel').props.onClick();tree=open(view,'other');assert.deepEqual(gallery(tree),[]);slow.resolve({data:encoded('late')});await pending;tree=view.render();assert.deepEqual(gallery(tree),[]);assert.doesNotMatch(text(tree),/Preparing photos/);assert.equal(button(tree,'Approve QA').props.disabled,false);
 await select(chooser(tree),[file('new inspection')]);assert.deepEqual(gallery(view.render()),[encoded('late')]);button(view.render(),'← Back to QA Centre').props.onClick();tree=open(view);assert.deepEqual(gallery(tree),[]);
});

test('unmounting rejects late processing results and does not update photo state',async()=>{
 const slow=deferred(),view=fixture({live:true,processor:async()=>slow.promise});await settle();let tree=open(view);const pending=select(chooser(tree),[file('late')]);const before=view.states.slice();view.unmount();slow.resolve({data:encoded('late')});await pending;assert.deepEqual(view.states,before);assert.deepEqual(gallery(view.render()),[]);
});

test('extra selections over ten photos show an error without truncating or discarding existing photos',async()=>{
 const view=fixture();let tree=open(view);await select(chooser(tree),Array.from({length:10},(_,i)=>file('photo-'+i)));tree=view.render();assert.equal(gallery(tree).length,10);const before=gallery(tree);await select(chooser(tree),[file('eleven'),file('twelve')]);assert.match(text(view.render()),/up to 10 Gate QA photos/);assert.deepEqual(gallery(view.render()),before);assert.equal(view.processCalls.length,10);
});

test('a failed batch, unreadable image or oversized image preserves prior photos atomically',async()=>{
 const view=fixture({processor:async value=>{if(value.name==='bad.jpg')throw Error('This image could not be read.');if(value.name==='invalid.jpg')return {data:'not an image'};if(value.name==='huge.jpg')return {data:'data:image/jpeg;base64,'+'A'.repeat(1500000)};return {data:encoded(await value.text())};}});let tree=open(view);await select(chooser(tree),[file('existing')]);
 await select(chooser(view.render()),[file('new'),file('bad')]);assert.match(text(view.render()),/could not be read/);assert.deepEqual(gallery(view.render()),[encoded('existing')]);
 await select(chooser(view.render()),[file('invalid')]);assert.match(text(view.render()),/could not be read/);assert.deepEqual(gallery(view.render()),[encoded('existing')]);
 await select(chooser(view.render()),[file('huge')]);assert.match(text(view.render()),/too large/);assert.deepEqual(gallery(view.render()),[encoded('existing')]);
 await select(chooser(view.render()),[file('valid')]);assert.deepEqual(gallery(view.render()),[encoded('existing'),encoded('valid')]);
});

test('aggregate photo size limit rejects the whole addition and retains the previous gallery',async()=>{
 const large='data:image/jpeg;base64,'+'A'.repeat(1499900),view=fixture({processor:async()=>({data:large})});let tree=open(view);await select(chooser(tree),Array.from({length:4},(_,i)=>file('large-'+i)));tree=view.render();assert.equal(gallery(tree).length,4);await select(chooser(tree),[file('over-total')]);assert.match(text(view.render()),/too large together/);assert.equal(gallery(view.render()).length,4);
});

for(const kind of ['panel','metalwork'])test(`${kind} keeps single-photo selection, replacement and API payload`,async()=>{
 let payload;const item={id:kind,kind,project:'Test project',orderNumber:'9',reference:'Regular item',cutBy:'operator',fabricatedBy:'operator',status:'awaiting',history:[]};const view=fixture({items:[item],post:async body=>{payload=body;return Response.json({ok:true,item:{status:'approved'},items:[]});}});let tree=open(view,kind);assert.equal(chooser(tree).props.multiple,false);await select(chooser(tree),[file('first')]);tree=view.render();await select(camera(tree),[file('replacement')]);tree=view.render();assert.equal(nodes(tree).filter(node=>node.tag==='img').length,1);assert.equal(nodes(tree).find(node=>node.tag==='img').props.src,encoded('replacement'));assert.equal(gallery(tree).length,0);await save(tree);assert.equal(payload.photo,encoded('replacement'));assert.equal(Object.hasOwn(payload,'photos'),false);
});

test('legacy Gate inspection history still displays its single evidence photo',()=>{
 const attempt={id:'legacy',status:'approved',photo:encoded('legacy')},view=fixture({items:[gate({status:'approved',latest:attempt,history:[attempt]})]});view.states[8]='approved';let tree=expand(view);button(tree,'View report').props.onClick();assert.deepEqual(nodes(view.render()).filter(node=>node.tag==='img').map(node=>node.props.src),[encoded('legacy')]);
});

for(const result of ['success','rejection'])test(`late ${result} from a cancelled save cannot change a new Gate inspection or its photos`,async()=>{
 const pending=deferred(),view=fixture({items:[gate(),gate({id:'other',reference:'Gate OTHER'})],post:async()=>pending.promise});let tree=open(view);await select(chooser(tree),[file('old')]);const saving=save(view.render());assert.equal(submitButton(view.render()).props.disabled,true);
 button(view.render(),'Cancel').props.onClick();tree=open(view,'other');assert.equal(chooser(tree).props.disabled,false);await select(chooser(tree),[file('new')]);tree=view.render();assert.deepEqual(gallery(tree),[encoded('new')]);assert.equal(button(tree,'Approve QA').props.disabled,false);
 pending.resolve(result==='success'?Response.json({ok:true,item:{status:'approved'},items:[]}):Response.json({error:'Stale save failed'},{status:503}));await saving;tree=view.render();assert.match(text(tree),/Gate OTHER/);assert.deepEqual(gallery(tree),[encoded('new')]);assert.doesNotMatch(text(tree),/Stale save failed|QA check approved/);assert.equal(button(tree,'Approve QA').props.disabled,false);
});

test('an older save finishing cannot unlock a newer save in progress',async()=>{
 const old=deferred(),next=deferred();let count=0;const view=fixture({items:[gate(),gate({id:'other',reference:'Gate OTHER'})],post:async()=>++count===1?old.promise:next.promise});let tree=open(view);await select(chooser(tree),[file('old')]);const savingOld=save(view.render());button(view.render(),'Cancel').props.onClick();tree=open(view,'other');await select(chooser(tree),[file('new')]);const savingNew=save(view.render());
 old.resolve(Response.json({ok:true,item:{status:'approved'},items:[]}));await savingOld;tree=view.render();assert.deepEqual(gallery(tree),[encoded('new')]);assert.equal(submitButton(tree).props.disabled,true);
 next.resolve(Response.json({error:'New inspection needs review'},{status:409}));await savingNew;tree=view.render();assert.equal(button(tree,'Approve QA').props.disabled,false);assert.match(text(tree),/New inspection needs review/);assert.deepEqual(gallery(tree),[encoded('new')]);
});
