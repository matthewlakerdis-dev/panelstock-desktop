const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync(require.resolve('../index.html'),'utf8');
const normalizers=html.slice(html.indexOf('function normalizeCncInput('),html.indexOf('function compareCncOrders('));
function source(name,indent=2){const start=html.indexOf(' '.repeat(indent)+'function '+name+'(');assert.ok(start>=0,name);return html.slice(start,html.indexOf('\n'+' '.repeat(indent)+'function ',start+10));}
function nodes(value){return Array.isArray(value)?value.flatMap(nodes):value&&typeof value==='object'?[value,...nodes(value.children)]:[];}
function hooks(extra={}){
 const state=[];let cursor=0;const jsx=(type,props,key)=>({type,...props,key}),createElement=(type,props,...children)=>({type,...props,children:children.length?children:props?.children});
 const context={...extra,import_react:{createElement},import_jsx_runtime:{jsx,jsxs:jsx},useEffect(){},useRef:initial=>{const i=cursor++;if(!(i in state))state[i]={current:initial};return state[i];},useState:initial=>{const i=cursor++;if(!(i in state))state[i]=typeof initial==='function'?initial():initial;return[state[i],value=>state[i]=typeof value==='function'?value(state[i]):value];}};
 return {context,render(fn,props){cursor=0;return fn(props);}};
}
const base={id:'a',jobReference:'Alpha',orderNumber:'01',sheetNumber:'1',panelNumber:'A',status:'pending'};
const existing=[base,{...base,id:'b',panelNumber:'B'},{...base,id:'sheet2',sheetNumber:'2'},{...base,id:'leading',sheetNumber:'01'},{...base,id:'other',jobReference:'Beta'}];
const scope={kind:'sheet',jobReference:'Alpha',orderNumber:'01',sheetNumber:'1'};
function remove(scope,ids,panels=existing,isAdmin=true,fail=false){
 const result={writes:[],updates:[],messages:[]},context={cncPanels:panels,scope,ids,isAdmin,transactions:[{id:'history'}],username:'admin',uid:()=> 'deletion',persist:value=>{if(fail)throw Error('Storage unavailable');result.writes.push(value);},setCncPanels:v=>result.updates.push(v),setTransactions:v=>result.updates.push(v),showToast:v=>result.messages.push(v)};
 result.accepted=vm.runInNewContext(normalizers+source('cncRemovalPlan')+source('removeCncScheduled',4)+';removeCncScheduled(scope,ids);',context);return result;
}
test('scheduled sheet/order deletion is one audited save and cannot cross project or leading-zero identities',()=>{
 const before=JSON.stringify(existing),r=remove(scope,['a','b']);assert.equal(r.accepted,true);assert.equal(r.writes.length,1);
 assert.deepEqual(Array.from(r.writes[0].cncPanels,p=>p.id),['sheet2','leading','other']);assert.deepEqual(Object.keys(r.writes[0]).sort(),['cncPanels','transactions']);
 const activity=r.writes[0].transactions[0];assert.equal(activity.source,'cnc-remove');assert.equal(activity.removalScope.kind,'sheet');assert.deepEqual(Array.from(activity.panelRecordIds),['a','b']);assert.equal(r.writes[0].transactions[1].id,'history');assert.equal(JSON.stringify(existing),before);
 const order=remove({...scope,kind:'order'},['a','b','sheet2','leading']);assert.equal(order.accepted,true);assert.deepEqual(Array.from(order.writes[0].cncPanels,p=>p.id),['other']);
});
test('deletion rejects staff, stale/missing/duplicate selections, completed work and failed local persistence',()=>{
 for(const [panels,ids,admin] of [[existing,['a','b'],false],[existing,['a'],true],[existing,['a','a'],true],[existing,['missing'],true],[[...existing,{...base,id:'new'}],['a','b'],true],[[{...base,status:'completed'},...existing.slice(1)],['a','b'],true]]){
  const r=remove(scope,ids,panels,admin);assert.equal(r.accepted,false);assert.equal(r.writes.length,0);assert.equal(r.updates.length,0);
 }
 const partial=[...existing,{...base,id:'done',status:'completed'}];assert.equal(remove({...scope,kind:'panel',panelRecordId:'a'},['a'],partial).accepted,false);
 assert.equal(remove({...scope,kind:'order'},partial.filter(p=>p.jobReference==='Alpha').map(p=>p.id),partial).accepted,false);
 assert.equal(remove({...scope,sheetNumber:'2'},['sheet2'],partial).accepted,true);
 const failed=remove(scope,['a','b'],existing,true,true);assert.equal(failed.accepted,false);assert.equal(failed.updates.length,0);
});
test('group delete confirmation includes the full scope/count, supports cancel, and prevents repeated clicks',async()=>{
 let resolve,removed=[],prompts=[];const runtime=hooks({Trash2:'trash',PanelStock:{confirm:prompt=>{prompts.push(prompt);return new Promise(r=>resolve=r);}}});
 const render=vm.runInNewContext(source('CncDeleteGroupButton')+';CncDeleteGroupButton',runtime.context),props={panels:existing.slice(0,2),scope,onRemove:(...args)=>removed.push(args)};
 let button=runtime.render(render,props);const first=button.onClick();await button.onClick();assert.equal(prompts.length,1);assert.match(prompts[0].message,/Alpha · Order 01 · Sheet 1/);assert.match(prompts[0].message,/2 pending panels/);assert.match(prompts[0].message,/hidden by the search filter/);
 resolve(false);await first;assert.equal(removed.length,0);
 button=runtime.render(render,props);const second=button.onClick();resolve(true);await second;assert.equal(removed.length,1);assert.deepEqual(Array.from(removed[0][1]),['a','b']);
 assert.equal(runtime.render(render,{...props,panels:[{...base,status:'completed'}]}).disabled,true);
 assert.equal(runtime.render(render,{...props,onRemove:null}),null);
});
test('order and sheet delete controls use all scheduled members, sit outside toggles, and remain admin-only',()=>{
 const runtime=hooks({CncDeleteGroupButton:'delete',CncSheetGroups:'sheets',compareCncOrders:(a,b)=>a.localeCompare(b)}),render=vm.runInNewContext(source('CncOrderGroups')+';CncOrderGroups',runtime.context);
 let all=nodes(runtime.render(render,{panels:[base],allPanels:existing.filter(p=>p.jobReference==='Alpha'),query:'A',renderGroup:rows=>rows,onRemoveScheduled(){}}));
 assert.equal(all.find(n=>n.type==='delete').panels.length,4);
 for(const toggle of all.filter(n=>n['aria-expanded']!==undefined))assert.equal(nodes(toggle.children).some(n=>n.type==='delete'||n.type==='button'),false);
 const sheets=vm.runInNewContext(source('CncSheetGroups')+';CncSheetGroups',runtime.context);
 all=nodes(runtime.render(sheets,{panels:[base],allPanels:existing.filter(p=>p.jobReference==='Alpha'),renderGroup:rows=>rows,onRemoveScheduled(){}}));assert.equal(all.find(n=>n.type==='delete').panels.length,2);
 const page=source(html.includes('  function CncTab(')?'CncTab':'CncPage');assert.match(page,/onRemoveScheduled: isAdmin && view === "pending" \? onRemoveScheduled : null/);assert.match(page,/isAdmin && view === "pending" &&/);
});
test('PDF review removes one sheet copy, preserves original numbering, supports undo and never deletes existing schedule data',async()=>{
 const stock={id:'stock',sku:'SKU',qty:8,width:4000,height:1500,material:'ACM'},pdfPages=[{page:1,project:'Alpha',orderNumber:'01',sheetNumber:'1',panelIds:['A','B'],quantity:2,sheetWidth:4000,sheetHeight:1500,panelArea:4,material:'ACM'},{page:2,project:'Alpha',orderNumber:'01',sheetNumber:'2',panelIds:['C'],quantity:1,sheetWidth:4000,sheetHeight:1500,panelArea:4,material:'ACM'}];
 let saved=[],closed=0;const scheduled=[{...base,status:'completed'}],before=JSON.stringify(scheduled);
 const runtime=hooks({PageHeading:'heading',Upload:'upload',Trash2:'trash',Field:'field',CncStockPicker:'picker',CncPanelTypeFields:'classification',inputCls:'input',BAKED_WORKER_URL:'https://example.invalid',projectTitleCase:v=>v,FileReader:class{readAsDataURL(){this.result='data:application/pdf;base64,AA==';this.onload();}},PanelStock:{apiFetch:async()=>({ok:true,json:async()=>({pages:pdfPages})})}});
 const render=vm.runInNewContext(normalizers+source('expandCncPdfSheets')+source('cncRecutSheetPlan')+source('CncPdfImport')+';CncPdfImport',runtime.context),props={variants:[stock],offcuts:[],cncPanels:scheduled,onSave:(rows,options)=>saved.push({rows,options}),onClose:()=>closed++},draw=()=>nodes(runtime.render(render,props));
 let all=draw();
 // The model stores an input element's type attribute on the same object key.
 const input=all.find(n=>n.accept==='application/pdf');await input.onChange({target:{files:[{type:'application/pdf',size:1,name:'example.pdf'}]}});
 all=draw();assert.equal(all.filter(n=>n['aria-label']?.startsWith('Remove sheet')).length,3);
 all.find(n=>n['aria-label']==='Remove sheet 1 from import').onClick();all=draw();
 assert.ok(all.some(n=>n['aria-label']==='Remove sheet 1.2 from import'));assert.equal(all.find(n=>n.children?.includes?.('Save reviewed sheets')).disabled,false);
 all.find(n=>n.children?.includes?.('Undo last removal')).onClick();all=draw();assert.equal(all.find(n=>n.children?.includes?.('Save reviewed sheets')).disabled,true,'completed duplicate returns after undo');
 all.find(n=>n['aria-label']==='Remove sheet 1 from import').onClick();all=draw();all.find(n=>n.children?.includes?.('Save reviewed sheets')).onClick();
 assert.equal(saved.length,1);assert.deepEqual(Array.from(saved[0].rows,p=>p.sheetNumber),['1.2','1.2','2']);assert.deepEqual(Array.from(saved[0].rows,p=>p.pdfPage),[1,1,2]);assert.equal(saved[0].options.replacePending,true);assert.equal(closed,1);assert.equal(JSON.stringify(scheduled),before);
 for(const button of draw().filter(n=>n['aria-label']?.startsWith('Remove sheet'))) {draw().find(n=>n['aria-label']===button['aria-label']).onClick();}
 all=draw();assert.equal(all.some(n=>n.children?.includes?.('Save reviewed sheets')),false);assert.equal(saved.length,1);
});
test('recut sheet changes keep the layout bottom-left and recalculate the usable off-cut',()=>{
 const plan=vm.runInNewContext(source('cncRecutSheetPlan')+';cncRecutSheetPlan({layout:{anchor:"bottom-left",usedLength:1800,usedWidth:900},cutEdgeAllowance:10,minimumOffcutSize:100},2400,1200)');
 assert.equal(plan.fits,true);assert.deepEqual(JSON.parse(JSON.stringify(plan.offcut)),{length:1200,width:590,edge:'right',cutEdgeAllowance:10,minimumOffcutSize:100,layout:{anchor:'bottom-left',usedLength:1800,usedWidth:900},confidence:'high'});
 const tooSmall=vm.runInNewContext(source('cncRecutSheetPlan')+';cncRecutSheetPlan({layout:{anchor:"bottom-left",usedLength:1800,usedWidth:900}},1700,1200)');
 assert.equal(tooSmall.fits,false);assert.equal(tooSmall.offcut,null);
});
