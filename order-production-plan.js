(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory(require('./order-lead-times.js'));else root.PanelStockProductionPlan=factory(root.PanelStockOrderLeadTimes);})(typeof window==='object'?window:globalThis,function(lead){
 'use strict';
 const stages=[['stockOrder','Order stock'],['drawnCnc','Drawn / Toolpath / CNC'],['fabrication','Fabrication'],['powderCoating','Powder coating']];
 const copy=value=>JSON.parse(JSON.stringify(value));
 function pickup(date){return date?lead.minimumDate({days:{powderCoating:5}},'powderCoating',date):'';}
 function definitions(data,draft){const values=data.stageDefinitions||stages;return data.coating?.canChoose?stages.filter(([name])=>name!=='powderCoating'||draft.panelCoating!=='already_coated'):values;}
 function dates(draft,stageDefinitions=stages){const values=stageDefinitions.flatMap(([stage,label])=>{const row=draft.stages[stage];if(!row||row.notApplicable||!row.date)return [];return [{stage,label:stage==='powderCoating'?'Powder coating · Send':label,date:row.date},...(stage==='powderCoating'?[{stage:'powderPickup',label:'Powder coating · Pickup',date:pickup(row.date)}]:[])];});if(draft.scheduledDeliveryDate)values.push({stage:'siteDelivery',label:'Schedule delivery',date:draft.scheduledDeliveryDate});return values.sort((a,b)=>a.date.localeCompare(b.date)||a.stage.localeCompare(b.stage));}
 function draftFrom(data){return {stages:Object.fromEntries(stages.map(([name])=>{const row=data.plan.stages[name];return [name,{date:row.date,notApplicable:row.notApplicable,notes:row.notes}];})),panelCoating:data.coating?.selection||data.plan.panelCoating||'required',scheduledDeliveryDate:data.order.scheduledDeliveryDate||'',scheduledDeliveryTime:data.order.scheduledDeliveryTime||''};}
 function createController({client,baseUrl,orderId,onChange,onSaved,uuid=()=>crypto.randomUUID()}){
  const owner=client.username;let live=true,locked=false,pending=null,generation=0;
  const state={loading:true,saving:false,data:null,draft:null,error:'',conflict:false,uncertain:false,dirty:false};
  const current=()=>live&&client.username===owner;
  const publish=patch=>{if(current()){Object.assign(state,patch);onChange({...state});}};
  async function request(body){const response=await client.apiFetch(baseUrl+'/orders/'+encodeURIComponent(orderId)+'/production-plan',body===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});let data;try{data=await response.json();}catch{throw Error('The save response could not be confirmed. Retry to check this plan.');}if(!current())throw Error('Your account changed. Reopen the production plan.');return {response,data};}
  async function load(){
   if(locked||!current())return;const version=++generation;locked=true;publish({loading:true,error:'',conflict:false});
   try{const {response,data}=await request();if(!response.ok)throw Error(data.error||'The production plan could not be loaded.');if(version!==generation||!current())return;pending=null;publish({data,draft:draftFrom(data),dirty:false,uncertain:false});}
   catch(error){if(version===generation)publish({error:error.message});}finally{locked=false;if(version===generation)publish({loading:false});}
  }
  function update(stage,field,value){
   if(locked||!current()||!state.data?.canEdit||state.uncertain)return;
   const draft=copy(state.draft);
   if(stage==='plan'){
    if(field!=='panelCoating'||!state.data.coating?.canChoose||!['required','already_coated'].includes(value))return;
    draft.panelCoating=value;if(value==='required')draft.stages.powderCoating.notApplicable=false;
   }else if(stage==='siteDelivery'){
    if(!state.data.canScheduleDelivery||!['scheduledDeliveryDate','scheduledDeliveryTime'].includes(field))return;
    draft[field]=value;if(field==='scheduledDeliveryDate'&&!value)draft.scheduledDeliveryTime='';
   }else{
    if(!definitions(state.data,draft).some(([name])=>name===stage)||!['date','notApplicable','notes'].includes(field))return;
    draft.stages[stage][field]=value;if(field==='notApplicable'&&value)draft.stages[stage].date='';
   }
   pending=null;publish({draft,dirty:true,error:'',conflict:false});
  }
  async function save(){
   if(locked||!current()||!state.data?.canEdit||!state.draft)return;
   if(!pending)pending={mutationId:uuid(),expectedRevision:state.data.plan.revision,expectedOrderUpdatedAt:state.data.order.updatedAt||state.data.order.createdAt||'',...copy(state.draft)};
   locked=true;publish({saving:true,error:'',conflict:false});
   try{
    const {response,data}=await request(pending);if(!response.ok){const definite=response.status>=400&&response.status<500;if(definite)pending=null;publish({error:data.error||'The plan could not be saved.',conflict:response.status===409,uncertain:!definite});return;}
    if(!data.plan||!data.order||typeof data.plan.revision!=='number')throw Error('The saved production plan could not be confirmed. Retry to check it.');
    pending=null;publish({data,draft:draftFrom(data),dirty:false,uncertain:false});if(current())onSaved?.(data);
   }catch(error){publish({error:error.message||'The save could not be confirmed.',uncertain:true});}finally{locked=false;publish({saving:false});}
  }
  return {state,load,update,save,destroy(){live=false;generation++;}};
 }
 return {stages,definitions,pickup,dates,createController};
});
