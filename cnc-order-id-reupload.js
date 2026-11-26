(function(root){
  'use strict';
  const MAX_REUPLOAD_BYTES=8*1024*1024;
  const normalId=value=>String(value??'').trim().toLocaleLowerCase('en-AU');
  const reuploadObject=value=>!!value&&typeof value==='object'&&!Array.isArray(value);
  const reuploadText=(value,max,empty=false)=>typeof value==='string'&&value.length<=max&&(empty||value.trim().length>0)&&!/[\u0000-\u001f\u007f]/.test(value);
  const reuploadCheck=(condition,message)=>{if(!condition)throw Error(message);};
  function normalizeScope(value){
    reuploadCheck(reuploadObject(value)&&reuploadText(value.project,120,true)&&reuploadText(value.orderNumber,200),'Choose an existing project and order.');
    return {project:value.project.trim(),orderNumber:value.orderNumber.trim()};
  }
  function sameReuploadScope(a,b){return normalId(a.project)===normalId(b.project)&&normalId(a.orderNumber)===normalId(b.orderNumber);}
  function normalizeReuploadPanels(value){
    reuploadCheck(Array.isArray(value)&&value.length<=10000,'The existing order panel list could not be verified.');
    const seen=new Set();
    return value.map(item=>{
      reuploadCheck(reuploadObject(item)&&reuploadText(item.id,100)&&!seen.has(item.id)&&reuploadText(item.sheetNumber,200,true)&&reuploadText(item.status,80),'The existing order contains invalid or duplicate panel records.');seen.add(item.id);
      reuploadCheck(item.panelNumber===null||reuploadText(item.panelNumber,5000,true),'An existing panel ID could not be verified.');
      reuploadCheck(item.completedAt==null||reuploadText(item.completedAt,100,true),'An existing completion date could not be verified.');
      for(const key of ['qaStatus','fabricationStatus'])reuploadCheck(item[key]==null||reuploadText(item[key],100,true),'An existing panel status could not be verified.');
      return {id:item.id,panelNumber:item.panelNumber,sheetNumber:item.sheetNumber,status:item.status,completedAt:item.completedAt??null,qaStatus:item.qaStatus??null,fabricationStatus:item.fabricationStatus??null};
    });
  }
  function normalizeContext(value,expectedScope){
    reuploadCheck(reuploadObject(value)&&value.ok===true,'The existing order could not be loaded.');
    const scope=normalizeScope(value.scope),expected=normalizeScope(expectedScope);
    reuploadCheck(sameReuploadScope(scope,expected),'The returned panel records belong to a different order.');
    reuploadCheck(Number.isSafeInteger(value.revision)&&value.revision>=0&&Number.isSafeInteger(value.restoreEpoch)&&value.restoreEpoch>=0,'The saved order revision could not be verified.');
    return {scope,panels:normalizeReuploadPanels(value.panels),revision:value.revision,restoreEpoch:value.restoreEpoch};
  }
  function normalizeAnalysis(value,expectedScope){
    reuploadCheck(reuploadObject(value)&&value.ok===true&&reuploadText(value.analysisId,200),'The drawing analysis could not be verified.');
    const scope=normalizeScope(value.scope),expected=normalizeScope(expectedScope),source=value.source;
    reuploadCheck(sameReuploadScope(scope,expected),'The drawing analysis belongs to a different order.');
    reuploadCheck(reuploadObject(source)&&reuploadText(source.fileName,200)&&typeof source.sha256==='string'&&/^[a-fA-F0-9]{64}$/.test(source.sha256)&&Number.isSafeInteger(source.bytes)&&source.bytes>0&&source.bytes<=MAX_REUPLOAD_BYTES,'The PDF source details could not be verified.');
    reuploadCheck(Array.isArray(value.occurrences)&&value.occurrences.length<=1000,'The drawing has too many or invalid panel occurrences.');
    const seen=new Set(),occurrences=value.occurrences.map(item=>{
      reuploadCheck(reuploadObject(item)&&reuploadText(item.occurrenceId,200)&&!seen.has(item.occurrenceId),'The drawing contains invalid or repeated occurrence references.');seen.add(item.occurrenceId);
      reuploadCheck(typeof item.eligible==='boolean'&&reuploadText(item.panelNumber,item.eligible?200:5000,!item.eligible)&&reuploadText(item.sheetNumber,200,true),'A detected panel ID or sheet could not be verified.');
      reuploadCheck(Number.isSafeInteger(item.page)&&item.page>=1&&item.page<=10000&&Number.isSafeInteger(item.quantity)&&item.quantity>=1&&item.quantity<=1000&&Number.isSafeInteger(item.copyIndex)&&item.copyIndex>=0&&item.copyIndex<item.quantity,'A drawing page, quantity or copy reference is invalid.');
      reuploadCheck(item.error==null||reuploadText(item.error,2000,true),'A drawing warning could not be verified.');
      return {occurrenceId:item.occurrenceId,panelNumber:item.panelNumber,page:item.page,sheetNumber:item.sheetNumber,copyIndex:item.copyIndex,quantity:item.quantity,eligible:item.eligible,error:item.error||''};
    });
    reuploadCheck(value.warnings===undefined||Array.isArray(value.warnings)&&value.warnings.length<=1000&&value.warnings.every(warning=>reuploadText(warning,2000,true)),'The PDF warnings could not be verified.');
    return {analysisId:value.analysisId,scope,source:{fileName:source.fileName,sha256:source.sha256.toLowerCase(),bytes:source.bytes},occurrences,panels:normalizeReuploadPanels(value.panels),warnings:[...(value.warnings||[])]};
  }
  function autoMappings(analysis){
    const counts=new Map(),candidates=new Map(),result={};
    const identity=item=>JSON.stringify([normalId(item.sheetNumber),normalId(item.panelNumber)]);
    for(const occurrence of analysis.occurrences){const key=identity(occurrence);counts.set(key,(counts.get(key)||0)+1);}
    for(const panel of analysis.panels){const key=identity(panel),items=candidates.get(key)||[];items.push(panel);candidates.set(key,items);}
    for(const occurrence of analysis.occurrences){
      const key=identity(occurrence),matches=candidates.get(key)||[];
      if(occurrence.eligible&&occurrence.quantity===1&&counts.get(key)===1&&matches.length===1)Object.defineProperty(result,occurrence.occurrenceId,{value:matches[0].id,enumerable:true,writable:true,configurable:true});
    }
    return result;
  }
  function buildMappings(analysis,selections={},combines={}){
    const issues=[],groupsById=new Map(),panels=new Map(analysis.panels.map(panel=>[panel.id,panel])),occurrences=new Map(analysis.occurrences.map(item=>[item.occurrenceId,item])),unmatchedOccurrenceIds=[];
    if(!reuploadObject(selections)||!reuploadObject(combines))return {mappings:[],groups:[],issues:['Review the selected existing panel records.'],unmatchedOccurrenceIds:analysis.occurrences.map(item=>item.occurrenceId)};
    for(const key of Object.keys(selections))if(!occurrences.has(key)&&selections[key])issues.push('An unknown PDF occurrence has been selected.');
    for(const occurrence of analysis.occurrences){
      const panelId=Object.hasOwn(selections,occurrence.occurrenceId)?selections[occurrence.occurrenceId]:'';
      if(panelId==null||panelId===''){unmatchedOccurrenceIds.push(occurrence.occurrenceId);continue;}
      if(!occurrence.eligible){issues.push(`PDF page ${occurrence.page}: this occurrence is not eligible for an ID update.`);unmatchedOccurrenceIds.push(occurrence.occurrenceId);continue;}
      if(typeof panelId!=='string'||!panels.has(panelId)){issues.push(`PDF page ${occurrence.page}: choose an existing panel in this order.`);unmatchedOccurrenceIds.push(occurrence.occurrenceId);continue;}
      let group=groupsById.get(panelId);if(!group){group={panelId,panel:panels.get(panelId),occurrences:[]};groupsById.set(panelId,group);}group.occurrences.push(occurrence);
    }
    const groups=[...groupsById.values()].map(group=>({...group,combineConfirmed:group.occurrences.length>1&&Object.hasOwn(combines,group.panelId)&&combines[group.panelId]===true}));
    for(const group of groups)if(group.occurrences.length>1&&!group.combineConfirmed)issues.push(`Confirm that existing record ${group.panel.panelNumber||group.panelId} represents these ${group.occurrences.length} labels.`);
    if(!groups.length)issues.push('Choose at least one existing panel to update.');
    return {mappings:groups.map(group=>({panelId:group.panelId,occurrenceIds:group.occurrences.map(item=>item.occurrenceId),combineConfirmed:group.combineConfirmed})),groups,issues,unmatchedOccurrenceIds};
  }
  function sameOrder(a,b){return String(a?.project??'').trim().toLowerCase()===String(b?.project??'').trim().toLowerCase()&&String(a?.orderNumber??'').trim().toLowerCase()===String(b?.orderNumber??'').trim().toLowerCase();}
  function checkPlan(result,analysis,mappings){
    const p=result?.plan,fail=()=>{throw Error('The reviewed ID changes could not be verified. Review the drawings again.');};
    if(result?.ok!==true||!p||p.analysisId!==analysis.analysisId||!sameOrder(p.scope,analysis.scope)||p.source?.sha256!==analysis.source.sha256||typeof p.snapshot!=='string'||!/^[a-f0-9]{64}$/i.test(p.snapshot)||!Number.isSafeInteger(p.revision)||p.revision<0||!Number.isSafeInteger(p.restoreEpoch)||p.restoreEpoch<0||!Array.isArray(p.rows)||p.rows.length!==mappings.length||!Number.isSafeInteger(p.changedCount)||p.changedCount<0||p.changedCount>p.rows.length)fail();
    const selected=new Map(mappings.map(m=>[m.panelId,m])),seen=new Set();
    for(const row of p.rows){const mapping=selected.get(row?.panelId);if(!mapping||seen.has(row.panelId)||!(row.oldPanelNumber===null||typeof row.oldPanelNumber==='string')||typeof row.newPanelNumber!=='string'||!row.newPanelNumber.trim()||row.newPanelNumber.length>200||typeof row.sheetNumber!=='string'||typeof row.status!=='string'||!(row.completedAt===null||typeof row.completedAt==='string')||!Array.isArray(row.occurrenceIds)||JSON.stringify([...row.occurrenceIds].sort())!==JSON.stringify([...mapping.occurrenceIds].sort()))fail();seen.add(row.panelId);}
    if(p.changedCount!==p.rows.filter(row=>(row.oldPanelNumber??'')!==row.newPanelNumber).length||!Array.isArray(p.unmatchedPanelIds)||!Array.isArray(p.unmatchedOccurrenceIds))fail();
    return p;
  }
  function checkSaved(result,plan){
    const summary=result?.summary;
    if(result?.ok!==true||(!Number.isSafeInteger(result.revision)||result.revision<0)||!summary||!sameOrder(summary.scope,plan.scope)||summary.source?.sha256!==plan.source.sha256||summary.changedCount!==plan.changedCount||!Array.isArray(summary.rows)||summary.rows.length!==plan.rows.length)throw Error('The saved ID corrections could not be verified. Retry to verify the same update.');
    const expected=new Map(plan.rows.map(row=>[row.panelId,row])),seen=new Set();
    for(const row of summary.rows){const before=expected.get(row?.panelId);if(!before||seen.has(row.panelId)||row.newPanelNumber!==before.newPanelNumber||row.status!==before.status||(row.completedAt??null)!==(before.completedAt??null))throw Error('The saved ID corrections could not be verified. Retry to verify the same update.');seen.add(row.panelId);}
    return result;
  }
  function requestId(){
    if(typeof root.crypto?.randomUUID==='function')return root.crypto.randomUUID();
    if(typeof root.crypto?.getRandomValues==='function')return Array.from(root.crypto.getRandomValues(new Uint8Array(16)),n=>n.toString(16).padStart(2,'0')).join('');
    throw Error('Open PanelStock in an up-to-date browser before saving ID corrections.');
  }
  function readUploadPdf(file,onReader){
    if(!file||!(file.size>0)||file.size>8*1024*1024||typeof file.name!=='string'||!file.name||file.name.length>200||!(file.type==='application/pdf'||/\.pdf$/i.test(file.name)))return Promise.reject(Error('Choose a PDF under 8 MB with a filename of at most 200 characters.'));
    return new Promise((resolve,reject)=>{const reader=new root.FileReader();onReader?.(reader);reader.onload=()=>{const value=String(reader.result||'');if(!/^data:[^;]*;base64,[A-Za-z0-9+/=]+$/.test(value)){reject(Error('The PDF could not be read.'));return;}resolve(value.replace(/^data:[^;]*;/,'data:application/pdf;'));};reader.onerror=()=>reject(Error('The PDF could not be read.'));reader.onabort=()=>reject(Error('PDF reading was cancelled.'));reader.readAsDataURL(file);});
  }
  function statusText(panel){return `Cutting: ${panel.status==='completed'?'Completed':panel.status==='pending'?'Pending':panel.status||'Not recorded'} · QA: ${String(panel.qaStatus||'Not recorded').replace(/_/g,' ')} · Fabrication: ${String(panel.fabricationStatus||'Not recorded').replace(/_/g,' ')}`;}
  function View({React,scope,request,onClose,onSaved}){
    const h=React.createElement;
    const [context,setContext]=React.useState(null),[analysis,setAnalysis]=React.useState(null),[selected,setSelected]=React.useState({}),[combine,setCombine]=React.useState({}),[plan,setPlan]=React.useState(null),[reason,setReason]=React.useState(''),[confirmed,setConfirmed]=React.useState(false),[busy,setBusy]=React.useState(true),[error,setError]=React.useState(''),[message,setMessage]=React.useState('Loading the existing order…');
    const session=React.useRef({active:true,busy:true,version:0}),operation=React.useRef(null),reader=React.useRef(null);
    const chosenScope={project:String(scope?.project??''),orderNumber:String(scope?.orderNumber??'')},scopeKey=JSON.stringify(chosenScope);
    const current=version=>session.current.active&&session.current.version===version;
    function lock(value){session.current.busy=value;setBusy(value);}
    React.useEffect(()=>{
      session.current.active=true;const version=++session.current.version;lock(true);setError('');
      Promise.resolve().then(()=>request({action:'context',...chosenScope})).then(result=>{if(current(version)){setContext(normalizeContext(result,chosenScope));setMessage('Choose the revised drawing PDF for this existing order.');}},failure=>{if(current(version))setError(failure.message||'The order could not be loaded.');}).catch(failure=>{if(current(version))setError(failure.message||'The order could not be loaded.');}).finally(()=>{if(current(version))lock(false);});
      return()=>{session.current.active=false;++session.current.version;try{reader.current?.abort();}catch{}};
    },[scopeKey]);
    const draft=analysis?buildMappings(analysis,selected,combine):{mappings:[],groups:[],issues:[],unmatchedOccurrenceIds:[]};
    const frozen=!!operation.current;
    function close(){if(operation.current)return;session.current.active=false;++session.current.version;try{reader.current?.abort();}catch{}onClose();}
    function changeSelection(occurrenceId,panelId){if(session.current.busy||operation.current)return;setSelected(value=>({...value,[occurrenceId]:panelId}));setCombine({});setPlan(null);setConfirmed(false);setError('');}
    async function chooseFile(event){
      const file=event.target.files?.[0];event.target.value='';if(!file||session.current.busy||operation.current||!context)return;
      const version=++session.current.version;lock(true);setError('');setMessage('Reading and analysing the drawing PDF…');setAnalysis(null);setSelected({});setCombine({});setPlan(null);setConfirmed(false);setReason('');
      try{const pdf=await readUploadPdf(file,value=>{reader.current=value;});if(!current(version))return;const result=await request({action:'analyse',...chosenScope,fileName:file.name,pdf});if(!current(version))return;const value=normalizeAnalysis(result,chosenScope);setAnalysis(value);setSelected(autoMappings(value));setContext({...context,scope:value.scope,panels:value.panels});setMessage('Review each detected label. Select the existing panel record for every ID you want to update.');}
      catch(failure){if(current(version)){setError(failure.message||'The PDF could not be analysed.');setMessage('');}}
      finally{reader.current=null;if(current(version))lock(false);}
    }
    async function fetchPreview(mappings,version){
      const result=await request({action:'preview',analysisId:analysis.analysisId,mappings});if(!current(version))return null;const value=checkPlan(result,analysis,mappings);setPlan(value);setConfirmed(false);return value;
    }
    async function review(){
      if(session.current.busy||operation.current||!analysis)return;if(draft.issues.length){setError(draft.issues.join(' '));return;}if(!draft.mappings.length){setError('Select at least one existing panel record to review.');return;}
      const version=++session.current.version;lock(true);setError('');setMessage('Checking the current saved panel records…');setPlan(null);setConfirmed(false);
      try{const value=await fetchPreview(draft.mappings,version);if(value)setMessage(value.changedCount?'Review the old and new IDs and their preserved statuses before saving.':'No panel ID changes are needed for the selected records.');}
      catch(failure){if(current(version))setError(failure.message||'The ID changes could not be reviewed.');}
      finally{if(current(version))lock(false);}
    }
    async function save(){
      if(session.current.busy||!analysis||!plan)return;
      const explanation=reason.trim();if(!operation.current){if(!confirmed){setError('Confirm the reviewed ID changes before saving.');return;}if(!explanation||explanation.length>1000||/[\u0000-\u001f\u007f]/.test(explanation)){setError('Enter a reason of 1 to 1000 characters on one line.');return;}if(!plan.changedCount){setError('No panel ID changes are selected.');return;}operation.current={action:'save',analysisId:analysis.analysisId,mappings:JSON.parse(JSON.stringify(draft.mappings)),snapshot:plan.snapshot,revision:plan.revision,restoreEpoch:plan.restoreEpoch,mutationId:requestId(),reason:explanation,confirmed:true};}
      const version=++session.current.version;lock(true);setError('');setMessage('Saving ID corrections…');
      try{const result=await request(operation.current);if(!current(version))return;checkSaved(result,plan);onSaved?.(result);onClose();}
      catch(failure){if(!current(version))return;setError(failure.message||'The update could not be confirmed. Retry to verify the same update.');
        if(failure.status===409){const mappings=operation.current.mappings;operation.current=null;setPlan(null);setConfirmed(false);try{const value=await fetchPreview(mappings,version);if(value)setMessage('Saved records changed. Review the latest ID changes and confirm again.');}catch(previewFailure){if(current(version)){setError(previewFailure.message||'Choose the PDF again to review current records.');setMessage('Choose the PDF again if its analysis has expired.');}}}
        else if(failure.status>=400&&failure.status<500){operation.current=null;setPlan(null);setConfirmed(false);setMessage('Review the mappings or choose the PDF again before saving.');}
      }finally{if(current(version))lock(false);}
    }
    const button='rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700',selectClass='mt-2 h-11 w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 text-sm',auto=analysis?autoMappings(analysis):{};
    const label=panel=>`Sheet ${panel.sheetNumber||'—'} · ${panel.panelNumber||'No current ID'} · ${panel.status==='completed'?'Cut':panel.status||'Not recorded'}`;
    return h('section',{className:'mx-auto max-w-5xl px-4 py-5'},
      h('div',{className:'rounded-xl border border-slate-300 bg-white p-5'},
        h('div',{className:'flex flex-wrap items-center justify-between gap-3'},h('h2',{className:'text-xl font-semibold text-slate-900'},'Re-upload CNC drawings'),h('button',{type:'button',className:button,disabled:frozen,onClick:close},'Back to CNC tracker')),
        h('p',{className:'mt-3 text-base font-semibold text-slate-800'},`${chosenScope.project||'No job reference'} · Order ${chosenScope.orderNumber}`),
        h('p',{className:'mt-2 text-sm text-slate-600'},'Use the PDF to correct panel IDs in this existing order. Cutting, QA and fabrication statuses stay attached to the same records. Sheets, stock, areas and original cutting-source references stay unchanged.'),
        context&&h('p',{className:'mt-2 text-sm text-slate-600'},`${context.panels.length} existing records in this order. The PDF does not add or remove records.`),
        h('label',{className:'mt-4 block text-sm font-semibold text-slate-700'},'Revised CNC drawing PDF',h('input',{type:'file',accept:'.pdf,application/pdf','aria-label':'Revised CNC drawing PDF',disabled:busy||frozen||!context,onChange:chooseFile,className:'mt-2 block w-full text-sm'})),
        h('p',{className:'mt-1 text-sm text-slate-500'},'PDF files up to 8 MB.'),
        message&&h('p',{role:'status',className:'mt-3 text-sm text-slate-700'},message),error&&h('p',{role:'alert',className:'mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-800'},error)
      ),
      analysis&&h(React.Fragment,null,
        h('div',{className:'mt-4 rounded-xl border border-slate-300 bg-white p-4'},h('p',{className:'text-sm font-semibold text-slate-800'},`${analysis.source.fileName} · ${analysis.occurrences.length} detected label occurrences`),analysis.warnings.length>0&&h('ul',{className:'mt-2 list-disc space-y-1 pl-5 text-sm text-amber-900'},analysis.warnings.map((warning,index)=>h('li',{key:index},warning)))),
        h('div',{className:'mt-4 space-y-3'},analysis.occurrences.map(occurrence=>{const target=analysis.panels.find(panel=>panel.id===selected[occurrence.occurrenceId]);return h('article',{key:occurrence.occurrenceId,className:'rounded-xl border border-slate-300 bg-white p-4'},
          h('p',{className:'break-words text-base font-semibold text-slate-900'},occurrence.panelNumber||'No readable panel ID'),
          h('p',{className:'mt-1 text-sm text-slate-500'},`PDF page ${occurrence.page} · Printed sheet ${occurrence.sheetNumber||'—'}${occurrence.quantity>1?` · Copy ${occurrence.copyIndex+1} of ${occurrence.quantity}`:''}`),
          occurrence.eligible===false?h('p',{className:'mt-2 text-sm text-amber-900'},occurrence.error||'This label requires review and cannot be selected.'):h('label',{className:'mt-3 block text-sm font-semibold text-slate-700'},'Existing panel record',h('select',{'aria-label':'Existing panel for '+occurrence.occurrenceId,className:selectClass,value:selected[occurrence.occurrenceId]||'',disabled:busy||frozen,onChange:event=>changeSelection(occurrence.occurrenceId,event.target.value)},h('option',{value:''},'Leave this label unmapped'),analysis.panels.map(panel=>h('option',{key:panel.id,value:panel.id},label(panel))))),
          target&&h('p',{className:'mt-2 text-sm text-slate-600'},statusText(target)),
          target&&auto[occurrence.occurrenceId]===target.id&&h('p',{className:'mt-1 text-sm text-green-700'},'Matched the existing ID on the same sheet.')
        );})),
        draft.groups.filter(group=>group.occurrences.length>1).map(group=>h('div',{key:group.panelId,className:'mt-3 rounded-xl border border-amber-300 bg-amber-50 p-4'},h('p',{className:'text-sm font-semibold text-slate-800'},`${label(group.panel)} ← ${group.occurrences.map(item=>item.panelNumber).join(', ')}`),h('label',{className:'mt-2 flex items-start gap-2 text-sm text-slate-800'},h('input',{type:'checkbox','aria-label':'Confirm aggregate '+group.panelId,checked:!!combine[group.panelId],disabled:busy||frozen,onChange:event=>{setCombine(value=>({...value,[group.panelId]:event.target.checked}));setPlan(null);setConfirmed(false);setError('');}}),'This existing record represents these labels.'))),
        h('div',{className:'mt-4 rounded-xl border border-slate-300 bg-white p-4'},h('p',{className:'text-sm text-slate-700'},`${draft.mappings.length} existing records selected · ${draft.unmatchedOccurrenceIds.length} PDF labels left unmapped.`),draft.issues.length>0&&h('ul',{className:'mt-2 list-disc pl-5 text-sm text-amber-900'},draft.issues.map((issue,index)=>h('li',{key:index},issue))),h('button',{type:'button',className:button+' mt-3',disabled:busy||frozen||!draft.mappings.length||draft.issues.length>0,onClick:review},'Review ID updates')),
        plan&&h('section',{'aria-label':'Reviewed panel ID updates',className:'mt-4 rounded-xl border border-slate-300 bg-white p-5'},h('h3',{className:'text-lg font-semibold text-slate-900'},`${plan.changedCount} panel ID ${plan.changedCount===1?'change':'changes'}`),
          h('div',{className:'mt-3 space-y-3'},plan.rows.map(row=>h('div',{key:row.panelId,className:'rounded-lg border border-slate-200 p-3'},h('p',{className:'break-words text-sm font-semibold text-slate-900'},`${row.oldPanelNumber||'No current ID'} → ${row.newPanelNumber}`),h('p',{className:'mt-1 text-sm text-slate-600'},`Sheet ${row.sheetNumber||'—'} · ${statusText(row)}`)))),
          h('p',{className:'mt-3 text-sm text-slate-600'},`${plan.unmatchedPanelIds.length} existing records remain unmapped and unchanged. ${plan.unmatchedOccurrenceIds.length} PDF labels remain unmapped.`),
          h('label',{className:'mt-4 block text-sm font-semibold text-slate-700'},'Reason for correction',h('input',{type:'text',maxLength:1000,'aria-label':'Reason for drawing ID corrections',value:reason,disabled:busy||frozen,onChange:event=>{setReason(event.target.value);setError('');},className:selectClass})),
          h('label',{className:'mt-3 flex items-start gap-2 text-sm text-slate-800'},h('input',{type:'checkbox','aria-label':'Confirm reviewed drawing ID corrections',checked:confirmed,disabled:busy||frozen,onChange:event=>{setConfirmed(event.target.checked);setError('');}}),'I reviewed these existing records and ID changes. Their cutting, QA and fabrication statuses must stay unchanged.'),
          h('button',{type:'button',onClick:save,disabled:busy||(!frozen&&(!confirmed||!reason.trim()||!plan.changedCount)),className:'mt-4 rounded-lg bg-cyan-800 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50'},busy?'Saving…':frozen?'Retry update verification':`Save ${plan.changedCount} ID ${plan.changedCount===1?'change':'changes'}`),
          frozen&&!busy&&h('p',{className:'mt-2 text-sm text-amber-900'},'Retry to verify the same update before changing this review or closing it.')
        )
      )
    );
  }
  const api={normalizeContext,normalizeAnalysis,autoMappings,buildMappings,checkPlan,checkSaved,readUploadPdf,View};if(typeof module==='object'&&module.exports)module.exports=api;else root.PanelStockCncOrderIdReupload=api;
})(typeof window==='object'?window:globalThis);
