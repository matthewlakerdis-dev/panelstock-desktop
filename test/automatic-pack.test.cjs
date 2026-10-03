const {test}=require('node:test'),assert=require('node:assert/strict');
const pack=require('../cad/automatic-pack.js');
const makeDrawing=()=>({dxf:'drawing',svg:'<svg/>',validation:{closedCut:true,checks:['Closed cut'],measurements:[{status:'pass'}],warnings:['Test drawing: tooling width and depth remain unspecified.'],fabricationTags:[],stiffeners:[]}});
const spec=()=>({panelId:'A',panelDirection:'right',packManufacturing:{material:'Aluminium',thickness:3,finish:'White'}});
test('approved CAD skips AI reads and regeneration but still checks stock and journals scheduling',async()=>{
 const j=job();j.pages=[];j.approvedDxf=new File(['dxf'],'approved.dxf');j.settings.policy={missingDirection:'non-directional',thickness:3};j.settings.rawFinish='Milled';const h=harness(j);
 const request=async(path,body)=>{
  if(path==='/cad/analyse'){assert.equal(body.mode,'approved-dxf');return {panels:[{name:'A',quantity:1,spec:spec(),result:makeDrawing(),reviewed:true}]};}
  return h.request(path,body);
 };
 await pack.process(j,{...h,request});assert.equal(j.sent,true);assert.equal(j.approvedImported,true);
 assert.equal(h.calls.filter(c=>c.path==='/cad/generate'&&!c.body.sheetPlan).length,0);
 assert.ok(h.calls.some(c=>c.path==='/data'));assert.ok(h.saves.some(s=>s.packet&&!s.sent));
});
test('whole pack reconciles cover quantities and cross-page references',()=>{
 const cover={verified:true,groups:[],inventory:{pageKind:'cover',declaredPackPageCount:3,listedPanels:[{id:'Template 1',quantity:1},{id:'Template 3',quantity:1}]}};
 const drawing=id=>({verified:true,groups:[{panels:[{id,quantity:1}]}],inventory:{referencedPanelIds:['Template 1','Template 3']}});
 const pages=[cover,drawing('Template 1'),drawing('Template 3')];assert.deepEqual(pack.packContextIssues(pages),[]);
 const missing=structuredClone(pages);missing[2].verified=false;assert.match(pack.packContextIssues(missing).join(' '),/Template 3 has no checked drawing/);
 const quantity=structuredClone(pages);quantity[1].groups[0].panels[0].quantity=2;assert.match(pack.packContextIssues(quantity).join(' '),/quantity differs/);
 const shared=structuredClone(pages);shared[0].inventory.sharedManufacturingRequirements=['Use 75mm staggered tags.'];assert.match(pack.packContextIssues(shared).join(' '),/needs mapping/);
 assert.match(pack.packContextIssues(pages.slice(0,2)).join(' '),/3 pages, but 2/);
});
test('checked page cache skips AI reads but still generates and checks stock before scheduling',async()=>{
 const values=new Map(),cache={get:async key=>values.get(key),put:async(key,value)=>values.set(key,structuredClone(value))};
 const first=job(),h=harness(first);let clock=0;
 const request=async(path,body)=>{const result=await h.request(path,body);if(path==='/cad/analyse')return {...result,readerVersion:'pack-dimensions-v8',independentInventory:{groups:[]}};return result;};
 await pack.process(first,{...h,request,cache,now:()=>clock+=100});
 assert.equal(values.size,1);assert.ok(first.timings.Reading>0);assert.ok(first.timings['Independent checks']>0);assert.ok(first.timings['Drawing generation']>0);assert.ok(first.timings.Nesting>0);assert.ok(first.timings.Scheduling>0);
 const next=job(),second=harness(next);await pack.process(next,{...second,cache});
 assert.equal(second.calls.filter(c=>c.path==='/cad/analyse').length,0);assert.equal(next.pages[0].reusedReading,true);
 assert.ok(second.calls.some(c=>c.path==='/data'));assert.ok(second.calls.some(c=>c.path==='/cad/generate'));assert.equal(next.sent,true);
 assert.match(pack.timingText(next),/1 unchanged page/);
});
test('cache keys change with source bytes and material or direction policy',async()=>{
 const j=job(),key=await pack.checkedPageKey(j.pages[0],j.settings);
 for(const settings of [{...j.settings,stockKey:'other'},{...j.settings,policy:{thickness:4}},{...j.settings,policy:{missingDirection:'required'}}])assert.notEqual(await pack.checkedPageKey(j.pages[0],settings),key);
 assert.notEqual(await pack.checkedPageKey({...j.pages[0],file:new File(['changed'],'page.pdf',{type:'application/pdf'})},j.settings),key);
});
test('expired, failed or incomplete cached readings are never trusted',async()=>{
 const valid={verified:true,readerVersion:'pack-dimensions-v8',inventory:{},independentInventory:{},groups:[{}],issues:[],savedAt:Date.now()};
 assert.equal(pack.validCachedPage(valid),true);
 for(const change of [{savedAt:Date.now()-8*86400000},{verified:false},{issues:['Unclear']},{independentInventory:null},{readerVersion:'old'},{groups:[]}])assert.equal(pack.validCachedPage({...valid,...change}),false);
 const j=job(),h=harness(j);await pack.process(j,{...h,cache:{get:async()=>{throw Error('Storage unavailable');},put:async()=>{throw Error('Storage unavailable');}}});assert.equal(j.sent,true);assert.equal(h.calls.filter(c=>c.path==='/cad/analyse').length,2);
});
test('pack uses two reading slots, checks every page twice and serializes checkpoints',async()=>{
 const j=job(),h=harness(j);j.pages=Array.from({length:4},(_,i)=>({...j.pages[0],file:new File(['page'],'page-'+i+'.pdf',{type:'application/pdf'})}));
 let active=0,maxActive=0,saving=0,maxSaving=0;const seen=[],pending=[];
 const request=async(path,body)=>{
  assert.equal(path,'/cad/analyse');active++;maxActive=Math.max(maxActive,active);seen.push(body.filename+':'+body.mode);
  await new Promise(resolve=>pending.push(resolve));active--;
  return body.mode==='pack-read'?{inventory:{groups:[]}}:{verified:false,issues:['Needs review'],groups:[]};
 };
 let done=false;
 const result=pack.process(j,{...h,request,save:async()=>{saving++;maxSaving=Math.max(maxSaving,saving);await new Promise(resolve=>setImmediate(resolve));saving--;}});
 const checked=assert.rejects(result,/pages need attention/).finally(()=>{done=true;});
 let firstBatch=true;
 while(!done){await new Promise(resolve=>setImmediate(resolve));if(pending.length&&(!firstBatch||pending.length===2)){firstBatch=false;pending.splice(0).forEach(resolve=>resolve());}}
 await checked;assert.equal(maxActive,2);assert.equal(maxSaving,1);assert.equal(seen.length,8);
 for(let i=0;i<4;i++){assert.ok(seen.includes('page-'+i+'.pdf:pack-read'));assert.ok(seen.includes('page-'+i+'.pdf:pack-verify'));}
 assert.equal(j.sent,undefined);
});
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

test('provider limits pause the entire queue before later pages start',async()=>{
 for(const message of ['OpenAI rate limit reached. Wait briefly and retry.','OpenAI API quota is exhausted.']){
 const j=job(),h=harness(j);j.pages=Array.from({length:7},(_,i)=>({file:new File(['page'],i+'.png',{type:'image/png'})}));let attempts=0;const waits=[];
 await assert.rejects(pack.process(j,{...h,request:async()=>{attempts++;throw Error(message);},wait:async ms=>waits.push(ms)}),/OpenAI/);
 assert.ok(attempts<=2);assert.equal(waits.length,0);assert.equal(j.sent,undefined);assert.ok(j.pages.slice(2).every(p=>!p.inventory&&!p.readJobs));
 }
});
test('exhausted retries and quota errors never schedule',async()=>{
 for(const message of ['OpenAI rate limit reached. Wait briefly and retry.','OpenAI API quota is exhausted.']){
 const j=job(),h=harness(j);let attempts=0;await assert.rejects(pack.process(j,{...h,wait:async()=>{},request:async()=>{attempts++;throw Error(message);}}),/OpenAI/);assert.equal(attempts,1);assert.equal(j.sent,undefined);
 }
});
test('resuming after a provider limit preserves the successful first reading',async()=>{
 const j=job(),h=harness(j);let limited=true,reads=0;
 const request=async(path,body)=>{if(body?.mode==='pack-read')reads++;if(body?.mode==='pack-verify'&&limited)throw Error('OpenAI rate limit reached.');return h.request(path,body);};
 await assert.rejects(pack.process(j,{...h,request}),/OpenAI/);assert.ok(j.pages[0].inventory);assert.equal(j.pages[0].retryable,true);assert.ok(!j.sent);
 limited=false;await pack.process(j,{...h,request});assert.equal(reads,1);assert.equal(j.sent,true);
});

test('reader upgrades invalidate unsent cached approvals but preserve submitted packets',async()=>{
 const j=job(),h=harness(j);j.pages[0].verified=true;j.pages[0].groups=[{panels:[{id:'OLD',quantity:1}],spec:spec()}];
 await pack.process(j,h);assert.equal(j.readerRevision,'pack-dimensions-v8');assert.deepEqual(j.panels.map(p=>p.name),['A','B']);assert.ok(h.calls.some(c=>c.body?.mode==='pack-read'));
});

test('temporary reader timeout retries without resubmitting CNC mutations',async()=>{
 const j=job(),h=harness(j);let attempts=0;await pack.process(j,{...h,wait:async()=>{},request:async(path,body)=>{if(body?.mode==='pack-verify'&&attempts++===0)throw Error('Cannot reach OpenAI or the request timed out. Retry later.');return h.request(path,body);}});assert.equal(j.sent,true);assert.equal(h.calls.filter(c=>c.path==='/mutations').length,1);
});
test('resume after exhausted verification timeouts retains the successful first read',async()=>{
 const j=job(),h=harness(j);let reads=0,fail=true;const request=async(path,body)=>{if(body?.mode==='pack-read')reads++;if(body?.mode==='pack-verify'&&fail)throw Error('Cannot reach OpenAI or the request timed out. Retry later.');return h.request(path,body);};
 await assert.rejects(pack.process(j,{...h,request,wait:async()=>{}}),/pages need attention/);assert.equal(j.pages[0].retryable,true);fail=false;await pack.process(j,{...h,request});assert.equal(reads,1);assert.equal(j.sent,true);
});


test('order manifest blocks all eight reference-only Order30 IDs',()=>{
 const ordered=['Z4-105','Z4-112','Z4-25','Z4-26','Z4-72','Z4-50','Z4-49','Z4-48','Z4-52','Z4-44','Z4-46','Z4-57'];
 const references=['Z4-54','Z4-43','Z4-61','Z4-74','Z4-51','Z4-56','Z4-69','Z4-75'];
 const panels=ordered.map(id=>({id,quantity:1}));
 const page={verified:true,inventory:{listedPanels:panels},groups:[{panels}]};
 assert.deepEqual(pack.packContextIssues([page]),[]);
 const extra={...page,groups:[{panels:[...panels,...references.map(id=>({id,quantity:1}))]}]};
 const issues=pack.packContextIssues([extra]);
 assert.equal(issues.length,8);
 for(const id of references)assert.ok(issues.some(message=>message.includes(id.toLowerCase())));
});

test('dimension-basis upgrade refuses previously checked v5, v6 and v7 caches',()=>{
 const old={verified:true,readerVersion:'pack-constraints-v5',inventory:{},independentInventory:{},groups:[{}],issues:[],savedAt:Date.now()};
 assert.equal(pack.validCachedPage(old),false);
 assert.equal(pack.validCachedPage({...old,readerVersion:'pack-dimensions-v6'}),false);
 assert.equal(pack.validCachedPage({...old,readerVersion:'pack-dimensions-v7'}),false);
});
