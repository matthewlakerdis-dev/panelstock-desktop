(function(root){
  'use strict';
  const object=value=>!!value&&typeof value==='object'&&!Array.isArray(value);
  const text=(value,max,empty=false)=>typeof value==='string'&&value.length<=max&&(empty||value.trim().length>0)&&!/[\u0000-\u001f\u007f]/.test(value);
  const check=(condition,message)=>{if(!condition)throw Error(message);};
  const key=value=>String(value??'').trim().toLocaleLowerCase('en-AU');
  const sameScope=(a,b)=>key(a?.project)===key(b?.project)&&key(a?.orderNumber)===key(b?.orderNumber);
  function scopeOf(value){check(object(value)&&text(value.project,120,true)&&text(value.orderNumber,200),'Choose an existing order.');return {project:value.project.trim(),orderNumber:value.orderNumber.trim()};}
  function panelsOf(value){
    check(Array.isArray(value)&&value.length<=10000,'The order panel list could not be verified.');const seen=new Set();
    return value.map(item=>{
      const id=item?.panelId||item?.id;
      check(object(item)&&text(id,100)&&!seen.has(id)&&(!item.id||item.id===id),'The order contains invalid or duplicate panel records.');seen.add(id);
      check((item.panelNumber==null||text(item.panelNumber,5000,true))&&text(item.sheetNumber,200,true)&&text(item.status,80)&&text(item.qaStatus,100)&&typeof item.eligible==='boolean','A panel status could not be verified.');
      check(item.completedAt==null||text(item.completedAt,100,true),'A panel completion could not be verified.');
      check(item.excludedReason==null||text(item.excludedReason,1000,true),'A panel exclusion could not be verified.');
      check(!item.qaReset||(object(item.qaReset)&&text(item.qaReset.id,100)&&typeof item.qaReset.pending==='boolean'),'A QA reset cycle could not be verified.');
      check(!item.eligible||item.status==='completed','Only completed panels can have QA reset.');
      return {...item,id,panelId:id,panelNumber:item.panelNumber??null,completedAt:item.completedAt??null};
    });
  }
  function contextOf(result,expectedScope){
    check(result?.ok===true,'The order QA details could not be loaded.');const scope=scopeOf(result.scope);
    check(sameScope(scope,scopeOf(expectedScope)),'The QA details belong to a different order.');
    check(Number.isSafeInteger(result.revision)&&result.revision>=0&&Number.isSafeInteger(result.restoreEpoch)&&result.restoreEpoch>=0,'The saved order revision could not be verified.');
    return {scope,panels:panelsOf(result.panels),revision:result.revision,restoreEpoch:result.restoreEpoch};
  }
  function selectionOf(context,selected){return context.panels.filter(panel=>panel.eligible&&selected[panel.id]).map(panel=>panel.id);}
  function planOf(result,scope,panelIds){
    const plan=result?.plan;check(result?.ok===true&&object(plan)&&sameScope(scopeOf(plan.scope),scopeOf(scope)),'The QA reset preview belongs to a different order.');
    check(typeof plan.snapshot==='string'&&/^[a-f0-9]{64}$/i.test(plan.snapshot)&&Number.isSafeInteger(plan.revision)&&plan.revision>=0&&Number.isSafeInteger(plan.restoreEpoch)&&plan.restoreEpoch>=0,'The QA reset preview could not be verified.');
    check(Array.isArray(panelIds)&&panelIds.length>0&&panelIds.length<=500&&new Set(panelIds).size===panelIds.length&&Array.isArray(plan.panelIds)&&plan.panelIds.length===panelIds.length&&new Set(plan.panelIds).size===panelIds.length&&plan.panelIds.every(id=>panelIds.includes(id)),'The QA reset selection changed. Review the panels again.');
    const rows=panelsOf(plan.rows),targets=new Set(panelIds);
    check(rows.length===targets.size&&rows.every(row=>targets.has(row.id)&&row.status==='completed'&&text(row.oldQaStatus,100)&&row.newQaStatus==='awaiting'),'The reviewed QA changes could not be verified.');
    check(Array.isArray(plan.warnings)&&plan.warnings.every(value=>text(value,2000,true)),'The QA reset warnings could not be verified.');
    return {...plan,rows,excluded:panelsOf(plan.excluded)};
  }
  function savedOf(result,plan,mutationId){
    const summary=result?.summary;check(result?.ok===true&&Number.isSafeInteger(result.revision)&&result.revision>=plan.revision&&object(summary)&&sameScope(summary.scope,plan.scope)&&summary.resetId===mutationId&&summary.resetCount===plan.rows.length&&Array.isArray(summary.rows),'The reset receipt could not be verified. Retry the same reset.');
    const rows=panelsOf(summary.rows),before=new Map(plan.rows.map(row=>[row.id,row]));
    check(rows.length===before.size&&rows.every(row=>{const old=before.get(row.id);return old&&row.panelNumber===old.panelNumber&&row.status===old.status&&row.completedAt===old.completedAt&&row.qaStatus==='awaiting'&&row.qaReset?.id===mutationId&&row.qaReset.pending===true;}),'The saved QA reset could not be verified. Retry the same reset.');
    return result;
  }
  function requestId(){if(typeof root.crypto?.randomUUID==='function')return root.crypto.randomUUID();if(typeof root.crypto?.getRandomValues==='function')return Array.from(root.crypto.getRandomValues(new Uint8Array(16)),n=>n.toString(16).padStart(2,'0')).join('');throw Error('Use an up-to-date browser before resetting QA.');}
  const statusLabel=value=>value==='not_required'?'QA not required':value==='approved'?'Approved':value==='awaiting'?'Awaiting QA':String(value||'Not recorded').replace(/_/g,' ');
  function View({React,scope,request,onClose,onSaved,owner=null}){
    const h=React.createElement,[context,setContext]=React.useState(null),[selected,setSelected]=React.useState({}),[plan,setPlan]=React.useState(null),[reason,setReason]=React.useState(''),[confirmed,setConfirmed]=React.useState(false),[busy,setBusy]=React.useState(true),[error,setError]=React.useState(''),[message,setMessage]=React.useState('Loading current QA details…'),[saved,setSaved]=React.useState(null);
    const session=React.useRef({active:true,busy:true,version:0,owner}),operation=React.useRef(null),chosenScope=scopeOf(scope),scopeKey=JSON.stringify(chosenScope);
    const send=payload=>request(payload,session.current.owner);
    const current=version=>session.current.active&&session.current.version===version;
    function lock(value){session.current.busy=value;setBusy(value);}
    async function load(version,keepSelection){const result=await send({action:'context',...chosenScope});if(!current(version))return;const value=contextOf(result,chosenScope);setContext(value);setSelected(previous=>Object.fromEntries(value.panels.filter(panel=>panel.eligible&&(!keepSelection||previous[panel.id])).slice(0,500).map(panel=>[panel.id,true])));return value;}
    React.useEffect(()=>{session.current.active=true;const version=++session.current.version;lock(true);Promise.resolve().then(()=>load(version,false)).then(value=>{if(current(version)&&value)setMessage('Choose the completed panels that need a new QA inspection.');}).catch(failure=>{if(current(version))setError(failure.message);}).finally(()=>{if(current(version))lock(false);});return()=>{session.current.active=false;++session.current.version;};},[scopeKey]);
    const ids=context?selectionOf(context,selected):[],frozen=!!operation.current,eligible=context?.panels.filter(panel=>panel.eligible)||[],excluded=context?.panels.filter(panel=>!panel.eligible)||[];
    function close(){if(operation.current)return;session.current.active=false;++session.current.version;onClose();}
    function change(id,value){if(session.current.busy||operation.current)return;setSelected(previous=>({...previous,[id]:value}));setPlan(null);setConfirmed(false);setError('');}
    async function review(){if(session.current.busy||operation.current||!context)return;if(!ids.length||ids.length>500){setError('Select 1 to 500 eligible panels.');return;}const version=++session.current.version;lock(true);setError('');setPlan(null);setConfirmed(false);try{const result=await send({action:'preview',...chosenScope,panelIds:ids});if(current(version)){setPlan(planOf(result,chosenScope,ids));setMessage('Review the selected panels before resetting QA.');}}catch(failure){if(current(version))setError(failure.message);}finally{if(current(version))lock(false);}}
    async function save(){
      if(session.current.busy||!plan)return;
      if(!operation.current){const explanation=reason.trim();if(!confirmed||!explanation||explanation.length>1000||/[\u0000-\u001f\u007f]/.test(explanation)){setError('Confirm the preview and enter a reason of 1 to 1000 characters on one line.');return;}operation.current={action:'save',...chosenScope,panelIds:[...plan.panelIds],snapshot:plan.snapshot,revision:plan.revision,restoreEpoch:plan.restoreEpoch,mutationId:requestId(),reason:explanation,confirmed:true};}
      const version=++session.current.version;lock(true);setError('');setMessage('Resetting QA…');
      try{const result=await send(operation.current);if(!current(version))return;savedOf(result,plan,operation.current.mutationId);operation.current=null;setSaved(result.summary);setPlan(null);setMessage(`${result.summary.resetCount} panels are awaiting a new QA inspection.`);onSaved?.(result);}
      catch(failure){if(!current(version))return;setError(failure.message||'The reset could not be confirmed. Retry the same reset.');if(failure.status===409){operation.current=null;setPlan(null);setConfirmed(false);try{await load(version,true);if(current(version))setMessage('Saved records changed. Select the current eligible panels and preview again.');}catch(refreshFailure){if(current(version))setError(refreshFailure.message);}}else if(failure.status>=400&&failure.status<500){operation.current=null;setPlan(null);setConfirmed(false);setMessage('Review the current panels before saving again.');}}
      finally{if(current(version))lock(false);}
    }
    const button='rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700',label=panel=>`Sheet ${panel.sheetNumber||'—'} · Panel ${panel.panelNumber||'No current ID'}`;
    return h('section',{className:'mx-auto max-w-5xl px-4 py-5'},h('div',{className:'rounded-xl border border-slate-300 bg-white p-5'},
      h('div',{className:'flex flex-wrap items-center justify-between gap-3'},h('h2',{className:'text-xl font-semibold text-slate-900'},'Reset order QA'),h('button',{type:'button',className:button,disabled:frozen,onClick:close},'Back to CNC tracker')),
      h('p',{className:'mt-3 text-base font-semibold text-slate-800'},`${chosenScope.project||'No job reference'} · Order ${chosenScope.orderNumber}`),
      h('p',{className:'mt-2 text-sm text-slate-600'},'Selected panels will need a new QA inspection. Cutting stays complete. Panel m², photos and previous inspections are retained. Caps marked QA not required stay excluded.'),
      h('p',{className:'mt-2 text-sm text-slate-600'},'Fabricated and Ready progress will be pending until the required QA is completed again.'),
      message&&h('p',{role:'status',className:'mt-3 text-sm text-slate-700'},message),error&&h('p',{role:'alert',className:'mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-800'},error),
      saved?h('p',{className:'mt-3 text-sm text-green-700'},'Open QA Centre → Awaiting QA to inspect these panels.'):context&&h(React.Fragment,null,
        h('div',{className:'mt-4 flex flex-wrap items-center gap-3'},h('p',{className:'text-sm font-semibold text-slate-700'},`${ids.length} selected · ${eligible.length} eligible · ${excluded.length} excluded`),h('button',{type:'button',className:button,disabled:busy||frozen||!eligible.length,onClick:()=>{if(session.current.busy||operation.current)return;setSelected(Object.fromEntries(eligible.slice(0,500).map(panel=>[panel.id,ids.length!==Math.min(eligible.length,500)])));setPlan(null);setConfirmed(false);}},ids.length===Math.min(eligible.length,500)?'Clear selection':eligible.length>500?'Select first 500 eligible':'Select all eligible')),
        eligible.length>500&&h('p',{className:'mt-2 text-sm text-slate-600'},'Reset up to 500 panels at a time. Remaining panels can be selected in another reviewed reset.'),
        h('div',{className:'mt-3 space-y-2'},eligible.map(panel=>h('label',{key:panel.id,className:'flex items-start gap-3 rounded-lg border border-slate-200 p-3'},h('input',{type:'checkbox','aria-label':'Reset QA for '+label(panel),checked:!!selected[panel.id],disabled:busy||frozen,onChange:event=>change(panel.id,event.target.checked)}),h('span',{className:'min-w-0 break-words text-sm text-slate-800'},h('strong',null,label(panel)),h('span',{className:'mt-1 block text-xs text-slate-500'},`${statusLabel(panel.qaStatus)} → Awaiting QA · Cut stays complete`))))),
        excluded.length>0&&h('section',{'aria-label':'Panels excluded from QA reset',className:'mt-4 rounded-lg bg-slate-50 p-4'},h('h3',{className:'text-sm font-semibold text-slate-700'},'Excluded panels'),excluded.map(panel=>h('p',{key:panel.id,className:'mt-2 break-words text-sm text-slate-600'},`${label(panel)} · ${statusLabel(panel.qaStatus)} · ${panel.excludedReason||'Not eligible for QA reset'}`))),
        h('button',{type:'button',className:button+' mt-4',disabled:busy||frozen||!ids.length||ids.length>500,onClick:review},'Preview QA reset'),
        plan&&h('section',{'aria-label':'Reviewed order QA reset',className:'mt-4 rounded-xl border border-amber-300 bg-amber-50 p-4'},h('h3',{className:'text-lg font-semibold text-slate-900'},`${plan.rows.length} panels will need QA again`),plan.rows.map(panel=>h('p',{key:panel.id,className:'mt-2 break-words text-sm text-slate-800'},`${label(panel)} · ${statusLabel(panel.oldQaStatus)} → Awaiting QA`)),plan.warnings.map((warning,index)=>h('p',{key:index,className:'mt-2 text-sm text-amber-900'},warning)),
          h('label',{className:'mt-4 block text-sm font-semibold text-slate-700'},'Reason for resetting QA',h('input',{type:'text',maxLength:1000,'aria-label':'Reason for resetting order QA',value:reason,disabled:busy||frozen,onChange:event=>setReason(event.target.value),className:'mt-2 h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm'})),
          h('label',{className:'mt-3 flex items-start gap-2 text-sm text-slate-800'},h('input',{type:'checkbox','aria-label':'Confirm reviewed order QA reset',checked:confirmed,disabled:busy||frozen,onChange:event=>setConfirmed(event.target.checked)}),'I confirm these selected panels must be inspected again. Other panels and orders stay unchanged.'),
          h('button',{type:'button',onClick:save,disabled:busy||(!frozen&&(!confirmed||!reason.trim())),className:'mt-4 rounded-lg bg-cyan-800 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50'},busy?'Saving…':frozen?'Retry reset verification':'Reset selected QA'),frozen&&!busy&&h('p',{className:'mt-2 text-sm text-amber-900'},'Retry to verify the same reset before changing this review or closing it.')
        )
      )
    ));
  }
  const api={contextOf,selectionOf,planOf,savedOf,View};if(typeof module==='object'&&module.exports)module.exports=api;else root.PanelStockCncOrderQaReset=api;
})(typeof window==='object'?window:globalThis);
