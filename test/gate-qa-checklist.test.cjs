const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const settingsCode=source.slice(source.indexOf('  function QaSettingsPage()'),source.indexOf('\nfunction cncSheetKey('));
const qaCode=source.slice(source.indexOf('  function qaReportStatusLabel('),source.indexOf('  function AuditCenter('));
const settle=()=>new Promise(resolve=>setImmediate(resolve));
function nodes(tree){if(Array.isArray(tree))return tree.flatMap(nodes);return tree&&typeof tree==='object'?[tree,...nodes(tree.children)]:[];}
function text(tree){if(Array.isArray(tree))return tree.map(text).join(' ');return tree===undefined||tree===null||typeof tree==='boolean'?'':typeof tree==='object'?text(tree.children):String(tree);}
const button=(tree,label)=>nodes(tree).find(node=>node.tag==='button'&&text(node).trim()===label);
const input=(tree,label)=>nodes(tree).find(node=>node.tag==='input'&&node.props['aria-label']===label);
const checklistData={panel:[['p-edge','Panel edge']],metalwork:[['dimensions','Metalwork dimensions'],['welds','Metalwork welds']],gate:[['dimensions','Gate opening dimensions'],['latch','Gate latch operates']]};
function fixture({mode='qa',fetcher=async()=>Response.json({ok:true}),items=[],checklists=checklistData}={}){
 const states=[],refs=[],effects=[],calls=[];let cursor=0,refCursor=0,effectCursor=0;
 const context={Response,console,Date,Math,PageHeading:'heading',ClipboardList:'clipboard',ChevronRight:'chevron',Check:'check',Camera:'camera',Upload:'upload',Plus:'plus',Trash2:'trash',BAKED_WORKER_URL:'https://worker.test',PanelStock:{apiFetch:async(url,options)=>{calls.push({url,options});return fetcher(url,options);}},import_react:{createElement:(tag,props,...children)=>({tag,props:props||{},children})},useState(initial){const i=cursor++;if(!(i in states))states[i]=typeof initial==='function'?initial():initial;return [states[i],value=>{states[i]=typeof value==='function'?value(states[i]):value;}];},useRef(initial){const i=refCursor++;return refs[i]||(refs[i]={current:initial});},useEffect(callback){const i=effectCursor++;if(mode==='settings'&&!(i in effects)){effects[i]=true;callback();}}};
 vm.createContext(context);vm.runInContext(mode==='settings'?settingsCode:qaCode,context);
 function render(){cursor=refCursor=effectCursor=0;return mode==='settings'?context.QaSettingsPage():context.QaCenter({username:'inspector',isAdmin:true,canManage:true,canDispatch:false});}
 render();if(mode==='qa'){states[0]=items;states[2]=checklists;states[4]={requireQaPhoto:false,requireFailurePhoto:false};states[5]=false;}
 return {render,states,calls,context};
}
const gate=(extra={})=>({id:'gate-item',kind:'metalwork',gateOrderId:'site-gate',project:'Test project',orderNumber:'9',reference:'Gate: ENTRY',quantity:1,drawnBy:'drafter',status:'awaiting',history:[],...extra});
const metal=()=>({id:'metal-item',kind:'metalwork',project:'Test project',orderNumber:'9',reference:'METALWORK',quantity:1,fabricatedBy:'fabricator',status:'awaiting',history:[]});
function openCheck(view,label='Open check'){
 let tree=view.render();nodes(tree).find(node=>node.tag==='button'&&node.props['aria-expanded']===false).props.onClick();tree=view.render();button(tree,label).props.onClick();return view.render();
}

test('Gate checklist edits, additions, enabled checks and deletions persist independently through save and reload',async()=>{
 let saved={requireQaPhoto:false,activePanelChecks:['p-edge'],activeMetalworkChecks:['dimensions','welds'],activeGateChecks:['dimensions','latch'],panelChecks:checklistData.panel,metalworkChecks:checklistData.metalwork,gateChecks:checklistData.gate};
 const fetcher=async(url,options)=>{assert.equal(url,'https://worker.test/qa/settings');if(options)saved=JSON.parse(options.body);return Response.json({settings:saved,availableChecklists:{panel:saved.panelChecks,metalwork:saved.metalworkChecks,gate:saved.gateChecks}});};
 const view=fixture({mode:'settings',fetcher});await settle();let tree=view.render();
 assert.ok(nodes(tree).find(node=>node.tag==='legend'&&text(node)==='Gate checks'));assert.match(text(tree),/Used for Gate site orders\. Replace the starter checks with your inspection list\./);
 input(tree,'Edit gate check 1').props.onChange({target:{value:'Gate dimensions match drawing'}});
 tree=view.render();nodes(tree).find(node=>node.props['aria-label']==='Disable Gate latch operates').props.onClick();
 button(view.render(),'Add gate check').props.onClick();tree=view.render();input(tree,'Edit gate check 3').props.onChange({target:{value:'Hinges operate freely'}});
 tree=view.render();nodes(tree).find(node=>node.props['aria-label']==='Delete Gate latch operates').props.onClick();
 tree=view.render();await nodes(tree).find(node=>node.tag==='form').props.onSubmit({preventDefault(){}});
 assert.equal(saved.gateChecks.length,2);assert.deepEqual(saved.gateChecks.map(pair=>pair[1]),['Gate dimensions match drawing','Hinges operate freely']);assert.deepEqual(saved.activeGateChecks,saved.gateChecks.map(pair=>pair[0]));
 assert.deepEqual(saved.metalworkChecks,checklistData.metalwork);assert.deepEqual(saved.activeMetalworkChecks,['dimensions','welds']);assert.deepEqual(saved.panelChecks,checklistData.panel);
 assert.match(text(view.render()),/QA settings saved/);
 const reloaded=fixture({mode:'settings',fetcher});await settle();assert.equal(input(reloaded.render(),'Edit gate check 1').props.value,'Gate dimensions match drawing');assert.equal(input(reloaded.render(),'Edit gate check 2').props.value,'Hinges operate freely');
});

test('settings retain at least one enabled Gate check and protect only that checklist',async()=>{
 const settings={activePanelChecks:['p-edge'],activeMetalworkChecks:['dimensions'],activeGateChecks:['latch']};
 const view=fixture({mode:'settings',fetcher:async()=>Response.json({settings,availableChecklists:{...checklistData,gate:[['latch','Gate latch operates']]}})});await settle();let tree=view.render();
 nodes(tree).find(node=>node.props['aria-label']==='Disable Gate latch operates').props.onClick();assert.equal(nodes(view.render()).find(node=>node.props['aria-label']==='Disable Gate latch operates').props['aria-pressed'],true);
 nodes(view.render()).find(node=>node.props['aria-label']==='Delete Gate latch operates').props.onClick();assert.match(text(view.render()),/Keep at least one gate check/);assert.ok(input(view.render(),'Edit gate check 1'));assert.equal(input(view.render(),'Edit metalwork check 1').props.value,'Metalwork dimensions');
});

test('Gate inspection uses Gate checks while posting the existing linked metalwork item',async()=>{
 const view=fixture({items:[gate()],fetcher:async()=>Response.json({ok:true,item:{status:'approved'},items:[],settings:{},checklists:checklistData})});let tree=openCheck(view);
 assert.match(text(tree),/Gate inspection/);assert.match(text(tree),/Gate opening dimensions/);assert.match(text(tree),/Gate latch operates/);assert.doesNotMatch(text(tree),/Metalwork dimensions|Metalwork welds/);
 button(tree,'Complete all').props.onClick();tree=view.render();assert.equal(button(tree,'Approve QA').props.disabled,false);await nodes(tree).find(node=>node.tag==='form').props.onSubmit({preventDefault(){}});
 assert.equal(view.calls.length,1);assert.equal(view.calls[0].url,'https://worker.test/qa/check');const body=JSON.parse(view.calls[0].options.body);assert.equal(body.kind,'metalwork');assert.equal(body.id,'gate-item');assert.deepEqual(body.results,{dimensions:'pass',latch:'pass'});
});

test('ordinary metalwork continues to use its independent checklist',()=>{
 const view=fixture({items:[metal()]});const tree=openCheck(view);assert.match(text(tree),/Metalwork QA/);assert.match(text(tree),/Metalwork dimensions/);assert.match(text(tree),/Metalwork welds/);assert.doesNotMatch(text(tree),/Gate opening dimensions|Gate latch operates/);
});

test('a missing Gate checklist does not fall back to metalwork or allow approval',async()=>{
 const view=fixture({items:[gate()],checklists:{panel:checklistData.panel,metalwork:checklistData.metalwork}});let tree=openCheck(view);
 assert.match(text(tree),/Gate checklist is unavailable.*Refresh/);assert.equal(button(tree,'Approve QA'),undefined);assert.equal(view.calls.length,0);
 const active=fixture({items:[gate()]});openCheck(active);active.states[2]={metalwork:checklistData.metalwork};tree=active.render();assert.equal(button(tree,'Approve QA').props.disabled,true);assert.equal(button(tree,'Complete all').props.disabled,true);assert.match(text(tree),/inspection checklist is unavailable/);
 await nodes(tree).find(node=>node.tag==='form').props.onSubmit({preventDefault(){}});assert.equal(active.calls.length,0);
});

test('Gate history uses each saved checklist and keeps old Gate attempts on their metalwork wording',()=>{
 const history=[{id:'legacy',status:'approved',checkedBy:'old inspector',results:{dimensions:'pass',welds:'pass'}},{id:'gate-check',status:'approved',checkedBy:'new inspector',checklistKind:'gate',checklist:[['dimensions','Original saved Gate dimensions'],['latch','Original saved Gate latch']],results:{dimensions:'pass',latch:'pass'}}];
 const view=fixture({items:[gate({status:'approved',history,latest:history[1],checklistKind:'gate'})]});view.states[8]='approved';let tree=view.render();nodes(tree).find(node=>node.tag==='button'&&node.props['aria-expanded']===false).props.onClick();tree=view.render();button(tree,'View report').props.onClick();tree=view.render();
 const attempts=nodes(tree).filter(node=>node.tag==='article');assert.equal(attempts.length,2);assert.match(text(attempts[0]),/Original saved Gate dimensions/);assert.match(text(attempts[0]),/Original saved Gate latch/);assert.doesNotMatch(text(attempts[0]),/Gate opening dimensions|Metalwork dimensions/);assert.match(text(attempts[1]),/Metalwork dimensions/);assert.match(text(attempts[1]),/Metalwork welds/);assert.doesNotMatch(text(attempts[1]),/Gate opening dimensions/);
});

test('Gate and ordinary metalwork filters remain separate',()=>{
 const view=fixture({items:[gate(),metal()]});view.states[9]='gate';let tree=view.render();nodes(tree).find(node=>node.tag==='button'&&node.props['aria-expanded']===false).props.onClick();tree=view.render();assert.match(text(tree),/Gate: ENTRY/);assert.doesNotMatch(text(tree),/METALWORK/);
 view.states[9]='metalwork';tree=view.render();assert.match(text(tree),/METALWORK/);assert.doesNotMatch(text(tree),/Gate: ENTRY/);
});
