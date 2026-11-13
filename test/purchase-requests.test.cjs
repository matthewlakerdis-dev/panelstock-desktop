const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require.resolve('../purchase-requests.js'),'utf8');
const context={Intl,JSON,TextDecoder,Uint8Array,URL,Blob,AbortController,console};vm.runInNewContext(source,context);
const {calculateTotals,createSubmission,createDetailLoader}=context.PanelStockPurchaseRequests;
const plain=value=>JSON.parse(JSON.stringify(value));
const body=()=>({requestId:'35fc4244-267c-42c6-885c-6ab93a55b899',projectPageId:60,catalogRevision:'snapshot',requestor:{name:'Matt',email:'matt@example.test'},date:'2026-11-13',supplierId:'225',supplierReference:'example',serviceId:'8',breakdownType:'b_70',quote:null,quoteBase64:'',lines:[{description:'Blanket PO',quantity:'1',unitPriceExGst:'1000',chartOfAccountId:'1',taxRateId:'1',breakdownType:'b_70'}]});
function storage(initial=null){let value=initial?plain(initial):null;return{read:async()=>value?plain(value):null,write:async next=>{value=plain(next);},clear:async()=>{value=null;},get value(){return value;}};}
const found=id=>({ok:true,status:200,data:{request:{id,reference:'REQ-'+id,state:'queued'}}});

test('GST totals use decimal half-up per line, including fractional quantities',()=>{
 const taxes=[{id:'1',rate:10},{id:'0',rate:0}];
 assert.deepEqual(plain(calculateTotals(body().lines,taxes)),{subtotalCents:100000,taxCents:10000,totalCents:110000});
 assert.deepEqual(plain(calculateTotals([{quantity:'0.1',unitPriceExGst:'0.05',taxRateId:'1'},{quantity:'1',unitPriceExGst:'1.005',taxRateId:'1'}],taxes)),{subtotalCents:102,taxCents:10,totalCents:112});
 for(const changes of [{quantity:'0'},{quantity:'-1'},{quantity:'NaN'},{unitPriceExGst:'Infinity'},{taxRateId:'unknown'}])assert.throws(()=>calculateTotals([{...body().lines[0],...changes}],taxes));
});

test('a timeout retains the exact body and UUID, resolves status, then retries unchanged',async()=>{
 const saved=storage(),calls=[];let first=true;
 const api=async(path,options)=>{calls.push({path,options});if(options){if(first){first=false;throw Error('timeout');}return found(body().requestId);}return{ok:false,status:404,data:{}};};
 const submitter=createSubmission(api,saved),input=body();
 await assert.rejects(()=>submitter.submit(input),/timeout/);input.lines[0].description='edited after timeout';
 assert.equal(submitter.pending.lines[0].description,'Blanket PO');assert.equal(saved.value.requestId,body().requestId);
 await assert.rejects(()=>submitter.submit({...body(),requestId:'new-id'}),/saved request/);
 const result=await submitter.retry();assert.equal(result.id,body().requestId);assert.equal(calls[1].path,'/purchase-requests/'+body().requestId);
 assert.equal(calls[0].options.body,calls[2].options.body);assert.equal(saved.value,null);assert.equal(submitter.pending,null);
});

test('reload reads saved status without posting and accepted status clears the retry record',async()=>{
 const saved=storage(body()),calls=[],submitter=createSubmission(async(path,options)=>{calls.push([path,options]);return found(body().requestId);},saved);
 assert.equal((await submitter.restore()).state,'queued');assert.equal(calls.length,1);assert.equal(calls[0][1],undefined);assert.equal(saved.value,null);
});

test('missing status after reload stays frozen until the user retries',async()=>{
 const saved=storage(body()),calls=[],submitter=createSubmission(async(path,options)=>{calls.push([path,options]);return{ok:false,status:404,data:{}};},saved);
 assert.equal(await submitter.restore(),null);assert.equal(calls.length,1);assert.equal(submitter.pending.requestId,body().requestId);assert.equal(calls[0][1],undefined);
});

test('validation rejection unlocks correction but conflicting/uncertain responses keep the saved identity',async()=>{
 for(const status of [400,422,409,503]){
  const saved=storage(),submitter=createSubmission(async()=>({ok:false,status,data:{error:'rejected'}}),saved);
  await assert.rejects(()=>submitter.submit(body()),/rejected/);assert.equal(!!submitter.pending,![400,422].includes(status));assert.equal(!!saved.value,![400,422].includes(status));
 }
 const saved=storage(),submitter=createSubmission(async()=>found('different-request'),saved);
 await assert.rejects(()=>submitter.submit(body()),/did not match/);assert.equal(submitter.pending.requestId,body().requestId);
});

test('storage failure stops before any network submission',async()=>{
 let calls=0;const submitter=createSubmission(async()=>{calls++;return found(body().requestId);},{write:async()=>{throw Error('storage unavailable');}});
 await assert.rejects(()=>submitter.submit(body()),/storage unavailable/);assert.equal(calls,0);
});

test('an explicit stale-choices rejection unlocks only after proving that the UUID was never saved',async()=>{
 for(const resolution of ['missing','saved','unavailable']){
  const saved=storage(),calls=[];
  const api=async(path,options)=>{calls.push([path,options]);if(options)return{ok:false,status:409,data:{code:'PURCHASE_REQUEST_CHOICES_CHANGED',error:'Refresh choices'}};return resolution==='missing'?{ok:false,status:404,data:{}}:resolution==='saved'?found(body().requestId):{ok:false,status:503,data:{}};};
  const submitter=createSubmission(api,saved);
  if(resolution==='saved'){assert.equal((await submitter.submit(body())).id,body().requestId);assert.equal(saved.value,null);}
  else{await assert.rejects(()=>submitter.submit(body()),resolution==='missing'?error=>error.choicesChanged===true:/could not be checked/);assert.equal(!!submitter.pending,resolution==='unavailable');assert.equal(!!saved.value,resolution==='unavailable');}
  assert.equal(calls.length,2);assert.equal(calls[1][0],'/purchase-requests/'+body().requestId);assert.equal(calls[1][1],undefined);
 }
});

test('selected request details load full lines and ignore stale selections or account changes',async()=>{
 const pending=[],changes=[];let current=true;
 const loader=createDetailLoader(path=>new Promise(resolve=>pending.push({path,resolve})),()=>current,()=>changes.push(loader.id));
 const first=loader.select('first'),second=loader.select('second');
 pending[1].resolve({ok:true,data:{request:{id:'second',state:'queued',lines:[{description:'Second request line'}]}}});await second;
 pending[0].resolve({ok:true,data:{request:{id:'first',lines:[{description:'Stale first line'}]}}});await first;
 assert.equal(loader.id,'second');assert.equal(loader.value.lines[0].description,'Second request line');
 loader.summary({id:'second',state:'processing',lineCount:1});assert.equal(loader.value.state,'processing');assert.equal(loader.value.lines[0].description,'Second request line');
 const refresh=loader.refresh();assert.equal(pending[2].path,'/purchase-requests/second');current=false;
 pending[2].resolve({ok:true,data:{request:{id:'second',lines:[{description:'Different account response'}]}}});await refresh;
 assert.equal(loader.value.lines[0].description,'Second request line');assert.ok(changes.length>=3);
});

test('native integration uses explicit new permissions, current account APIs and private quote download',()=>{
 const html=fs.readFileSync(require.resolve('../index.html'),'utf8');
 assert.match(html,/taskAccess\["purchase-requests.create"\]===true/);assert.match(html,/taskAccess\["purchase-requests.manage"\]===true/);
 assert.match(html,/key:"purchase-requests",label:"Purchase Requests",target:"purchase-requests"/);
 assert.match(html,/name:"Purchase requests",codes:\["purchase-requests.create","purchase-requests.manage"\]/);
 const wrapper=html.slice(html.indexOf('  function PurchaseRequestsPage('),html.indexOf('  function GateProgressPage('));
 assert.doesNotMatch(wrapper,/iframe|localStorage|\/login/);assert.match(wrapper,/currentUsername:\(\)=>PanelStock.username/);assert.match(wrapper,/return\(\)=>view.destroy\(\)/);
 assert.match(source,/\/quote/);assert.match(source,/Download quote PDF/);assert.doesNotMatch(source,/127\.0\.0\.1|localhost|nexviaSubmissionEnabled|\/purchase-order-add/);
 for(const build of ['build-production.cjs','build-staging.cjs'])assert.match(fs.readFileSync(require.resolve('../scripts/'+build),'utf8'),/'purchase-requests.js','purchase-requests.css'/);
});
