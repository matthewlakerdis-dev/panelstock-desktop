const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const qaSource=source.slice(source.indexOf('  function qaReportStatusLabel('),source.indexOf('  function AuditCenter('));
function nodes(tree){if(Array.isArray(tree))return tree.flatMap(nodes);if(!tree||typeof tree!=='object')return [];return [tree,...nodes(tree.children)];}
function text(tree){if(Array.isArray(tree))return tree.map(text).join(' ');if(tree===null||tree===undefined||typeof tree==='boolean')return '';return typeof tree==='object'?text(tree.children):String(tree);}
function harness({items=[],status='awaiting',kind='all',query='',response,apiFetch}={}){
  const state=[],calls=[];let cursor=0;
  const context={import_react:{createElement:(tag,props,...children)=>({tag,props,children})},useState:initial=>{const index=cursor++;if(!(index in state))state[index]=typeof initial==='function'?initial():initial;return [state[index],value=>{state[index]=typeof value==='function'?value(state[index]):value;}];},useEffect:()=>{},PageHeading:'heading',ClipboardList:'clipboard',ChevronRight:'chevron',PanelStock:{apiFetch:async(url,options)=>{calls.push({url,options});return apiFetch?apiFetch(url,options):{ok:true,json:async()=>response};}},BAKED_WORKER_URL:'https://worker.example.test',console};
  vm.createContext(context);vm.runInContext(qaSource,context);
  function render(props={}){cursor=0;return context.QaCenter({username:'admin',isAdmin:true,canManage:true,canDispatch:false,...props});}
  render();state[0]=items;state[5]=false;state[8]=status;state[9]=kind;state[10]=query;
  return {context,state,calls,render,renderReport(report){state.length=0;cursor=0;return context.QaOrderReport({report,onClose(){}});}};
}
const panel=(id,reference,status='awaiting',extra={})=>({id,kind:'panel',project:'Library facade',orderNumber:'007',sheetNumber:'2',reference,status,history:[],quantity:1,remainingQuantity:1,...extra});
const button=(tree,label)=>nodes(tree).find(node=>node.tag==='button'&&node.children.includes(label));

test('collapsed QA orders offer a report to administrators with the existing staff restriction',()=>{
  const view=harness({items:[panel('visible','P2')]});
  const tree=view.render();
  assert.equal(nodes(tree).find(node=>node.props?.['aria-expanded']!==undefined).props['aria-expanded'],false);
  assert.ok(button(tree,'Generate QA report'));
  assert.equal(button(view.render({isAdmin:false}),'Generate QA report'),undefined);
  const metalwork=harness({items:[{...panel('metal','M2'),kind:'metalwork'}]});
  assert.equal(button(metalwork.render(),'Generate QA report'),undefined);
});

test('order report fetch uses only project and order while filtered panels remain hidden from the QA list',async()=>{
  const hidden=panel('approved','P20','approved'),visible=panel('awaiting','P2'),other=panel('other','P3','awaiting',{project:'Other project'});
  const report={project:visible.project,orderNumber:visible.orderNumber,items:[hidden,visible,panel('pending','P30','awaiting_routing')]};
  const view=harness({items:[visible,hidden,other],status:'awaiting',kind:'panel',query:'P2',response:{ok:true,report}});
  const tree=view.render();
  const actions=nodes(tree).filter(node=>node.tag==='button'&&node.children.includes('Generate QA report'));
  assert.equal(actions.length,1);
  await actions[0].props.onClick();
  assert.equal(view.calls.length,1);
  assert.equal(view.calls[0].url,'https://worker.example.test/qa/report');
  assert.equal(view.calls[0].options.method,'POST');
  assert.deepEqual(JSON.parse(view.calls[0].options.body),{project:visible.project,orderNumber:visible.orderNumber});
  const opened=view.render();
  assert.equal(opened.tag,view.context.QaOrderReport);
  assert.equal(opened.props.report,report);
  opened.props.onClose();
  assert.ok(button(view.render(),'Generate QA report'));
});

test('failed report generation retains the order and offers a retry with the server error',async()=>{
  const view=harness({items:[panel('p','P2')],apiFetch:async()=>({ok:false,json:async()=>({error:'The order is unavailable. Refresh and retry.'})})});
  await button(view.render(),'Generate QA report').props.onClick();
  const tree=view.render();
  assert.match(text(tree),/The order is unavailable\. Refresh and retry\./);
  assert.equal(button(tree,'Generate QA report').props.disabled,false);
});

test('order report renders every panel, full history and evidence, and explains uninspected phases',()=>{
  const failed={id:'i1',status:'recut',checkedBy:'Alex',checkedAt:'2026-10-26T01:00:00Z',results:{edge:'fail',removed_check:'na'},notes:'Edge needs a recut.',photo:'data:image/png;base64,aGVsbG8='};
  const approved={id:'i2',status:'approved',checkedBy:'Sam',checkedAt:'2026-10-26T02:00:00Z',results:{edge:'pass'},notes:'Replacement approved.',overrideReason:'Approved by supervisor'};
  const items=[panel('inspected','P1','approved',{history:[failed,approved]}),panel('pending','P2','awaiting_routing'),panel('legacy','P3','pre_qa'),panel('awaiting','P4')];
  const report={project:'Library facade',orderNumber:'007',generatedAt:'2026-10-27T00:00:00Z',generatedBy:'admin',items,checklists:{panel:[['edge','Edges are finished']]}};
  const view=harness(),tree=view.renderReport(report),content=text(tree);
  assert.equal(nodes(tree).filter(node=>node.tag==='h3').length,4);
  assert.deepEqual(nodes(tree).filter(node=>node.tag==='h4').map(text),['Inspection 2','Inspection 1']);
  for(const expected of ['Edges are finished','removed_check','N/A','Edge needs a recut.','Replacement approved.','Administrator override: Approved by supervisor','Awaiting routing — no QA inspection recorded.','Pre-QA — completed before QA was introduced; no QA inspection recorded.','No QA inspection recorded.'])assert.ok(content.includes(expected),expected);
  assert.equal(nodes(tree).filter(node=>node.tag==='img').length,1);
  assert.equal(nodes(tree).find(node=>node.tag==='img').props.src,failed.photo);
  assert.ok(button(tree,'Download PDF'));
});

test('generated order PDF remains readable across pages and includes the last panel',async()=>{
  const context={console,Uint8Array,Blob};vm.createContext(context);
  const pdfSource=source.slice(source.indexOf('  function pdfSafe('),source.indexOf('  function rowsToCSV('));
  const helpers=source.slice(source.indexOf('  function qaReportStatusLabel('),source.indexOf('  function QaOrderReport('));
  vm.runInContext(pdfSource+helpers,context);
  const items=Array.from({length:45},(_,index)=>panel('panel-'+index,'P'+(index+1),'approved',{history:[{id:'inspection-'+index,status:'approved',checkedBy:'Sam',checkedAt:'2026-10-26T02:00:00Z',results:{edge:'pass'},notes:'Panel '+(index+1)+' is checked.'}]}));
  const blocks=await context.buildQaOrderPdfBlocks({project:'Library facade',orderNumber:'007',items,checklists:{panel:[['edge','Edges are finished']]},generatedAt:'2026-10-27T00:00:00Z',generatedBy:'admin'});
  const bytes=context.buildRichPdfBytes(blocks);
  const {getDocument}=await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task=getDocument({data:bytes,useSystemFonts:true,disableFontFace:true}),document=await task.promise;
  try{
    assert.ok(document.numPages>1);
    const pages=[];
    for(let pageNumber=1;pageNumber<=document.numPages;pageNumber++){const page=await document.getPage(pageNumber);const content=await page.getTextContent();pages.push(content.items.map(item=>item.str).join(' '));}
    const content=pages.join(' ').replace(/\s+/g,' ');
    assert.match(content,/Order QA report/);assert.match(content,/Order 007/);assert.match(content,/Panel P1/);assert.match(content,/Panel P45/);assert.match(content,/Panel 45 is checked\./);
    assert.equal((content.match(/Edges are finished/g)||[]).length,45);
  }finally{await task.destroy();}
});

function pdfContext(extra={}){const c={setTimeout,clearTimeout,Uint8Array,...extra};vm.createContext(c);vm.runInContext(source.slice(source.indexOf('  function qaReportStatusLabel('),source.indexOf('  function QaOrderReport(')),c);return c;}
test('order PDF preserves panel/history order and complete checklist notes without truncation',async()=>{
 const c=pdfContext(),history=[{id:'first',status:'recut',checkedBy:'First inspector',results:{edge:'fail'},notes:'First failure',overrideReason:'Admin reason'},{id:'second',status:'approved',checkedBy:'Second inspector',results:{edge:'pass',removedCheck:'na'},notes:'Long notes\n'+('x'.repeat(900))}];
 const report={project:'Test project',orderNumber:'001',generatedAt:'2026-10-27T01:00:00Z',generatedBy:'Admin',checklists:{panel:[['edge','Edges checked']]},items:[{reference:'P2',sheetNumber:'1',status:'approved',history},{reference:'P10',sheetNumber:'1',status:'awaiting_routing'},{reference:'OLD',sheetNumber:'2',status:'pre_qa'}]};
 const blocks=await c.buildQaOrderPdfBlocks(report),text=blocks.filter(b=>b.type==='text').map(b=>b.text).join('\n');
 assert.ok(text.indexOf('Panel P2')<text.indexOf('Panel P10'));assert.ok(text.indexOf('Second inspector')<text.indexOf('First inspector'));assert.match(text,/PASS: Edges checked/);assert.match(text,/N\/A: removedCheck/);assert.match(text,/FAIL: Edges checked/);assert.match(text,/Administrator override: Admin reason/);assert.match(text,/panel is awaiting routing/);assert.match(text,/completed before QA tracking began/);assert.equal((text.match(/x/g)||[]).length,900);assert.equal(history[0].id,'first');
 for(const block of blocks.filter(b=>b.type==='text'))assert.ok(block.text.length<=Math.floor(680/(block.size*.6)));
});
test('report statuses and latest-only history remain explicit',()=>{
 const c=pdfContext(),latest={status:'approved',id:'latest'};
 assert.equal(c.qaReportAttempts({latest})[0],latest);assert.equal(c.qaReportStatusLabel('awaiting_routing'),'Awaiting routing');assert.equal(c.qaReportStatusLabel('pre_qa'),'Pre-QA');assert.equal(c.qaReportStatusLabel({status:'replaced',resolvedSeparatelyAt:'2026-01-01'}),'Recut completed separately');assert.equal(c.qaReportDate('broken'),'Unknown');assert.match(c.qaReportDate('2026-10-27T01:00:00Z'),/11:00/);
});
test('evidence photos are embedded at bounded display size and conversion failures reject the report',async()=>{
 class Image {set src(value){this.naturalWidth=1600;this.naturalHeight=900;queueMicrotask(()=>this.onload());}}
 const c=pdfContext({Image,document:{createElement:()=>({getContext:()=>({fillRect(){},drawImage(){}}),toDataURL:()=> 'data:image/jpeg;base64,aGVsbG8='})},dataUrlToBytes:()=>new Uint8Array([1,2,3]),computeDisplaySize:(w,h,maxW,maxH)=>({displayWidth:maxW,displayHeight:h/w*maxW})});
 const report={items:[{reference:'1',history:[{status:'approved',photo:'data:image/png;base64,aGVsbG8='}]}]};
 const blocks=await c.buildQaOrderPdfBlocks(report),photo=blocks.find(b=>b.type==='image');assert.ok(photo);assert.equal(photo.width,1200);assert.equal(photo.height,675);assert.ok(photo.displayWidth<=300);assert.ok(photo.displayHeight<=200);
 await assert.rejects(c.buildQaOrderPdfBlocks({items:[{history:[{photo:'https://untrusted.example/photo'}]}]}),/could not be added/);
});
