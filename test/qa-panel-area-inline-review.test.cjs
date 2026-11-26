'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const modulePath=path.join(__dirname,'../qa-panel-area-import.js'),api=require(modulePath);
const scope={project:'Demo Tower',orderNumber:'042'},row=(reference='PANEL-A',page=1)=>({page,reference,areaM2:.859,project:scope.project,order:scope.orderNumber,date:'24-11-26'});
const item=(id,extra={})=>({id,kind:'panel',project:scope.project,orderNumber:scope.orderNumber,reference:'PANEL-A',sheetNumber:'1',status:'awaiting',cutAt:'2026-11-20T01:00:00Z',cutBy:'Bob',latest:null,panelAreaRevision:0,...extra});
const candidates=()=>[item('qa-approved-record',{sheetNumber:'2',status:'approved',cutAt:'2026-11-01T02:00:00Z',cutBy:'Alice',panelArea:{method:'manual',areaM2:2},panelAreaRevision:3,latest:{id:'old-inspection'}}),item('qa-awaiting-record',{sheetNumber:'9',isRemake:true,remakeReason:'Dimension correction'}),item('qa-exempt-cap',{sheetNumber:'10',status:'not_required'})];
const plain=value=>JSON.parse(JSON.stringify(value));
test('duplicate QA references require an explicit stable record choice, including when only one candidate is eligible',()=>{
 for(const items of [candidates(),[item('one'),item('failed',{status:'recut'})]]){const result=api.matchRows([row()],items,scope,true)[0];assert.equal(result.state,'review');assert.equal(result.item,undefined);assert.notEqual(result.matchConfirmed,true);assert.deepEqual(result.candidates.map(candidate=>candidate.id).sort(),items.map(candidate=>candidate.id).sort());}
});
test('an explicit candidate binds the stable ID and the entire sorted candidate set while preserving overwrite rules',()=>{
 const items=candidates(),picked=api.matchRows([row()],items,scope,true,{1:'qa-awaiting-record'})[0];assert.equal(picked.state,'ready');assert.equal(picked.item.id,'qa-awaiting-record');assert.equal(picked.matchConfirmed,true);assert.deepEqual(picked.expectedCandidateIds,items.map(item=>item.id).sort());
 const replace=api.matchRows([row()],items,scope,true,{1:'qa-approved-record'})[0];assert.equal(replace.state,'replace');assert.equal(replace.item.panelArea.areaM2,2);
 assert.equal(api.matchRows([row()],items,scope,false,{1:'qa-approved-record'})[0].state,'blocked');
 for(const status of ['recut','replaced','not_required'])assert.equal(api.matchRows([row()],[item('safe'),item('unsafe',{status})],scope,true,{1:'unsafe'})[0].state,'blocked');
});
test('manual choices cannot cross the selected project, literal order or printed panel ID',()=>{
 const items=[...candidates(),item('foreign-project',{project:'Another Tower'}),item('foreign-order',{orderNumber:'42'}),item('foreign-reference',{reference:'PANEL-B'})];
 for(const id of ['foreign-project','foreign-order','foreign-reference','unknown-record']){const picked=api.matchRows([row()],items,scope,true,{1:id})[0];assert.ok(!['ready','replace'].includes(picked.state));assert.notEqual(picked.matchConfirmed,true);}
 const picked=api.matchRows([row()],items,scope,true,{1:'qa-awaiting-record'})[0];assert.deepEqual(picked.expectedCandidateIds,candidates().map(item=>item.id).sort());
});
test('duplicate labels in the PDF remain blocked even when different candidate choices were supplied',()=>{
 const results=api.matchRows([row(),row('PANEL-A',2)],candidates(),scope,true,{1:'qa-approved-record',2:'qa-awaiting-record'});assert.ok(results.every(result=>result.state==='blocked'));assert.ok(results.every(result=>result.matchConfirmed!==true));
});

function elements(value){return Array.isArray(value)?value.flatMap(elements):value&&typeof value==='object'?[value,...elements(value.props?.children)]:[];}
function words(value){return Array.isArray(value)?value.map(words).join(' '):value==null||typeof value==='boolean'?'':typeof value==='object'?words(value.props?.children):String(value);}
function viewFixture(initialItems=candidates(),initialRows=[row()],options={}){
 const state=[],effects=[];let cursor=0,importCount=0,closed=0;
 const h=(type,props,...children)=>({type,props:{...props,...(children.length?{children:children.length===1?children[0]:children}:{})}}),React={createElement:h,Fragment:'fragment',useState(initial){const slot=cursor++;if(!(slot in state))state[slot]=typeof initial==='function'?initial():initial;return [state[slot],value=>{state[slot]=typeof value==='function'?value(state[slot]):value;}];},useRef(initial){const slot=cursor++;if(!(slot in state))state[slot]={current:initial};return state[slot];},useEffect(run,deps=[]){const slot=cursor++,old=state[slot];if(!old||deps.some((value,index)=>!Object.is(value,old.deps[index]))){state[slot]={deps};effects.push(()=>{old?.cleanup?.();state[slot].cleanup=run();});}}};
 const context={module:{exports:{}},crypto:{randomUUID:()=> 'inline-area-import-request-'+(++importCount)},Date,Map,Set,Number,String,JSON,__extractPdf:async()=>structuredClone(initialRows)};
 // Mock the PDF-reader boundary; matching, choices, preview and save use the real module.
 const source=fs.readFileSync(modulePath,'utf8').replace('  const api={','  extractPdf=async file=>__extractPdf(file);\n  const api={');assert.notEqual(source,fs.readFileSync(modulePath,'utf8'));vm.runInNewContext(source,context,{filename:modulePath});
 const currentApi=context.module.exports,calls=[],saved=[],props={React,items:initialItems,canManage:options.canManage??true,base:'https://worker.test',request:async(url,requestOptions={})=>{const call={url,options:requestOptions,body:requestOptions.body?JSON.parse(requestOptions.body):null};calls.push(call);if(options.request)return options.request(call);if(url.endsWith('/qa/queue'))return {response:{ok:true,status:200},result:{ok:true,items:options.refreshedItems||initialItems,dispatches:[]}};return {response:{ok:true,status:200},result:{ok:true,savedCount:call.body.rows.length,items:call.body.rows.map(item=>({id:item.id,kind:'panel',panelArea:item.panelArea,panelAreaRevision:1}))}};},onSaved:value=>saved.push(value),onClose:()=>closed++};
 function draw(){cursor=0;return elements(currentApi.View(props));}
 async function settle(){for(let n=0;n<3;n++){draw();for(const effect of effects.splice(0))effect();await Promise.resolve();}return draw();}
 const find=label=>draw().find(node=>node.props['aria-label']===label),button=label=>draw().find(node=>node.type==='button'&&words(node)===label);
 async function chooseScope(value=scope){const select=draw().find(node=>node.type==='select');assert.ok(select,'Target project / order selector');select.props.onChange({target:{value:JSON.stringify([value.project,value.orderNumber])}});await settle();}
 async function upload(){const file=draw().find(node=>node.type==='input'&&node.props.type==='file');assert.ok(file);await file.props.onChange({target:{files:[{name:'synthetic-stickers.pdf',size:10}],value:'file'}});await settle();}
 async function pick(id,reference='PANEL-A'){const radio=find(`Choose QA item ${id} for panel ${reference}`);assert.ok(radio,'Inline stable record selector '+id);radio.props.onChange({target:{checked:true,value:id}});await settle();}
 async function use(reference='PANEL-A'){const checkbox=find('Import panel '+reference);assert.ok(checkbox,'Explicit Use checkbox');checkbox.props.onChange({target:{checked:true}});await settle();}
 async function confirm(){const checkbox=draw().find(node=>node.type==='input'&&node.props.type==='checkbox'&&!node.props['aria-label']);assert.ok(checkbox,'Final project/order and area confirmation');checkbox.props.onChange({target:{checked:true}});await settle();}
 async function save(){const saveButton=draw().find(node=>node.type==='button'&&/^Save \d+ panel areas$/.test(words(node)));assert.ok(saveButton);await saveButton.props.onClick();await settle();}
 return {draw,settle,find,button,chooseScope,upload,pick,use,confirm,save,calls,saved,props,state,get closed(){return closed;}};
}
async function ready(items,rows,options){const view=viewFixture(items,rows,options);await view.settle();await view.chooseScope();await view.upload();return view;}
test('inline candidate cards show physical sheet, status, cutter/date and record identity without selecting a duplicate',async()=>{
 const view=await ready(),all=view.draw(),text=words(all);assert.match(text,/Sheet 2/);assert.match(text,/Sheet 9/);assert.match(text,/Approved/);assert.match(text,/Awaiting QA/);assert.match(text,/Alice/);assert.match(text,/Bob/);assert.match(text,/2026/);assert.match(text,/2\.000/);
 for(const item of candidates()){const radio=view.find(`Choose QA item ${item.id} for panel PANEL-A`);assert.ok(radio);assert.notEqual(radio.props.checked,true);}assert.equal(view.find('Choose QA item qa-exempt-cap for panel PANEL-A').props.disabled,true);assert.equal(view.find('Import panel PANEL-A'),undefined);assert.equal(view.calls.length,0);
});
test('selecting a duplicate record starts with Use off and posts only the reviewed stable identity with all guards',async()=>{
 const view=await ready();await view.pick('qa-awaiting-record');assert.equal(view.find('Import panel PANEL-A').props.checked,false);await view.save();assert.equal(view.calls.length,0);await view.use();await view.confirm();await view.save();
 const body=view.calls.find(call=>call.body)?.body;assert.equal(body.project,scope.project);assert.equal(body.orderNumber,'042');assert.equal(body.rows.length,1);assert.equal(body.rows[0].id,'qa-awaiting-record');assert.equal(body.rows[0].matchConfirmed,true);assert.deepEqual(body.rows[0].expectedCandidateIds,candidates().map(item=>item.id).sort());assert.equal(body.rows[0].cutAt,candidates()[1].cutAt);assert.equal(body.rows[0].expectedAttemptId,null);assert.equal(body.rows[0].expectedAreaRevision,0);assert.equal(body.rows[0].panelArea.areaM2,.859);assert.equal(view.saved.length,1);
});
test('changing a candidate clears Use and the final confirmation before any different record can be saved',async()=>{
 const view=await ready();await view.pick('qa-awaiting-record');await view.use();await view.confirm();await view.pick('qa-approved-record');assert.equal(view.find('Import panel PANEL-A').props.checked,false);await view.save();assert.equal(view.calls.length,0);await view.use();await view.save();assert.equal(view.calls.length,0);await view.confirm();await view.save();assert.equal(view.calls[0].body.rows[0].id,'qa-approved-record');assert.equal(view.calls[0].body.rows[0].expectedAreaRevision,3);
});
test('refresh uses the returned queue, drops old manual choices and requires reselecting current candidate guards',async()=>{
 const latest=candidates().map(item=>item.id==='qa-awaiting-record'?{...item,cutAt:'2026-11-27T06:00:00Z',panelAreaRevision:5,latest:{id:'fresh-inspection'}}:item),view=await ready(undefined,undefined,{refreshedItems:latest});await view.pick('qa-awaiting-record');await view.use();await view.confirm();await view.button('Review latest matches').props.onClick();await view.settle();assert.equal(view.find('Import panel PANEL-A'),undefined);assert.ok(view.draw().filter(node=>node.props.type==='radio').every(node=>!node.props.checked));await view.save();assert.equal(view.calls.filter(call=>call.body).length,0);
 await view.pick('qa-awaiting-record');assert.equal(view.find('Import panel PANEL-A').props.checked,false);await view.use();await view.confirm();await view.save();const body=view.calls.find(call=>call.body).body;assert.equal(body.rows[0].cutAt,'2026-11-27T06:00:00Z');assert.equal(body.rows[0].expectedAttemptId,'fresh-inspection');assert.equal(body.rows[0].expectedAreaRevision,5);
});
test('a missing former candidate remains unselected after refresh and cannot be posted from stale cached props',async()=>{
 const remaining=[candidates()[0],candidates()[2]],view=await ready(undefined,undefined,{refreshedItems:remaining});await view.pick('qa-awaiting-record');await view.use();await view.confirm();await view.button('Review latest matches').props.onClick();await view.settle();assert.equal(view.find('Choose QA item qa-awaiting-record for panel PANEL-A'),undefined);assert.equal(view.find('Import panel PANEL-A'),undefined);await view.pick('qa-approved-record');await view.use();await view.confirm();await view.save();const body=view.calls.find(call=>call.body).body;assert.equal(body.rows[0].id,'qa-approved-record');assert.deepEqual(body.rows[0].expectedCandidateIds,remaining.map(item=>item.id).sort());
});
test('scope changes cannot carry a selected record into another project or a different literal order',async()=>{
 const foreign=[item('other-one',{project:'Another Tower'}),item('other-two',{project:'Another Tower',sheetNumber:'8'})],view=await ready([...candidates(),...foreign]);await view.pick('qa-awaiting-record');await view.use();await view.confirm();await view.chooseScope({project:'Another Tower',orderNumber:'042'});assert.equal(view.find('Choose QA item qa-awaiting-record for panel PANEL-A'),undefined);assert.ok(view.find('Choose QA item other-one for panel PANEL-A'));assert.equal(view.find('Import panel PANEL-A'),undefined);await view.save();assert.equal(view.calls.length,0);
});
test('duplicate stable identities cannot be emitted twice in one area-import request',async()=>{
 const items=[item('same-id'),item('same-id',{reference:'PANEL-B',sheetNumber:'3'})],view=await ready(items,[row(),row('PANEL-B',2)]);await view.confirm();await view.save();assert.equal(view.calls.length,0);assert.match(words(view.draw()),/duplicate|same.*record|once|identity/i);
});
test('an already recorded matching area is visible but is never posted as an area change',async()=>{
 const items=candidates().map(item=>item.id==='qa-awaiting-record'?{...item,panelArea:{method:'manual',areaM2:.859}}:item),view=await ready(items);await view.pick('qa-awaiting-record');assert.match(words(view.draw()),/already recorded/i);assert.equal(view.find('Import panel PANEL-A'),undefined);await view.save();assert.equal(view.calls.length,0);
});
test('clearing a manual match removes the chosen identity and requires choosing and checking it again',async()=>{
 const view=await ready();await view.pick('qa-awaiting-record');await view.use();await view.confirm();const clear=view.find('Clear QA match for panel PANEL-A');assert.ok(clear);clear.props.onClick();await view.settle();assert.equal(view.find('Import panel PANEL-A'),undefined);assert.ok(view.draw().filter(node=>node.props.type==='radio').every(node=>!node.props.checked));await view.save();assert.equal(view.calls.length,0);await view.pick('qa-awaiting-record');assert.equal(view.find('Import panel PANEL-A').props.checked,false);await view.use();await view.save();assert.equal(view.calls.length,0);
});
test('choosing another sticker file clears candidate choices and confirmations without changing the selected project',async()=>{
 const view=await ready();await view.pick('qa-awaiting-record');await view.use();await view.confirm();await view.upload();assert.equal(view.find('Import panel PANEL-A'),undefined);assert.ok(view.draw().filter(node=>node.props.type==='radio').every(node=>!node.props.checked));assert.equal(view.draw().find(node=>node.type==='select').props.value,JSON.stringify([scope.project,scope.orderNumber]));await view.save();assert.equal(view.calls.length,0);
});
test('missing legacy cut dates remain explicit and restricted approved candidates are disabled in the picker',async()=>{
 const legacy=item('legacy-record',{cutAt:null,cutBy:'Unknown',sheetNumber:'',isRemake:false}),view=await ready([legacy,candidates()[0]],undefined,{canManage:false});assert.match(words(view.draw()),/Date not recorded/);assert.match(words(view.draw()),/Record: legacy-record/);assert.equal(view.find('Choose QA item qa-approved-record for panel PANEL-A').props.disabled,true);assert.notEqual(view.find('Choose QA item legacy-record for panel PANEL-A').props.disabled,true);assert.ok(view.draw().filter(node=>node.props.type==='radio').every(node=>!node.props.checked));assert.equal(view.calls.length,0);
});
test('retrying a lost response preserves the exact chosen candidate proof and import identity',async()=>{
 let tries=0;const view=await ready(undefined,undefined,{request:async call=>{if(++tries===1)throw Error('Connection lost after save');return {response:{ok:true,status:200},result:{ok:true,savedCount:1,items:call.body.rows.map(row=>({id:row.id,kind:'panel',panelArea:row.panelArea}))}};}});await view.pick('qa-awaiting-record');await view.use();await view.confirm();await view.save();assert.equal(view.saved.length,0);assert.match(words(view.draw()),/Connection lost after save/);await view.save();assert.equal(view.calls.length,2);assert.equal(view.calls[0].options.body,view.calls[1].options.body);assert.equal(view.calls[1].body.rows[0].matchConfirmed,true);assert.deepEqual(view.calls[1].body.rows[0].expectedCandidateIds,candidates().map(item=>item.id).sort());assert.equal(view.saved.length,1);
});
