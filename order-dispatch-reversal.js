(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.PanelStockOrderDispatchReversal=api;})(typeof window==='object'?window:globalThis,function(){
 'use strict';
 function blockedReason(order){return order?.status!=='dispatched'?'This order is no longer dispatched.':order.hasDeliveryReceipts||order.receipts?.length?'A delivery has already been recorded. Review the delivery record before reversing dispatch.':'';}
 function createController({order,client,baseUrl,onChange,uuid=()=>crypto.randomUUID()}){
  const owner=client.username;let live=true,locked=false,pending=null,version=0;
  const state={order,busy:true,reason:'',error:'',phase:'loading',conflict:null,uncertain:false};
  const current=()=>live&&client.username===owner;
  const publish=patch=>{if(current()){Object.assign(state,patch);onChange({...state});}};
  async function request(path,body){if(!current())throw Error('Your account changed. Reopen the order.');const response=await client.apiFetch(baseUrl+path,body===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const data=await response.json();if(!current())throw Error('Your account changed. Reopen the order.');return {response,data};}
  async function load(){
   if(locked||!current())return;const generation=++version;publish({busy:true,error:'',phase:'loading'});
   try{const session=await request('/session');if(!session.response.ok||session.data.isAdmin!==true)throw Error('Only administrators can reverse dispatch.');const result=await request('/orders/'+encodeURIComponent(order.id));if(!result.response.ok||result.data.order?.id!==order.id)throw Error(result.data.error||'Could not load this order.');if(generation!==version)return;pending=null;publish({order:result.data.order,conflict:null,uncertain:false,phase:blockedReason(result.data.order)?'blocked':'editing'});}
   catch(error){if(generation===version)publish({error:error.message,phase:'blocked'});}finally{if(generation===version)publish({busy:false});}
  }
  async function submit(reason){
   if(locked||!current()||state.phase!=='editing'||state.conflict)return null;
   const text=String(reason||'').trim();if(!text||text.length>1000){publish({error:'Enter a reason of 1 to 1000 characters.'});return null;}
   locked=true;publish({busy:true,error:'',reason:pending?.reason||text});
   if(!pending)pending={mutationId:uuid(),reason:text,expectedUpdatedAt:state.order.updatedAt||state.order.createdAt||''};
   try{const {response,data}=await request('/orders/'+encodeURIComponent(order.id)+'/reverse-dispatch',pending);
    if(response.status===409&&data.code==='ORDER_CONFLICT'){pending=null;publish({conflict:data.order,error:'The order changed. Review the latest dispatch before reversing it.',uncertain:false});return null;}
    if(!response.ok){if(response.status>=400&&response.status<500){pending=null;publish({phase:'blocked',uncertain:false});}throw Error(data.error||'Could not confirm the reversal.');}
    if(!data.ok||data.order?.id!==order.id)throw Error('The reversal response could not be verified. Retry to confirm it.');
    pending=null;publish({order:data.order,phase:'done',uncertain:false});return data;
   }catch(error){publish({error:error.message,uncertain:!!pending});return null;}finally{locked=false;publish({busy:false});}
  }
  return {state,load,submit,dispose(){live=false;++version;}};
 }
 function createComponent(React,client,baseUrl){
  const {createElement:h,useState,useEffect,useRef}=React;
  return function ReverseDispatchModal({order,onSaved,onClose}){
   const [state,setState]=useState({order,busy:true,reason:'',phase:'loading'}),[reason,setReason]=useState('');const controller=useRef(null),dialog=useRef(null),callbacks=useRef({onSaved,onClose});callbacks.current={onSaved,onClose};
   useEffect(()=>{const instance=createController({order,client,baseUrl,onChange:setState});controller.current=instance;void instance.load();dialog.current?.focus({preventScroll:true});return()=>{instance.dispose();controller.current=null;};},[order.id]);
   const submit=async event=>{event.preventDefault();const instance=controller.current,owner=client.username;const result=await instance?.submit(reason);if(result&&controller.current===instance&&client.username===owner)callbacks.current.onSaved(result.order,result.idempotent);};
   const keyDown=event=>{if(event.key==='Escape'&&!state.busy){event.preventDefault();callbacks.current.onClose();}if(event.key==='Tab'){const controls=[...dialog.current.querySelectorAll('button:not([disabled]),textarea:not([disabled])')],first=controls[0],last=controls.at(-1);if(event.shiftKey&&(document.activeElement===first||document.activeElement===dialog.current)){event.preventDefault();last?.focus();}else if(!event.shiftKey&&(document.activeElement===last||document.activeElement===dialog.current)){event.preventDefault();first?.focus();}}};
   const active=state.order||order,blocked=blockedReason(active);
   return h('div',{className:'fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4',style:{zIndex:90}},h('form',{ref:dialog,role:'dialog','aria-modal':true,'aria-label':'Reverse dispatch',tabIndex:-1,onKeyDown:keyDown,onSubmit:submit,className:'max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-6 shadow-2xl'},
    h('h2',{className:'text-lg font-semibold'},'Reverse dispatch'),h('p',{className:'mt-2 text-sm'},'Order #'+active.orderNumber+' · '+active.project),
    h('p',{className:'mt-3 text-sm text-slate-600'},'Return this order to factory dispatch or production tracking. Existing production and QA checks still apply. The original dispatch and your reason stay in its history.'),
    String(active.orderType).trim().toLowerCase()==='panels'&&h('p',{className:'mt-3 text-sm'},'This reverses all site delivery loads for this order. Powder coating and QA records are kept.'),
    active.dispatch&&h('p',{className:'mt-3 text-sm'},[active.dispatch.destination,active.dispatch.transport,active.dispatch.driver].filter(Boolean).join(' · ')),
    state.phase==='loading'&&h('p',{role:'status',className:'mt-3 text-sm'},'Checking the current dispatch…'),
    blocked&&state.phase!=='loading'&&h('p',{role:'alert',className:'mt-3 text-sm text-amber-800'},blocked),
    h('label',{className:'mt-4 block text-sm font-medium'},'Reason ',h('span',{className:'text-red-600','aria-hidden':true},'*'),h('textarea',{name:'reason',required:true,maxLength:1000,rows:3,disabled:state.busy||state.uncertain||state.phase==='blocked',value:reason,onChange:event=>setReason(event.target.value),className:'mt-2 block w-full rounded-lg border border-slate-300 p-3'})),
    state.error&&h('p',{role:'alert',className:'mt-3 text-sm text-red-700'},state.error),
    state.uncertain&&h('p',{className:'mt-2 text-sm text-slate-600'},'The response was not confirmed. Retry uses the same request and reason.'),
    state.conflict&&h('p',{className:'mt-2 text-sm'},'Latest status: '+state.conflict.status),
    h('div',{className:'mt-5 flex flex-wrap justify-end gap-3'},h('button',{type:'button',disabled:state.busy,onClick:()=>callbacks.current.onClose(),className:'rounded-lg border border-slate-300 px-4 py-2 text-sm'},'Close'),(state.conflict||state.phase==='blocked')&&h('button',{type:'button',disabled:state.busy,onClick:()=>controller.current?.load(),className:'rounded-lg border border-cyan-700 px-4 py-2 text-sm'},'Review latest dispatch'),h('button',{type:'submit',disabled:state.busy||!!state.conflict||!!blocked||state.phase!=='editing',className:'rounded-lg bg-cyan-800 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50'},state.busy?'Saving…':state.uncertain?'Retry reversal':'Reverse dispatch'))));
  };
 }
 return {blockedReason,createController,createComponent};
});
