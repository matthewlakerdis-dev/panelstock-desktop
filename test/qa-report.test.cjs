const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const qaSource=source.slice(source.indexOf('  function qaReportStatusLabel('),source.indexOf('  function AuditCenter('));
function nodes(tree){if(Array.isArray(tree))return tree.flatMap(nodes);if(!tree||typeof tree!=='object')return [];return [tree,...nodes(tree.children)];}
function text(tree){if(Array.isArray(tree))return tree.map(text).join(' ');if(tree===null||tree===undefined||typeof tree==='boolean')return '';return typeof tree==='object'?text(tree.children):String(tree);}
function harness({items=[],status='awaiting',kind='all',query='',response,apiFetch,extra={}}={}){
  const state=[],calls=[];let cursor=0,reportMode=false;
  const context={import_react:{createElement:(tag,props,...children)=>({tag,props,children})},useState:initial=>{const index=cursor++;if(!(index in state))state[index]=typeof initial==='function'?initial():initial;return [state[index],value=>{state[index]=typeof value==='function'?value(state[index]):value;}];},useEffect:()=>{},PageHeading:'heading',ClipboardList:'clipboard',ChevronRight:'chevron',PanelStock:{apiFetch:async(url,options)=>{calls.push({url,options});return apiFetch?apiFetch(url,options):{ok:true,json:async()=>response};}},BAKED_WORKER_URL:'https://worker.example.test',console,...extra};
  vm.createContext(context);vm.runInContext(qaSource,context);
  function render(props={}){cursor=0;return context.QaCenter({username:'admin',isAdmin:true,canManage:true,canDispatch:false,...props});}
  render();state[0]=items;state[5]=false;state[8]=status;state[9]=kind;state[10]=query;
  return {context,state,calls,render,renderReport(report){if(!reportMode){state.length=0;reportMode=true;}cursor=0;return context.QaOrderReport({report,onClose(){}});}};
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

test('order report fetch requests the server PDF snapshot for the whole order despite active filters',async()=>{
  const hidden=panel('approved','P20','approved'),visible=panel('awaiting','P2'),other=panel('other','P3','awaiting',{project:'Other project'});
  const report={project:visible.project,orderNumber:visible.orderNumber,items:[hidden,visible,panel('pending','P30','awaiting_routing')]};
  const pdf={fileName:'Lennox_QA_Order_007.pdf',mime:'application/pdf',data:'JVBERi0xLjQ='};
  const view=harness({items:[visible,hidden,other],status:'awaiting',kind:'panel',query:'P2',response:{ok:true,report,pdf}});
  const tree=view.render();
  const actions=nodes(tree).filter(node=>node.tag==='button'&&node.children.includes('Generate QA report'));
  assert.equal(actions.length,1);
  await actions[0].props.onClick();
  assert.equal(view.calls.length,1);
  assert.equal(view.calls[0].url,'https://worker.example.test/qa/report');
  assert.equal(view.calls[0].options.method,'POST');
  assert.deepEqual(JSON.parse(view.calls[0].options.body),{project:visible.project,orderNumber:visible.orderNumber,includePdf:true});
  const opened=view.render();
  assert.equal(opened.tag,view.context.QaOrderReport);
  assert.equal(JSON.stringify(opened.props.report),JSON.stringify({...report,pdf}));
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

test('generation without a PDF snapshot retains the order and allows the report to be generated again',async()=>{
  const view=harness({items:[panel('p','P2')],response:{ok:true,report:{items:[]}}});
  await button(view.render(),'Generate QA report').props.onClick();
  const tree=view.render();
  assert.notEqual(tree.tag,view.context.QaOrderReport);
  assert.match(text(tree),/report.*generated|PDF|snapshot/i);
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
  const photos=nodes(tree).filter(node=>node.tag==='img'&&node.props.src===failed.photo);
  assert.equal(photos.length,1);
  const logo=nodes(tree).find(node=>node.tag==='img'&&/Lennox/i.test(node.props.alt||''));
  assert.ok(logo,'Lennox report logo is accessible in the preview');
  assert.equal(logo.props.src,'lennox-logo.jpg');
  const logoBytes=fs.readFileSync(path.join(__dirname,'..',logo.props.src));
  assert.equal(logoBytes.readUInt16BE(0),0xffd8,'preview logo is an existing JPEG asset');
  assert.match(content,/Order QA report/);assert.match(content,/AEST/);
  assert.ok(button(tree,'Download PDF'));
});

function downloadHarness(report){
  const blobs=[],links=[],timers=[],revoked=[];
  const view=harness({extra:{Uint8Array,Blob,atob,setTimeout:callback=>{timers.push(callback);return timers.length;},URL:{createObjectURL(blob){blobs.push(blob);return 'blob:qa-snapshot';},revokeObjectURL(url){revoked.push(url);}},document:{createElement(tag){assert.equal(tag,'a');const link={clicks:0,removed:false,click(){this.clicks++;},remove(){this.removed=true;}};links.push(link);return link;},body:{append(){}}}}});
  return {view,blobs,links,timers,revoked,render:()=>view.renderReport(report)};
}

test('PDF download preserves the exact generated snapshot and cleans up its download URL',async()=>{
  const bytes=Buffer.from('%PDF-1.4\nsaved QA snapshot \0\xff\n%%EOF','latin1');
  const pdf={fileName:'Lennox_QA_Order_007.pdf',mime:'application/pdf',data:bytes.toString('base64')};
  const download=downloadHarness({project:'Library facade',orderNumber:'007',items:[],pdf});
  await button(download.render(),'Download PDF').props.onClick();
  assert.equal(download.blobs.length,1);assert.equal(download.blobs[0].type,'application/pdf');
  assert.deepEqual(Buffer.from(await download.blobs[0].arrayBuffer()),bytes);
  assert.equal(download.links.length,1);assert.equal(download.links[0].href,'blob:qa-snapshot');
  assert.equal(download.links[0].download,pdf.fileName);assert.equal(download.links[0].clicks,1);assert.equal(download.links[0].removed,true);
  assert.equal(download.view.calls.length,0,'downloading uses the saved snapshot without another API request');
  for(const callback of download.timers)callback();
  assert.deepEqual(download.revoked,['blob:qa-snapshot']);
});

test('PDF download uses a safe filename even if the provided filename contains path or control characters',async()=>{
  const download=downloadHarness({project:'Library facade',orderNumber:'007',items:[],pdf:{fileName:'../Lennox\\QA\r\n007.pdf',mime:'application/pdf',data:Buffer.from('%PDF-1.4\nsnapshot').toString('base64')}});
  await button(download.render(),'Download PDF').props.onClick();
  assert.equal(download.links.length,1);
  assert.match(download.links[0].download,/^[^/\\\r\n\0]+\.pdf$/i);
});

test('missing or corrupt PDF snapshots show a useful error and never download a partial report',async()=>{
  for(const pdf of [undefined,{fileName:'QA.pdf',mime:'application/pdf',data:'%%%invalid%%%'},{fileName:'QA.pdf',mime:'application/pdf',data:Buffer.from('not a PDF').toString('base64')},{fileName:'QA.pdf',mime:'text/html',data:Buffer.from('%PDF-1.4').toString('base64')}]){
    const download=downloadHarness({project:'Library facade',orderNumber:'007',items:[],pdf});
    await button(download.render(),'Download PDF').props.onClick();
    assert.equal(download.links.length,0);assert.equal(download.blobs.length,0);
    const tree=download.render(),alert=nodes(tree).find(node=>node.props?.role==='alert');
    assert.ok(alert);assert.match(text(alert),/PDF|snapshot|generate|retry|invalid|character/i);
    assert.equal(button(tree,'Download PDF').props.disabled,false);
  }
});

test('report statuses and latest-only history remain explicit',()=>{
  const view=harness(),c=view.context,latest={status:'approved',id:'latest'};
  assert.equal(c.qaReportAttempts({latest})[0],latest);assert.equal(c.qaReportStatusLabel('awaiting_routing'),'Awaiting routing');assert.equal(c.qaReportStatusLabel('pre_qa'),'Pre-QA');assert.equal(c.qaReportStatusLabel({status:'replaced',resolvedSeparatelyAt:'2026-01-01'}),'Recut completed separately');assert.equal(c.qaReportDate('broken'),'Unknown');assert.match(c.qaReportDate('2026-10-27T01:00:00Z'),/11:00/);
});
