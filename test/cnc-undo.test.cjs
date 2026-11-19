const SOURCE_PATH=require.resolve('../index.html');
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync(SOURCE_PATH,'utf8');
function source(name){const start=html.indexOf('  function '+name+'(');assert.ok(start>=0,name);return html.slice(start,html.indexOf('\n  function ',start+10));}
function nodes(value){return Array.isArray(value)?value.flatMap(nodes):value&&typeof value==='object'?[value,...nodes(value.children)]:[];}
function hooks(extra={}){
 const state=[],effects=[];let cursor=0,id=0;
 const useState=initial=>{const i=cursor++;if(!(i in state))state[i]=typeof initial==='function'?initial():initial;return[state[i],value=>state[i]=typeof value==='function'?value(state[i]):value];};
 const useRef=initial=>{const i=cursor++;if(!(i in state))state[i]={current:initial};return state[i];};
 const jsx=(type,props)=>({type,...props});
 const context={...extra,crypto:{randomUUID:()=> 'undo-request-id-'+(++id)},import_react:{createElement:(type,props,...children)=>({type,...props,children:children.length?children:props?.children}),useRef},import_jsx_runtime:{jsx,jsxs:jsx},useState,useEffect:(fn,deps)=>{const i=cursor++;if(JSON.stringify(state[i])!==JSON.stringify(deps)){state[i]=deps;effects.push(fn);}},Modal:'modal',inputCls:'input'};
 return {context,render(fn,props){cursor=0;return fn(props);},async flush(){for(const fn of effects.splice(0))fn();await new Promise(setImmediate);}};
}
const panel={id:'p',jobReference:'Project',orderNumber:'1',sheetNumber:'2',panelNumber:'P1',completedAt:'2026-11-19T00:00:00Z',status:'completed'};
const plan={panelId:'p',expectedCompletedAt:panel.completedAt,revision:7,restoreEpoch:0,panels:[{id:'p',panelNumber:'P1'},{id:'p2',panelNumber:'P2'}],stockAdjustments:[{type:'variant',sku:'S',delta:1},{type:'offcut',sku:'O',delta:-1}]};
test('undo dialog previews the whole completion and stock effects; cancel sends no undo',async()=>{
 const calls=[];let closed=0;const r=hooks(),render=vm.runInNewContext(source('CncUndoCutDialog')+';CncUndoCutDialog',r.context),props={panel,request:async body=>{calls.push(body);return{plan};},onClose:()=>closed++};
 r.render(render,props);await r.flush();const all=nodes(r.render(render,props)),text=all.flatMap(v=>(v.children||[]).filter(v=>typeof v==='string')).join(' ');
 assert.match(text,/2 panels will return to Pending: P1, P2/);assert.match(text,/Return 1 sheet S to stock/);assert.match(text,/Remove 1 offcut O from stock/);
 all.find(n=>n.children?.includes('Cancel')).onClick();assert.equal(closed,1);assert.deepEqual(calls.map(v=>v.action),['preview']);
});
test('double clicks and a lost response reuse the same undo request ID',async()=>{
 const calls=[];let reject,closed=0;const r=hooks(),render=vm.runInNewContext(source('CncUndoCutDialog')+';CncUndoCutDialog',r.context),props={panel,onClose:()=>closed++,request:body=>{calls.push(body);return body.action==='preview'?Promise.resolve({plan}):new Promise((resolve,no)=>{reject=no;});}};
 const draw=()=>nodes(r.render(render,props));draw();await r.flush();draw().find(n=>n.rows===3).onChange({target:{value:'Marked by mistake'}});
 const form=draw().find(n=>n.type==='form'),first=form.onSubmit({preventDefault(){}});await form.onSubmit({preventDefault(){}});assert.equal(calls.filter(v=>v.action==='undo').length,1);
 reject(Error('Connection interrupted'));await first;assert.equal(closed,0);assert.equal(draw().find(n=>n.rows===3).disabled,true);
 const retry=draw().find(n=>n.type==='form').onSubmit({preventDefault(){}});assert.equal(calls[1].mutationId,calls[2].mutationId);assert.equal(calls[1].reason,'Marked by mistake');reject(Error('Retry interrupted'));await retry;
});
test('only admins see Undo cut on completed rows',()=>{
 const name=html.includes('  function CncTab(')?'CncTab':'CncPage';
 for(const isAdmin of [false,true]){
  const r=hooks({CNC_PUBLIC_TOKEN:'',CncRouterIcon:'icon',FileSpreadsheet:'excel',Plus:'plus',LinkIcon:'link',Search:'search',Check:'check',Trash2:'trash',SectionTitle:'heading',PageHeading:'heading',EmptyState:'empty',CncJobGroups:'jobs',normalizeCncInput:p=>p,fmtStockDim:()=>'',fmtCncOffcutDim:()=>'',cncEstimatedOffcut:()=>null});
  const render=vm.runInNewContext(source(name)+';'+name,r.context),props={isAdmin,cncPanels:[panel],variants:[],offcuts:[],onUndoCut(){}};let all=nodes(r.render(render,props));
  all.find(n=>n.onClick&&n.children?.some?.(v=>typeof v==='string'&&v.startsWith('Completed'))).onClick();all=nodes(r.render(render,props));
  const groups=all.find(n=>n.type==='jobs'),rows=nodes(groups.renderGroup([panel]));assert.equal(rows.some(n=>n['aria-label']==='Undo cut for panel P1'),isAdmin);
 }
});
test('server-backed undo waits for sync and applies refreshed stock only to the same account',async()=>{
 const a=html.indexOf('    async function undoCncCutRequest('),b=html.indexOf('\n    function ',a+10),handler=html.slice(a,b)+';undoCncCutRequest';assert.ok(a>=0);
 const calls=[],updates=[];const context={isAdmin:true,BAKED_WORKER_URL:'https://example.test',PanelStock:{username:'admin',outbox:{flush:async()=>{},pending:()=>0},apiFetch:async(url,options)=>{calls.push(JSON.parse(options.body));return {ok:true,json:async()=>({ok:true,summary:{panels:[panel]}})};},snapshot:async()=>({cncPanels:[{...panel,status:'pending'}],variants:[{qty:5}],offcuts:[],transactions:[]})},setCncPanels:v=>updates.push(v),setVariants:v=>updates.push(v),setOffcuts:v=>updates.push(v),setTransactions:v=>updates.push(v),showToast(){}};
 const request=vm.runInNewContext(handler,context);await request({action:'undo'});assert.equal(updates[0][0].status,'pending');assert.equal(updates[1][0].qty,5);
 context.PanelStock.outbox.pending=()=>1;await assert.rejects(request({action:'preview'}),/Sync your saved changes/);assert.equal(calls.length,1);
 context.PanelStock.outbox.pending=()=>0;context.PanelStock.outbox.flush=async()=>{context.PanelStock.username='another';};await assert.rejects(request({action:'undo'}),/account changed/);assert.equal(calls.length,1);
 context.isAdmin=false;await assert.rejects(request({action:'undo'}),/Only administrators/);
});
