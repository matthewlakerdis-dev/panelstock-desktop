const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {parsePage,matchRows}=require('../qa-panel-area-import.js');
const drawing=(id='A-1',area='0.859')=>`ORDER:\n Batch 2\nPANEL\nID:\n ${id}\nDATE:\n24-11-26\nm2:\n ${area}\nProject\nName:\nTest tower\nMeasured\nby:\nSITE\nEND PLATES A-1 EP-L A-1 EP-R\n999 x 999`;
const item=(id='a',extra={})=>({id,kind:'panel',project:'Test tower',orderNumber:'42',reference:'A-1',status:'awaiting',...extra});
test('sticker extraction takes the labelled main panel area and never assigns unlabelled end plate or bounding-box dimensions',()=>{
 assert.deepEqual(parsePage(drawing(),1),{page:1,reference:'A-1',areaM2:.859,order:'Batch 2',project:'Test tower',date:'24-11-26'});
 assert.equal(parsePage(drawing('Z5W1-4a','1.212').replace('m2:','m²:'),2).reference,'Z5W1-4a');
 for(const area of ['0','-1','NaN','Infinity','999999','0.859oops'])assert.ok(parsePage(drawing('A',area),1).error);
 assert.ok(parsePage('Scanned image / no text',1).error);assert.ok(parsePage(drawing()+drawing('B-1'),1).error);
});
test('matching is scoped to the chosen project and order, blocks repeated PDF references and requires review of ambiguous QA items',()=>{
 const row=parsePage(drawing(),1),scope={project:'Test tower',orderNumber:'42'};
 assert.equal(matchRows([row],[item('wrong',{project:'Other tower'}),item()],scope,true)[0].item.id,'a');
 assert.equal(matchRows([row],[item('wrong',{orderNumber:'43'})],scope,true)[0].state,'blocked');
 assert.equal(matchRows([row],[item(),item('remake')],scope,true)[0].state,'review');
 assert.ok(matchRows([row,{...row,page:2}],[item()],scope,true).every(row=>row.state==='blocked'));
 assert.equal(matchRows([row],[item('case',{reference:'a-1'})],scope,true)[0].state,'ready');
});
test('existing areas are never silently overwritten and approved corrections require QA management',()=>{
 const row=parsePage(drawing(),1),scope={project:'Test tower',orderNumber:'42'};
 assert.equal(matchRows([row],[item('a',{panelArea:{areaM2:.859}})],scope,false)[0].state,'same');
 const approved=item('a',{status:'approved',panelArea:{areaM2:2}});
 assert.equal(matchRows([row],[approved],scope,false)[0].state,'blocked');assert.equal(matchRows([row],[approved],scope,true)[0].state,'replace');
 assert.equal(matchRows([row],[item('a',{status:'approved'})],scope,false)[0].state,'ready');
 for(const status of ['recut','not_required','replaced'])assert.equal(matchRows([row],[item('a',{status})],scope,true)[0].state,'blocked');
});
test('caps are excluded from sticker-area matches even when an older cap record shares the main panel ID',()=>{
 const row=parsePage(drawing(),1),scope={project:'Test tower',orderNumber:'42'},cap=item('old-cap',{qaStandaloneRequired:false,qaAssembly:{role:'cap',mainPanelId:'a'},status:'awaiting'});
 const matched=matchRows([row],[cap,item()],scope,true)[0];assert.equal(matched.state,'ready');assert.equal(matched.item.id,'a');assert.equal(matched.candidates,undefined);
 assert.equal(matchRows([row],[cap],scope,true)[0].state,'blocked');
 assert.equal(require('../qa-panel-area-import.js').candidateState(row,cap,true).state,'blocked');
 const roleOnly={...cap,qaStandaloneRequired:undefined};assert.equal(matchRows([row],[roleOnly,item()],scope,true)[0].item.id,'a');
});
test('production packaging includes the importer and the QA Centre entry point',()=>{
 const root=path.join(__dirname,'..'),html=fs.readFileSync(path.join(root,'index.html'),'utf8'),build=fs.readFileSync(path.join(root,'scripts/build-production.cjs'),'utf8');
 assert.match(html,/qa-panel-area-import\.js\?v=/);assert.match(html,/Import panel m² PDF/);assert.match(build,/'qa-panel-area-import.js'/);
});

function importViewFixture(request){
 const api=require('../qa-panel-area-import.js'),states=[],refs=[];let cursor=0,refCursor=0;
 const React={Fragment:'fragment',createElement:(tag,props,...children)=>({tag,props:props||{},children}),useState(initial){const i=cursor++;if(!(i in states))states[i]=initial;return [states[i],value=>{states[i]=typeof value==='function'?value(states[i]):value;}];},useRef(initial){const i=refCursor++;return refs[i]||(refs[i]={current:initial});},useEffect(){}};
 const panel=item('a',{cutAt:'2026-11-20T00:00:00Z',latest:null,panelAreaRevision:0}),scope={project:panel.project,orderNumber:panel.orderNumber},row=parsePage(drawing(),1),calls=[],saved=[];
 function render(){cursor=refCursor=0;return api.View({React,items:[panel],canManage:true,base:'https://worker.test',request:async(...args)=>{calls.push(args);return request(...args);},onSaved:result=>saved.push(result),onClose(){}});}
 render();states[0]=[row];states[1]='stickers.pdf';states[2]=JSON.stringify([scope.project,scope.orderNumber]);states[3]=api.matchRows([row],[panel],scope,true);states[4]={1:true};
 function nodes(tree){if(Array.isArray(tree))return tree.flatMap(nodes);return tree&&typeof tree==='object'?[tree,...nodes(tree.children)]:[];}
 function text(tree){if(Array.isArray(tree))return tree.map(text).join(' ');return tree==null||typeof tree==='boolean'?'':typeof tree==='object'?text(tree.children):String(tree);}
 const save=()=>nodes(render()).find(node=>node.tag==='button'&&text(node)==='Save 1 panel areas');
 const confirm=()=>nodes(render()).find(node=>node.tag==='input'&&node.props.type==='checkbox'&&!node.props['aria-label']).props.onChange({target:{checked:true}});
 return {render,nodes,text,save,confirm,calls,saved,states};
}
test('clicking Save without the required confirmation explains what is missing beside the button and sends nothing',async()=>{
 const view=importViewFixture(()=>{throw Error('No request expected');});assert.equal(view.save().props.disabled,false);await view.save().props.onClick();assert.equal(view.calls.length,0);
 const tree=view.render(),alert=view.nodes(tree).find(node=>node.props.role==='alert');assert.match(view.text(alert),/Tick the confirmation below/);assert.match(view.text(tree),/Required: I confirm/);
 const parents=view.nodes(tree).filter(node=>node.children.includes(alert));assert.equal(parents.length,1);assert.ok(parents[0].children.some(node=>node?.tag==='button'&&view.text(node)==='Save 1 panel areas'),'Validation must be beside Save, below the full preview');
});
test('a rejected PDF area save shows its error beside Save and retains the checked rows and confirmation',async()=>{
 const view=importViewFixture(async()=>({response:{ok:false},result:{error:'Panel area changed on another device. Review the latest matches.'}}));view.confirm();await view.save().props.onClick();assert.equal(view.calls.length,1);
 const alert=view.nodes(view.render()).find(node=>node.props.role==='alert');assert.match(view.text(alert),/changed on another device/);assert.equal(view.states[4][1],true);assert.equal(view.states[7],true);assert.equal(view.save().props.disabled,false);
});
test('a lost response keeps the exact import request for a successful retry without duplicate saves',async()=>{
 const original=globalThis.crypto;assert.ok(original?.randomUUID);
 let count=0;const view=importViewFixture(async(url,options)=>{if(++count===1)throw Error('Connection interrupted');const body=JSON.parse(options.body);return {response:{ok:true},result:{ok:true,savedCount:1,items:body.rows.map(row=>({id:row.id,kind:'panel',panelArea:row.panelArea,panelAreaRevision:1}))}};});
 view.confirm();await view.save().props.onClick();assert.match(view.text(view.nodes(view.render()).find(node=>node.props.role==='alert')),/Connection interrupted/);await view.save().props.onClick();assert.equal(view.calls.length,2);assert.equal(view.calls[0][1].body,view.calls[1][1].body);assert.equal(view.saved.length,1);
});
test('browsers without randomUUID can still save with a secure import reference',async()=>{
 const descriptor=Object.getOwnPropertyDescriptor(globalThis,'crypto');Object.defineProperty(globalThis,'crypto',{configurable:true,value:{getRandomValues:bytes=>bytes.fill(17)}});
 try{
  const view=importViewFixture(async(url,options)=>{const body=JSON.parse(options.body);assert.match(body.importId,/^[a-f0-9]{32}$/);return {response:{ok:true},result:{ok:true,savedCount:1,items:body.rows.map(row=>({id:row.id,kind:'panel',panelArea:row.panelArea}))}};});
  view.confirm();await view.save().props.onClick();assert.equal(view.calls.length,1);assert.equal(view.saved.length,1);assert.equal(view.save().props.disabled,false);
 }finally{Object.defineProperty(globalThis,'crypto',descriptor);}
});
test('an error preparing the save request is visible and cannot leave Save stuck in a busy state',async()=>{
 const descriptor=Object.getOwnPropertyDescriptor(globalThis,'crypto');Object.defineProperty(globalThis,'crypto',{configurable:true,value:{}});
 try{const view=importViewFixture(()=>{throw Error('No request expected');});view.confirm();await view.save().props.onClick();assert.equal(view.calls.length,0);assert.equal(view.save().props.disabled,false);assert.match(view.text(view.nodes(view.render()).find(node=>node.props.role==='alert')),/secure save reference/);}finally{Object.defineProperty(globalThis,'crypto',descriptor);}
});
