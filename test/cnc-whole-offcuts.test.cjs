const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,fs.existsSync(path.join(__dirname,'../panelstock-app.modern.js'))?'../panelstock-app.modern.js':'../index.html'),'utf8');
const normalizers=html.slice(html.indexOf('function normalizeCncInput('),html.indexOf('function compareCncOrders('));
function source(name,indent=2){const start=html.indexOf(' '.repeat(indent)+'function '+name+'(');assert.ok(start>=0,name);return html.slice(start,html.indexOf('\n'+' '.repeat(indent)+'function ',start+10));}
const plain=value=>JSON.parse(JSON.stringify(value));
const nodes=value=>Array.isArray(value)?value.flatMap(nodes):value&&typeof value==='object'?[value,...nodes(value.children)]:[];
function hooks(extra={}){
 const state=[];let cursor=0;
 const useState=initial=>{const i=cursor++;if(!(i in state))state[i]=typeof initial==='function'?initial():initial;return[state[i],next=>state[i]=typeof next==='function'?next(state[i]):next];};
 const jsx=(type,props)=>({type,...props}),createElement=(type,props,...children)=>({type,...props,children:children.length?children:props?.children});
 const context={CncProjectPicker:'project-picker',PageHeading:'heading',Upload:'upload',Trash2:'trash',Field:'field',CncStockPicker:'stock-picker',CncPanelTypeFields:'classification',inputCls:'input',useState,useEffect(){},useRef:initial=>{const i=cursor++;if(!(i in state))state[i]={current:initial};return state[i];},...extra,import_react:{createElement,useState},import_jsx_runtime:{jsx,jsxs:jsx}};
 return {context,draw(fn,props){cursor=0;return nodes(fn(props));}};
}
const fractional={length:1200,width:479.971,source:'cnc-pdf',rectangle:{x:3520.029,y:0,width:479.971,height:1200}};
const stock={id:'stock',sku:'SKU',qty:5,width:4000,height:1500,material:'ACM',color:'White',thickness:4};

test('detected proposals floor usable sides and shrink matching rectangles without changing manual leftovers',()=>{
 const normalize=vm.runInNewContext(normalizers+';cncWholeOffcutProposal'),before=JSON.stringify(fractional),result=normalize(fractional);
 assert.equal(result.length,1200);assert.equal(result.width,479);
 assert.deepEqual(plain(result.rectangle),{x:3520.029,y:0,width:479,height:1200});
 assert.ok(result.rectangle.x+result.rectangle.width<=fractional.rectangle.x+fractional.rectangle.width);
 assert.deepEqual(plain(normalize(result)),plain(result));assert.equal(JSON.stringify(fractional),before);
 assert.equal(normalize({...fractional,width:.9,rectangle:undefined}),null);
 assert.equal(normalize({...fractional,minimumOffcutSize:479.5}),null,'minimum size is applied after flooring');
 const manual={...fractional,source:'manual'};assert.equal(normalize(manual),manual);
 const mismatch=normalize({...fractional,rectangle:{x:0,y:0,width:479.1,height:1199.9}});
 assert.equal(mismatch.length,1199);assert.equal(mismatch.width,479);assert.equal(mismatch.rectangle.height,1199);
 const estimate=vm.runInNewContext(normalizers+source('cncEstimatedOffcut')+';cncEstimatedOffcut');
 assert.equal(estimate([{pendingOffcut:fractional}]).offcuts[0].width,479);
});

test('recut proposals floor each usable side before minimum filtering and preserve safe origins',()=>{
 const plan=vm.runInNewContext(normalizers+source('cncRecutSheetPlan')+';cncRecutSheetPlan');
 const proposed={layout:{anchor:'bottom-left',usedLength:1800.2,usedWidth:900.1},cutEdgeAllowance:10.3,minimumOffcutSize:1};
 const result=plan(proposed,3000.8,1500.9);assert.equal(result.fits,true);assert.equal(result.offcuts.length,2);
 assert.deepEqual(plain(result.offcuts.map(item=>[item.length,item.width])),[[1500,1190],[1789,590]]);
 for(const item of result.offcuts){
  const r=item.rectangle;assert.equal(item.length,Math.max(r.width,r.height));assert.equal(item.width,Math.min(r.width,r.height));
  assert.ok(r.x+r.width<=3000.8);assert.ok(r.y+r.height<=1500.9);
 }
 const [a,b]=result.offcuts.map(item=>item.rectangle);
 assert.ok(Math.min(a.x+a.width,b.x+b.width)<=Math.max(a.x,b.x)||Math.min(a.y+a.height,b.y+b.height)<=Math.max(a.y,b.y));
 assert.equal(plan({...proposed,minimumOffcutSize:1190.1},3000.8,1500.9).offcuts.length,0);
 assert.equal(plan(fractional,4000,1500).offcuts[0].width,479,'legacy proposals without layout also round down');
});

test('PDF review displays and schedules integer proposals while project selection still starts blank',async()=>{
 const saved=[],page={page:1,project:'Wrong PDF project',orderNumber:'7',sheetNumber:'1',panelIds:['A'],quantity:1,sheetWidth:4000,sheetHeight:1500,panelArea:4,material:'ACM 4 mm',finish:'White',proposedOffcuts:[fractional],proposedOffcut:fractional};
 const runtime=hooks({BAKED_WORKER_URL:'https://example.test',FileReader:class{readAsDataURL(){this.result='data:application/pdf;base64,AA==';this.onload();}},PanelStock:{apiFetch:async()=>({ok:true,json:async()=>({pages:[page]})})}});
 const render=vm.runInNewContext(normalizers+source('expandCncPdfSheets')+source('cncRecutSheetPlan')+source('cncPdfStockMatch')+source('CncPdfImport')+';CncPdfImport',runtime.context);
 const props={variants:[stock],offcuts:[],cncPanels:[],onSave:rows=>saved.push(rows),onClose(){}},draw=()=>runtime.draw(render,props),save=()=>draw().find(node=>node.children?.includes?.('Save reviewed sheets'));
 await draw().find(node=>node.accept==='application/pdf').onChange({target:{files:[{type:'application/pdf',size:1,name:'program.pdf'}]}});
 assert.equal(draw().find(node=>node.type==='project-picker').value,'');assert.equal(save().disabled,true);
 assert.ok(draw().some(node=>node.children?.includes?.('Detected leftover: 1200 × 479 mm. Tick to keep it; otherwise it will not be saved.')));
 draw().find(node=>node.type==='project-picker').onChange('Chosen Project',{name:'Chosen Project'});
 draw().find(node=>node['aria-label']==='Keep offcut for sheet 1').onChange({target:{checked:true}});
 save().onClick();assert.equal(saved.length,1);assert.equal(saved[0][0].jobReference,'Chosen Project');
 const item=saved[0][0].pendingOffcuts[0];assert.equal(item.width,479);assert.equal(item.rectangle.width,479);
 assert.equal(saved[0][0].pendingOffcut,item);
});

test('completion defaults old detected proposals to integer sides and allows explicit manual corrections',()=>{
 const runtime=hooks(),confirmed=[];
 const render=vm.runInNewContext(normalizers+html.slice(html.indexOf('  function CncSheetDialog('),html.indexOf('function normalizeCncInput('))+';CncSheetDialog',runtime.context);
 const props={sheet:{orderNumber:'7',sheetNumber:'1'},affectedPanels:[{id:'a',panelNumber:'A',pendingOffcut:fractional,sheetWidth:4000,sheetHeight:1500,totalPanelArea:4,panelAreaScope:'sheet'}],onClose(){},onConfirm:value=>confirmed.push(value)},draw=()=>runtime.draw(render,props);
 assert.equal(draw().find(node=>node['aria-label']==='Saved offcut 1 width').value,479);
 draw().find(node=>node.children==='Complete sheet').onClick();assert.equal(confirmed[0].offcuts[0].width,479);assert.equal(confirmed[0].offcuts[0].rectangle.width,479);
 draw().find(node=>node['aria-label']==='Saved offcut 1 width').onChange({target:{value:'479.75'}});
 draw().find(node=>node.children==='Complete sheet').onClick();assert.equal(confirmed[1].offcuts[0].width,479.75);assert.equal(confirmed[1].offcuts[0].rectangle,undefined);
});
