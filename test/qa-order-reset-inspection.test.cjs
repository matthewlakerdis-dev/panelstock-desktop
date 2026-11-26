const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),mobile=fs.existsSync(path.join(root,'panelstock-app.modern.js')),html=fs.readFileSync(path.join(root,mobile?'panelstock-app.modern.js':'index.html'),'utf8');
const centreStart=html.indexOf('  function QaCenter(');assert.ok(centreStart>=0,'the actual QA Centre exists');const centreEnd=html.indexOf('\n  function ',centreStart+10),centre=html.slice(centreStart,centreEnd<0?undefined:centreEnd);
const plain=value=>JSON.parse(JSON.stringify(value));
function fn(name){const re=new RegExp('^  function '+name+'\\(','m'),m=re.exec(html);assert.ok(m,'the real '+name+' helper is present');const rest=html.slice(m.index+m[0].length),next=/\n  function /.exec(rest);return html.slice(m.index,next?m.index+m[0].length+next.index:undefined);}
function declaration(name){const start=centre.indexOf('    const '+name+'=');assert.ok(start>=0,'the actual QA '+name+' closure exists');const end=centre.indexOf('\n    const ',start+10);return centre.slice(start,end<0?undefined:end);}
function helpers(context={}){return vm.runInNewContext(fn('qaInspectionDraft')+fn('qaInspectionResetToken')+';({qaInspectionDraft,qaInspectionResetToken});',context);}
const definitions=[['finish','Finish'],['size','Dimensions']];
const item=(patch={})=>({id:'panel-1',kind:'panel',reference:'C1F-27',project:'Tower',orderNumber:'25',sheetNumber:'1',status:'awaiting',cutAt:'2026-11-20T00:00:00Z',panelArea:{method:'manual',areaM2:2.5},panelAreaRevision:4,latest:{id:'prior-check',results:{finish:'pass',size:'fail'},notes:'Previous inspection notes',photo:'old inspection photo'},history:[{id:'earlier-check',results:{finish:'pass'},photo:'history photo'}],qaReset:{id:'reset-cycle-0001',pending:true},...patch});

test('pending reset drafts start with blank checks and notes without rewriting previous inspection evidence',()=>{
 const h=helpers(),source=item(),before=JSON.stringify(source),draft=h.qaInspectionDraft(source,definitions);
 assert.deepEqual(plain(draft),{results:{finish:'',size:''},notes:''});assert.equal(JSON.stringify(source),before);assert.equal(source.latest.photo,'old inspection photo');assert.equal(h.qaInspectionResetToken(source),'reset-cycle-0001');
});
test('ordinary and already-consumed reset drafts preserve existing check results and notes while retaining their reset token',()=>{
 const h=helpers();for(const source of [item({qaReset:undefined}),item({qaReset:{id:'reset-cycle-0001',pending:false}})]){assert.deepEqual(plain(h.qaInspectionDraft(source,definitions)),{results:{finish:'pass',size:'fail'},notes:'Previous inspection notes'});assert.equal(h.qaInspectionResetToken(source),source.qaReset?.id??null);}
 assert.equal(h.qaInspectionResetToken(item({qaReset:undefined})),null);
});
function beginHarness(){
 const state={selected:null,results:null,notes:null,photo:'chosen stale photo',photos:['chosen stale photo'],resetCalls:0,notices:[]},context={photoSession:{current:{id:null}},checklists:{panel:definitions},qaChecklistKind:value=>value.kind,definitionsFor:()=>definitions,areaFormFor:value=>value.panelArea,resetPhotos(){state.resetCalls++;state.photo='';state.photos=[];},setSelected:value=>{state.selected=value;},setPanelAreaForm:value=>{state.area=value;},setResults:value=>{state.results=plain(value);},setNotes:value=>{state.notes=value;},setPhoto:value=>{state.photo=value;},setOverrideReason:value=>{state.overrideReason=value;},setNotice:value=>state.notices.push(value)};
 const name=mobile?'beginFull':'beginLoaded',run=vm.runInNewContext(fn('qaInspectionDraft')+fn('qaInspectionResetToken')+declaration(name)+';'+name,context);return {state,run};
}
test('the real begin-inspection closure uses a blank reset draft and resets pending photos',()=>{
 const h=beginHarness(),source=item(),before=JSON.stringify(source);h.run(source);assert.equal(h.state.selected,source);assert.deepEqual(h.state.results,{finish:'',size:''});assert.equal(h.state.notes,'');assert.equal(h.state.photo,'');assert.deepEqual(h.state.photos,[]);assert.equal(h.state.resetCalls,1);assert.equal(JSON.stringify(source),before);assert.equal(h.state.area.areaM2,2.5);
});
test('ordinary begin-inspection preserves results/notes, and an exempt cap cannot open an inspection',()=>{
 const h=beginHarness();h.run(item({qaReset:undefined}));assert.deepEqual(h.state.results,{finish:'pass',size:'fail'});assert.equal(h.state.notes,'Previous inspection notes');assert.equal(h.state.photo,'');const count=h.state.resetCalls;h.state.selected=null;h.run(item({status:'not_required'}));assert.equal(h.state.selected,null);assert.equal(h.state.resetCalls,count);assert.match(h.state.notices.at(-1),/not required/);
});
function submitHarness(selected=item(),options={}){
 const state={selected,saving:false,notices:[],finished:[],bodies:[],urls:[]};
 const session=mobile?{current:7}:{current:{active:true,version:3,busy:false,saving:false,photos:[]}},context={selected,username:'qa-user',saving:false,results:options.results||{finish:'pass',size:'pass'},notes:'Fresh inspection notes',photo:'',overrideReason:'',checklists:{panel:definitions},definitionsFor:()=>definitions,checklistKind:value=>value.kind,qaChecklistKind:value=>value.kind,photoReading:{current:false},photoSession:session,photoList:{current:[]},mounted:{current:true},BAKED_WORKER_URL:'https://example.test',items:[item({qaReset:{id:'a-newer-live-token',pending:true}})],areaValue:()=>options.noArea?null:({method:'manual',areaM2:2.5}),areaBody:value=>({panelArea:{method:'manual',areaM2:2.5},expectedAreaRevision:value.panelAreaRevision||0,cutAt:value.cutAt||null,expectedAttemptId:value.latest?.id||null}),setSaving:value=>{state.saving=value;},setNotice:value=>state.notices.push(value),finish:value=>{state.finished.push(value);state.selected=null;}};
 const result=options.result||{ok:true,item:{id:selected.id,kind:'panel',status:'approved'},items:[],dispatches:[]},response={ok:options.status?options.status<400:true,status:options.status||200};
 const send=async(url,config)=>{state.urls.push(url);state.bodies.push(JSON.parse(config.body));if(options.during)await options.during(context);return {response,result};};
 context.requestJson=send;context.PanelStock={username:'qa-user',apiFetch:async(url,config)=>{const r=await send(url,config);return {...r.response,json:async()=>r.result};}};
 const submit=vm.runInNewContext(fn('qaInspectionDraft')+fn('qaInspectionResetToken')+(mobile?declaration('qaCurrent'):'')+declaration('submit')+';submit',context);return {state,context,submit:()=>submit({preventDefault(){}})};
}
test('panel checks submit the selected reset token on pass and fail, including failures without area',async()=>{
 for(const failure of [false,true]){const h=submitHarness(item(),failure?{results:{finish:'fail',size:'pass'},noArea:true}:{});await h.submit();assert.equal(h.state.bodies.length,1);assert.equal(h.state.bodies[0].expectedQaResetId,'reset-cycle-0001');assert.equal(h.state.bodies[0].id,'panel-1');assert.equal(h.state.bodies[0].kind,'panel');assert.equal(h.state.finished.length,1);assert.equal(h.state.saving,false);assert.match(h.state.urls[0],/\/qa\/check\?view=queue$/);}
});
test('ordinary panels explicitly submit null and consumed reset cycles still submit their exact token',async()=>{
 for(const source of [item({qaReset:undefined}),item({qaReset:{id:'reset-cycle-consumed',pending:false}})]){const h=submitHarness(source);await h.submit();assert.ok(Object.hasOwn(h.state.bodies[0],'expectedQaResetId'));assert.equal(h.state.bodies[0].expectedQaResetId,source.qaReset?.id??null);}
});
test('a stale pre-reset form submits its captured token and stays open on 409 without optimistic QA updates',async()=>{
 const source=item({qaReset:undefined}),h=submitHarness(source,{status:409,result:{error:'QA reset changed. Refresh QA Centre before inspecting this panel.'}});await h.submit();assert.equal(h.state.bodies[0].expectedQaResetId,null);assert.equal(h.state.selected,source);assert.equal(h.state.finished.length,0);assert.equal(h.state.saving,false);assert.match(h.state.notices.at(-1),/QA reset changed/);
 const old=item({qaReset:{id:'old-reset-cycle',pending:true}}),other=submitHarness(old,{status:409,result:{error:'QA reset changed'}});await other.submit();assert.equal(other.state.bodies[0].expectedQaResetId,'old-reset-cycle');assert.equal(other.state.finished.length,0);
});
test('an inspection session change during submission prevents applying a response to another open form',async()=>{
 const h=submitHarness(item(),{during:async context=>{if(mobile)context.photoSession.current++;else context.photoSession.current.version++;}});await h.submit();assert.equal(h.state.bodies.length,1);assert.equal(h.state.finished.length,0);assert.equal(h.state.selected.id,'panel-1');
});
test('account changes before and during an inspection submit cannot write or apply another user’s response',async()=>{
 const before=submitHarness(item());before.context.PanelStock.username='another-user';await before.submit();assert.equal(before.state.bodies.length,0);assert.equal(before.state.finished.length,0);
 const during=submitHarness(item(),{during:async context=>{context.PanelStock.username='another-user';}});await during.submit();assert.equal(during.state.bodies.length,1);assert.equal(during.state.finished.length,0);assert.equal(during.state.selected.id,'panel-1');
});
test('lazy inspection details reject a newer QA reset token even when status and attempt IDs are unchanged',async()=>{
 const summary=item({evidenceLoaded:false,qaReset:{id:'old-cycle',pending:true}}),full=item({evidenceLoaded:true,qaReset:{id:'new-cycle',pending:true}});let opened=0;const messages=[];
 if(mobile){const context={fullItem:async()=>full,beginFull:()=>{opened++;},setNotice:value=>messages.push(value)};const run=vm.runInNewContext(fn('qaInspectionResetToken')+declaration('begin')+';begin',context);await run(summary);}
 else{const context={AbortController,photoSession:{current:{active:true}},detailSession:{current:{version:0,controller:null}},PanelStock:{username:'qa-user'},username:'qa-user',BAKED_WORKER_URL:'https://example.test',qaFetchJson:async()=>({response:{ok:true},result:{ok:true,evidenceLoaded:true,item:full}}),showQaItem:()=>{opened++;},setDetailRequest:value=>{if(value?.error)messages.push(value.error);}};const run=vm.runInNewContext(fn('qaInspectionResetToken')+declaration('openQaItem')+';openQaItem',context);await run(summary,'inspect');}
 assert.equal(opened,0);assert.match(messages.join(' '),/changed|reset|Refresh/i);
});
