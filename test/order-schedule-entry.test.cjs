const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync(__dirname+'/../index.html','utf8'),helper=html.slice(html.indexOf('  function scheduleDraftForOrder('),html.indexOf('  function SchedulePage('));
const initial={date:'2026-11-19',scheduleType:'general',assignedUsername:'',notes:'',status:'planned'},project={id:'project-1',name:'Shared Project',active:true},order={id:'order-1',projectId:project.id,project:project.name,orderNumber:'12',orderType:'Fabrication',location:'Mechanical screens',status:'approved'},data={projects:[project],orders:[order],people:[{username:'alex',displayName:'Alex'}],settings:{startHour:5,endHour:15}};
function seed(id='order-1',result=data,base=initial){return vm.runInNewContext(helper+';scheduleDraftForOrder(id,result,base,label)',{id,result,base,label:o=>'Order '+o.orderNumber+' · '+o.orderType+' · '+o.location});}
test('schedule shortcut selects the fresh linked project/order and server times, leaving person/date choices intact',()=>{
 const before=JSON.stringify(data),draft=seed();assert.equal(draft.projectId,'project-1');assert.equal(draft.orderId,'order-1');assert.equal(draft.title,'Order 12 · Fabrication · Mechanical screens');assert.equal(draft.startTime,'05:00');assert.equal(draft.endTime,'15:00');assert.equal(draft.date,initial.date);assert.equal(draft.assignedUsername,'');assert.equal(draft.activityOther,false);assert.equal(JSON.stringify(data),before);
 assert.equal(seed('order-1',data,{...initial,scheduleType:'cnc'}).scheduleType,'cnc');
 const changed={...data,projects:[{...project,id:'new-project'}],orders:[{...order,projectId:'new-project'}]};assert.equal(seed('order-1',changed).projectId,'new-project');
});
test('legacy names match only one active project; stale, dispatched, cancelled and unavailable orders cannot silently prefill another project',()=>{
 assert.equal(seed('order-1',{...data,orders:[{...order,projectId:null,project:' shared  PROJECT '}]}).projectId,project.id);
 for(const result of [{...data,orders:[]},...['dispatched','cancelled'].map(status=>({...data,orders:[{...order,status}]})),{...data,projects:[{...project,active:false}]},{...data,orders:[{...order,projectId:'missing'}]},{...data,projects:[project,{...project,id:'second'}],orders:[{...order,projectId:null}]}])assert.throws(()=>seed('order-1',result),/no longer available|project is inactive or unavailable/);
});
function controller(fetcher){
 const calls=[],saved=[],state={editor:null,loading:false,saving:false,notice:''},context={editor:null,entryOrder:{id:order.id},entryStarted:false,seeded:{current:false},saveLock:{current:false},loadVersion:{current:0},BAKED_WORKER_URL:'https://api.test',PanelStock:{username:'admin',apiFetch:async(url,options)=>{calls.push({url,options});return fetcher(url,options);}},current:()=>context.alive&&context.PanelStock.username==='admin',alive:true,blank:()=>({...initial}),orderLabel:o=>'Order '+o.orderNumber,projectTitleCase:value=>value,setLoading:value=>state.loading=value,setSaving:value=>state.saving=value,setNotice:value=>state.notice=value,setEntries(){},setProjects(){},setOrders(){},setPeople(){},setScheduleSettings(){},setEditor:value=>{context.editor=state.editor=value;},onEntrySaved:value=>saved.push(value),useEffect(){},window:{}};
 vm.createContext(context);vm.runInContext(helper,context);
 let a=html.indexOf('    async function load()',html.indexOf('  function SchedulePage')),b=html.indexOf('    const update=',a);vm.runInContext(html.slice(a,b),context);
 a=html.indexOf('    async function save(',html.indexOf('  function SchedulePage'));b=html.indexOf('    async function remove(entry)',a);vm.runInContext(html.slice(a,b),context);
 return{context,state,calls,saved,load:context.load,save:()=>context.save({preventDefault(){}})};
}
test('opening loads schedule data without writing; save uses the existing endpoint once and reports success without a page refresh',async()=>{
 let finish;const c=controller(async(url,options)=>!options?Response.json(data):new Promise(resolve=>finish=resolve));await c.load();assert.equal(c.calls.length,1);assert.equal(c.calls[0].options,undefined);assert.equal(c.state.editor.orderId,order.id);c.context.editor={...c.context.editor,assignedUsername:'alex',assignedTo:'Alex',notes:'Keep together'};
 const first=c.save();await c.save();assert.equal(c.calls.length,2);assert.equal(c.calls[1].url,'https://api.test/schedule');assert.equal(c.calls[1].options.method,'POST');assert.equal(JSON.parse(c.calls[1].options.body).orderId,order.id);assert.equal(JSON.parse(c.calls[1].options.body).projectId,project.id);finish(Response.json({entry:{id:'saved'},entries:[]}));await first;assert.equal(c.saved.length,1);assert.equal(c.state.editor,null);assert.equal(c.calls.length,2);assert.equal(c.state.saving,false);
});
test('load errors are retryable and save failures retain the order, notes and selected details',async()=>{
 let fail=true;const c=controller(async(url,options)=>options?Response.json({error:'Schedule denied'},{status:403}):fail?Response.json({error:'Unavailable'},{status:503}):Response.json(data));await c.load();assert.equal(c.state.editor,null);assert.equal(c.state.notice,'Unavailable');fail=false;await c.load();c.context.editor={...c.state.editor,notes:'Keep notes'};await c.save();assert.equal(c.state.notice,'Schedule denied');assert.equal(c.context.editor.notes,'Keep notes');assert.equal(c.context.editor.orderId,order.id);assert.equal(c.saved.length,0);assert.equal(c.state.saving,false);
});
test('late loads and saves cannot reopen or close an order after unmount or account change',async()=>{
 for(const mode of ['unmount','account']){
  let finish;const c=controller(async()=>new Promise(resolve=>finish=resolve)),pending=c.load();if(mode==='unmount')c.context.alive=false;else c.context.PanelStock.username='someone-else';finish(Response.json(data));await pending;assert.equal(c.state.editor,null);assert.equal(c.saved.length,0);
 }
 let finish;const c=controller(async(url,options)=>options?new Promise(resolve=>finish=resolve):Response.json(data));await c.load();const pending=c.save();c.context.PanelStock.username='someone-else';finish(Response.json({entry:{id:'saved'}}));await pending;assert.equal(c.saved.length,0);assert.ok(c.state.editor);
});
