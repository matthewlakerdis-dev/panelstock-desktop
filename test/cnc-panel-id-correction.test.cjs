const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),file=fs.existsSync(path.join(root,'panelstock-app.modern.js'))?'panelstock-app.modern.js':'index.html',html=fs.readFileSync(path.join(root,file),'utf8');
function source(name,indent=2){const re=new RegExp('^'+' '.repeat(indent)+'(?:async )?function '+name+'\\(','m'),match=re.exec(html);assert.ok(match,name);const start=match.index,next=new RegExp('\\n'+' '.repeat(indent)+'(?:async )?function ').exec(html.slice(start+match[0].length));return html.slice(start,next?start+match[0].length+next.index:undefined);}
function nodes(value){return Array.isArray(value)?value.flatMap(nodes):value&&typeof value==='object'?[value,...nodes(value.children)]:[];}
const text=all=>all.flatMap(node=>(Array.isArray(node.children)?node.children:[node.children]).filter(v=>typeof v==='string'||typeof v==='number')).join(' ');
function hooks(extra={}){
 const state=[],pending=[];let cursor=0,id=0;
 const useState=initial=>{const i=cursor++;if(!(i in state))state[i]=typeof initial==='function'?initial():initial;return[state[i],value=>state[i]=typeof value==='function'?value(state[i]):value];};
 const useRef=initial=>{const i=cursor++;if(!(i in state))state[i]={current:initial};return state[i];};
 const h=(type,props,...children)=>({...props,type,children:children.length?children:props?.children});
 const context={Date,JSON,Number,String,Promise,Map,Set,crypto:{randomUUID:()=> 'cut-id-correction-request-'+(++id)},...extra,import_react:{createElement:h,useRef},import_jsx_runtime:{jsx:(type,props,key)=>({...props,type,key}),jsxs:(type,props,key)=>({...props,type,key})},useState,useRef,useEffect:(fn,deps)=>{const i=cursor++,old=state[i];if(!old||deps.some((d,j)=>d!==old.deps[j])){state[i]={deps};pending.push(()=>{old?.cleanup?.();state[i].cleanup=fn();});}},Modal:'modal',Pencil:'pencil',inputCls:'input'};
 return {context,render(fn,props){cursor=0;return fn(props);},async flush(){for(const fn of pending.splice(0))fn();await new Promise(setImmediate);await new Promise(setImmediate);}};
}
const panel={id:'stable-record',jobReference:'Tower',orderNumber:'25',sheetNumber:'01',panelNumber:'WRONG, OLD',status:'completed',completedAt:'2026-11-20T01:00:00Z',completedBy:'cutter'};
const plan=(patch={})=>({panelId:panel.id,panelNumber:panel.panelNumber,project:panel.jobReference,orderNumber:panel.orderNumber,sheetNumber:panel.sheetNumber,completedAt:panel.completedAt,completedBy:panel.completedBy,productionSignature:'a'.repeat(64),revision:8,restoreEpoch:0,...patch});
function dialog(request,selected=panel){const rt=hooks(),fn=vm.runInNewContext(source('CncPanelIdCorrectionDialog')+';CncPanelIdCorrectionDialog',rt.context);let closed=0;const props={panel:selected,request,onClose:()=>closed++};return {rt,props,draw:()=>nodes(rt.render(fn,props)),get closed(){return closed;}};}
const form=all=>all.find(n=>n.type==='form');
function edit(all,id,value){all.find(n=>n['aria-label']===id).onChange({target:{value}});}
const submit=all=>form(all).onSubmit({preventDefault(){}});

test('completed panel ID editor loads fresh details and exposes only ID and reason, including legacy rows with no stock or date',async()=>{
 const legacy={id:panel.id,status:'completed'},calls=[];
 const d=dialog(async payload=>{calls.push(payload);return {ok:true,plan:plan({panelNumber:null,completedAt:null,completedBy:null})};},legacy);
 let all=d.draw();assert.match(text(all),/Checking saved panel details/);assert.equal(all.filter(n=>['input','textarea','select'].includes(n.type)).length,0);await d.rt.flush();all=d.draw();
 assert.equal(calls.length,1);assert.deepEqual(JSON.parse(JSON.stringify(calls[0])),{action:'preview',panelId:panel.id});
 assert.deepEqual(all.filter(n=>['input','textarea','select'].includes(n.type)).map(n=>n['aria-label']),['Corrected panel ID','Reason for correction']);
 assert.match(text(all),/Current panel ID: Not recorded/);assert.match(text(all),/Cut completed: Not recorded/);assert.match(text(all),/Cutting details, stock and QA history stay attached/);
 all.find(n=>n.type==='button'&&n.children?.includes?.('Cancel')).onClick();assert.equal(d.closed,1);assert.equal(calls.length,1);
});

test('a correction preserves raw old ID, stable record identity and completion guard; missing legacy fields remain null',async()=>{
 const calls=[],legacy={id:panel.id,status:'completed'},d=dialog(async body=>{calls.push(JSON.parse(JSON.stringify(body)));return body.action==='preview'?{ok:true,plan:plan({panelNumber:null,completedAt:null})}:{ok:true};},legacy);
 d.draw();await d.rt.flush();let all=d.draw();edit(all,'Corrected panel ID','  C1F-27, C1F-28  ');edit(all,'Reason for correction','  Incorrect source label  ');all=d.draw();await submit(all);
 assert.equal(d.closed,1);assert.equal(calls[1].panelId,panel.id);assert.equal(calls[1].expectedPanelNumber,null);assert.equal(calls[1].expectedCompletedAt,null);assert.equal(calls[1].newPanelNumber,'C1F-27, C1F-28');assert.equal(calls[1].reason,'Incorrect source label');assert.equal(calls[1].productionSignature,'a'.repeat(64));assert.equal(calls[1].revision,8);assert.equal(calls[1].restoreEpoch,0);assert.match(calls[1].mutationId,/cut-id-correction-request-/);
 assert.deepEqual(Object.keys(calls[1]).sort(),['action','panelId','newPanelNumber','reason','mutationId','expectedPanelNumber','expectedCompletedAt','productionSignature','revision','restoreEpoch'].sort());
});

test('empty, unchanged or invalid corrected IDs and missing reasons never send a save',async()=>{
 const calls=[],d=dialog(async body=>{calls.push(body);return {ok:true,plan:plan()};});d.draw();await d.rt.flush();let all=d.draw();
 edit(all,'Reason for correction','Correction');for(const value of ['',panel.panelNumber,'A'.repeat(201),'BAD\nID']){edit(d.draw(),'Corrected panel ID',value);await submit(d.draw());}
 edit(d.draw(),'Corrected panel ID','CORRECT');edit(d.draw(),'Reason for correction',' ');await submit(d.draw());assert.equal(calls.length,1);assert.equal(d.closed,0);assert.match(text(d.draw()),/Enter a reason/);
});

test('double clicks and uncertain responses retain the exact request and keep fields and close locked until verified',async()=>{
 const calls=[];let reject,attempt=0;const d=dialog(async body=>{calls.push(JSON.parse(JSON.stringify(body)));if(body.action==='preview')return {ok:true,plan:plan()};if(++attempt===1)return new Promise((_,no)=>{reject=no;});return {ok:true};});
 d.draw();await d.rt.flush();let all=d.draw();edit(all,'Corrected panel ID','CORRECT');edit(all,'Reason for correction','Wrong upload');all=d.draw();const first=submit(all),second=submit(all);await second;assert.equal(calls.length,2);reject(Error('Connection lost'));await first;
 all=d.draw();assert.equal(all.find(n=>n['aria-label']==='Corrected panel ID').disabled,true);assert.equal(all.find(n=>n.children?.includes?.('Cancel')).disabled,true);all.find(n=>n.type==='modal').onClose();assert.equal(d.closed,0);assert.match(text(all),/Retry to verify the same correction/);
 await submit(all);assert.deepEqual(calls[2],calls[1]);assert.equal(d.closed,1);
});

test('409 reloads fresh guards and requires another explicit save while preserving the proposed correction',async()=>{
 const calls=[];let previews=0,saves=0;const d=dialog(async body=>{calls.push(JSON.parse(JSON.stringify(body)));if(body.action==='preview')return {ok:true,plan:plan(++previews===1?{}:{panelNumber:'OTHER ADMIN ID',revision:9,productionSignature:'b'.repeat(64)})};if(++saves===1)throw Object.assign(Error('Panel changed'),{status:409});return {ok:true};});
 d.draw();await d.rt.flush();let all=d.draw();edit(all,'Corrected panel ID','CORRECT');edit(all,'Reason for correction','Wrong upload');await submit(d.draw());d.draw();await d.rt.flush();all=d.draw();
 assert.equal(saves,1);assert.match(text(all),/Current panel ID: OTHER ADMIN ID/);assert.equal(all.find(n=>n['aria-label']==='Corrected panel ID').value,'CORRECT');assert.equal(all.find(n=>n['aria-label']==='Corrected panel ID').disabled,false);assert.equal(d.closed,0);
 await submit(all);const saved=calls.filter(b=>b.action==='save');assert.notEqual(saved[0].mutationId,saved[1].mutationId);assert.equal(saved[1].expectedPanelNumber,'OTHER ADMIN ID');assert.equal(saved[1].revision,9);assert.equal(saved[1].productionSignature,'b'.repeat(64));assert.equal(d.closed,1);
});

test('malformed preview cannot enable saving and permanent validation failure allows correcting the draft',async()=>{
 const bad=dialog(async()=>({ok:true,plan:{...plan(),panelId:'another'}}));bad.draw();await bad.rt.flush();assert.match(text(bad.draw()),/could not be verified/);assert.equal(bad.draw().some(n=>n.type==='input'),false);
 const d=dialog(async b=>{if(b.action==='preview')return {ok:true,plan:plan()};throw Object.assign(Error('Invalid panel ID'),{status:400});});d.draw();await d.rt.flush();edit(d.draw(),'Corrected panel ID','CORRECT');edit(d.draw(),'Reason for correction','Wrong upload');await submit(d.draw());assert.equal(d.draw().find(n=>n['aria-label']==='Corrected panel ID').disabled,false);assert.match(text(d.draw()),/Invalid panel ID/);
});

function requestHarness(extra={}){
 const calls=[],updates=[],context={isAdmin:true,BAKED_WORKER_URL:'https://example.test',PanelStock:{username:'admin',outbox:{flush:async()=>{},pending:()=>0},apiFetch:async(url,options)=>{const body=JSON.parse(options.body);calls.push({url,body});return {ok:true,json:async()=>body.action==='preview'?{ok:true,plan:plan()}:{ok:true,revision:9,summary:{panelId:panel.id,newPanelNumber:body.newPanelNumber}}};},snapshot:async()=>({revision:9,cncPanels:[{...panel,panelNumber:'CORRECT'}],transactions:[{id:'correction-history'}]})},setCncPanels:value=>updates.push({kind:'panels',value}),setTransactions:value=>updates.push({kind:'transactions',value}),showToast(){},...extra};
 const request=vm.runInNewContext(source('correctCncPanelIdRequest',4)+';correctCncPanelIdRequest',context);return {request,context,calls,updates};
}
const payload={action:'save',panelId:panel.id,newPanelNumber:'CORRECT',reason:'Wrong upload',mutationId:'correction-request-0001',expectedPanelNumber:panel.panelNumber,expectedCompletedAt:panel.completedAt,productionSignature:'a'.repeat(64),revision:8,restoreEpoch:0};

test('server correction callback flushes sync, uses the dedicated authenticated endpoint and applies only a verified refreshed snapshot',async()=>{
 const rt=requestHarness();await rt.request({action:'preview',panelId:panel.id});assert.equal(rt.updates.length,0);await rt.request(payload);assert.equal(rt.calls[1].url,'https://example.test/cnc/panel-id');assert.deepEqual(rt.calls[1].body,payload);assert.equal(rt.updates[0].value[0].id,panel.id);assert.equal(rt.updates[0].value[0].panelNumber,'CORRECT');assert.equal(rt.updates[0].value[0].status,'completed');assert.equal(rt.updates[0].value[0].completedAt,panel.completedAt);assert.equal(rt.updates[1].kind,'transactions');
});

test('callback rejects non-admins, pending sync and account switches before/after network or snapshot without local writes',async()=>{
 for(const kind of ['nonadmin','pending','flush-account','response-account','snapshot-account']){
  const rt=requestHarness();if(kind==='nonadmin')rt.context.isAdmin=false;if(kind==='pending')rt.context.PanelStock.outbox.pending=()=>1;if(kind==='flush-account')rt.context.PanelStock.outbox.flush=async()=>{rt.context.PanelStock.username='other';};
  if(kind==='response-account')rt.context.PanelStock.apiFetch=async()=>{rt.context.PanelStock.username='other';return {ok:true,json:async()=>({ok:true})};};
  if(kind==='snapshot-account')rt.context.PanelStock.snapshot=async()=>{rt.context.PanelStock.username='other';return {revision:9,cncPanels:[{...panel,panelNumber:'CORRECT'}]};};
  await assert.rejects(rt.request(payload),/administrators|Sync your saved changes|account changed/);assert.equal(rt.updates.length,0);
 }
});

test('failed or stale snapshot and malformed correction receipts remain retryable; later edits require fresh review',async()=>{
 for(const value of [null,{revision:8,cncPanels:[{...panel,panelNumber:'CORRECT'}]},{revision:9,cncPanels:[panel]}]){const rt=requestHarness();rt.context.PanelStock.snapshot=async()=>value;await assert.rejects(rt.request(payload),/refreshed|changed after/);assert.equal(rt.updates.length,0);}
 const failed=requestHarness();failed.context.PanelStock.snapshot=async()=>{throw Error('Offline');};await assert.rejects(failed.request(payload),/tracker could not be refreshed/);assert.equal(failed.updates.length,0);
 const malformed=requestHarness();malformed.context.PanelStock.apiFetch=async()=>({ok:true,json:async()=>({ok:true,revision:9,summary:{panelId:'wrong',newPanelNumber:'CORRECT'}})});await assert.rejects(malformed.request(payload),/response could not be verified/);assert.equal(malformed.updates.length,0);
 const newer=requestHarness();newer.context.PanelStock.snapshot=async()=>({revision:10,cncPanels:[{...panel,panelNumber:'CHANGED AGAIN'}]});await assert.rejects(newer.request(payload),error=>error.status===409&&/Latest tracker loaded/.test(error.message));assert.equal(newer.updates[0].value[0].panelNumber,'CHANGED AGAIN');assert.equal(newer.updates[0].value[0].id,panel.id);assert.equal(newer.updates[1].kind,'transactions');
});

test('only admins see ID correction on completed rows; the pending edit stays a separate action',()=>{
 const name=html.includes('  function CncTab(')?'CncTab':'CncPage';
 for(const isAdmin of [false,true]){
  const rt=hooks({PageHeading:'heading',CncRouterIcon:'icon',CNC_PUBLIC_TOKEN:'public',BAKED_WORKER_URL:'https://example.test',SectionTitle:'heading',EmptyState:'empty',CncJobGroups:'jobs',CncPanelIdCorrectionDialog:'id-correction',CncUndoCutDialog:'undo',CncPanelEdit:'pending-edit',CncSheetDialog:'sheet',Plus:'plus',Pencil:'pencil',Trash2:'trash',FileSpreadsheet:'spreadsheet',Copy:'copy',Check:'check',Link:'link',LinkIcon:'link-icon',Search:'search-icon',Upload:'upload',Settings2:'settings',normalizeCncInput:value=>value,fmtStockDim:()=>'',fmtCncOffcutDim:()=>'',cncEstimatedOffcut:()=>null});
  const fn=vm.runInNewContext(source(name)+';'+name,rt.context),pending={...panel,id:'pending',status:'pending'},props={isAdmin,cncPanels:[panel,pending],variants:[],offcuts:[],onCorrectPanelId(){},onUndoCut(){},onEditPanel(){}};
  let all=nodes(rt.render(fn,props));let jobs=all.find(n=>n.type==='jobs'),rows=nodes(jobs.renderGroup([pending]));assert.equal(rows.some(n=>n.children?.includes?.('Edit panel ID')),false);assert.equal(rows.some(n=>n['aria-label']==='Edit panel '+panel.panelNumber),isAdmin);
  all.find(n=>n.type==='button'&&n.children?.includes?.('Completed (')).onClick();all=nodes(rt.render(fn,props));jobs=all.find(n=>n.type==='jobs');rows=nodes(jobs.renderGroup([panel]));const edit=rows.find(n=>n['aria-label']==='Edit panel ID for '+panel.panelNumber);assert.equal(!!edit,isAdmin);assert.equal(rows.some(n=>n['aria-label']==='Edit panel '+panel.panelNumber),false);
  if(edit){edit.onClick();all=nodes(rt.render(fn,props));const modal=all.find(n=>n.type==='id-correction');assert.equal(modal.panel.id,panel.id);assert.equal(modal.request,props.onCorrectPanelId);}
 }
 const currentEdit=source('editCncPanel',4);assert.match(currentEdit,/panel\.status !== "pending"/);assert.match(source('CncPanelEdit'),/Edit scheduled CNC panel/);assert.match(html,/onCorrectPanelId: isAdmin \? correctCncPanelIdRequest : null/);
});
