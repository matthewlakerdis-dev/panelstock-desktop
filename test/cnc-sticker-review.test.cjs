'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const api=require('../cnc-sticker-review.js');
const scope={project:'Demo Tower',orderNumber:'BATCH 7'};
const source={fileName:'demo-stickers.pdf',sha256:'a'.repeat(64),bytes:500};
const draft=(targetKey,panelNumber,sheetNumber='1',extra={})=>({targetKey,jobReference:scope.project,orderNumber:scope.orderNumber,sheetNumber,panelNumber,...extra});
const cap=(labelId,reference,side='L',parentReference='PANEL-A13')=>({labelId,reference,side,parentReference,evidence:'end-plate-label'});
const main=(labelId='label-main',reference='PANEL-A13',extra={})=>({page:1,labelId,reference,areaM2:1.237,warnings:[],project:scope.project,order:scope.orderNumber,date:'01-01-26',caps:[cap('label-l','PANEL-A13 EP-L'),cap('label-r','PANEL-A13 EP-R','R')],...extra});
const parsed=(rows=[main()],extra={})=>api.normalizeSource({rows,source,...extra});
const targets=()=>[draft('draft-main','PANEL-A13'),draft('draft-l','PANEL-A13 EP-L','2'),draft('draft-r','PANEL-A13 EP-R','3')];
const assignments=()=>({'label-main':'draft-main','label-l':'draft-l','label-r':'draft-r'});
const messages=value=>value.issues.join(' ');

test('source normalization retains printed precision and explicit end-plate evidence without modifying inputs',()=>{
 const input={rows:[main()],source},before=JSON.stringify(input),value=api.normalizeSource(input);
 assert.equal(value.rows[0].areaM2,1.237);assert.equal(value.rows[0].caps[0].evidence,'end-plate-label');assert.equal(value.source.sha256,source.sha256);assert.equal(JSON.stringify(input),before);
 const upper=parsed([main('a','PANEL-D9a',{caps:[cap('b','PANEL-D9a EP-B','B','PANEL-D9a'),cap('c','PANEL-D9a EP-T','T','PANEL-D9a')]})]);assert.deepEqual(upper.rows[0].caps.map(row=>row.side),['B','T']);assert.equal(upper.rows[0].reference,'PANEL-D9a');
});
test('malformed labels, duplicate source identities and unverified source metadata are rejected',()=>{
 const inputs=[{rows:null,source},{rows:[main('same','A',{caps:[]}),main('same','B',{caps:[]})],source},{rows:[main('a','A',{areaM2:0,caps:[]})],source},{rows:[main('a','A',{areaM2:Infinity,caps:[]})],source},{rows:[main('a','A',{areaM2:true,caps:[]})],source},{rows:[main('a','',{caps:[]})],source},{rows:[main('a','A',{caps:{}})],source},{rows:[main('a','A',{caps:[cap('a','A EP-L','L','A')]})],source},{rows:[main()],source:{...source,sha256:'unverified'}}];
 for(const input of inputs)assert.throws(()=>api.normalizeSource(input));
});
test('review stores the printed main-plus-caps area once and links caps across different physical sheets',()=>{
 const rows=targets(),input=parsed(),before=JSON.stringify({rows,input}),value=api.reviewDrafts(rows,scope,input,assignments());
 assert.equal(value.ready,true,messages(value));assert.deepEqual(value.issues,[]);assert.equal(value.totalArea,1.237);assert.equal(value.entries.length,3);
 const owner=value.entries.find(row=>row.role==='main');assert.equal(owner.targetKey,'draft-main');assert.equal(owner.areaM2,1.237);
 for(const entry of value.entries.filter(row=>row.role==='cap')){assert.equal(entry.mainTargetKey,'draft-main');assert.equal(entry.areaM2,undefined);}
 assert.equal(JSON.stringify({rows,input}),before);
});
test('only exact unique source and target labels are suggested, preserving suffixes and I versus 1',()=>{
 const input=parsed([main('a','PANEL-B8b',{caps:[]}),main('b','I23',{caps:[]}),main('c','A',{caps:[]})]),rows=[draft('suffix','PANEL-B8b'),draft('different','PANEL-B8a'),draft('digits','123'),draft('aggregate','A, B')],value=api.reviewDrafts(rows,scope,input,{});
 assert.equal(value.suggestions.a,'suffix');assert.equal(value.suggestions.b,undefined);assert.equal(value.suggestions.c,undefined);assert.equal(value.targets.length,4);assert.equal(value.targets.find(row=>row.targetKey==='aggregate').panelNumber,'A, B');assert.equal(value.entries.length,0);assert.equal(value.ready,false);
});
test('duplicate printed IDs and IDs reused across sheets never guess by list position',()=>{
 const duplicateSource=parsed([main('a','REPEAT',{caps:[]}),main('b','REPEAT',{caps:[]})]),one=api.reviewDrafts([draft('one','REPEAT')],scope,duplicateSource,{});assert.equal(one.suggestions.a,undefined);assert.equal(one.suggestions.b,undefined);
 const input=parsed([main('a','REPEAT',{caps:[]})]),two=api.reviewDrafts([draft('one','REPEAT','1'),draft('two','REPEAT','2')],scope,input,{});assert.equal(two.suggestions.a,undefined);
 const explicit=api.reviewDrafts([draft('two','REPEAT','2'),draft('one','REPEAT','1')],scope,input,{a:'one'});assert.equal(explicit.ready,true,messages(explicit));assert.equal(explicit.entries[0].targetKey,'one');
});
test('explicit decisions use stable draft identities and never split a legacy aggregate record',()=>{
 const rows=[draft('aggregate','OLD-A, OLD-B'),draft('new','OTHER')],input=parsed([main('a','OLD-A, OLD-B',{caps:[]})]),first=api.reviewDrafts(rows,scope,input,{a:'aggregate'}),second=api.reviewDrafts(rows.slice().reverse(),scope,input,{a:'aggregate'});
 assert.equal(first.targets.length,2);assert.equal(first.targets.find(row=>row.targetKey==='aggregate').panelNumber,'OLD-A, OLD-B');assert.deepEqual(second.entries,first.entries);assert.equal(first.entries.filter(entry=>entry.targetKey==='aggregate').length,1);assert.equal(first.totalArea,1.237);
});
test('unknown targets, stale source IDs and one draft assigned to several labels cannot yield a ready review',()=>{
 const input=parsed(),rows=targets();
 for(const map of [{'label-main':'missing','label-l':'draft-l','label-r':'draft-r'},{...assignments(),forged:'draft-main'},{...assignments(),'label-l':'draft-main'}]){const value=api.reviewDrafts(rows,scope,input,map);assert.equal(value.ready,false);assert.ok(value.issues.length);assert.equal(value.entries.some(entry=>entry.targetKey==='missing'),false);}
});
test('main omissions are explicit and cannot leave attached caps or a review with no area-owning main',()=>{
 const input=parsed(),rows=targets(),missing=api.reviewDrafts(rows,scope,input,{});assert.equal(missing.ready,false);assert.ok(missing.issues.length);
 const wrong=api.reviewDrafts(rows,scope,input,{'label-main':'__omit__','label-l':'draft-l','label-r':'__omit__'});assert.equal(wrong.ready,false);assert.ok(wrong.issues.length);
 const allOmitted=api.reviewDrafts(rows,scope,input,{'label-main':'__omit__','label-l':'__omit__','label-r':'__omit__'});assert.equal(allOmitted.ready,false);assert.equal(allOmitted.totalArea,0);assert.equal(allOmitted.entries.length,0);
});
test('unmatched caps can be explicitly left outside the schedule without creating rows or an exemption',()=>{
 const input=parsed(),rows=[draft('draft-main','PANEL-A13')],unselected=api.reviewDrafts(rows,scope,input,{'label-main':'draft-main'});
 assert.equal(unselected.suggestions['label-l'],'__omit__');assert.equal(unselected.suggestions['label-r'],'__omit__');assert.equal(unselected.targets.length,1);
 const selected=api.reviewDrafts(rows,scope,input,{'label-main':'draft-main','label-l':'__omit__','label-r':'__omit__'});assert.equal(selected.ready,true,messages(selected));assert.ok(selected.warnings.length);assert.equal(selected.entries.length,1);assert.equal(selected.entries[0].role,'main');assert.equal(selected.totalArea,1.237);
});
test('ambiguous cap matches require an explicit stable target decision',()=>{
 const rows=[draft('draft-main','PANEL-A13'),draft('cap-a','PANEL-A13 EP-L','2'),draft('cap-b','PANEL-A13 EP-L','3')],input=parsed([main('label-main','PANEL-A13',{caps:[cap('label-l','PANEL-A13 EP-L')]})]),value=api.reviewDrafts(rows,scope,input,{'label-main':'draft-main'});assert.equal(value.suggestions['label-l'],undefined);assert.equal(value.ready,false);assert.ok(value.issues.length);
 const decided=api.reviewDrafts(rows,scope,input,{'label-main':'draft-main','label-l':'cap-b'});assert.equal(decided.ready,true,messages(decided));assert.equal(decided.entries.find(row=>row.role==='cap').targetKey,'cap-b');
});
test('draft signatures are stable under reordering but change for target, scope, sheet or panel identity changes',()=>{
 const rows=targets(),first=api.draftSignature(rows,scope);assert.equal(typeof first,'string');assert.ok(first);assert.equal(api.draftSignature(rows.slice().reverse(),{orderNumber:scope.orderNumber,project:scope.project}),first);
 for(const change of [{targetKey:'new-key'},{panelNumber:'new-label'},{sheetNumber:'new-sheet'}])assert.notEqual(api.draftSignature([{...rows[0],...change},...rows.slice(1)],scope),first);
 assert.notEqual(api.draftSignature(rows,{...scope,project:'OTHER'}),first);assert.notEqual(api.draftSignature(rows,{...scope,orderNumber:'2'}),first);
});

const stableIds=()=>new Map([['draft-main','00000000-0000-4000-8000-000000000001'],['draft-l','00000000-0000-4000-8000-000000000002'],['draft-r','00000000-0000-4000-8000-000000000003']]);
function approved(rows=targets(),extra={}){return {reviewId:'sticker-review-request-0001',signature:api.draftSignature(rows,scope),scope,source,labels:parsed().rows,decisions:assignments(),areaGeneration:null,restoreEpoch:0,confirmed:true,scopeConfirmed:true,...extra};}
test('materialization resolves reviewed main/cap links only through the actual stable ID map',()=>{
 const rows=targets(),review=approved(rows),before=JSON.stringify({rows,review}),value=api.materializeReview(review,rows,stableIds());
 assert.equal(value.reviewId,review.reviewId);assert.equal(value.stickerReview.schemaVersion,1);assert.equal(value.stickerReview.confirmed,true);assert.equal(value.stickerReview.scopeConfirmed,true);assert.deepEqual(value.stickerReview.source,source);assert.deepEqual(value.stickerReview.scope,scope);assert.equal(new Set(value.panelRecordIds).size,3);
 assert.deepEqual(value.stickerReview.mappings.map(row=>row.panelId).sort(),[...stableIds().values()].sort());
 const mainId=stableIds().get('draft-main'),metadata=value.metadata.find(row=>row.panelId===mainId);assert.equal(metadata.sticker.role,'main');assert.equal(metadata.sticker.areaM2,1.237);
 for(const row of value.metadata.filter(row=>row.panelId!==mainId)){assert.equal(row.sticker.role,'cap');assert.equal(row.sticker.mainPanelId,mainId);assert.equal(row.sticker.areaM2,undefined);}
 assert.equal(JSON.stringify({rows,review}),before);
});
test('materialization rejects missing confirmation, changed drafts and missing or colliding persistent identities',()=>{
 const rows=targets();for(const patch of [{confirmed:false},{scopeConfirmed:false},{signature:'outdated'},{decisions:{...assignments(),forged:'draft-main'}}])assert.throws(()=>api.materializeReview(approved(rows,patch),rows,stableIds()));
 assert.throws(()=>api.materializeReview(approved(rows),[{...rows[0],panelNumber:'LATER-EDIT'},...rows.slice(1)],stableIds()));
 const missing=stableIds();missing.delete('draft-l');assert.throws(()=>api.materializeReview(approved(rows),rows,missing));
 const duplicate=stableIds();duplicate.set('draft-l',duplicate.get('draft-main'));assert.throws(()=>api.materializeReview(approved(rows),rows,duplicate));
});
test('equal printed areas on distinct main panels remain additive rather than being deduplicated by value',()=>{
 const rows=[draft('a','A'),draft('b','B')],input=parsed([main('source-a','A',{caps:[]}),main('source-b','B',{caps:[]})]),value=api.reviewDrafts(rows,scope,input,{'source-a':'a','source-b':'b'});assert.equal(value.ready,true,messages(value));assert.equal(value.entries.length,2);assert.equal(value.totalArea,1.237*2);
});
test('printed scope discrepancies remain visible and another order’s draft is never an automatic target',()=>{
 const rows=[draft('local','PANEL-A13'),draft('foreign','OTHER','1',{jobReference:'OTHER JOB',orderNumber:'OTHER ORDER'})],input=parsed([main('main','PANEL-A13',{project:'DIFFERENT PRINTED JOB',order:'2',caps:[]})]),value=api.reviewDrafts(rows,scope,input,{main:'local'});assert.equal(value.scopeMismatch,true);assert.ok(value.warnings.length);
 const other=api.reviewDrafts(rows,scope,parsed([main('foreign-label','OTHER',{caps:[]})]),{'foreign-label':'foreign'});assert.equal(other.suggestions['foreign-label'],undefined);assert.equal(other.ready,false);assert.ok(other.issues.length);assert.equal(other.entries.some(entry=>entry.targetKey==='foreign'),false);
});

function nodes(value){return Array.isArray(value)?value.flatMap(nodes):value&&typeof value==='object'?[value,...nodes(value.children)]:[];}
const words=all=>all.flatMap(node=>(Array.isArray(node.children)?node.children:[node.children]).filter(value=>typeof value==='string'||typeof value==='number')).join(' ');
function runtime(){
 const state=[],effects=[];let cursor=0;
 const React={Fragment:'fragment',createElement:(type,props,...children)=>({...props,type,children:children.length?children:props?.children}),useState(initial){const i=cursor++;if(!(i in state))state[i]=typeof initial==='function'?initial():initial;return [state[i],value=>state[i]=typeof value==='function'?value(state[i]):value];},useRef(initial){const i=cursor++;if(!(i in state))state[i]={current:initial};return state[i];},useEffect(fn,deps){const i=cursor++,old=state[i];if(!old||deps.some((value,j)=>value!==old.deps[j])){state[i]={deps};effects.push(()=>{old?.cleanup?.();state[i].cleanup=fn();});}}};
 return {React,draw(props){cursor=0;return nodes(api.View(props));},async flush(){for(const run of effects.splice(0))run();await new Promise(setImmediate);},unmount(){for(const value of state)value?.cleanup?.();}};
}
function view(t,reader=async()=>parsed(),extra={}){
 const old=globalThis.PanelStockCncStickerParser,crypto=Object.getOwnPropertyDescriptor(globalThis,'crypto');globalThis.PanelStockCncStickerParser={extractPdf:reader};Object.defineProperty(globalThis,'crypto',{configurable:true,value:{randomUUID:()=> '00000000-0000-4000-8000-000000000099'}});t.after(()=>{if(old===undefined)delete globalThis.PanelStockCncStickerParser;else globalThis.PanelStockCncStickerParser=old;if(crypto)Object.defineProperty(globalThis,'crypto',crypto);else delete globalThis.crypto;});
 const rt=runtime(),changes=[],props={React:rt.React,rows:targets(),scope,base:'https://example.test',loadContext:async()=>({ok:true,areaGeneration:null,restoreEpoch:0}),onChange:value=>changes.push(value),...extra};
 return {rt,props,changes,draw:()=>rt.draw(props),async settle(){for(let i=0;i<3;i++){rt.draw(props);await rt.flush();}return rt.draw(props);},get latest(){return changes.at(-1);}};
}
const file={name:source.fileName,type:'application/pdf',size:source.bytes};
function input(v,label){const found=v.draw().find(node=>node['aria-label']===label);assert.ok(found,label);return found;}
async function change(v,label,value,checkbox=false){await input(v,label).onChange({target:checkbox?{checked:value}:{value}});return v.settle();}
async function upload(v,next=file){await input(v,'Panel stickers PDF').onChange({target:{files:[next],value:'selected'}});return v.settle();}
async function confirm(v){return change(v,'Confirm reviewed sticker areas and cap links',true,true);}
async function click(v,label){const found=v.draw().find(node=>node.type==='button'&&node.children?.includes?.(label));assert.ok(found,label);await found.onClick();return v.settle();}

test('optional upload blocks scheduling immediately and only emits a ready review after explicit confirmation',async t=>{
 let finish;const v=view(t,()=>new Promise(resolve=>{finish=resolve;}));await v.settle();assert.deepEqual(v.latest,{attached:false,ready:true,review:null});
 const request=input(v,'Panel stickers PDF').onChange({target:{files:[file],value:'selected'}});assert.deepEqual(v.latest,{attached:true,ready:false,review:null});assert.equal(input(v,'Panel stickers PDF').disabled,true);
 finish(parsed());await request;let all=await v.settle();assert.equal(v.latest.ready,false);assert.equal(v.latest.review,null);assert.equal(input(v,'Scheduling row for label-main').value,'draft-main');assert.equal(input(v,'Scheduling row for label-l').value,'draft-l');assert.match(words(all),/1\.237 m² including caps/);assert.match(words(all),/QA exemption planned/);
 await confirm(v);assert.equal(v.latest.ready,true);assert.equal(v.latest.review.confirmed,true);assert.equal(v.latest.review.decisions['label-r'],'draft-r');assert.deepEqual(v.latest.review.scope,scope);assert.equal(v.latest.review.signature,api.draftSignature(v.props.rows,scope));assert.equal('status' in v.latest.review,false);
});
test('changing a main/cap decision clears prior confirmation without altering the scheduling records',async t=>{
 const rows=targets(),before=JSON.stringify(rows),v=view(t,async()=>parsed(),{rows});await v.settle();await upload(v);await confirm(v);assert.equal(v.latest.ready,true);
 await change(v,'Scheduling row for label-l','__omit__');assert.equal(v.latest.ready,false);assert.equal(v.latest.review,null);assert.equal(input(v,'Confirm reviewed sticker areas and cap links').checked,false);
 await confirm(v);assert.equal(v.latest.ready,true);assert.equal(v.latest.review.decisions['label-l'],'__omit__');assert.equal(JSON.stringify(rows),before);
});
test('draft reordering preserves a reviewed decision, while edited panel identities invalidate it',async t=>{
 const v=view(t);await v.settle();await upload(v);await confirm(v);const original=v.latest.review.signature;v.props.rows=v.props.rows.slice().reverse();await v.settle();assert.equal(v.latest.ready,true);assert.equal(v.latest.review.signature,original);
 v.props.rows=v.props.rows.map(row=>row.targetKey==='draft-main'?{...row,panelNumber:'CHANGED-MAIN'}:row);await v.settle();assert.equal(v.latest.ready,false);assert.equal(v.latest.review,null);assert.equal(input(v,'Scheduling row for label-main').value,'');assert.equal(input(v,'Confirm reviewed sticker areas and cap links').checked,false);assert.equal(input(v,'Confirm reviewed sticker areas and cap links').disabled,true);
});
test('printed project/order mismatches require a separate acknowledgement followed by review confirmation',async t=>{
 const nextScope={project:'Selected project',orderNumber:'2'},v=view(t,async()=>parsed(),{scope:nextScope,rows:targets().map(row=>({...row,jobReference:nextScope.project,orderNumber:nextScope.orderNumber}))});await v.settle();await upload(v);assert.equal(v.latest.ready,false);assert.equal(input(v,'Confirm reviewed sticker areas and cap links').disabled,true);
 await change(v,'Confirm sticker project and order mismatch',true,true);assert.equal(v.latest.ready,false);assert.equal(input(v,'Confirm reviewed sticker areas and cap links').checked,false);await confirm(v);assert.equal(v.latest.ready,true);assert.deepEqual(v.latest.review.scope,nextScope);
 v.props.scope={...nextScope,orderNumber:'3'};v.props.rows=v.props.rows.map(row=>({...row,orderNumber:'3'}));await v.settle();assert.equal(v.latest.ready,false);assert.equal(input(v,'Confirm sticker project and order mismatch').checked,false);assert.equal(input(v,'Confirm reviewed sticker areas and cap links').checked,false);
});
test('a failed PDF stays attached and blocks scheduling until it is successfully reviewed or explicitly removed',async t=>{
 const v=view(t,async()=>{throw Error('No readable panel header');});await v.settle();const all=await upload(v);assert.equal(v.latest.attached,true);assert.equal(v.latest.ready,false);assert.equal(v.latest.review,null);assert.match(words(all),/No readable panel header/);assert.equal(v.draw().some(node=>node['aria-label']==='Scheduling row for label-main'),false);
 await click(v,'Remove sticker PDF');assert.deepEqual(v.latest,{attached:false,ready:true,review:null});
});
test('an asynchronous PDF result uses the current draft rows instead of assigning removed targets',async t=>{
 let finish;const v=view(t,()=>new Promise(resolve=>{finish=resolve;}));await v.settle();const request=input(v,'Panel stickers PDF').onChange({target:{files:[file],value:'selected'}});
 v.props.rows=[draft('replacement','UNRELATED')];await v.settle();finish(parsed());await request;await v.settle();assert.equal(input(v,'Scheduling row for label-main').value,'');assert.equal(v.latest.ready,false);assert.equal(v.latest.review,null);const options=v.draw().filter(node=>node.type==='option').map(node=>node.value);assert.equal(options.includes('draft-main'),false);assert.equal(options.includes('replacement'),true);
});
test('unmounting during PDF extraction ignores its late result and cannot emit a successful review',async t=>{
 let finish;const v=view(t,()=>new Promise(resolve=>{finish=resolve;}));await v.settle();const request=input(v,'Panel stickers PDF').onChange({target:{files:[file],value:'selected'}}),count=v.changes.length;v.rt.unmount();finish(parsed());await request;assert.equal(v.changes.length,count);assert.equal(v.changes.some(value=>value.review),false);
});

test('explicit matching cannot attach an A sticker to a differently named physical record',()=>{
 const value=api.reviewDrafts([draft('target','B')],scope,parsed([main('label','A',{caps:[]})]),{label:'target'});assert.equal(value.ready,false);assert.match(messages(value),/does not match/);assert.equal(value.entries.length,0);
});
test('materialization requires explicit validated reset-generation and restore-epoch context',()=>{
 const rows=targets();for(const patch of [{areaGeneration:undefined},{areaGeneration:0},{areaGeneration:''},{restoreEpoch:undefined},{restoreEpoch:-1},{restoreEpoch:1.5}])assert.throws(()=>api.materializeReview(approved(rows,patch),rows,stableIds()));
 const value=api.materializeReview(approved(rows,{areaGeneration:'area-reset-generation-001',restoreEpoch:9}),rows,stableIds());assert.equal(value.stickerReview.areaGeneration,'area-reset-generation-001');assert.equal(value.stickerReview.restoreEpoch,9);
});
test('confirmation cannot become ready with failed or malformed current context, and includes valid fresh tokens',async t=>{
 const v=view(t);await v.settle();await upload(v);
 for(const context of [undefined,{ok:false},{ok:true,restoreEpoch:0},{ok:true,areaGeneration:7,restoreEpoch:0},{ok:true,areaGeneration:null,restoreEpoch:-1},{ok:true,areaGeneration:null,restoreEpoch:0.5}]){v.props.loadContext=async()=>context;await confirm(v);assert.equal(v.latest.ready,false);assert.equal(v.latest.review,null);assert.match(words(v.draw()),/context could not be verified/);}
 v.props.loadContext=async()=>{throw Error('Context unavailable offline');};await confirm(v);assert.equal(v.latest.ready,false);assert.match(words(v.draw()),/Context unavailable offline/);
 v.props.loadContext=async()=>({ok:true,areaGeneration:'generation-002',restoreEpoch:4});await confirm(v);assert.equal(v.latest.ready,true);assert.equal(v.latest.review.areaGeneration,'generation-002');assert.equal(v.latest.review.restoreEpoch,4);
});
test('a draft edit while confirmation context is loading invalidates the response and requires fresh review',async t=>{
 let finish,calls=0;const v=view(t,async()=>parsed(),{loadContext:()=>{calls++;return new Promise(resolve=>{finish=resolve;});}});await v.settle();await upload(v);
 const checkbox=input(v,'Confirm reviewed sticker areas and cap links'),pending=checkbox.onChange({target:{checked:true}});await checkbox.onChange({target:{checked:true}});assert.equal(calls,1);assert.equal(v.latest.ready,false);
 v.props.rows=v.props.rows.map(row=>row.targetKey==='draft-main'?{...row,sheetNumber:'99'}:row);await v.settle();finish({ok:true,areaGeneration:null,restoreEpoch:0});await pending;await v.settle();assert.equal(v.latest.ready,false);assert.equal(v.latest.review,null);assert.equal(input(v,'Confirm reviewed sticker areas and cap links').checked,false);assert.match(words(v.draw()),/Scheduling rows changed/);
});
const member=(id,mainPanelId='main',reviewId='old-review',role='cap',extra={})=>({id,jobReference:scope.project,orderNumber:scope.orderNumber,sheetNumber:id,stockItemType:'variant',stockItemId:'stock-1',stockSku:'SKU-1',sheetWidth:3000,sheetHeight:1200,totalPanelArea:2,panelAreaScope:'sheet',panelNumber:id,pdfRevision:1,status:'pending',sticker:{reviewId,mainPanelId,role,...(role==='main'?{areaM2:1.237}:{})},...extra});
const assembly=()=>[member('main','main','old-review','main'),member('cap-l'),member('cap-r'),member('other','other','old-review','main'),member('newer','main','different-review','main')];
test('changing a linked physical row selects its complete cross-sheet assembly and leaves unrelated groups alone',()=>{
 const panels=assembly(),before=JSON.stringify(panels),next={...panels[0],stockItemId:'stock-2'},plan=api.assemblyChangePlan(panels,[next]);assert.equal(plan.blocked,false);assert.deepEqual(plan.panelIds,['cap-l','cap-r','main']);assert.equal(plan.rows.length,3);assert.equal(plan.rows.some(row=>row.id==='other'||row.id==='newer'),false);assert.equal(JSON.stringify(panels),before);
 assert.throws(()=>api.confirmedClear(plan),/Confirm removal/);const ids=api.confirmedClear(plan,{clearStickerSignature:plan.signature,clearStickerPanelIds:plan.panelIds});assert.deepEqual([...ids].sort(),plan.panelIds);
 const cleared=api.clearAssignments(panels,ids);assert.equal(cleared.filter(row=>row.sticker).length,2);assert.deepEqual(cleared.find(row=>row.id==='other'),panels.find(row=>row.id==='other'));assert.equal(panels[0].sticker.reviewId,'old-review');
});
test('any already-cut member blocks assembly clearing even when the edited member remains pending',()=>{
 const panels=assembly().map(row=>row.id==='cap-r'?{...row,status:'completed',completedAt:'2026-11-26T00:00:00Z'}:row),plan=api.assemblyChangePlan(panels,[{...panels[0],sheetWidth:2400}]);assert.equal(plan.blocked,true);assert.deepEqual(plan.panelIds,['cap-l','cap-r','main']);assert.throws(()=>api.confirmedClear(plan,{clearStickerSignature:plan.signature,clearStickerPanelIds:plan.panelIds}),/already been cut/);
});
test('ID-only corrections and offcut decisions preserve sticker links while physical revisions require full review',()=>{
 const panels=assembly(),before=panels[0],changed={...before,panelNumber:'CORRECTED-ID',pendingOffcuts:[{length:500,width:1200}],uploadedAt:'later'};assert.equal(api.physicalKey(before),api.physicalKey(changed));assert.deepEqual(api.assemblyChangePlan(panels,[changed]).panelIds,[]);
 assert.notEqual(api.physicalKey(before),api.physicalKey({...before,pdfRevision:2}));assert.deepEqual(api.assemblyChangePlan(panels,[{...before,pdfRevision:2}]).panelIds,['cap-l','cap-r','main']);
});
test('clear confirmation signatures change when any linked member state or physical revision changes',()=>{
 const panels=assembly(),next=[{...panels[0],stockItemId:'stock-2'}],first=api.assemblyChangePlan(panels,next).signature;
 assert.notEqual(api.assemblyChangePlan(panels.map(row=>row.id==='cap-l'?{...row,status:'completed'}:row),next).signature,first);
 assert.notEqual(api.assemblyChangePlan(panels.map(row=>row.id==='cap-l'?{...row,pdfRevision:2}:row),next).signature,first);
});
test('cap-parent evidence and bounded warning metadata fail closed before a backend save can be attempted',()=>{
 const invalid=[main('a','A',{caps:[cap('b','B EP-L','L','A')]}),main('a','A',{caps:[cap('b','A EP-L','L','OTHER')]}),main('a','A',{caps:[cap('b','A EP-L','L','A'),cap('c','A EP-L','L','A')]}),main('x'.repeat(121),'A',{caps:[]}),main('a','A',{warnings:Array.from({length:31},()=> 'warning'),caps:[]}),main('a','A',{warnings:['x'.repeat(1001)],caps:[]})];
 for(const row of invalid)assert.throws(()=>parsed([row]));
});
