const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync(require.resolve('../index.html'),'utf8');
const helpers=html.slice(html.indexOf('function normalizeCncInput('),html.indexOf('function compareCncOrders('));
function source(name,indent=2){const start=html.indexOf(' '.repeat(indent)+'function '+name+'(');assert.ok(start>=0,name);const end=html.indexOf('\n'+' '.repeat(indent)+'function ',start+10);return html.slice(start,end);}
function nodes(value){if(Array.isArray(value))return value.flatMap(nodes);return value&&typeof value==='object'?[value,...nodes(value.children)]:[];}
function hooks(extra={}){
 const state=[],effects=[];let cursor=0;
 const createElement=(type,props,...children)=>({type,...props,children:children.length?children:props?.children});
 const context={...extra,useState:initial=>{const i=cursor++;if(!(i in state))state[i]=typeof initial==='function'?initial():initial;return[state[i],value=>state[i]=typeof value==='function'?value(state[i]):value];},useRef:initial=>{const i=cursor++;if(!(i in state))state[i]={current:initial};return state[i];},useEffect:(fn,deps)=>{const i=cursor++,old=state[i];if(!old||deps.some((value,j)=>value!==old[j]))effects.push(fn);state[i]=deps;},import_react:{createElement},import_jsx_runtime:{jsx:(type,props,key)=>({type,...props,key})}};
 return {context,render(fn,props){cursor=0;const tree=fn(props);for(const effect of effects.splice(0))effect();return tree;}};
}
test('Audit Centre has a left control rail and at most 30 records, with bottom-scroll batches and filter reset',()=>{
 const localDateStr=vm.runInNewContext(source('localDateStr')+';localDateStr');
 assert.ok(source('PageHeading').includes('title'),'the real app defines its shared heading');
 const runtime=hooks({PageHeading:'heading',ClipboardList:'icon',FileSpreadsheet:'icon',Printer:'icon',localDateStr});
 const render=vm.runInNewContext(source('AuditCenter')+';AuditCenter',runtime.context);
 const transactions=Array.from({length:75},(_,i)=>({id:String(i+1),type:i%2?'receipt':'dispatch',desc:'Record '+(i+1),user:'Admin',timestamp:new Date(Date.UTC(2026,8,6,0,75-i)).toISOString(),qty:1}));
 let exports=0;const props={transactions,onExportExcel:()=>exports++,onExportPDF:()=>exports++},draw=()=>nodes(runtime.render(render,props));
 let all=draw(),articles=all.filter(n=>n.type==='article');
 assert.equal(articles.length,30);assert.equal(articles[0].key,'1');assert.equal(articles.at(-1).key,'30');
 assert.ok(all.some(n=>n.type==='aside'&&n['aria-label']==='Audit filters and statistics'));
 const list=all.find(n=>n['aria-label']==='Scrollable audit records');
 const scroll={scrollTop:200,clientHeight:600,scrollHeight:800};list.ref.current=scroll;
 list.onScroll({currentTarget:scroll});list.onScroll({currentTarget:scroll});
 all=draw();articles=all.filter(n=>n.type==='article');
 assert.equal(articles.length,30);assert.equal(articles[0].key,'31');assert.equal(articles.at(-1).key,'60');assert.equal(scroll.scrollTop,0);
 all.find(n=>n.children?.includes('Next 30')).onClick();all=draw();articles=all.filter(n=>n.type==='article');
 assert.equal(articles.length,15);assert.equal(articles[0].key,'61');
 assert.equal(all.find(n=>n.type==='button'&&n.children?.includes('Next 30')).disabled,true);
 all.find(n=>n.type==='button'&&n.children?.includes('Previous 30')).onClick();all=draw();assert.equal(all.filter(n=>n.type==='article')[0].key,'31');
 all.find(n=>n.type==='input'&&n.placeholder).onChange({target:{value:'Record 75'}});all=draw();assert.equal(all.filter(n=>n.type==='article').length,1);assert.equal(all.filter(n=>n.type==='article')[0].key,'75');
 all.find(n=>n.type==='button'&&n.children?.includes('Clear filters')).onClick();all=draw();assert.equal(all.filter(n=>n.type==='article')[0].key,'1');
 for(const button of all.filter(n=>n.type==='button'&&n.children?.some(text=>text==='Excel'||text==='PDF')))button.onClick();assert.equal(exports,2);
});
test('one Complete sheet action sits beside each pending sheet summary, never inside the expansion button',()=>{
 const runtime=hooks(),render=vm.runInNewContext(source('CncSheetGroups')+';CncSheetGroups',runtime.context);
 const panels=[{id:'a',jobReference:'Alpha',orderNumber:'01',sheetNumber:'1',status:'pending'},{id:'b',jobReference:'Alpha',orderNumber:'01',sheetNumber:'1',status:'pending'},{id:'done',jobReference:'Alpha',orderNumber:'01',sheetNumber:'2',status:'completed'}];
 let selected;const props={panels,allPanels:panels,renderGroup:rows=>rows,onCompleteSheet:sheet=>selected=sheet};
 const all=nodes(runtime.render(render,props)),buttons=all.filter(n=>n.type==='button'&&n.children==='Complete sheet');assert.equal(buttons.length,1);
 for(const toggle of all.filter(n=>n['aria-expanded']!==undefined))assert.equal(nodes(toggle.children).some(n=>n.type==='button'),false);
 buttons[0].onClick();assert.deepEqual(JSON.parse(JSON.stringify(selected)),{jobReference:'Alpha',orderNumber:'01',sheetNumber:'1'});
 assert.equal(nodes(runtime.render(render,{...props,onCompleteSheet:null})).filter(n=>n.children==='Complete sheet').length,0);
 const page=source(html.includes('  function CncTab(')?'CncTab':'CncPage');assert.doesNotMatch(page,/children: "Complete sheet"|children: "Panel"/);assert.match(page,/onCompleteSheet: view === "pending" \? setSheetToComplete : null/);
});
const base={id:'a',jobReference:'Alpha',orderNumber:'01',sheetNumber:'1',panelNumber:'A',status:'pending',stockItemType:'variant',stockItemId:'stock',stockSku:'SKU',sheetWidth:4000,sheetHeight:1500,totalPanelArea:2,uploadedBy:'original',uploadedAt:'2026-09-01T00:00:00Z'};
function schedule(rows,existing=[base],options={replacePending:true},variants=[{id:'stock',sku:'SKU',qty:5}]){
 let saved,id=0,toast;const context={cncPanels:existing,variants,offcuts:[],rows,options,username:'admin',transactions:[],uid:()=> 'new-'+(++id),setCncPanels(){},setTransactions(){},persist:value=>saved=value,showToast:value=>toast=value};
 const code=helpers+source('cncReservedSheets')+source('validateCncSchedule',4)+source('addCncPanelsBulk',4);
 const accepted=vm.runInNewContext(code+';addCncPanelsBulk(rows,options);',context);return {accepted,saved,toast};
}
test('reviewed PDF updates pending IDs in place, adds new panels, retains unmatched records and writes one audit batch',()=>{
 const rows=[{...base,id:undefined,totalPanelArea:3,panelAreaScope:'sheet',pdfPage:1,isTemplate:true},{...base,id:undefined,panelNumber:'C',pdfPage:1,totalPanelArea:3,panelAreaScope:'sheet'}];
 const other={...base,id:'other',jobReference:'Other'},omitted={...base,id:'b',panelNumber:'B'},existing=[base,omitted,other],before=JSON.stringify(existing);
 const result=schedule(rows,existing);assert.equal(result.accepted,true);assert.equal(result.saved.cncPanels.length,4);
 const updated=result.saved.cncPanels.find(p=>p.id==='a');assert.equal(updated.totalPanelArea,3);assert.equal(updated.pdfRevision,1);assert.equal(updated.isTemplate,true);assert.equal(updated.uploadedBy,'original');assert.equal(updated.uploadedAt,base.uploadedAt);
 assert.equal(result.saved.cncPanels.find(p=>p.id==='b'),omitted);assert.equal(result.saved.cncPanels.find(p=>p.id==='other'),other);assert.equal(JSON.stringify(existing),before);
 assert.equal(result.saved.transactions.length,1);assert.equal(result.saved.transactions[0].source,'cnc-pdf');assert.equal(result.saved.transactions[0].panelRecordIds.length,2);
 assert.match(result.toast,/1 updated · 1 added/);
 const second=schedule(rows,result.saved.cncPanels);assert.equal(second.accepted,true);assert.equal(second.saved.cncPanels.find(p=>p.id==='a').pdfRevision,2);
});
test('completed, repeated PDF rows and ordinary manual duplicates are protected',()=>{
 const row={...base,pdfPage:1};
 for(const [rows,existing,options,pattern] of [
   [[row],[{...base,status:'completed'}],{replacePending:true},/completed/],
   [[row,row],[base],{replacePending:true},/more than once/],
   [[row],[base],{},/already in the CNC tracker/],
   [[{...row,panelNumber:'NEW'}],[{...base,status:'completed'}],{replacePending:true},/completed CNC sheet/]
 ]){
  const r=schedule(rows,existing,options);assert.equal(r.accepted,false);assert.equal(r.saved,undefined);assert.match(r.toast,pattern);
 }
});
test('a replacement keeps its reservation, but stock changes require consistent sibling stock and availability',()=>{
 const stock=[{id:'stock',sku:'SKU',qty:1},{id:'second',sku:'SECOND',qty:1}],row={...base,pdfPage:1};
 assert.equal(schedule([row],[base],{replacePending:true},stock).accepted,true);
 const changed={...row,stockItemId:'second',stockSku:'SECOND'},sibling={...base,id:'b',panelNumber:'B'};
 assert.match(schedule([changed],[base,sibling],{replacePending:true},stock).toast,/different stock item/);
 assert.equal(schedule([changed,{...changed,panelNumber:'B'}],[base,sibling],{replacePending:true},stock).accepted,true);
 const reserved={...changed,id:'other',jobReference:'Other'};
 assert.match(schedule([changed],[base,reserved],{replacePending:true},stock).toast,/0 unreserved/);
});
test('Complete sheet only completes the selected project and consumes one sheet',()=>{
 const context={cncPanels:[base,{...base,id:'b',panelNumber:'B'},{...base,id:'other',jobReference:'Other'}],variants:[{id:'stock',sku:'SKU',qty:3}],offcuts:[],transactions:[],username:'admin',uid:()=> 'activity',setCncPanels(){},setVariants(){},setOffcuts(){},setTransactions(){},showToast(){},persist:value=>context.saved=value};
 context.fmtDim=(width,height)=>width+' × '+height;
 vm.runInNewContext(helpers+source('completeCncSheet',4)+';completeCncSheet("01","1",null,"Alpha");',context);
 assert.deepEqual(Array.from(context.saved.cncPanels,p=>p.status),['completed','completed','pending']);assert.equal(context.saved.variants[0].qty,2);
});
