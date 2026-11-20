(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.PanelStockOrderMaterials=api;})(typeof window==='object'?window:globalThis,function(){
 'use strict';
 const statuses=['pending','ordered','not_required'];
 function validEntry(value){return !!value&&typeof value.order?.id==='string'&&Number.isSafeInteger(value.revision)&&value.revision>=0&&typeof value.orderUpdatedAt==='string'&&typeof value.canEdit==='boolean'&&Array.isArray(value.items)&&value.items.length>0&&value.items.every((item,index)=>item.index===index&&typeof item.description==='string'&&Number.isFinite(item.quantity)&&item.quantity>0&&statuses.includes(item.status))&&value.pendingCount===value.items.filter(item=>item.status==='pending').length&&value.orderedCount===value.items.filter(item=>item.status==='ordered').length&&value.notRequiredCount===value.items.filter(item=>item.status==='not_required').length&&value.complete===(value.pendingCount===0);}
 function createController({client,baseUrl,onChange,uuid=()=>crypto.randomUUID()}){
  const owner=client.username;let live=true,locked=false,pending=null;
  const state={entries:[],loading:true,saving:false,error:'',message:'',blocked:true,uncertain:false};
  const current=()=>live&&client.username===owner;
  const publish=patch=>{if(current()){Object.assign(state,patch);onChange({...state});}};
  async function request(path,body){if(!current())throw Error('Your account changed. Reopen Materials to order.');const response=await client.apiFetch(baseUrl+path,body===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}),data=await response.json().catch(()=>{throw Error('The response could not be confirmed.');});if(!current())throw Error('Your account changed. Reopen Materials to order.');return {response,data};}
  async function load(){
   if(locked||pending||!current())return;locked=true;publish({loading:true,error:'',message:'',blocked:true});
   try{const {response,data}=await request('/order-materials');if(!response.ok)throw Error(data.error||'Materials could not be loaded.');if(!data.ok||!Array.isArray(data.entries)||!data.entries.every(validEntry)||new Set(data.entries.map(value=>value.order.id)).size!==data.entries.length)throw Error('The materials list could not be verified.');publish({entries:data.entries,blocked:false});}
   catch(error){publish({error:error.message});}finally{locked=false;publish({loading:false});}
  }
  async function send(){
   if(locked||!pending||!current())return null;locked=true;publish({saving:true,error:'',message:''});
   const submitted=pending;
   try{
    const {response,data}=await request('/orders/'+encodeURIComponent(submitted.orderId)+'/materials',submitted.body);
    if(!response.ok){if(response.status>=400&&response.status<500){pending=null;publish({blocked:true,uncertain:false});}throw Error(data.error||'The update could not be confirmed.');}
    if(!data.ok||!validEntry(data.entry)||data.entry.order.id!==submitted.orderId||data.entry.revision<=submitted.body.expectedRevision||!data.duplicate&&submitted.body.updates.some(update=>data.entry.items[update.index]?.status!==update.status))throw Error('The materials update could not be verified. Retry to check the same update.');
    pending=null;publish({entries:state.entries.map(value=>value.order.id===submitted.orderId?data.entry:value),blocked:false,uncertain:false,message:'Materials updated for order #'+data.entry.order.orderNumber+'.'+(data.entry.complete?' All items are accounted for.':'')});return data.entry;
   }catch(error){publish({error:error.message,uncertain:!!pending});return null;}finally{locked=false;publish({saving:false});}
  }
  async function mark(orderId,index,status){
   if(locked||pending||state.blocked||!current()||!statuses.includes(status))return null;
   const value=state.entries.find(value=>value.order.id===orderId),item=value?.items[index];if(!value?.canEdit||!item||item.status===status)return null;
   pending={orderId,body:{mutationId:uuid(),expectedRevision:value.revision,expectedOrderUpdatedAt:value.orderUpdatedAt,updates:[{index,status}]}};return send();
  }
  return {state,load,mark,retry:send,dispose(){live=false;}};
 }
 function createComponent(React,client,baseUrl){
  const {createElement:h,useState,useEffect,useRef}=React;
  const date=value=>value?new Date(value.slice(0,10)+'T00:00:00').toLocaleDateString('en-AU',{day:'numeric',month:'short',year:'numeric'}):'—';
  const marked=value=>value?new Date(value).toLocaleString('en-AU',{timeZone:'Australia/Brisbane',day:'numeric',month:'short',hour:'numeric',minute:'2-digit'}):'';
  return function OrderMaterialsQueue(){
   const [state,setState]=useState({entries:[],loading:true,saving:false,error:'',message:'',blocked:true,uncertain:false}),[mode,setMode]=useState('pending'),[search,setSearch]=useState(''),[project,setProject]=useState(''),controller=useRef(null),owner=client.username;
   useEffect(()=>{const value=createController({client,baseUrl,onChange:setState});controller.current=value;void value.load();const unsubscribe=window.PanelStockPullRefresh?.subscribe(()=>value.load());return()=>{value.dispose();controller.current=null;unsubscribe?.();};},[owner]);
   const entries=state.entries.filter(value=>value.order.status!=='cancelled'),pending=entries.filter(value=>value.canEdit&&!value.complete),complete=entries.filter(value=>value.complete),projects=[...new Set(entries.map(value=>value.order.project))].sort(),query=search.trim().toLocaleLowerCase(),shown=(mode==='pending'?pending:complete).filter(value=>(!project||value.order.project===project)&&(!query||[value.order.orderNumber,value.order.project,value.order.orderType,value.order.location,value.order.villa,...value.items.map(item=>item.description)].join(' ').toLocaleLowerCase().includes(query))),disabled=state.loading||state.saving||state.blocked||state.uncertain;
   return h('section',{className:'ps-materials','aria-labelledby':'materials-heading'},
    h('header',{className:'ps-materials-heading'},h('div',null,h('h2',{id:'materials-heading'},'Materials to order'),h('p',null,'New orders appear automatically. Tick Ordered after placing the materials order, or choose Not required when materials are already available.')),h('button',{type:'button',disabled:state.loading||state.saving||state.uncertain,onClick:()=>controller.current?.load()},'Refresh list')),
    h('nav',{className:'ps-materials-tabs','aria-label':'Materials list'},[['pending','To order',pending.length],['complete','Completed',complete.length]].map(([value,label,count])=>h('button',{type:'button',key:value,'aria-pressed':mode===value,onClick:()=>setMode(value)},label,h('span',null,count)))),
    h('div',{className:'ps-materials-filters'},h('label',null,'Search orders or items',h('input',{type:'search',value:search,onChange:event=>setSearch(event.target.value),placeholder:'Order number, project, type or item'})),h('label',null,'Project',h('select',{'aria-label':'Materials project',value:project,onChange:event=>setProject(event.target.value)},h('option',{value:''},'All projects'),projects.map(name=>h('option',{key:name,value:name},name))))),
    state.loading&&h('p',{role:'status'},'Loading materials…'),state.saving&&h('p',{role:'status'},'Saving materials…'),state.message&&h('p',{role:'status',className:'ps-materials-success'},state.message),
    state.error&&h('div',{role:'alert',className:'ps-materials-error'},h('p',null,state.error),state.uncertain?h('div',null,h('p',null,'The save response was not confirmed. Retry checks the same item update.'),h('button',{type:'button',disabled:state.saving,onClick:()=>controller.current?.retry()},state.saving?'Checking…':'Retry same update')):h('button',{type:'button',disabled:state.loading||state.saving,onClick:()=>controller.current?.load()},'Reload latest list')),
    !state.loading&&!state.error&&!shown.length&&h('div',{className:'ps-materials-empty'},h('strong',null,search||project?'No matching orders':mode==='pending'?'No materials waiting to be ordered':'No completed materials orders yet'),h('p',null,search||project?'Try another search or project.':mode==='pending'?'New Site Orders will appear here.':'Orders move here once every item is Ordered or Not required.')),
    h('div',{className:'ps-materials-list'},shown.map(value=>{const order=value.order,name='Order #'+order.orderNumber+' · '+order.project,location=order.villa?'Villa '+order.villa:order.location;return h('article',{key:order.id,className:'ps-materials-order','aria-label':name},
     h('header',null,h('div',null,h('h3',null,'#'+order.orderNumber+' · '+order.project),h('p',null,order.orderType+(order.orderTypeOther?' · '+order.orderTypeOther:'')+(location?' · '+location:'')),order.urgent===true&&h('span',{className:'ps-order-urgent-badge'},'URGENT')),h('div',{className:'ps-materials-order-summary'},h('strong',null,(value.items.length-value.pendingCount)+' / '+value.items.length+' items accounted for'),h('span',null,'Requested '+date(order.requestedDeliveryDate)),order.scheduledDeliveryDate&&h('span',null,'Scheduled '+date(order.scheduledDeliveryDate)),!value.canEdit&&h('span',null,'Dispatched · read only'))),
     value.orderChanged&&h('p',{className:'ps-materials-changed'},'Order details changed. Check the outstanding materials below.'),
     h('ul',null,value.items.map(item=>{const title=item.description+' for '+name;return h('li',{key:item.index,className:'ps-materials-item','data-material-index':item.index},h('div',{className:'ps-materials-item-details'},h('strong',null,item.description),h('span',null,'Qty '+item.quantity),item.markedAt&&h('small',null,(item.status==='ordered'?'Ordered':item.status==='not_required'?'Not required':'Reopened')+' by '+item.markedBy+' · '+marked(item.markedAt))),
      h('div',{className:'ps-materials-item-actions'},item.status==='not_required'?h('span',{className:'ps-materials-not-required'},'Not required'):h('label',null,h('input',{type:'checkbox',checked:item.status==='ordered',disabled:disabled||!value.canEdit,'aria-label':'Ordered: '+title,onChange:event=>controller.current?.mark(order.id,item.index,event.target.checked?'ordered':'pending')}),'Ordered'),h('button',{type:'button',disabled:disabled||!value.canEdit,'aria-label':(item.status==='not_required'?'Reopen: ':'Not required: ')+title,onClick:()=>controller.current?.mark(order.id,item.index,item.status==='not_required'?'pending':'not_required')},item.status==='not_required'?'Reopen':'Not required')));}))
    );})));
  };
 }
 return {createController,createComponent};
});
