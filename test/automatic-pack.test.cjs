const {test}=require('node:test'),assert=require('node:assert/strict');
const pack=require('../cad/automatic-pack.js');
const makeDrawing=()=>({dxf:'drawing',svg:'<svg/>',validation:{closedCut:true,checks:['Closed cut'],measurements:[{status:'pass'}],warnings:['Test drawing: tooling width and depth remain unspecified.'],fabricationTags:[],stiffeners:[]}});
const spec=()=>({panelId:'A',panelDirection:'right',packManufacturing:{material:'Aluminium',thickness:3,finish:'White'}});
test('background reads poll the same saved job and preserve it across a lost connection',async()=>{
 const j=job(),h=harness(j);let dropped=false;const starts=[],polls=[];
 const request=async(path,body)=>{
  if(path!=='/cad/analyse')return h.request(path,body);
  if(body.jobAction==='start'){starts.push(structuredClone(body));return {jobState:'running'};}
  polls.push(body.jobId);
  if(!dropped){dropped=true;throw Error('Connection lost');}
  const original=starts.find(s=>s.jobId===body.jobId);assert.ok(original);
  return {jobState:'completed',result:await h.request(path,original)};
 };
 await assert.rejects(pack.process(j,{...h,request,wait:async()=>{}}),/pages need attention/);
 assert.equal(starts.length,1);assert.equal(j.pages[0].readJobs['pack-read'].started,true);
 await pack.process(j,{...h,request,wait:async()=>{}});
 assert.equal(starts.length,2);assert.equal(polls[0],polls[1]);assert.equal(j.sent,true);
});
test('pausing a background read preserves its identifier for resume',async()=>{
 const j=job(),h=harness(j);let paused=false;
 await assert.rejects(pack.process(j,{...h,cancelled:()=>paused,wait:async()=>{paused=true;},request:async()=>({jobState:'running'})}),/Paused/);
 assert.ok(j.pages[0].readJobs['pack-read'].id);assert.equal(j.sent,undefined);
});
function job(){const file=new File(['page'],'page.pdf',{type:'application/pdf'});return {id:'run',settings:{projectName:'Notre Dame',orderNumber:'11',stockKey:'aluminium-3-milled',powderCoat:true,policy:{}},pages:[{file,original:file}],panels:[],exceptions:[]};}
function harness(j){
 const calls=[],saves=[];let failMutation=false,inventoryFailure=false,unplaced=[];
 const stock={material:'Aluminium',thickness:3,color:'Milled',id:'stock',type:'variant',quantity:20,width:3000,height:1200};
 const planner={availableStock:()=>[stock],groupKey:()=>j.settings.stockKey,trackerPacket:()=>({mutationId:'stable-id',changes:[{id:'panel'}]})};
 const request=async(path,body)=>{calls.push({path,body});
  if(path==='/data')return {cncPanels:[]};
  if(path==='/cad/analyse')return body.mode==='pack-read'?{inventory:{groups:[]}}:inventoryFailure?{verified:false,issues:['Unclear dimension.'],groups:[]}:{verified:true,issues:[],groups:[{panels:[{id:'A',quantity:1},{id:'B',quantity:1}],spec:spec()}]};
  if(path==='/cad/generate')return body.sheetPlan?{sheets:[{number:1,stock,panels:[{name:'A'},{name:'B'}],dxf:'sheet'}],unplaced}:makeDrawing();
  if(path==='/mutations'){if(failMutation)throw Error('Lost response');return {ok:true};}
  throw Error('Unexpected request');
 };
 return {calls,saves,planner,request,save:async value=>saves.push(structuredClone(value)),setFailMutation:v=>failMutation=v,setInventoryFailure:v=>inventoryFailure=v,setUnplaced:v=>unplaced=v};
}
test('full workflow expands every ID, generates, plans, journals before sending',async()=>{
 const j=job(),h=harness(j);await pack.process(j,h);assert.equal(j.sent,true);assert.deepEqual(j.panels.map(p=>p.name),['A','B']);assert.equal(h.calls.filter(c=>c.path==='/mutations').length,1);assert.ok(h.saves.some(s=>s.packet&&!s.sent));
 const before=h.calls.length;await pack.process(j,h);assert.equal(h.calls.length,before);
});
test('lost submission response retries the identical saved packet without re-reading or re-planning',async()=>{
 const j=job(),h=harness(j);h.setFailMutation(true);await assert.rejects(pack.process(j,h),/Lost response/);const packet=structuredClone(j.packet),before=h.calls.length;h.setFailMutation(false);await pack.process(j,h);assert.equal(h.calls.length,before+1);assert.deepEqual(h.calls.at(-1).body,packet);assert.equal(j.sent,true);
});
test('page uncertainty blocks all tracker changes and preserves a specific exception',async()=>{
 const j=job(),h=harness(j);h.setInventoryFailure(true);await assert.rejects(pack.process(j,h),/pages need attention/);assert.match(j.exceptions[0],/Page 1: Unclear/);assert.ok(!h.calls.some(c=>c.path==='/mutations'));
});
test('unplaced panels are named and never sent',async()=>{
 const j=job(),h=harness(j);h.setUnplaced([{name:'B',copy:1}]);await assert.rejects(pack.process(j,h),/Not all panels fit/);assert.match(j.exceptions[0],/^B:/);assert.ok(!j.packet);assert.ok(!h.calls.some(c=>c.path==='/mutations'));
});
test('journal failure prevents external mutation',async()=>{
 const j=job(),h=harness(j);h.save=async value=>{if(value.packet)throw Error('Disk full');};await assert.rejects(pack.process(j,h),/Disk full/);assert.ok(!h.calls.some(c=>c.path==='/mutations'));
});
test('journal failure also prevents retrying an unsaved in-memory packet',async()=>{
 const j=job(),h=harness(j);j.packet={mutationId:'not-yet-saved'};h.save=async()=>{throw Error('Disk full');};await assert.rejects(pack.process(j,h),/Disk full/);assert.ok(!h.calls.some(c=>c.path==='/mutations'));
});
test('definitively rejected submission clears its packet so fresh stock can be checked',async()=>{
 const j=job(),h=harness(j);j.packet={mutationId:'rejected'};h.request=async()=>{throw Object.assign(Error('Stock conflict'),{status:409});};await assert.rejects(pack.process(j,h),/Stock conflict/);assert.equal(j.packet,undefined);assert.equal(h.saves.at(-1).packet,undefined);
});
test('saved CAD projects preserve the run identity and readiness for resume',()=>{
 const vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');const context={window:{},structuredClone};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../cad/cad-projects.js'),'utf8'),context);const saved=context.window.PanelCadProjects.snapshot([{name:'A',automationRunId:'run-1',spec:spec(),reviewed:true}],0,'Order 11',[],{},()=>({version:1,ready:true}));assert.equal(saved.panels[0].automationRunId,'run-1');assert.equal(saved.panels[0].drawingReadiness.ready,true);
});
test('duplicate IDs on separate pages cannot be silently combined',()=>{
 const page={verified:true,original:{name:'pack.pdf'},groups:[{panels:[{id:'A',quantity:1}],spec:spec()}]};assert.throws(()=>pack.inventoryPanels([page,page],'run'),/more than once/);
});
test('existing order panels block scheduling even under a different sheet number',()=>{
 assert.throws(()=>pack.ensureNotScheduled({cncPanels:[{jobReference:'NOTRE DAME',orderNumber:'11',sheetNumber:'9',panelNumber:'A'}]},[{name:'A',quantity:1}],job().settings),/already/);
});
test('omitted holes and measurement mismatches are exceptions',()=>{
 const result=makeDrawing();result.validation.warnings.push('Holes omitted where required spacing cannot fit: sections 1.');result.validation.measurements.push({label:'Width',status:'mismatch'});assert.equal(pack.drawingIssues(result).length,2);
});
test('cancellation stops before the next operation',async()=>{
 const j=job(),h=harness(j);await assert.rejects(pack.process(j,{...h,cancelled:()=>true}),/Paused/);assert.equal(h.calls.length,0);
});

test('rate limits retry the same page with bounded backoff and operator policy',async()=>{
 const j=job(),h=harness(j);j.settings.policy={thickness:3,missingDirection:'non-directional'};let attempts=0;const waits=[];
 const request=async(path,body)=>{if(path==='/cad/analyse'&&body.mode==='pack-read'){attempts++;assert.equal(body.policy.thickness,3);if(attempts<3)throw Error('OpenAI rate limit reached. Wait briefly and retry.');}return h.request(path,body);};
 await pack.process(j,{...h,request,wait:async ms=>waits.push(ms)});assert.equal(attempts,3);assert.equal(waits.length,60);assert.equal(j.sent,true);
});
test('exhausted retries and quota errors never schedule',async()=>{
 for(const message of ['OpenAI rate limit reached. Wait briefly and retry.','OpenAI API quota is exhausted.']){
 const j=job(),h=harness(j);let attempts=0;await assert.rejects(pack.process(j,{...h,wait:async()=>{},request:async()=>{attempts++;throw Error(message);}}),/pages need attention/);assert.equal(attempts,message.includes('rate limit')?4:1);assert.equal(j.sent,undefined);
 }
});
test('pause during rate-limit backoff prevents another request',async()=>{
 const j=job(),h=harness(j);let paused=false,calls=0;await assert.rejects(pack.process(j,{...h,cancelled:()=>paused,wait:async()=>{paused=true;},request:async()=>{calls++;throw Error('OpenAI rate limit reached.');}}),/pages need attention|Paused/);assert.equal(calls,1);assert.ok(!j.sent);
});

test('reader upgrades invalidate unsent cached approvals but preserve submitted packets',async()=>{
 const j=job(),h=harness(j);j.pages[0].verified=true;j.pages[0].groups=[{panels:[{id:'OLD',quantity:1}],spec:spec()}];
 await pack.process(j,h);assert.equal(j.readerRevision,'independent-v2');assert.deepEqual(j.panels.map(p=>p.name),['A','B']);assert.ok(h.calls.some(c=>c.body?.mode==='pack-read'));
});

test('temporary reader timeout retries without resubmitting CNC mutations',async()=>{
 const j=job(),h=harness(j);let attempts=0;await pack.process(j,{...h,wait:async()=>{},request:async(path,body)=>{if(body?.mode==='pack-verify'&&attempts++===0)throw Error('Cannot reach OpenAI or the request timed out. Retry later.');return h.request(path,body);}});assert.equal(j.sent,true);assert.equal(h.calls.filter(c=>c.path==='/mutations').length,1);
});
test('resume after exhausted verification timeouts retains the successful first read',async()=>{
 const j=job(),h=harness(j);let reads=0,fail=true;const request=async(path,body)=>{if(body?.mode==='pack-read')reads++;if(body?.mode==='pack-verify'&&fail)throw Error('Cannot reach OpenAI or the request timed out. Retry later.');return h.request(path,body);};
 await assert.rejects(pack.process(j,{...h,request,wait:async()=>{}}),/pages need attention/);assert.equal(j.pages[0].retryable,true);fail=false;await pack.process(j,{...h,request});assert.equal(reads,1);assert.equal(j.sent,true);
});
