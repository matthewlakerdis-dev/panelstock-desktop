const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const plain=value=>JSON.parse(JSON.stringify(value));
function source(text,name,indent=2){const marker=' '.repeat(indent)+'function '+name+'(',start=text.indexOf(marker);assert.ok(start>=0,name);let end=text.indexOf('\n'+' '.repeat(indent)+'function ',start+marker.length);if(end<0)end=text.length;return text.slice(start,end);}
const nodes=value=>Array.isArray(value)?value.flatMap(nodes):value&&typeof value==='object'?[value,...nodes(value.children)]:[];
function hooks(extra={}){
 const state=[];let cursor=0;
 const useState=initial=>{const i=cursor++;if(!(i in state))state[i]=typeof initial==='function'?initial():initial;return[state[i],next=>state[i]=typeof next==='function'?next(state[i]):next];};
 const jsx=(type,props)=>({type,...props}),createElement=(type,props,...children)=>({type,...props,children:children.length?children:props?.children});
 const context={useState,useMemo:fn=>fn(),useEffect(){},useRef:initial=>{const i=cursor++;if(!(i in state))state[i]={current:initial};return state[i];},inputCls:'input',Field:'field',import_react:{createElement,useState,default:{Fragment:'fragment'}},import_jsx_runtime:{jsx,jsxs:jsx},...extra};
 return {context,draw(fn,props){cursor=0;return nodes(fn(props));}};
}
const target=fs.existsSync(path.join(__dirname,'../panelstock-app.modern.js'))?'panelstock-app.modern.js':'index.html';
for(const relative of [target]){
 const text=fs.readFileSync(path.join(__dirname,'..',relative),'utf8'),normalizers=text.slice(text.indexOf('function normalizeCncInput('),text.indexOf('function compareCncOrders(')),formatters=(text.match(/  var (?:fmtDim|stockDimensions|fmtStockDim|fmtCncOffcutDim) = [^\n]+/g)||[]).join('\n');
 const compile=(name,extra={},indent=2)=>vm.runInNewContext(formatters+'\n'+normalizers+'\n'+source(text,name,indent)+';'+name,extra);
 const legacyProposal={length:1200,width:480,source:'cnc-pdf',rectangle:{x:2520,y:0,width:480,height:1200}};
 const stock={id:'stock',sku:'SKU',qty:2,color:'White',material:'ALPOLIC',thickness:4,width:3000,height:1200};
 test(relative+': detected strip keeps parent-sheet axes, rounding and legacy compatibility',()=>{
  const normalize=vm.runInNewContext(normalizers+';cncWholeOffcutProposal'),original=JSON.stringify(legacyProposal),result=normalize(legacyProposal);
  assert.equal(result.length,480);assert.equal(result.width,1200);assert.equal(result.dimensionOrder,'sheet');assert.deepEqual(plain(result.rectangle),legacyProposal.rectangle);assert.equal(JSON.stringify(legacyProposal),original);
  assert.deepEqual(plain(normalize(result)),plain(result));
  const fraction=normalize({...legacyProposal,width:479.971,rectangle:{x:2520,y:0,width:479.971,height:1200}});assert.equal(fraction.length,479);assert.equal(fraction.width,1200);assert.equal(fraction.rectangle.width,479);
  assert.equal(normalize({...legacyProposal,minimumOffcutSize:481}),null);
  const manual={source:'manual',length:480,width:1200};assert.equal(normalize(manual),manual);
  const legacy=normalize({length:480,width:1200,source:'cnc-pdf'});assert.equal(legacy.length,1200);assert.equal(legacy.width,480);assert.equal(legacy.dimensionOrder,undefined);
  const corrected=normalize({length:450,width:1200,source:'cnc-pdf',dimensionOrder:'sheet'});assert.equal(corrected.length,450);assert.equal(corrected.width,1200);
 });
 function complete(proposal,actualStock=stock){
  const state={},toasts=[];let serial=0;
  const scheduled={id:'panel',status:'pending',orderNumber:'TEST',sheetNumber:'1',panelNumber:'P-1',stockItemId:stock.id,stockSku:stock.sku,sheetWidth:stock.width,sheetHeight:stock.height,totalPanelArea:1,panelAreaScope:'sheet',pendingOffcuts:[proposal]};
  const context={cncPanels:[scheduled],variants:[actualStock],offcuts:[],transactions:[],username:'Audit',uid:()=>`id-${++serial}`,genSku:()=>`SKU-${++serial}`,showToast:(...args)=>toasts.push(args),setCncPanels:value=>state.cncPanels=value,setVariants:value=>state.variants=value,setOffcuts:value=>state.offcuts=value,setTransactions:value=>state.transactions=value,persist:value=>state.persisted=value};
  compile('completeCncSheet',context,4)('TEST','1',{confirmed:true,offcuts:[proposal]});return{state,toasts};
 }
 test(relative+': completion saves 480 length × 1200 width and propagates its order',()=>{
  const normalize=vm.runInNewContext(normalizers+';cncWholeOffcutProposal'),proposal=normalize(legacyProposal),{state,toasts}=complete(proposal);
  assert.equal(state.offcuts?.length,1,JSON.stringify(toasts));const saved=state.offcuts[0];assert.equal(saved.width,480);assert.equal(saved.height,1200);assert.equal(saved.dimensionOrder,'sheet');assert.equal(saved.width*saved.height,proposal.length*proposal.width);
  assert.equal(state.cncPanels[0].savedOffcuts[0].length,480);assert.equal(state.cncPanels[0].savedOffcuts[0].width,1200);assert.equal(state.cncPanels[0].offcutDetails.dimensionOrder,'sheet');assert.equal(state.variants[0].qty,1);assert.deepEqual(plain(state.persisted.offcuts),plain(state.offcuts));assert.match(state.transactions[0].desc,/480 × 1200/);
  const differentStock=complete({...proposal,rectangle:undefined},{...stock,width:4000,height:1500}).state.offcuts[0];assert.equal(differentStock.width,480);assert.equal(differentStock.height,1200,'completion bounds-checks against selected stock without rescaling the proposal');
  const manual=complete({length:480,width:1200,source:'manual'}).state.offcuts[0];assert.equal(manual.width,480);assert.equal(manual.height,1200);assert.equal(manual.dimensionOrder,'sheet');
  const legacy=complete({length:480,width:1200,source:'cnc-pdf'}).state.offcuts[0];assert.equal(legacy.width,1200);assert.equal(legacy.height,480);assert.equal(legacy.dimensionOrder,undefined);
 });
 test(relative+': manual add and legacy correction preserve explicitly entered axes',()=>{
  const state={},context={offcuts:[{id:'existing',sku:'OLD',width:1200,height:480,qty:1}],uid:()=> 'new',genSku:()=> 'NEW',setOffcuts:value=>state.offcuts=value,persist:value=>state.persisted=value,logTxn(){},showToast(){},isAdmin:true};
  compile('addOffcut',context,4)({...stock,width:480,height:1200,qty:1});assert.equal(state.offcuts[1].width,480);assert.equal(state.offcuts[1].height,1200);assert.equal(state.offcuts[1].dimensionOrder,'sheet');
  compile('editOffcut',context,4)('existing',{width:480,height:1200,qty:1});assert.equal(state.offcuts[0].width,480);assert.equal(state.offcuts[0].height,1200);assert.equal(state.offcuts[0].dimensionOrder,'sheet');
 });
 test(relative+': stock labels, CSV and formatter preserve ordered offcuts and full-sheet convention',()=>{
  const ordered={...stock,width:480,height:1200,dimensionOrder:'sheet'},format=vm.runInNewContext(formatters+';fmtStockDim');assert.equal(format(ordered),'480 × 1200');assert.equal(format({...ordered,dimensionOrder:undefined}),'1200 × 480');assert.equal(format({...stock,width:1200,height:3000}),'3000 × 1200');const formatProposal=vm.runInNewContext(formatters+';fmtCncOffcutDim');assert.equal(formatProposal({source:'manual',length:480,width:1200}),'480 × 1200');assert.equal(formatProposal(compile('cncEstimatedOffcut')([{pendingOffcut:{source:'manual',length:480,width:1200}}]).offcuts[0]),'480 × 1200');
  const label=compile('buildLabelLines')(ordered);assert.match(label[1].text,/480 × 1200/);
  let rows;compile('exportExcel',{variants:[stock],offcuts:[ordered],rowsToCSV:value=>(rows=value,''),prepareExport(){},Blob:class{},todayStr:()=> 'test'},4)();assert.equal(rows[0]['Length (mm)'],3000);assert.equal(rows[1]['Length (mm)'],480);assert.equal(rows[1]['Width (mm)'],1200);
 });
 test(relative+': stock matching and recut retain physical sizes with either axis ordering',()=>{
  const match=compile('cncPdfStockMatch'),ordered={...stock,width:480,height:1200,dimensionOrder:'sheet'};assert.equal(match({material:'ALPOLIC 4 mm',finish:'White',sheetWidth:1200,sheetHeight:480},[ordered]),ordered);
  const plan=compile('cncRecutSheetPlan')({layout:{anchor:'bottom-left',usedLength:2500,usedWidth:1000},cutEdgeAllowance:20,minimumOffcutSize:1},3000,1200);assert.equal(plan.fits,true);assert.equal(plan.offcuts.length,2);const vertical=plan.offcuts.find(item=>item.edge==='right');assert.equal(vertical.length,480);assert.equal(vertical.width,1200);assert.equal(vertical.dimensionOrder,'sheet');assert.equal(vertical.rectangle.width,480);assert.equal(vertical.rectangle.height,1200);
 });
 test(relative+': completion dialog shows length and width in their preserved fields',()=>{
  const runtime=hooks(),confirmed=[],start=text.indexOf('  function CncSheetDialog('),end=text.indexOf('function normalizeCncInput(',start);assert.ok(start>=0&&end>start);
  const render=vm.runInNewContext(normalizers+text.slice(start,end)+';CncSheetDialog',runtime.context),props={sheet:{orderNumber:'TEST',sheetNumber:'1'},affectedPanels:[{id:'a',panelNumber:'P-1',pendingOffcut:legacyProposal,sheetWidth:3000,sheetHeight:1200,totalPanelArea:1,panelAreaScope:'sheet'}],onClose(){},onConfirm:value=>confirmed.push(value)},draw=()=>runtime.draw(render,props);
  assert.equal(draw().find(node=>node['aria-label']==='Saved offcut 1 length').value,480);assert.equal(draw().find(node=>node['aria-label']==='Saved offcut 1 width').value,1200);draw().find(node=>node.children==='Complete sheet').onClick();assert.equal(confirmed[0].offcuts[0].length,480);assert.equal(confirmed[0].offcuts[0].dimensionOrder,'sheet');
  draw().find(node=>node['aria-label']==='Saved offcut 1 length').onChange({target:{value:'450'}});draw().find(node=>node.children==='Complete sheet').onClick();assert.equal(confirmed[1].offcuts[0].length,450);assert.equal(confirmed[1].offcuts[0].width,1200);assert.equal(confirmed[1].offcuts[0].dimensionOrder,'sheet');assert.equal(confirmed[1].offcuts[0].rectangle,undefined);
 });
 test(relative+': undoing dispatch recreates ordered offcut dimensions',()=>{
  const state={},txn={id:'txn',type:'dispatch',itemType:'offcut',sku:'OFF',color:'White',material:'ALPOLIC',thickness:4,width:480,height:1200,dimensionOrder:'sheet',qty:1},context={isAdmin:true,transactions:[txn],variants:[],offcuts:[],username:'Audit',uid:()=> 'restored',showToast(){},setVariants:value=>state.variants=value,setOffcuts:value=>state.offcuts=value,setTransactions:value=>state.transactions=value,persist:value=>state.persisted=value};
  compile('voidTransaction',context,4)('txn');assert.equal(state.offcuts[0].width,480);assert.equal(state.offcuts[0].height,1200);assert.equal(state.offcuts[0].dimensionOrder,'sheet');
 });
 test(relative+': PDF review carries parent-sheet axes into pending offcuts',async()=>{
  const saved=[],page={page:1,project:'PDF Project',orderNumber:'7',sheetNumber:'1',panelIds:['A'],quantity:1,sheetWidth:3000,sheetHeight:1200,panelArea:1,material:'ALPOLIC 4 mm',finish:'White',proposedOffcuts:[legacyProposal],proposedOffcut:legacyProposal};
  const runtime=hooks({CncProjectPicker:'project-picker',PageHeading:'heading',Upload:'upload',Trash2:'trash',CncStockPicker:'stock-picker',CncPanelTypeFields:'classification',BAKED_WORKER_URL:'https://example.test',FileReader:class{readAsDataURL(){this.result='data:application/pdf;base64,AA==';this.onload();}},PanelStock:{apiFetch:async()=>({ok:true,json:async()=>({pages:[page]})})}});
  const render=vm.runInNewContext(formatters+normalizers+source(text,'expandCncPdfSheets')+source(text,'cncRecutSheetPlan')+source(text,'cncPdfStockMatch')+source(text,'CncPdfImport')+';CncPdfImport',runtime.context),props={variants:[stock],offcuts:[],cncPanels:[],onSave:rows=>saved.push(rows),onClose(){}},draw=()=>runtime.draw(render,props),save=()=>draw().find(node=>node.children?.includes?.('Save reviewed sheets'));
  await draw().find(node=>node.accept==='application/pdf').onChange({target:{files:[{type:'application/pdf',size:1,name:'program.pdf'}]}});
  assert.equal(draw().find(node=>node.type==='project-picker').value,'');assert.equal(save().disabled,true);assert.ok(draw().some(node=>node.children?.includes?.('Detected leftover: 480 × 1200 mm. Tick to keep it; otherwise it will not be saved.')));
  draw().find(node=>node.type==='project-picker').onChange('Chosen Project',{name:'Chosen Project'});draw().find(node=>node['aria-label']==='Keep offcut for sheet 1').onChange({target:{checked:true}});save().onClick();assert.equal(saved.length,1);
  const item=saved[0][0].pendingOffcuts[0];assert.equal(item.length,480);assert.equal(item.width,1200);assert.equal(item.dimensionOrder,'sheet');assert.equal(item.rectangle.width,480);assert.equal(item.rectangle.height,1200);assert.equal(saved[0][0].pendingOffcut,item);
  page.proposedOffcuts=[];page.proposedOffcut=null;
  await draw().find(node=>node.accept==='application/pdf').onChange({target:{files:[{type:'application/pdf',size:1,name:'manual.pdf'}]}});
  draw().find(node=>node.type==='project-picker').onChange('Chosen Project',{name:'Chosen Project'});draw().find(node=>node['aria-label']==='Keep offcut for sheet 1').onChange({target:{checked:true}});
  draw().find(node=>node['aria-label']==='Off-cut length').onChange({target:{value:'480'}});draw().find(node=>node['aria-label']==='Off-cut width').onChange({target:{value:'1200'}});save().onClick();assert.equal(saved.length,2);
  const manual=saved[1][0].pendingOffcuts[0];assert.equal(manual.source,'cnc-pdf');assert.equal(manual.dimensionOrder,'sheet');assert.equal(manual.length,480);assert.equal(manual.width,1200);assert.equal(manual.rectangle,undefined);
  const normalize=vm.runInNewContext(normalizers+';cncWholeOffcutProposal'),normalized=normalize(manual);assert.equal(normalized.length,480);assert.equal(normalized.width,1200);assert.equal(complete(normalized).state.offcuts[0].width,480);assert.equal(complete(normalized).state.offcuts[0].height,1200);

 });
 test(relative+': completion rejects ordered dimensions transposed against their retained rectangle',()=>{
  const result=complete({...legacyProposal,dimensionOrder:'sheet'});assert.equal(result.state.persisted,undefined);assert.deepEqual(result.toasts,[['Review the edited offcut dimensions','err']]);
 });

}
