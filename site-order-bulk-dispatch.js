(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.PanelStockBulkDispatch=api;})(typeof window==='object'?window:globalThis,function(){
 'use strict';
 const MAX_ORDERS=20;
 function createController({orderIds,client,baseUrl,onChange,uuid=()=>crypto.randomUUID()}){
  const owner=client.username;let ids=[...orderIds],live=true,locked=false,pending=null,generation=0;
  const state={busy:true,phase:'loading',orders:[],defaults:{},form:{transport:'',driver:'',notes:'',photo:''},error:'',uncertain:false};
  const current=()=>live&&client.username===owner;
  const publish=patch=>{if(current()){Object.assign(state,patch);onChange({...state});}};
  async function request(path,body){if(!current())throw Error('Your account changed. Reopen bulk dispatch.');const response=await client.apiFetch(baseUrl+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}),data=await response.json().catch(()=>{throw Error('The response could not be confirmed. Try again to check its status.');});if(!current())throw Error('Your account changed. Reopen bulk dispatch.');return{response,data};}
  async function review(){
   if(locked||!current())return;const version=++generation;publish({busy:true,phase:'loading',error:''});
   try{
    if(!ids.length||ids.length>MAX_ORDERS||new Set(ids).size!==ids.length)throw Error('Select between 1 and '+MAX_ORDERS+' orders.');
    const {response,data}=await request('/dispatch/orders/batch-preview',{orderIds:ids});if(!response.ok)throw Error(data.error||'The selected orders could not be checked.');
    if(!Array.isArray(data.orders)||data.orders.length!==ids.length||new Set(data.orders.map(row=>row.id)).size!==ids.length||data.orders.some(row=>!ids.includes(row.id)||typeof row.eligible!=='boolean'||row.eligible&&(!/^[a-f0-9]{64}$/.test(row.reviewToken||'')||typeof row.expectedUpdatedAt!=='string')))throw Error('The order review response could not be verified.');
    if(version!==generation||!current())return;
    const vehicles=Array.isArray(data.dispatchVehicles)?data.dispatchVehicles:[],drivers=Array.isArray(data.dispatchDrivers)?data.dispatchDrivers:[],driver=drivers.find(value=>value.username===data.dispatchDefaultDriver);
    pending=null;publish({orders:data.orders,defaults:data,form:{transportChoice:vehicles.length?'vehicle:0':'external',transport:vehicles[0]||'',driverChoice:driver?'user:'+driver.username:'',driver:driver?(driver.displayName||driver.username):'',notes:state.form.notes||'',photo:''},phase:'editing',uncertain:false});
   }catch(error){if(version===generation)publish({phase:'blocked',error:error.message});}finally{if(version===generation)publish({busy:false});}
  }
  function change(name,value){if(!current()||locked||state.uncertain||state.phase!=='editing')return;publish({form:{...state.form,[name]:value},error:''});}
  function destination(id,value){if(!current()||locked||state.uncertain||state.phase!=='editing')return;publish({orders:state.orders.map(row=>row.id===id?{...row,destination:value}:row),error:''});}
  function remove(id){if(!current()||locked||state.uncertain||state.phase!=='editing')return false;ids=ids.filter(value=>value!==id);publish({orders:state.orders.filter(row=>row.id!==id),error:''});return true;}
  async function submit(){
   if(!current()||locked||state.phase!=='editing')return null;
   if(!pending){
    if(!state.orders.length||state.orders.some(row=>!row.eligible)){publish({error:'Remove blocked orders or complete their production checks before dispatch.'});return null;}
    const form=state.form;if(!form.transport.trim()||!form.driver.trim()||state.orders.some(row=>!String(row.destination||'').trim())){publish({error:'Enter a vehicle, driver and site address for every order.'});return null;}
    if(state.orders.some(row=>row.requiresPhoto)&&!form.photo){publish({error:'Add the required dispatch photo.'});return null;}
    pending={mutationId:uuid(),transport:form.transport.trim(),driver:form.driver.trim(),notes:form.notes.trim(),photo:form.photo,orders:state.orders.map(row=>({id:row.id,expectedUpdatedAt:row.expectedUpdatedAt,reviewToken:row.reviewToken,destination:row.destination.trim()}))};
   }
   locked=true;publish({busy:true,error:''});
   try{
    const {response,data}=await request('/dispatch/orders/batch',pending);
    if(!response.ok){if(response.status>=400&&response.status<500){pending=null;publish({phase:'blocked',uncertain:false});}throw Error(data.error||'The dispatch response could not be confirmed.');}
    const expected=pending.orders.map(row=>row.id);
    if(!data.ok||!Array.isArray(data.orderIds)||data.orderIds.length!==expected.length||new Set(data.orderIds).size!==expected.length||data.orderIds.some(id=>!expected.includes(id))||!Array.isArray(data.orders)||new Set(data.orders.map(row=>row.id)).size!==data.orders.length||data.orders.some(row=>!expected.includes(row.id)||!data.idempotent&&row.status!=='dispatched')||!data.idempotent&&data.orders.length!==expected.length)throw Error('The dispatch response could not be verified. Retry to confirm the same request.');
    pending=null;publish({phase:'done',uncertain:false});return data;
   }catch(error){publish({error:error.message,uncertain:!!pending});return null;}finally{locked=false;publish({busy:false});}
  }
  return{state,review,change,destination,remove,submit,error:message=>{if(current()&&!locked)publish({error:message});},dispose(){live=false;++generation;}};
 }
 async function preparePhoto(file){
  if(!file||!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>10*1024*1024)throw Error('Choose a JPG, PNG or WebP photo under 10 MB.');
  const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(Error('The photo could not be read.'));reader.readAsDataURL(file);});
  if(data.length<=300000)return data;
  const img=await new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>reject(Error('The photo could not be opened.'));image.src=data;});
  for(const width of [1024,768,512]){const scale=Math.min(1,width/Math.max(img.width,img.height)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(img.width*scale));canvas.height=Math.max(1,Math.round(img.height*scale));const context=canvas.getContext('2d');if(!context)throw Error('Photo processing is unavailable in this browser.');context.fillStyle='#fff';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(img,0,0,canvas.width,canvas.height);const result=canvas.toDataURL('image/jpeg',0.8);if(result.length<=300000)return result;}
  throw Error('Choose a smaller dispatch photo.');
 }
 function createComponent(React,client,baseUrl){
  const {createElement:h,useState,useEffect,useRef}=React;
  return function BulkDispatchModal({orderIds,onClose,onSaved,onRemoved}){
   const [state,setState]=useState({busy:true,phase:'loading',orders:[],defaults:{},form:{},error:''}),[photoBusy,setPhotoBusy]=useState(false),controller=useRef(null),dialog=useRef(null),callbacks=useRef({onClose,onSaved,onRemoved});callbacks.current={onClose,onSaved,onRemoved};
   useEffect(()=>{const previous=document.activeElement,owner=client.username,instance=createController({orderIds,client,baseUrl,onChange:setState});controller.current=instance;void instance.review();dialog.current?.focus({preventScroll:true});return()=>{instance.dispose();controller.current=null;if(client.username===owner&&previous?.isConnected)previous.focus({preventScroll:true});};},[]);
   const frozen=state.busy||state.uncertain||state.phase!=='editing',vehicles=state.defaults.dispatchVehicles||[],drivers=state.defaults.dispatchDrivers||[],form=state.form;
   const update=(name,value)=>controller.current?.change(name,value);
   const submit=async event=>{event.preventDefault();if(photoBusy)return;const instance=controller.current,owner=client.username,result=await instance?.submit();if(result&&controller.current===instance&&client.username===owner)callbacks.current.onSaved(result);};
   const photo=async event=>{const file=event.target.files?.[0],instance=controller.current;if(!file)return;setPhotoBusy(true);try{const value=await preparePhoto(file);if(controller.current===instance)instance.change('photo',value);}catch(error){if(controller.current===instance)instance.error(error.message);}finally{if(controller.current===instance)setPhotoBusy(false);}};
   const keyDown=event=>{if(event.key==='Escape'&&(!state.busy||state.phase==='loading')&&!photoBusy){event.preventDefault();callbacks.current.onClose();}if(event.key==='Tab'){const controls=[...dialog.current.querySelectorAll('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled])')],first=controls[0],last=controls[controls.length-1];if(event.shiftKey&&(document.activeElement===first||document.activeElement===dialog.current)){event.preventDefault();last?.focus();}else if(!event.shiftKey&&(document.activeElement===last||document.activeElement===dialog.current)){event.preventDefault();first?.focus();}}};
   return h('div',{className:'ps-excel-action-backdrop'},h('section',{className:'ps-excel-action ps-excel-action-pdf',role:'dialog','aria-modal':true,'aria-label':'Mark ready and dispatch selected orders',ref:dialog,tabIndex:-1,onKeyDown:keyDown},
    h('header',null,h('div',null,h('small',null,'Site Orders'),h('h2',null,'Mark ready & dispatch')),h('button',{type:'button',disabled:state.busy&&state.phase!=='loading'||photoBusy,onClick:()=>callbacks.current.onClose()},'Close')),
    h('p',null,'Send every remaining item in the selected orders. Production, coating and QA checks still apply. Every order must pass before this batch is dispatched.'),
    state.phase==='loading'&&h('p',{role:'status'},'Checking selected orders…'),
    h('form',{onSubmit:submit},h('div',{className:'ps-order-bulk-review'},state.orders.map(row=>h('article',{key:row.id,className:'ps-excel-action-load'},
      h('div',{className:'ps-order-bulk-review-heading'},h('strong',null,'#'+(row.orderNumber||'?')+' · '+(row.project||'Order unavailable')+' · '+(row.orderType||'')),h('button',{type:'button',disabled:frozen,onClick:()=>{if(controller.current?.remove(row.id))callbacks.current.onRemoved?.(row.id);}},'Remove')),
      !row.eligible&&h('p',{role:'alert',className:'ps-excel-action-error'},row.reason||'Review this order in Dispatch'),
      h('ul',{className:'ps-unified-items'},(row.items||[]).map((item,index)=>h('li',{key:index},item.quantity+' × '+item.description))),
      h('label',null,'Site address ',h('span',{'aria-hidden':true,className:'ps-order-required'},'*'),h('input',{required:true,maxLength:300,disabled:frozen,value:row.destination||'','aria-label':'Site address for Order '+row.orderNumber,className:'ps-unified-input',onChange:event=>controller.current?.destination(row.id,event.target.value)}))
    ))),state.phase!=='loading'&&h('div',{className:'ps-unified-form'},
      h('label',null,'Vehicle / transport company ',h('span',{className:'ps-order-required','aria-hidden':true},'*'),h('select',{required:true,disabled:frozen,className:'ps-unified-input',value:form.transportChoice||'external',onChange:event=>{const choice=event.target.value;update('transportChoice',choice);update('transport',choice==='external'?'':vehicles[Number(choice.slice(8))]||'');}},vehicles.map((value,index)=>h('option',{key:value,value:'vehicle:'+index},value)),h('option',{value:'external'},'Other vehicle / transport'))),
      form.transportChoice==='external'&&h('label',null,'Vehicle details ',h('span',{className:'ps-order-required','aria-hidden':true},'*'),h('input',{required:true,maxLength:300,disabled:frozen,className:'ps-unified-input',value:form.transport||'',onChange:event=>update('transport',event.target.value)})),
      h('label',null,'Driver ',h('span',{className:'ps-order-required','aria-hidden':true},'*'),h('select',{required:true,disabled:frozen,className:'ps-unified-input',value:form.driverChoice||'',onChange:event=>{const choice=event.target.value,driver=drivers.find(value=>'user:'+value.username===choice);update('driverChoice',choice);update('driver',driver?(driver.displayName||driver.username):'');}},h('option',{value:'',disabled:true},'Choose driver'),drivers.map(value=>h('option',{key:value.username,value:'user:'+value.username},value.displayName||value.username)),h('option',{value:'external'},'Other / external driver'))),
      form.driverChoice==='external'&&h('label',null,'Driver name ',h('span',{className:'ps-order-required','aria-hidden':true},'*'),h('input',{required:true,maxLength:300,disabled:frozen,className:'ps-unified-input',value:form.driver||'',onChange:event=>update('driver',event.target.value)})),
      h('label',{className:'ps-unified-wide'},'Delivery notes',h('textarea',{rows:2,maxLength:5000,disabled:frozen,className:'ps-unified-input',value:form.notes||'',onChange:event=>update('notes',event.target.value)})),
      state.orders.some(row=>row.requiresPhoto)&&h('label',{className:'ps-unified-wide'},'Dispatch photo ',h('span',{className:'ps-order-required','aria-hidden':true},'*'),h('input',{type:'file',accept:'image/jpeg,image/png,image/webp',disabled:frozen||photoBusy,onChange:photo}),photoBusy&&h('span',{role:'status'},'Preparing photo…'),form.photo&&h('p',null,'Photo ready for this dispatch.'))
    ),state.error&&h('p',{role:'alert',className:'ps-excel-action-error'},state.error),state.uncertain&&h('p',null,'The response was not confirmed. Retry keeps the same orders, quantities and delivery details.'),
    h('footer',null,state.phase==='blocked'&&h('button',{type:'button',disabled:state.busy,onClick:()=>controller.current?.review()},'Review latest orders'),h('button',{type:'submit',className:'ps-excel-action-primary',disabled:state.busy||photoBusy||state.phase!=='editing'||!state.orders.length||state.orders.some(row=>!row.eligible)},state.busy?'Checking…':state.uncertain?'Retry same dispatch':'Confirm ready & dispatch ('+state.orders.length+')')))));
  };
 }
 return{MAX_ORDERS,createController,createComponent};
});
