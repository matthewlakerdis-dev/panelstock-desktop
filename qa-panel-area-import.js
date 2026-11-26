(function(root){
  'use strict';
  const normal=value=>String(value||'').trim().toLowerCase();
  function parsePage(text,page){
    const headers=[...text.matchAll(/ORDER:\s*([^]*?)\s*PANEL\s*ID:\s*([^]*?)\s*DATE:\s*([\d/-]+)\s*m(?:2|²):\s*([^\s]+)/gi)];
    if(headers.length!==1)return {page,error:headers.length?'More than one panel header — review this page manually.':'No readable panel ID and m² header — review this page manually.'};
    const [,order,reference,date,number]=headers[0],areaM2=Number(number),project=text.match(/Project\s*Name:\s*([^]*?)\s*Measured\s*by:/i)?.[1]?.trim()||'';
    if(!/^\d+(?:\.\d+)?$/.test(number)||!Number.isFinite(areaM2)||areaM2<=0||areaM2>99999||!reference.trim()||reference.trim().length>120)return {page,error:'Invalid panel ID or m² — review this page manually.'};
    return {page,reference:reference.trim(),areaM2,project,order:order.trim(),date};
  }
  function candidateState(row,item,canManage){
    if(!['awaiting','approved'].includes(item.status))return {state:'blocked',message:'Panel is not awaiting or approved QA.'};
    if(item.panelArea){
      if(Math.abs(item.panelArea.areaM2-row.areaM2)<1e-8)return {state:'same',message:'Area already recorded.'};
      if(item.status==='approved'&&!canManage)return {state:'blocked',message:'An administrator or QA manager must correct this approved panel’s area.'};
      return {state:'replace',message:`Replace existing ${Number(item.panelArea.areaM2).toFixed(3)} m² — select explicitly.`};
    }
    return {state:'ready',message:item.status==='approved'?'Matched · will use its original QA completion date.':'Matched · counts when this item passes QA.'};
  }
  function candidateDetails(item){
    const statuses={awaiting:'Awaiting QA',approved:'QA approved',recut:'Recut required',not_required:'QA not required',replaced:'Replaced'};
    const date=item.cutAt?new Date(item.cutAt):null;
    const cutDate=date&&Number.isFinite(date.getTime())?date.toLocaleString('en-AU',{dateStyle:'medium',timeStyle:'short'}):'Date not recorded';
    return [`Sheet ${item.sheetNumber||'—'}`,statuses[item.status]||'Unavailable QA status',`Cut: ${cutDate}${item.cutBy?' · '+item.cutBy:''}`,item.panelArea?`${Number(item.panelArea.areaM2).toFixed(3)} m² recorded`:'No m² recorded',item.isRemake?`Remake${item.remakeReason?' · '+item.remakeReason:''}`:'',`Record: ${item.id}`].filter(Boolean);
  }
  function matchRows(rows,items,scope,canManage,choicesByPage={}){
    const scoped=items.filter(item=>item.kind==='panel'&&normal(item.project)===normal(scope.project)&&normal(item.orderNumber)===normal(scope.orderNumber));
    return rows.map(row=>{
      if(row.error)return {...row,state:'blocked',message:row.error};
      if(rows.filter(other=>!other.error&&normal(other.reference)===normal(row.reference)).length!==1)return {...row,state:'blocked',message:'Panel ID occurs more than once in this PDF.'};
      const matches=scoped.filter(item=>normal(item.reference)===normal(row.reference));
      if(!matches.length)return {...row,state:'blocked',message:'No matching QA panel in this order.'};
      if(matches.some(item=>!item.id)||new Set(matches.map(item=>item.id)).size!==matches.length)return {...row,state:'blocked',message:'QA item identifiers are not unique. Refresh the QA queue before reviewing.'};
      if(matches.length===1)return {...row,item:matches[0],...candidateState(row,matches[0],canManage)};
      const selected=matches.find(item=>item.id===choicesByPage[row.page]);
      if(!selected)return {...row,candidates:matches,state:'review',message:`${matches.length} QA items use this panel ID. Choose the correct item below.`};
      return {...row,candidates:matches,item:selected,matchConfirmed:true,expectedCandidateIds:matches.map(item=>item.id).sort(),...candidateState(row,selected,canManage)};
    });
  }
  async function extractPdf(file,base,onProgress){
    if(!file||file.size>32*1024*1024)throw Error('Choose a PDF no larger than 32 MB.');
    const data=new Uint8Array(await file.arrayBuffer());
    if(String.fromCharCode(...data.subarray(0,5))!=='%PDF-')throw Error('Choose a valid PDF file.');
    const reader=base.replace(/\/$/,'')+'/safety/pdf-reader/6.4.299/';
    const pdfjs=await import(reader+'pdf.mjs');pdfjs.GlobalWorkerOptions.workerSrc=reader+'pdf.worker.mjs';
    const task=pdfjs.getDocument({data,standardFontDataUrl:reader,useSystemFonts:true,isEvalSupported:false,enableXfa:false});
    // A password-protected PDF cannot be imported without a readable copy.
    task.onPassword=()=>task.destroy();
    try{
      const pdf=await task.promise;
      if(pdf.numPages>300)throw Error('Choose a PDF with at most 300 pages.');
      const rows=[];
      for(let page=1;page<=pdf.numPages;page++){
        onProgress?.(`Reading page ${page} of ${pdf.numPages}…`);
        const source=await pdf.getPage(page),content=await source.getTextContent();
        rows.push(parsePage(content.items.map(item=>item.str||'').join('\n'),page));source.cleanup();
      }
      if(!rows.some(row=>!row.error))throw Error('No labelled panel m² could be read. Scanned PDFs and drawings without a labelled area need manual entry.');
      return rows;
    }finally{await task.destroy();}
  }
  function newImportId(){
    if(typeof root.crypto?.randomUUID==='function')return root.crypto.randomUUID();
    if(typeof root.crypto?.getRandomValues==='function')return Array.from(root.crypto.getRandomValues(new Uint8Array(16)),value=>value.toString(16).padStart(2,'0')).join('');
    throw Error('This browser cannot create a secure save reference. Open PanelStock in an up-to-date browser and retry.');
  }
  function ResetControls({React,canManage,base,request,busy,onBusy,onReset}){
    const h=React.createElement;
    const [preview,setPreview]=React.useState(null),[open,setOpen]=React.useState(false),[confirmed,setConfirmed]=React.useState(false),[working,setWorking]=React.useState(false),[message,setMessage]=React.useState('');
    const session=React.useRef({active:true,busy:false,previewVersion:0}),operation=React.useRef(null);
    function validPreview(value){return value?.ok===true&&typeof value.snapshot==='string'&&value.snapshot.length>0&&Number.isSafeInteger(value.panelCount)&&value.panelCount>=0&&Number.isSafeInteger(value.knownAreaCount)&&value.knownAreaCount>=0;}
    async function loadPreview(){
      const version=++session.current.previewVersion;
      const {response,result}=await request(base+'/qa/panels/area-reset',{});
      if(!session.current.active||version!==session.current.previewVersion)return null;
      if(response.status===403){setPreview(null);return null;}
      if(!response.ok||!validPreview(result))throw Error(result?.error||'The reset preview could not be loaded.');
      setPreview(result);return result;
    }
    React.useEffect(()=>{
      session.current.active=true;
      if(canManage)loadPreview().catch(()=>{if(session.current.active)setPreview(null);});
      return()=>{session.current.active=false;};
    },[base,canManage]);
    function lock(value){session.current.busy=value;setWorking(value);onBusy?.(value);}
    async function review(){
      if(busy||session.current.busy)return;
      lock(true);setMessage('');
      try{if(!operation.current){setConfirmed(false);await loadPreview();}if(session.current.active)setOpen(true);}
      catch(error){if(session.current.active)setMessage(error.message||'The reset preview could not be loaded.');}
      finally{if(session.current.active)lock(false);}
    }
    async function reset(){
      if(busy||session.current.busy||!confirmed||!preview||preview.panelCount===0)return;
      lock(true);setMessage('');
      try{
        if(!operation.current)operation.current={resetId:newImportId(),expectedSnapshot:preview.snapshot,reason:'Replace existing QA areas with sticker totals'};
        const {response,result}=await request(base+'/qa/panels/area-reset',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(operation.current)});
        if(!session.current.active)return;
        if(!response.ok){
          if(response.status===409){operation.current=null;setConfirmed(false);await loadPreview();setMessage('Panel areas changed. Review the updated counts and confirm again.');return;}
          if(response.status>=400&&response.status<500){operation.current=null;setConfirmed(false);}
          throw Error(result?.error||'The reset result could not be confirmed. Retry to check the same reset.');
        }
        if(result?.ok!==true||result.resetId!==operation.current.resetId||typeof result.backupId!=='string'||!result.backupId||!Number.isSafeInteger(result.panelCount))throw Error('The reset result could not be verified. Retry to check the same reset.');
        const refreshed=await request(base+'/qa/queue',{});
        if(!session.current.active)return;
        if(!refreshed.response.ok||!Array.isArray(refreshed.result?.items))throw Error('The reset was saved, but QA could not be refreshed. Retry to verify the same reset.');
        onReset({items:refreshed.result.items,reset:result});
      }catch(error){if(session.current.active)setMessage(error.message||'The reset result could not be confirmed. Retry to check the same reset.');}
      finally{if(session.current.active)lock(false);}
    }
    if(!canManage||!preview)return null;
    const button='rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700';
    return h('section',{'aria-label':'Reset QA panel areas',className:'mt-5 rounded-xl border border-amber-300 bg-amber-50 p-4'},
      h('h3',{className:'text-base font-semibold text-slate-900'},'Reset panel m² across all orders'),
      !open&&h('button',{type:'button',disabled:busy||working,className:button+' mt-3',onClick:review},'Review reset for all orders'),
      open&&h(React.Fragment,null,
        h('p',{className:'mt-2 text-sm text-slate-800'},`ALL ORDERS · ${preview.panelCount} panels · ${preview.knownAreaCount} with recorded m². Completed and awaiting QA panels are included.`),
        preview.statusCounts&&h('p',{className:'mt-2 text-sm text-slate-700'},Object.entries(preview.statusCounts).map(([status,count])=>`${status==='approved'?'Completed QA':status==='awaiting'?'Awaiting QA':status.replace(/_/g,' ')}: ${count}`).join(' · ')),
        h('p',{className:'mt-2 text-sm text-slate-700'},'Current QA m² will be blank until sticker areas are imported or entered. Previous area values are backed up. QA results, photos and history, and CNC sheet areas stay unchanged.'),
        h('label',{className:'mt-3 flex items-start gap-2 text-sm font-semibold text-slate-800'},h('input',{type:'checkbox',checked:confirmed,disabled:busy||working,'aria-label':'Confirm reset of panel m² for all orders',onChange:event=>setConfirmed(event.target.checked)}),'I confirm this resets panel m² for ALL ORDERS, including completed and awaiting QA.'),
        h('div',{className:'mt-3 flex flex-wrap gap-3'},h('button',{type:'button',disabled:busy||working||!confirmed||!preview.panelCount,onClick:reset,className:'rounded-lg bg-red-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50'},working?'Resetting…':operation.current?'Retry reset verification':'Reset all panel m²'),!operation.current&&h('button',{type:'button',disabled:busy||working,onClick:()=>{setOpen(false);setConfirmed(false);setMessage('');},className:button},'Cancel reset preview'))
      ),
      message&&h('p',{role:'alert',className:'mt-3 text-sm text-red-800'},message)
    );
  }
  function View({React,items,canManage,base,request,onSaved,onClose}){
    const h=React.createElement;
    const [rows,setRows]=React.useState([]),[fileName,setFileName]=React.useState(''),[scopeKey,setScopeKey]=React.useState(''),[preview,setPreview]=React.useState([]),[selected,setSelected]=React.useState({}),[busy,setBusy]=React.useState(false),[message,setMessage]=React.useState(''),[confirmed,setConfirmed]=React.useState(false);
    const [saveMessage,setSaveMessage]=React.useState('');
    const [matchChoices,setMatchChoices]=React.useState({});
    const session=React.useRef({active:true,version:0,busy:false}),importId=React.useRef(null),payload=React.useRef(null);
    const reviewItems=React.useRef(items);
    React.useEffect(()=>{session.current.active=true;return()=>{session.current.active=false;++session.current.version;};},[]);
    const scopes=Array.from(new Map(items.filter(item=>item.kind==='panel').map(item=>[JSON.stringify([item.project,item.orderNumber]),{project:item.project,orderNumber:item.orderNumber}])).entries()).sort((a,b)=>a[1].project.localeCompare(b[1].project)||a[1].orderNumber.localeCompare(b[1].orderNumber,undefined,{numeric:true}));
    const scope=scopeKey?{project:JSON.parse(scopeKey)[0],orderNumber:JSON.parse(scopeKey)[1]}:null;
    function review(nextRows=rows,nextScope=scope,nextItems=reviewItems.current){
      reviewItems.current=nextItems;
      const matched=nextScope?matchRows(nextRows,nextItems,nextScope,canManage):[];setPreview(matched);setSelected(Object.fromEntries(matched.filter(row=>row.state==='ready').map(row=>[row.page,true])));setMatchChoices({});setConfirmed(false);setSaveMessage('');importId.current=null;payload.current=null;
    }
    function chooseCandidate(page,id){
      if(session.current.busy||!scope)return;
      const choices={...matchChoices,[page]:id};setMatchChoices(choices);
      setPreview(matchRows(rows,reviewItems.current,scope,canManage,choices));
      setSelected(value=>({...value,[page]:false}));setConfirmed(false);setSaveMessage('');importId.current=null;payload.current=null;
    }
    function areasReset(result){
      ++session.current.version;setRows([]);setFileName('');setScopeKey('');setPreview([]);setSelected({});setMatchChoices({});setConfirmed(false);setSaveMessage('');importId.current=null;payload.current=null;
      onSaved(result);
    }
    async function chooseFile(event){
      const file=event.target.files?.[0];if(!file||session.current.busy)return;event.target.value='';
      const version=++session.current.version;session.current.busy=true;setBusy(true);setMessage('Reading PDF…');setRows([]);setPreview([]);setFileName('');setMatchChoices({});setConfirmed(false);payload.current=null;importId.current=null;
      try{const parsed=await extractPdf(file,base,value=>{if(session.current.active&&version===session.current.version)setMessage(value);});if(!session.current.active||version!==session.current.version)return;setRows(parsed);setFileName(file.name.slice(0,200));review(parsed);setMessage('Review the drawing-stated areas and their QA matches.');}
      catch(error){if(session.current.active&&version===session.current.version)setMessage(error.message||'The PDF could not be read. Choose an unprotected PDF with readable text.');}
      finally{if(session.current.active&&version===session.current.version){session.current.busy=false;setBusy(false);}}
    }
    async function refreshMatches(){
      if(session.current.busy)return;session.current.busy=true;setBusy(true);setMessage('Refreshing QA matches…');
      try{const {response,result}=await request(base+'/qa/queue',{});if(!session.current.active)return;if(!response.ok||!Array.isArray(result?.items))throw Error(result?.error||'QA matches could not be refreshed.');review(rows,scope,result.items);setMessage('Matches refreshed. Review the current QA items before saving.');}
      catch(error){if(session.current.active)setMessage(error.message||'QA matches could not be refreshed.');}
      finally{if(session.current.active){session.current.busy=false;setBusy(false);}}
    }
    const chosen=preview.filter(row=>selected[row.page]&&['ready','replace'].includes(row.state));
    async function save(){
      if(session.current.busy)return;
      if(!scope||!chosen.length){setSaveMessage('Select at least one matched panel area before saving.');return;}
      if(new Set(chosen.map(row=>row.item.id)).size!==chosen.length){setSaveMessage('The same QA item is selected more than once. Review the latest matches before saving.');return;}
      if(!confirmed){setSaveMessage('Tick the confirmation below to confirm this project/order and fabrication area, then click Save again.');return;}
      session.current.busy=true;setBusy(true);setSaveMessage('');setMessage('Saving panel areas…');
      // Reuse the exact request after a lost response. Server receipt makes retries safe.
      try{const next={project:scope.project,orderNumber:scope.orderNumber,fileName,rows:chosen.map(row=>({id:row.item.id,reference:row.reference,page:row.page,panelArea:{method:'manual',areaM2:row.areaM2},cutAt:row.item.cutAt||null,expectedAttemptId:row.item.latest?.id||null,expectedAreaRevision:row.item.panelAreaRevision||0,...(row.matchConfirmed?{matchConfirmed:true,expectedCandidateIds:row.expectedCandidateIds}:{})}))};
      const signature=JSON.stringify(next);if(payload.current!==signature||!importId.current){importId.current=newImportId();payload.current=signature;}
      const {response,result}=await request(base+'/qa/panels/area-import',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...next,importId:importId.current})});if(!session.current.active)return;if(!response.ok)throw Error(result?.error||'Areas could not be saved.');if(!Array.isArray(result.items)||result.items.length!==chosen.length||!result.items.every(item=>chosen.some(row=>row.item.id===item.id&&item.panelArea?.areaM2===row.areaM2)))throw Error('The saved areas could not be verified. Retry the same import.');onSaved(result);}
      catch(error){if(session.current.active){const text=error.message||'Areas could not be saved. Retry, or review the latest matches.';setMessage(text);setSaveMessage(text);}}
      finally{if(session.current.active){session.current.busy=false;setBusy(false);}}
    }
    const button='rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700';
    const td={padding:'10px 12px',borderBottom:'1px solid #e2e8f0',textAlign:'left',verticalAlign:'top'};
    function matchCell(row){
      return h('div',null,h('p',{style:{margin:0}},row.message),row.candidates&&h('fieldset',{disabled:busy,style:{border:0,padding:0,margin:'10px 0 0'},'aria-label':`Review QA matches for panel ${row.reference}`},
        h('legend',{className:'text-sm font-semibold text-slate-700'},`Choose QA item for ${row.reference}`),
        row.candidates.map(candidate=>{
          const eligibility=candidateState(row,candidate,canManage),checked=row.item?.id===candidate.id;
          return h('label',{key:candidate.id,style:{display:'flex',alignItems:'flex-start',gap:8,padding:10,marginTop:8,border:'1px solid '+(checked?'#0e7490':'#cbd5e1'),borderRadius:8,background:checked?'#ecfeff':'#fff',color:'#334155',overflowWrap:'anywhere'}},
            h('input',{type:'radio',name:`qa-match-${row.page}`,value:candidate.id,checked,disabled:busy||eligibility.state==='blocked','aria-label':`Choose QA item ${candidate.id} for panel ${row.reference}`,onChange:()=>chooseCandidate(row.page,candidate.id)}),
            h('span',null,candidateDetails(candidate).map((detail,index)=>h('span',{key:index,style:{display:'block',fontSize:index<2?14:12,fontWeight:index===0?600:400}},detail)),eligibility.state!=='ready'&&h('span',{style:{display:'block',fontSize:12,color:eligibility.state==='blocked'?'#9f1239':'#475569'}},eligibility.message))
          );
        }),row.item&&h('button',{type:'button',className:button,disabled:busy,'aria-label':`Clear QA match for panel ${row.reference}`,onClick:()=>chooseCandidate(row.page,'')},'Clear selection')
      ));
    }
    return h('section',{className:'mx-auto max-w-6xl px-4 py-5'},h('div',{className:'rounded-xl border border-slate-300 bg-white p-5'},
      h('div',{className:'flex flex-wrap items-center justify-between gap-3'},h('h2',{className:'text-xl font-semibold text-slate-900'},'Import panel m² from PDF'),h('button',{type:'button',className:button,disabled:busy,onClick:onClose},'Back to QA Centre')),
      h('p',{className:'mt-2 text-sm text-slate-600'},'Use the labelled m² from panel stickers. Choose the matching project and order, then review each panel. End plates without their own labelled area are excluded. QA results stay as recorded.'),
      canManage&&h(ResetControls,{React,canManage,base,request,busy,onBusy:value=>{session.current.busy=value;setBusy(value);},onReset:areasReset}),
      h('label',{className:'mt-4 block text-sm font-semibold text-slate-700'},'Target project / order',h('select',{value:scopeKey,disabled:busy,onChange:event=>{const value=event.target.value;setScopeKey(value);review(rows,value?{project:JSON.parse(value)[0],orderNumber:JSON.parse(value)[1]}:null);},className:'mt-1.5 h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm'},h('option',{value:''},'Choose an order'),scopes.map(([value,order])=>h('option',{key:value,value},`${order.project} · Order ${order.orderNumber}`)))),
      h('label',{className:'mt-4 block text-sm font-semibold text-slate-700'},'Panel stickers PDF',h('input',{type:'file',accept:'.pdf,application/pdf',disabled:busy,onChange:chooseFile,className:'mt-2 block w-full text-sm'})),
      h('p',{role:'status',className:'mt-3 text-sm text-slate-700'},message),
      !!rows.length&&h('p',{className:'mt-2 text-sm text-slate-600'},`${fileName} · ${rows.filter(row=>!row.error).length} labelled panels · ${rows.filter(row=>!row.error).reduce((sum,row)=>sum+row.areaM2,0).toFixed(3)} m² in PDF`),
      !!rows.length&&h('p',{className:'mt-2 text-xs text-slate-500'},'PDF drawing headers: '+Array.from(new Set(rows.filter(row=>!row.error).map(row=>`${row.project||'Project not labelled'} / ${row.order||'Order not labelled'}`))).join('; ')),
      !!preview.length&&h(React.Fragment,null,
        h('button',{type:'button',disabled:busy,className:button,onClick:refreshMatches},'Review latest matches'),
        h('div',{className:'mt-4 overflow-x-auto'},h('table',{style:{width:'100%',minWidth:760,borderCollapse:'collapse',fontSize:14}},h('thead',{style:{background:'#f1f5f9',color:'#475569'}},h('tr',null,['Use','Page','Panel ID','Drawing m²','Match'].map(value=>h('th',{key:value,scope:'col',style:td},value)))),h('tbody',null,preview.map(row=>h('tr',{key:row.page},h('td',{style:td},['ready','replace'].includes(row.state)?h('input',{type:'checkbox',disabled:busy,checked:!!selected[row.page],'aria-label':`Import panel ${row.reference}`,onChange:event=>{setSelected(value=>({...value,[row.page]:event.target.checked}));setConfirmed(false);setSaveMessage('');}}):'—'),h('td',{style:td},row.page),h('td',{style:td},row.reference||'—'),h('td',{style:td},row.areaM2?.toFixed(3)||'—'),h('td',{style:{...td,color:row.state==='blocked'?'#9f1239':'#475569'}},matchCell(row))))))),
        h('p',{className:'mt-4 text-sm font-semibold text-slate-800'},`${chosen.length} selected · ${chosen.reduce((sum,row)=>sum+row.areaM2,0).toFixed(3)} m²`),
        saveMessage&&h('p',{role:'alert',className:'mt-3 text-sm text-red-700'},saveMessage),
        h('label',{className:'mt-3 flex items-start gap-2 text-sm text-slate-700'},h('input',{type:'checkbox',disabled:busy||!chosen.length,checked:confirmed,onChange:event=>{setConfirmed(event.target.checked);setSaveMessage('');}}),`Required: I confirm these drawings belong to ${scope?.project} · Order ${scope?.orderNumber}, and the printed m² is the fabrication area to record.`),
        h('p',{className:'mt-2 text-xs text-slate-500'},'Approved items use their existing QA completion date. Other items count when they pass QA. Fabrication remains separate from the cutting and gate total.'),
        h('button',{type:'button',disabled:busy,onClick:save,className:'mt-4 rounded-lg bg-cyan-800 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50'},busy?'Saving…':`Save ${chosen.length} panel areas`)
      )
    ));
  }
  const api={parsePage,matchRows,candidateState,candidateDetails,extractPdf,View,ResetControls};if(typeof module==='object'&&module.exports)module.exports=api;else root.PanelStockPanelAreaImport=api;
})(typeof window==='object'?window:globalThis);
