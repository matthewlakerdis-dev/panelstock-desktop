const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require.resolve('../purchase-requests.js'),'utf8');
const originalId='024d7f9a-a908-478e-969e-7f87319ffc43',reviewId='03d51a62-9ca8-45d6-83e5-e779a71833f3';
const wait=()=>new Promise(resolve=>setImmediate(resolve));
async function settle(){for(let i=0;i<5;i++)await wait();}
const clone=value=>JSON.parse(JSON.stringify(value));
function deferred(){let resolve;const promise=new Promise(done=>resolve=done);return{promise,resolve};}
function catalog(){return{projectPageId:60,revision:'current-catalog',updatedAt:new Date(Date.now()-1000).toISOString(),suppliers:[{id:'225',text:'QLD Surveying'}],services:[{id:'8',name:'Consultant'}],breakdowns:[{id:'b_70',name:'Miscellaneous'}],accounts:[{id:'51097',name:'Consultants'}],taxes:[{id:'1',name:'GST',rate:10},{id:'0',name:'No GST',rate:0}]};}
function request(changes={}){
 return{id:originalId,reference:'REQ-'+originalId,displayReference:'REQ-0005',state:'needs_review',message:'Fresh preparation failed; no submission authorized',projectPageId:60,project:'2558 - Jardin building',requestor:{name:'Chris Collard',email:'chris@example.test'},date:'2026-11-16',supplierId:'225',supplierName:'QLD Surveying',supplierReference:'T29956',serviceId:'8',serviceName:'Consultant',breakdownType:'b_70',breakdownName:'Miscellaneous',totalCents:280000,lines:[{description:'Survey the facade',quantity:'1',unitPriceExGst:'2800',chartOfAccountId:'51097',taxRateId:'0',breakdownType:'b_70'}],quote:null,result:null,review:{status:'retry_ready',note:'Fixed native draft validation.',reviewedBy:'manager',reviewedAt:new Date().toISOString(),assessment:{id:reviewId,status:'retry_ready',message:'No upload or PO submission was attempted.',checkedAt:new Date().toISOString()},replacement:null,canCheck:true,canRetry:true,canClose:true},...changes};
}
function pendingBody(){return{requestId:'09d53a22-7c74-4e98-9d11-42756d3e4e76',projectPageId:60,catalogRevision:'current-catalog',requestor:{name:'Manager',email:'manager@example.test'},date:'2026-11-16',supplierId:'225',supplierReference:'Keep this request',serviceId:'8',breakdownType:'b_70',quote:null,quoteBase64:'',lines:[{description:'Existing pending purchase',quantity:'1',unitPriceExGst:'50',chartOfAccountId:'51097',taxRateId:'0',breakdownType:'b_70'}]};}

async function harness({records=[request()],create=true,manage=true,saved=null,confirm=async()=>true}={}){
 const calls=[],confirmations=[],timers=new Map(),recordsById=new Map(records.map(record=>[record.id,clone(record)]));
 let timerId=0,owner='manager',stored=clone(saved),detailsHandler=null,reviewHandler=null,submissionHandler=null,lookupHandler=null;
 const walk=node=>[node,...node.children.flatMap(walk)];
 class Node{
  constructor(tag){this.tagName=tag;this.children=[];this.events={};this._value='';this._text='';this.attributes={};this.ownerDocument=doc;this.classList={toggle(){},add(){},remove(){}};}
  get textContent(){return this._text+this.children.map(node=>node.textContent).join('');}
  set textContent(value){this._text=String(value??'');this.children=[];}
  appendChild(node){this.children.push(node);node.parentNode=this;return node;}
  append(...nodes){for(const node of nodes)this.appendChild(node);}
  replaceChildren(...nodes){this.textContent='';if(this.tagName==='select')this._value='';for(const node of nodes)this.appendChild(node);}
  remove(){if(this.parentNode)this.parentNode.children=this.parentNode.children.filter(node=>node!==this);}
  setAttribute(name,value){this.attributes[name]=String(value);this[name]=value;}
  getAttribute(name){return this.attributes[name]??null;}
  removeAttribute(name){delete this.attributes[name];delete this[name];}
  addEventListener(name,callback){(this.events[name]||=[]).push(callback);}
  emit(name){if(this.disabled)return;for(const callback of this.events[name]||[])callback({preventDefault(){},target:this});}
  get options(){return this.tagName==='select'?this.children:[];}
  get value(){return this.tagName==='select'&&!this.children.some(node=>node.value===this._value)?'':this._value;}
  set value(value){this._value=String(value);}
  querySelector(selector){const name=selector.match(/^\[name=['"]?([^\]'"]+)['"]?\]$/)?.[1];return walk(this).find(node=>name?node.name===name:node.tagName===selector)||null;}
  querySelectorAll(selector){const name=selector.match(/^\[name=['"]?([^\]'"]+)['"]?\]$/)?.[1];return walk(this).filter(node=>name?node.name===name:node.tagName===selector);}
  contains(node){return walk(this).includes(node);}
  focus(){doc.activeElement=this;}
  scrollIntoView(){}
  reportValidity(){return true;}
  reset(){for(const node of walk(this))if(node.name)node.value='';}
 }
 const doc={hidden:false,createElement:tag=>new Node(tag)};doc.body=new Node('body');const host=new Node('div');
 const context={Date,Intl,JSON,TextDecoder,Uint8Array,URL,Blob,AbortController,crypto,btoa,console,setTimeout(callback,delay){const id=++timerId;timers.set(id,{callback,delay});return id;},clearTimeout:id=>timers.delete(id)};
 vm.runInNewContext(source,context);
 const response=data=>({ok:!(data.status>=400),status:data.status||200,json:async()=>data});
 const apiFetch=async(url,options={})=>{
  const path=new URL(url).pathname,body=options.body?JSON.parse(options.body):null;calls.push({path,options,body});let data;
  if(path==='/purchase-requests'&&options.method!=='POST')data={requests:[...recordsById.values()],projects:[{projectPageId:60,name:'2558 - Jardin building'},{projectPageId:59,name:'2549 - Salacia'}],profile:{name:'Manager',email:'manager@example.test'},permissions:{create,manage},connection:{connected:true}};
  else if(path==='/purchase-requests/shared-choices')data={sharedChoices:catalog()};
  else if(path==='/purchase-requests/eow-choices')data={eowPreviews:[]};
  else if(path==='/purchase-requests/lookups'||path.startsWith('/purchase-requests/lookups/'))data=lookupHandler?await lookupHandler(body):{lookup:{id:'lookup',projectPageId:60,state:'ready'},catalog:catalog()};
  else if(path.endsWith('/review')){
   const id=path.split('/')[2],record=recordsById.get(id);
   if(reviewHandler)data=await reviewHandler(id,body);
   else{
    const next=clone(record),review=next.review;
    if(body.action==='check'){review.status='checking';review.canRetry=false;review.canCheck=false;review.assessment={id:reviewId,status:'queued',message:'Waiting for the Nexvia connection to check this request.',checkedAt:null};}
    if(body.action==='close'){review.status='closed';review.canRetry=false;review.canCheck=false;review.canClose=false;}
    if(body.action==='reopen'){review.status='open';review.canRetry=false;review.canCheck=true;review.canClose=true;}
    if(body.note!==undefined)review.note=body.note;
    review.reviewedBy='manager';review.reviewedAt=new Date().toISOString();data={request:next};
   }
   if(data.request)recordsById.set(id,clone(data.request));
  }else if(path==='/purchase-requests'&&options.method==='POST'){
   if(submissionHandler)return await submissionHandler(body,options);
   const child=request({id:body.requestId,displayReference:'REQ-0006',reference:'REQ-'+body.requestId,state:'queued',requestor:body.requestor,lines:body.lines,retryOf:{id:originalId,displayReference:'REQ-0005'},review:null});recordsById.set(child.id,child);data={request:child};
  }else{
   const id=path.split('/')[2];data=detailsHandler?await detailsHandler(id):recordsById.has(id)?{request:clone(recordsById.get(id))}:{status:404,error:'Request not found'};
  }
  return response(data);
 };
 const view=context.PanelStockPurchaseRequests.mount(host,{username:'manager',workerUrl:'https://api.example.test',currentUsername:()=>owner,confirm:async options=>{confirmations.push(options);return confirm(options);},apiFetch,storage:{read:async()=>clone(stored),write:async body=>{stored=clone(body);},clear:async()=>{stored=null;}}});
 await settle();
 const byName=name=>walk(host).find(node=>node.name===name),byText=text=>walk(host).find(node=>node.textContent===text&&!node.children.some(child=>child.textContent===text));
 async function click(text){const node=byText(text);assert.ok(node,'button '+text+' exists');node.emit('click');await settle();return node;}
 async function timer(delay){const entry=[...timers].find(([,item])=>item.delay===delay);assert.ok(entry,'timer '+delay+' exists');timers.delete(entry[0]);entry[1].callback();await settle();}
 return{host,view,calls,confirmations,byName,byText,walk:()=>walk(host),click,timer,stored:()=>clone(stored),changeOwner:value=>{owner=value;},setDetails:handler=>{detailsHandler=handler;},setReview:handler=>{reviewHandler=handler;},setSubmission:handler=>{submissionHandler=handler;},setLookup:handler=>{lookupHandler=handler;},setRecord:record=>recordsById.set(record.id,clone(record)),record:id=>clone(recordsById.get(id)),async open(reference='REQ-0005'){await click(reference);},async submit(){walk(host).find(node=>node.tagName==='form').emit('submit');await settle();},async attach(){const bytes=new TextEncoder().encode('%PDF-1.4\nFresh quote');const node=byName('quote');node.files=[{name:'fresh-quote.pdf',size:bytes.length,arrayBuffer:async()=>bytes.buffer}];node.emit('change');await settle();}};
}
const reviewCalls=h=>h.calls.filter(call=>call.path.endsWith('/review'));
const creationCalls=h=>h.calls.filter(call=>call.path==='/purchase-requests'&&call.options.method==='POST');
const noEnabledRetry=h=>{const action=h.byText('Prepare retry');assert.ok(!action||action.disabled,'a replacement cannot be prepared');};

test('review-staleness rejection clears a frozen retry only after the child UUID is proven unsaved',async()=>{
 for(const outcome of ['missing','saved','unavailable']){
  const context={Intl,JSON};vm.runInNewContext(source,context);let stored=null;
  const input={...pendingBody(),retryOf:{requestId:originalId,reviewId}},calls=[];
  const api=async(path,options)=>{calls.push({path,options});return options?{ok:false,status:409,data:{code:'PURCHASE_REQUEST_REVIEW_CHANGED',error:'Check this request again'}}:outcome==='missing'?{ok:false,status:404,data:{}}:outcome==='saved'?{ok:true,status:200,data:{request:{id:input.requestId,state:'queued'}}}:{ok:false,status:503,data:{}};};
  const submission=context.PanelStockPurchaseRequests.createSubmission(api,{read:async()=>stored,write:async body=>{stored=clone(body);},clear:async()=>{stored=null;}});
  if(outcome==='saved'){assert.equal((await submission.submit(input)).id,input.requestId);assert.equal(submission.pending,null);assert.equal(stored,null);}
  else{await assert.rejects(()=>submission.submit(input),outcome==='missing'?error=>error.reviewChanged===true:/could not be checked/);assert.equal(!!submission.pending,outcome==='unavailable');assert.equal(!!stored,outcome==='unavailable');}
  assert.equal(calls.length,2);assert.equal(calls[1].path,'/purchase-requests/'+input.requestId);assert.equal(calls[1].options,undefined,'resolving rejection never creates new work');
 }
});

test('an uncertain replacement submission replays the exact child identity, review and quote payload',async()=>{
 const context={Intl,JSON};vm.runInNewContext(source,context);let stored=null,first=true;const calls=[];
 const input={...pendingBody(),retryOf:{requestId:originalId,reviewId},quote:{filename:'fresh-quote.pdf'},quoteBase64:'JVBERi0xLjQKZnJlc2g='};
 const api=async(path,options)=>{calls.push({path,options});if(!options)return{ok:false,status:404,data:{}};if(first){first=false;throw Error('Lost acknowledgement');}return{ok:true,status:200,data:{request:{id:input.requestId,state:'queued'}}};};
 const submission=context.PanelStockPurchaseRequests.createSubmission(api,{read:async()=>stored,write:async body=>{stored=clone(body);},clear:async()=>{stored=null;}});
 await assert.rejects(()=>submission.submit(input),/Lost acknowledgement/);input.retryOf.reviewId='a later assessment';input.quoteBase64='changed PDF';await submission.retry();
 assert.equal(calls[0].options.body,calls[2].options.body);assert.equal(JSON.parse(calls[2].options.body).retryOf.reviewId,reviewId);assert.equal(JSON.parse(calls[2].options.body).quoteBase64,'JVBERi0xLjQKZnJlc2g=');assert.equal(stored,null);assert.equal(submission.pending,null);
});

test('thin history summaries retain full selected review notes and events while applying explicit clears',()=>{
 const context={Intl,JSON};vm.runInNewContext(source,context);const loader=context.PanelStockPurchaseRequests.createDetailLoader(async()=>{throw Error('No read expected');},()=>true,()=>{});
 const full=request();full.review.events=[{id:'review-event',note:'An earlier review note'}];loader.show(full);loader.summary({id:originalId,review:{status:'checking',canRetry:false}});
 assert.equal(loader.value.review.note,'Fixed native draft validation.');assert.equal(loader.value.review.events[0].note,'An earlier review note');assert.equal(loader.value.review.status,'checking');assert.equal(loader.value.review.canRetry,false);assert.equal(loader.value.lines[0].description,'Survey the facade');
 loader.summary({id:originalId,review:{note:'',events:[],assessment:null}});assert.equal(loader.value.review.note,'');assert.deepEqual(clone(loader.value.review.events),[]);assert.equal(loader.value.review.assessment,null);
});

test('requesters can read review findings and notes without reviewer actions',async()=>{
 const h=await harness({manage:false});await h.open();assert.match(h.host.textContent,/Fixed native draft validation/);assert.match(h.host.textContent,/No upload or PO submission was attempted/);
 for(const label of ['Check request','Save note','Close review','Reopen review','Prepare retry'])assert.equal(h.byText(label),undefined,label+' stays manager-only');
 assert.equal(h.byName('reviewNote'),undefined);assert.equal(reviewCalls(h).length,0);assert.equal(creationCalls(h).length,0);h.view.destroy();
});

test('manager check uses only the read-only review action and displays queued assessment',async()=>{
 const h=await harness();await h.open();await h.click('Check request');assert.deepEqual(reviewCalls(h).map(call=>call.body),[{action:'check'}]);assert.equal(creationCalls(h).length,0);assert.match(h.host.textContent,/Waiting for the Nexvia connection/);noEnabledRetry(h);h.view.destroy();
});

test('notes and review closure require entered text; reopen never submits purchase work',async()=>{
 const h=await harness();await h.open();const note=h.byName('reviewNote');assert.ok(note);note.value='';note.emit('input');await h.click('Close review');assert.equal(reviewCalls(h).length,0,'empty closure has no API mutation');
 note.value='  Checked the original request; no PO exists.  ';note.emit('input');await h.click('Save note');assert.deepEqual(reviewCalls(h).at(-1).body,{action:'note',note:'Checked the original request; no PO exists.'});
 const currentNote=h.byName('reviewNote');currentNote.value='Request is no longer required.';currentNote.emit('input');await h.click('Close review');assert.deepEqual(reviewCalls(h).at(-1).body,{action:'close',note:'Request is no longer required.'});noEnabledRetry(h);
 await h.click('Reopen review');assert.deepEqual(reviewCalls(h).at(-1).body,{action:'reopen'});assert.equal(creationCalls(h).length,0);h.view.destroy();
});

test('manager without create permission can review but cannot prepare a replacement',async()=>{
 const h=await harness({create:false});await h.open();assert.ok(h.byText('Check request'));assert.ok(h.byText('Close review'));noEnabledRetry(h);assert.equal(creationCalls(h).length,0);h.view.destroy();
});

test('history polling preserves an unsaved review note and retry is hidden for an expired assessment',async()=>{
 const h=await harness();await h.open();const note=h.byName('reviewNote');note.value='Still writing the review';note.emit('input');await h.timer(10000);assert.equal(h.byName('reviewNote').value,'Still writing the review');
 const expired=request();expired.review.canRetry=false;expired.review.assessment.message='Check this request again before preparing a retry.';h.setRecord(expired);await h.timer(10000);noEnabledRetry(h);assert.match(h.host.textContent,/Check this request again/);assert.equal(creationCalls(h).length,0);h.view.destroy();
});

test('prepare retry preloads current choices and preserves original requestor, lines and zero GST without creation',async()=>{
 const h=await harness();await h.open();await h.click('Prepare retry');assert.equal(creationCalls(h).length,0);assert.match(h.host.textContent,/Retry of REQ-0005/);
 assert.equal(h.byName('requestorName').value,'Chris Collard');assert.equal(h.byName('requestorEmail').value,'chris@example.test');assert.equal(h.byName('supplierReference').value,'T29956');assert.equal(h.byName('project').value,'60');assert.equal(h.byName('supplier').value,'225');assert.equal(h.byName('service').value,'8');assert.equal(h.byName('breakdown').value,'b_70');assert.equal(h.byName('description').value,'Survey the facade');assert.equal(h.byName('tax').value,'0');
 await h.submit();const body=creationCalls(h)[0]?.body;assert.ok(body,'only explicit Submit creates replacement work');assert.notEqual(body.requestId,originalId);assert.deepEqual(body.retryOf,{requestId:originalId,reviewId});assert.equal(body.requestor.email,'chris@example.test');assert.equal(body.lines[0].taxRateId,'0');assert.equal(body.catalogRevision,'current-catalog');h.view.destroy();
});

test('a quoted retry requires a newly selected PDF and never fetches original quote bytes',async()=>{
 const quoted=request({quote:{filename:'original-quote.pdf',bytes:100,sha256:'a'.repeat(64)},quoteTransfer:{version:1,state:'needs_review'}}),h=await harness({records:[quoted]});await h.open();await h.click('Prepare retry');assert.equal(h.byName('quote').value,'');assert.equal(h.byName('quote').required,true);
 await h.submit();assert.equal(creationCalls(h).length,0,'missing fresh quote cannot create replacement');await h.attach();await h.submit();const body=creationCalls(h)[0]?.body;assert.ok(body);assert.equal(body.quote.filename,'fresh-quote.pdf');assert.ok(body.quoteBase64);assert.deepEqual(body.retryOf,{requestId:originalId,reviewId});assert.equal(h.calls.some(call=>call.path.endsWith('/quote')),false);h.view.destroy();
});

test('unavailable copied IDs remain unselected rather than switching to a default tax or allocation',async()=>{
 const missing=request({supplierId:'removed-supplier',breakdownType:'removed-eow',lines:[{description:'Copy retained text',quantity:'2',unitPriceExGst:'25',chartOfAccountId:'removed-account',taxRateId:'removed-tax',breakdownType:'removed-eow'}]}),h=await harness({records:[missing]});await h.open();await h.click('Prepare retry');
 assert.equal(h.byName('supplier').value,'');assert.equal(h.byName('breakdown').value,'');assert.equal(h.byName('account').value,'');assert.equal(h.byName('tax').value,'');assert.equal(h.byName('description').value,'Copy retained text');await h.submit();assert.equal(creationCalls(h).length,0);h.view.destroy();
});

test('preparing a retry cannot overwrite an unresolved frozen submission',async()=>{
 const saved=pendingBody(),h=await harness({saved});await h.open();const action=h.byText('Prepare retry');if(action)await h.click('Prepare retry');assert.deepEqual(h.stored(),saved);assert.equal(creationCalls(h).length,0);assert.doesNotMatch(h.host.textContent,/Retry of REQ-0005/);h.view.destroy();
});

test('declining draft replacement preserves unsent user entries and sends no purchase request',async()=>{
 const h=await harness({confirm:async()=>false});h.byName('description').value='Existing unsent draft';h.byName('description').emit('input');await h.open();await h.click('Prepare retry');assert.equal(h.byName('description').value,'Existing unsent draft');assert.ok(h.confirmations.length);assert.equal(creationCalls(h).length,0);h.view.destroy();
});

test('fresh source details must still be eligible before a retry draft can be prepared',async()=>{
 const h=await harness();await h.open();const blocked=request();blocked.review={...blocked.review,status:'blocked',canRetry:false,assessment:{id:reviewId,status:'blocked',message:'A PO attempt needs manual verification.',checkedAt:new Date().toISOString()}};h.setDetails(async()=>({request:blocked}));await h.click('Prepare retry');assert.doesNotMatch(h.host.textContent,/Retry of REQ-0005/);assert.equal(h.byName('description').value,'');assert.equal(creationCalls(h).length,0);h.view.destroy();
});

test('a late prepare-retry source read cannot copy after selection or account changes',async()=>{
 const second=request({id:'31cb3f51-f542-4f71-bd76-c7047a84bb91',displayReference:'REQ-0007',supplierName:'Second supplier'}),h=await harness({records:[request(),second]}),pending=deferred();await h.open();h.setDetails(id=>id===originalId?pending.promise:Promise.resolve({request:second}));await h.click('Prepare retry');await h.open('REQ-0007');pending.resolve({request:request()});await settle();assert.doesNotMatch(h.host.textContent,/Retry of REQ-0005/);assert.equal(h.byName('description').value,'');assert.equal(creationCalls(h).length,0);h.view.destroy();
 const changed=await harness(),other=deferred();await changed.open();changed.setDetails(()=>other.promise);await changed.click('Prepare retry');changed.changeOwner('different-account');other.resolve({request:request()});await settle();assert.doesNotMatch(changed.host.textContent,/Retry of REQ-0005/);assert.equal(changed.byName('description').value,'');assert.equal(creationCalls(changed).length,0);changed.view.destroy();
});

test('a late copied-project lookup cannot restore its EOW after the user chooses another project',async()=>{
 const h=await harness(),pending=deferred();await h.open();h.setLookup(body=>body.projectPageId===60?pending.promise:Promise.resolve({lookup:{id:'other-project',projectPageId:59,state:'ready'},catalog:{...catalog(),projectPageId:59,revision:'other-catalog',breakdowns:[{id:'other-extent',name:'Different extent'}]}}));
 await h.click('Prepare retry');h.byName('project').value='59';h.byName('project').emit('change');await settle();pending.resolve({lookup:{id:'original-project',projectPageId:60,state:'ready'},catalog:catalog()});await settle();
 assert.equal(h.byName('project').value,'59');assert.equal(h.byName('breakdown').value,'');assert.equal(h.byName('description').value,'Survey the facade');assert.equal(h.byName('tax').value,'0');assert.equal(creationCalls(h).length,0);h.view.destroy();
});

test('a changed review rejection retains edited entries, blocks another submit and opens the existing replacement',async()=>{
 const h=await harness(),childId='f0475221-85b5-4cf8-bfd6-91de219fc3b8';await h.open();await h.click('Prepare retry');h.byName('description').value='Retain this edited description';h.byName('description').emit('input');
 h.setSubmission(async()=>{
  const parent=request();parent.review={...parent.review,status:'replaced',canRetry:false,canCheck:false,canClose:false,replacement:{id:childId,displayReference:'REQ-0006',state:'queued'}};h.setRecord(parent);h.setRecord(request({id:childId,displayReference:'REQ-0006',state:'queued',review:null,retryOf:{id:originalId,displayReference:'REQ-0005'}}));
  return{ok:false,status:409,json:async()=>({code:'PURCHASE_REQUEST_REVIEW_CHANGED',error:'This request already has a replacement.'})};
 });
 await h.submit();assert.equal(creationCalls(h).length,1);assert.equal(h.stored(),null,'404 child resolution releases the rejected frozen UUID');assert.equal(h.byName('description').value,'Retain this edited description');assert.equal(h.byName('tax').value,'0');assert.equal(h.byText('Submit purchase request').disabled,true);await h.submit();assert.equal(creationCalls(h).length,1,'a blocked retry draft cannot send another purchase');
 const details=h.walk().find(node=>node.className==='pr-details'),link=h.walk().find(node=>node.tagName==='button'&&node.textContent.includes('REQ-0006')&&details.contains(node));assert.ok(link,'fresh original details show its existing replacement');link.emit('click');await settle();assert.match(h.walk().find(node=>node.className==='pr-details').textContent,/REQ-0006/);h.view.destroy();
});

test('a reloaded frozen retry restores edited entries as blocked only after its rejected child is proven unsaved',async()=>{
 const saved={...pendingBody(),requestor:{name:'Edited original requestor',email:'edited@example.test'},supplierReference:'Edited quote reference',retryOf:{requestId:originalId,reviewId},quote:{filename:'previously-selected.pdf'},quoteBase64:'JVBERi0xLjQKcHJldmlvdXMgYnl0ZXM=',lines:[{description:'Retain edited line after reload',quantity:'2',unitPriceExGst:'75',chartOfAccountId:'51097',taxRateId:'0',breakdownType:'b_70'}]};
 const parent=request({quote:{filename:'original-quote.pdf',bytes:100,sha256:'a'.repeat(64)},quoteTransfer:{version:1,state:'needs_review'}});parent.review={...parent.review,status:'blocked',canRetry:false,assessment:{id:reviewId,status:'blocked',message:'Check the original request again; the prior assessment expired.',checkedAt:new Date(Date.now()-16*60000).toISOString()}};
 const h=await harness({saved,records:[parent]});assert.deepEqual(h.stored(),saved,'reload preserves the uncertain frozen submission');assert.equal(creationCalls(h).length,0);
 h.setSubmission(async()=>({ok:false,status:409,json:async()=>({code:'PURCHASE_REQUEST_REVIEW_CHANGED',error:'The prior assessment expired. Check the request again.'})}));
 await h.click('Check status and retry saved request');assert.equal(creationCalls(h).length,1);assert.deepEqual(creationCalls(h)[0].body,saved,'the first retry uses the original frozen child body');assert.equal(h.stored(),null,'known 404 after rejection clears only the unsaved child');
 assert.match(h.host.textContent,/Retry of REQ-0005/);assert.equal(h.byName('description').value,'Retain edited line after reload');assert.equal(h.byName('quantity').value,'2');assert.equal(h.byName('price').value,'75');assert.equal(h.byName('tax').value,'0');assert.equal(h.byName('requestorName').value,'Edited original requestor');assert.equal(h.byName('requestorEmail').value,'edited@example.test');assert.equal(h.byName('supplierReference').value,'Edited quote reference');
 assert.equal(h.byName('quote').required,true);assert.equal(h.byName('quote').value,'');assert.equal(h.calls.some(call=>call.path.endsWith('/quote')),false);assert.doesNotMatch(h.host.textContent,/JVBERi0xLjQK/);assert.equal(h.byText('Submit purchase request').disabled,true);await h.submit();assert.equal(creationCalls(h).length,1,'the restored blocked draft cannot submit');assert.ok(h.calls.some(call=>call.path==='/purchase-requests/'+originalId),'the parent review is refreshed');h.view.destroy();
});

test('late review responses cannot switch the selected request or leak into a changed account',async()=>{
 const second=request({id:'31cb3f51-f542-4f71-bd76-c7047a84bb91',displayReference:'REQ-0007',supplierName:'Second supplier'}),h=await harness({records:[request(),second]}),pending=deferred();await h.open();h.setReview(()=>pending.promise);await h.click('Check request');await h.open('REQ-0007');pending.resolve({request:request({review:{...request().review,note:'First review finished'}})});await settle();const details=h.walk().find(node=>node.className==='pr-details');assert.match(details.textContent,/Second supplier/);assert.doesNotMatch(details.textContent,/First review finished/);h.view.destroy();
 const account=await harness(),other=deferred();await account.open();account.setReview(()=>other.promise);await account.click('Check request');account.changeOwner('different-account');other.resolve({request:request({review:{...request().review,note:'Do not reveal this response'}})});await settle();assert.doesNotMatch(account.host.textContent,/Do not reveal this response/);assert.equal(creationCalls(account).length,0);account.view.destroy();
});

test('review closure and linked replacements stay readable with bidirectional request navigation',async()=>{
 const childId='f0475221-85b5-4cf8-bfd6-91de219fc3b8',parent=request(),child=request({id:childId,displayReference:'REQ-0006',state:'queued',review:null,retryOf:{id:originalId,displayReference:'REQ-0005'}});parent.review={...parent.review,status:'replaced',canRetry:false,canCheck:false,canClose:false,replacement:{id:childId,displayReference:'REQ-0006',state:'queued'}};
 const h=await harness({records:[parent,child],manage:false});await h.open();const details=()=>h.walk().find(node=>node.className==='pr-details');let linked=h.walk().filter(node=>node.tagName==='button'&&node.textContent.includes('REQ-0006')&&details().contains(node));assert.ok(linked.length,'parent detail links the replacement');linked[0].emit('click');await settle();assert.match(details().textContent,/REQ-0006/);linked=h.walk().filter(node=>node.tagName==='button'&&node.textContent.includes('REQ-0005')&&details().contains(node));assert.ok(linked.length,'child detail links the original');linked[0].emit('click');await settle();assert.match(details().textContent,/Fresh preparation failed/);noEnabledRetry(h);h.view.destroy();
});
