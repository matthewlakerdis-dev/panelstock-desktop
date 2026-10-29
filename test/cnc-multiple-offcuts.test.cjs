const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,fs.existsSync(path.join(__dirname,'../panelstock-app.modern.js'))?'../panelstock-app.modern.js':'../index.html'),'utf8');
const normalizers=html.slice(html.indexOf('function normalizeCncInput('),html.indexOf('function compareCncOrders('));
function source(name,indent=2,endName){const a=html.indexOf(' '.repeat(indent)+'function '+name+'(');assert.ok(a>=0,name);const b=endName?html.indexOf(' '.repeat(indent)+'function '+endName+'(',a+10):html.indexOf('\n'+' '.repeat(indent)+'function ',a+10);return html.slice(a,b);}
const nodes=value=>Array.isArray(value)?value.flatMap(nodes):value&&typeof value==='object'?[value,...nodes(value.children)]:[];
function hooks(extra={}){
 const state=[];let cursor=0;const jsx=(type,props,key)=>({type,...props,key}),createElement=(type,props,...children)=>({type,...props,children:children.length?children:props?.children});
 const useState=initial=>{const i=cursor++;if(!(i in state))state[i]=typeof initial==='function'?initial():initial;return[state[i],next=>state[i]=typeof next==='function'?next(state[i]):next];};
 const context={CncProjectPicker:'project-picker',PageHeading:'heading',Upload:'upload',Trash2:'trash',Field:'field',CncStockPicker:'stock-picker',CncPanelTypeFields:'classification',inputCls:'input',useState,useEffect(){},useRef:initial=>{const i=cursor++;if(!(i in state))state[i]={current:initial};return state[i];},...extra,import_react:{createElement,useState},import_jsx_runtime:{jsx,jsxs:jsx}};
 return {context,render(fn,props){cursor=0;return nodes(fn(props));}};
}
const stock={id:'stock',sku:'SKU',qty:5,width:4000,height:1500,material:'ACM',color:'White',thickness:4};
const proposals=[{length:1500,width:500,rectangle:{x:3500,y:0,width:500,height:1500},cutEdges:['left'],cutEdgeAllowance:10},{length:2000,width:300,rectangle:{x:0,y:1200,width:2000,height:300},cutEdges:['bottom'],cutEdgeAllowance:10}];
test('PDF import requires one explicitly selected project and reviews multiple offcuts independently for each sheet',async()=>{
 const pdfPages=[{page:1,project:'Wrong PDF project',orderNumber:'7',sheetNumber:'1',panelIds:['A','B'],quantity:2,sheetWidth:4000,sheetHeight:1500,panelArea:4,material:'ACM 4 mm',finish:'White',proposedOffcuts:proposals,proposedOffcut:proposals[0]}],saved=[];
 const runtime=hooks({BAKED_WORKER_URL:'https://example.test',FileReader:class{readAsDataURL(){this.result='data:application/pdf;base64,AA==';this.onload();}},PanelStock:{apiFetch:async()=>({ok:true,json:async()=>({pages:pdfPages})})}});
 const render=vm.runInNewContext(normalizers+source('expandCncPdfSheets')+source('cncRecutSheetPlan')+source('cncPdfStockMatch')+source('CncPdfImport')+';CncPdfImport',runtime.context),props={variants:[stock],offcuts:[],cncPanels:[],onSave:rows=>saved.push(rows),onClose(){}},draw=()=>runtime.render(render,props),save=()=>draw().find(n=>n.children?.includes?.('Save reviewed sheets'));
 const upload=async()=>draw().find(n=>n.accept==='application/pdf').onChange({target:{files:[{type:'application/pdf',size:1,name:'program.pdf'}]}});
 await upload();
 let picker=draw().find(n=>n.type==='project-picker');assert.equal(draw().filter(n=>n.type==='project-picker').length,1);assert.equal(picker.value,'');assert.equal(picker.required,true);assert.equal(picker.strict,true);assert.equal(save().disabled,true);save().onClick();assert.equal(saved.length,0);
 picker.onChange('Forged project',null);assert.equal(save().disabled,true);
 draw().find(n=>n.type==='project-picker').onChange('Chosen Project',{id:'known-project',name:'Chosen Project'});assert.equal(save().disabled,false);
 let checkboxes=draw().filter(n=>n['aria-label']?.startsWith('Keep offcut'));assert.equal(checkboxes.length,4);assert.ok(checkboxes.every(n=>!n.checked));
 for(const label of ['Keep offcut for sheet 1','Keep offcut for sheet 1 offcut 2'])draw().find(n=>n['aria-label']===label).onChange({target:{checked:true}});
 save().onClick();assert.equal(saved.length,1);
 const rows=saved[0];assert.ok(rows.every(row=>row.jobReference==='Chosen Project'));assert.ok(rows.filter(row=>row.sheetNumber==='1').every(row=>row.pendingOffcuts.length===2&&row.pendingOffcut===row.pendingOffcuts[0]));assert.ok(rows.filter(row=>row.sheetNumber==='1.2').every(row=>row.pendingOffcuts.length===0&&row.pendingOffcut===null));
 assert.deepEqual(JSON.parse(JSON.stringify(rows[0].pendingOffcuts[1].rectangle)),proposals[1].rectangle);
 draw().find(n=>n['aria-label']==='Off-cut 2 width').onChange({target:{value:'250'}});save().onClick();assert.equal(saved[1][0].pendingOffcuts[1].width,250);assert.equal(saved[1][0].pendingOffcuts[1].rectangle,undefined);
 await upload();assert.equal(draw().find(n=>n.type==='project-picker').value,'');assert.equal(save().disabled,true);assert.ok(draw().filter(n=>n['aria-label']?.startsWith('Keep offcut')).every(n=>!n.checked));
});

function complete(confirmation,panels){
 const base={id:'a',jobReference:'Alpha',orderNumber:'7',sheetNumber:'1',panelNumber:'A',status:'pending',stockItemType:'variant',stockItemId:'stock',stockSku:'SKU',sheetWidth:4000,sheetHeight:1500,totalPanelArea:4,panelAreaScope:'sheet',pendingOffcuts:proposals,pendingOffcut:proposals[0]};
 const cncPanels=panels||[base,{...base,id:'b',panelNumber:'B'},{...base,id:'other',sheetNumber:'2'}],before=JSON.stringify(cncPanels),result={writes:[],messages:[]};let id=0;
 vm.runInNewContext(normalizers+source('completeCncSheet',4,'removeCncPanel')+';completeCncSheet("7","1",confirmation,"Alpha");',{cncPanels,confirmation,variants:[stock],offcuts:[],transactions:[],username:'operator',uid:()=>`id-${++id}`,genSku:()=>`SKU-${++id}`,fmtDim:(a,b)=>`${a} × ${b}`,setCncPanels:v=>result.panels=v,setVariants:v=>result.variants=v,setOffcuts:v=>result.offcuts=v,setTransactions:v=>result.transactions=v,persist:v=>result.writes.push(v),showToast:message=>result.messages.push(message)});
 assert.equal(JSON.stringify(cncPanels),before);return result;
}
test('completing a sheet saves every confirmed offcut in one stock transaction batch and deducts one source sheet',()=>{
 const r=complete({confirmed:true,offcuts:proposals});assert.equal(r.writes.length,1);assert.equal(r.variants[0].qty,4);assert.equal(r.offcuts.length,2);assert.ok(r.offcuts.every(item=>item.qty===1&&item.sourceOrderNumber==='7'&&item.sourceSheetNumber==='1'));
 assert.equal(new Set(r.offcuts.map(item=>item.id)).size,2);assert.equal(r.transactions.filter(item=>item.type==='offcut_add').length,2);assert.equal(r.transactions.filter(item=>item.type==='dispatch').length,1);
 assert.ok(r.panels.slice(0,2).every(panel=>panel.status==='completed'&&panel.savedOffcuts.length===2&&panel.offcutDetails===panel.savedOffcuts[0]));assert.equal(r.panels[2].status,'pending');assert.equal(complete({confirmed:true,offcuts:proposals},r.panels).writes.length,0);
 const same=complete({confirmed:true,offcuts:[{length:500,width:300},{length:500,width:300}]});assert.equal(same.offcuts.length,2,'equal-sized separate pieces are retained');
});
test('completion supports a legacy single offcut, an explicit decline and rejects invalid or overlapping lists',()=>{
 assert.equal(complete({confirmed:true,length:500,width:300}).offcuts.length,1);
 const declined=complete({confirmed:false,offcuts:[]});assert.equal(declined.offcuts.length,0);assert.ok(declined.panels.slice(0,2).every(panel=>panel.savedOffcuts.length===0&&panel.offcutDetails===null&&panel.offcutOutcome==='none'));
 for(const offcuts of [[{length:0,width:500}],[{length:5000,width:500}],Array.from({length:21},()=>({length:100,width:100})),[{length:3000,width:1000},{length:3000,width:1000}],[proposals[0],{...proposals[0]}]]){
  const r=complete({confirmed:true,offcuts});assert.equal(r.writes.length,0);assert.equal(r.panels,undefined);assert.equal(r.offcuts,undefined);assert.equal(r.messages.length,1);
 }
});
test('completion dialog reviews each kept offcut without adding stock before confirmation',()=>{
 const payloads=[],runtime=hooks(),render=vm.runInNewContext(normalizers+html.slice(html.indexOf('  function CncSheetDialog('),html.indexOf('function normalizeCncInput('))+';CncSheetDialog',runtime.context),props={sheet:{orderNumber:'7',sheetNumber:'1'},affectedPanels:[{id:'a',panelNumber:'A',pendingOffcuts:proposals,pendingOffcut:proposals[0],sheetWidth:4000,sheetHeight:1500,totalPanelArea:4,panelAreaScope:'sheet'},{id:'b',panelNumber:'B',pendingOffcuts:proposals,pendingOffcut:proposals[0],sheetWidth:4000,sheetHeight:1500,totalPanelArea:4,panelAreaScope:'sheet'}],onClose(){},onConfirm:value=>payloads.push(value)},draw=()=>runtime.render(render,props);
 assert.equal(draw().filter(n=>n['aria-label']?.startsWith('Add offcut')).length,2);assert.equal(payloads.length,0);
 draw().find(n=>n['aria-label']==='Add offcut 2 to SOH').onChange({target:{checked:false}});draw().find(n=>n.children==='Complete sheet').onClick();assert.equal(payloads.length,1);assert.equal(payloads[0].confirmed,true);assert.equal(payloads[0].offcuts.length,1);
 draw().find(n=>n['aria-label']==='Saved offcut 1 width').onChange({target:{value:'0'}});assert.equal(draw().find(n=>n.children==='Complete sheet').disabled,true);
 draw().find(n=>n['aria-label']==='Add offcut 1 to SOH').onChange({target:{checked:false}});assert.equal(draw().find(n=>n.children==='Complete sheet').disabled,false);draw().find(n=>n.children==='Complete sheet').onClick();assert.equal(payloads[1].confirmed,false);assert.equal(payloads[1].offcuts.length,0);
});
