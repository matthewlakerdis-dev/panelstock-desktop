(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.PanelStockExcelActions={...api,link:api.parseLink(root.location.href)};
})(typeof window==='object'?window:globalThis,function(){
  'use strict';
  const active=['submitted','approved','ordered','in_stock'];
  const normalize=value=>String(value||'').trim().toLowerCase();
  function parseLink(href){
    try{const params=new URL(href).searchParams,id=params.get('orderId'),action=params.get('orderAction');
      return /^[a-zA-Z0-9-]{16,100}$/.test(id||'')&&['ready','dispatch','schedule'].includes(action)?{id,action}:null;
    }catch{return null;}
  }
  const manualReady=order=>active.includes(order.status)&&!['panels','gate'].includes(normalize(order.orderType));
  const siteLoad=load=>['waiting','ready_for_site'].includes(load.status)&&load.readyForSite===true;
  function createController({link,client,baseUrl,onChange,uuid=()=>crypto.randomUUID()}){
    const owner=client.username;
    let version=0,disposed=false,locked=false;
    let state={phase:'loading',busy:false,order:null,loads:[],selected:null,error:'',message:'',needsReview:false,mutationId:uuid()};
    const current=()=>!disposed&&client.username===owner;
    const publish=change=>{if(current()){state={...state,...change};onChange({...state});}};
    async function request(path,body){
      if(!current()||!owner)throw Error('Sign in again to review this order.');
      const response=await client.apiFetch(baseUrl+path,body===undefined?undefined:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
      const data=await response.json();
      if(!current())throw Error('The signed-in account changed. Reopen the order from Excel.');
      if(!response.ok){const error=Error(data.error||'The order could not be updated.');error.status=response.status;throw error;}
      return data;
    }
    async function load(){
      if(locked||!current())return;
      const generation=++version;
      publish({phase:'loading',busy:true,error:'',needsReview:false,selected:null});
      try{
        if(link.action==='schedule'){
          const actor=await request('/session');
          if(generation!==version||!current())return;
          if(actor.isAdmin!==true){publish({phase:'blocked',message:'Only administrators can schedule deliveries.'});return;}
          const {order}=await request('/orders/'+encodeURIComponent(link.id));
          if(generation!==version||!current())return;
          if(['dispatched','cancelled'].includes(order.status))publish({order,phase:'blocked',message:'This order is already '+order.status+' and cannot be rescheduled.'});
          else publish({order,phase:'confirm',message:''});
        }else if(link.action==='ready'){
          const {order}=await request('/orders/'+encodeURIComponent(link.id));
          if(generation!==version||!current())return;
          if(order.status==='completed')publish({order,phase:'done',message:'This order is already Ready for dispatch.'});
          else if(['dispatched','cancelled'].includes(order.status))publish({order,phase:'blocked',message:'This order is already '+order.status+'.'});
          else if(!manualReady(order))publish({order,phase:'blocked',message:'Readiness for panels and gates is set by production and QA. Complete the required checks in PanelStockHQ.'});
          else publish({order,phase:'confirm',message:''});
        }else{
          const {orders}=await request('/dispatch/orders');
          if(generation!==version||!current())return;
          const order=orders.find(value=>value.id===link.id);
          if(!order){publish({phase:'blocked',message:'This order is no longer ready for dispatch, or is unavailable to your account.'});return;}
          if(order.status==='dispatched'){publish({order,phase:'done',message:'This order has been dispatched. Use Refresh All in Excel to update the tracker.'});return;}
          if(!order.ready){publish({order,phase:'blocked',message:'This order is no longer ready for dispatch.'});return;}
          if(order.usesPanelLoads){
            const {loads}=await request('/dispatch/panels');
            if(generation!==version||!current())return;
            const matching=loads.filter(load=>normalize(load.project)===normalize(order.project)&&normalize(load.orderNumber)===normalize(order.orderNumber));
            publish({order,loads:matching,phase:'loads'});
          }else publish({order,phase:'confirm',message:'',mutationId:uuid()});
        }
      }catch(error){if(generation===version)publish({phase:'blocked',error:error.message});}
      finally{if(generation===version)publish({busy:false});}
    }
    function selectLoad(id){
      const load=state.loads.find(value=>value.id===id);
      if(!locked&&current()&&siteLoad(load||{}))publish({selected:load,phase:'confirm',error:'',needsReview:false});
    }
    async function submit(details={}){
      if(locked||!current()||state.phase!=='confirm'||state.needsReview)return false;
      const panel=link.action==='dispatch'&&state.order.usesPanelLoads;
      if(link.action==='ready'&&!manualReady(state.order)||panel&&!siteLoad(state.selected||{}))return false;
      locked=true;publish({busy:true,error:''});
      try{
        if(link.action==='schedule'){
          const clear=details.clearSchedule===true,date=clear?'':details.scheduledDeliveryDate,time=clear?'':details.scheduledDeliveryTime||'';
          const parsed=typeof date==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(date)?new Date(date+'T12:00:00Z'):null;
          if(!clear&&(!parsed||!Number.isFinite(parsed.getTime())||parsed.toISOString().slice(0,10)!==date))throw Error('Choose a valid scheduled delivery date.');
          if(typeof time!=='string'||time&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(time))throw Error('Choose a valid delivery time or leave it blank.');
          const result=await request('/orders/'+encodeURIComponent(link.id)+'/delivery',{scheduledDeliveryDate:date,scheduledDeliveryTime:time,expectedUpdatedAt:state.order.updatedAt||state.order.createdAt||''});
          publish({phase:'done',message:(result.unchanged?'Delivery schedule is unchanged.':clear?'Delivery schedule cleared.':'Delivery scheduled.')+' Use Refresh All in Excel to update the tracker.'});
        }else if(link.action==='ready'){
          await request('/orders/'+encodeURIComponent(link.id)+'/status',{status:'completed',expectedUpdatedAt:state.order.updatedAt||state.order.createdAt||''});
          publish({phase:'done',message:'Order marked Ready for dispatch. Use Refresh All in Excel to update the tracker.'});
        }else if(panel){
          await request('/dispatch/panels',{...details,id:state.selected.id,action:'dispatch',destinationType:'site'});
          locked=false;
          publish({message:'Load dispatched. The order becomes Dispatched once every load has been sent to site.'});
          await load();
        }else{
          await request('/dispatch/orders',{...details,id:link.id,expectedUpdatedAt:state.order.updatedAt||state.order.createdAt||'',mutationId:state.mutationId});
          publish({phase:'done',message:'Order dispatched. Use Refresh All in Excel to update the tracker.'});
        }
        return true;
      }catch(error){publish({error:error.message,needsReview:error.status===409||panel||link.action==='ready'});return false;}
      finally{locked=false;publish({busy:false});}
    }
    return {load,selectLoad,submit,get state(){return state;},dispose(){disposed=true;version++;}};
  }
  function createComponent(React,client,baseUrl,link){
    const {createElement:h,useState,useEffect,useRef}=React;
    return function ExcelOrderAction({username}){
      const [closed,setClosed]=useState(false),[state,setState]=useState({phase:'loading',busy:true}),[details,setDetails]=useState({destination:'',transport:'',driver:'',notes:'',scheduledDeliveryDate:'',scheduledDeliveryTime:''});
      const controller=useRef(null),dialog=useRef(null);
      useEffect(()=>{
        if(!link||!username||closed)return;
        const instance=createController({link,client,baseUrl,onChange:setState});controller.current=instance;void instance.load();
        return()=>{instance.dispose();controller.current=null;};
      },[username,closed]);
      useEffect(()=>{
        if(link?.action==='schedule'&&state.phase==='confirm'&&state.order)setDetails(current=>({...current,scheduledDeliveryDate:state.order.scheduledDeliveryDate||'',scheduledDeliveryTime:state.order.scheduledDeliveryTime||''}));
      },[state.order,state.phase]);
      useEffect(()=>{if(!closed&&link&&username)dialog.current?.focus();},[closed,username]);
      if(!link||!username||closed)return null;
      const close=()=>{if(!state.busy)setClosed(true);};
      const reload=()=>{void controller.current?.load();};
      const keyDown=event=>{
        if(event.key==='Escape'){event.preventDefault();close();}
        if(event.key==='Tab'){
          const controls=[...dialog.current.querySelectorAll('button:not([disabled]),input:not([disabled]),textarea:not([disabled])')];
          const first=controls[0],last=controls[controls.length-1];
          if(event.shiftKey&&(document.activeElement===first||document.activeElement===dialog.current)){event.preventDefault();last?.focus();}
          else if(!event.shiftKey&&(document.activeElement===last||document.activeElement===dialog.current)){event.preventDefault();first?.focus();}
        }
      };
      const heading=link.action==='schedule'?'Schedule delivery':link.action==='ready'?'Mark ready for dispatch':'Dispatch to site';
      const confirm=state.phase==='confirm',dispatch=link.action==='dispatch',schedule=link.action==='schedule';
      return h('div',{className:'ps-excel-action-backdrop'},h('section',{className:'ps-excel-action',role:'dialog','aria-modal':true,'aria-label':heading,tabIndex:-1,ref:dialog,onKeyDown:keyDown},
        h('header',null,h('div',null,h('small',null,'Production Tracker'),h('h2',null,heading)),h('button',{type:'button',disabled:state.busy,onClick:close,'aria-label':'Close order action'},'Close')),
        state.order&&h('p',{className:'ps-excel-action-order'},'Order #'+state.order.orderNumber+' · '+state.order.project),
        state.phase==='loading'&&h('p',{role:'status'},'Checking the latest order status…'),
        state.message&&h('p',{role:'status'},state.message),
        state.error&&h('p',{role:'alert',className:'ps-excel-action-error'},state.error),
        state.phase==='loads'&&h('div',null,h('p',null,'Choose a load to dispatch to site. Production, coating and QA checks apply to each load.'),
          !state.loads.length&&h('p',null,'No panel loads are available for this order.'),
          state.loads.map(load=>h('article',{key:load.id,className:'ps-excel-action-load'},h('div',null,h('strong',null,load.project+' · Order '+load.orderNumber),h('p',null,(load.items?.length||load.panelIds?.length||0)+' panels · '+(load.status==='dispatched_to_site'?'Dispatched to site':siteLoad(load)?'Ready for site':'Waiting for production / coating / QA'))),siteLoad(load)&&h('button',{type:'button',disabled:state.busy,onClick:()=>controller.current?.selectLoad(load.id)},'Dispatch this load')))),
        confirm&&h('form',{onSubmit:event=>{event.preventDefault();void controller.current?.submit(details);}},
          !dispatch&&!schedule&&h('p',null,'Confirm that this order is ready for dispatch. This will update its status in PanelStockHQ.'),
          schedule&&h('div',null,
            h('p',null,'Requested delivery: '+(state.order.requestedDeliveryDate?state.order.requestedDeliveryDate.split('-').reverse().join('/'):'Not set')),
            h('label',null,'Scheduled delivery date',h('input',{type:'date',required:true,value:details.scheduledDeliveryDate,disabled:state.busy,onChange:event=>{const value=event.target.value;setDetails(current=>({...current,scheduledDeliveryDate:value}));}})),
            h('label',null,'Delivery time (optional)',h('input',{type:'time',value:details.scheduledDeliveryTime,disabled:state.busy,onChange:event=>{const value=event.target.value;setDetails(current=>({...current,scheduledDeliveryTime:value}));}}))),
          dispatch&&h('div',null,state.selected&&h('p',null,'Dispatching the selected panel load to site.'),
            [['destination','Site address'],['transport','Vehicle / transport company'],['driver','Driver']].map(([key,label])=>h('label',{key},label,h('input',{required:true,maxLength:300,value:details[key],disabled:state.busy,onChange:event=>{const value=event.target.value;setDetails(current=>({...current,[key]:value}));}}))),
            h('label',null,'Notes (optional)',h('textarea',{maxLength:5000,rows:3,value:details.notes,disabled:state.busy,onChange:event=>{const value=event.target.value;setDetails(current=>({...current,notes:value}));}}))),
          h('footer',null,h('button',{type:'button',disabled:state.busy,onClick:close},'Cancel'),schedule&&state.order.scheduledDeliveryDate&&h('button',{type:'button',disabled:state.busy||state.needsReview,onClick:()=>{void controller.current?.submit({...details,clearSchedule:true});}},'Clear schedule'),h('button',{type:'submit',className:'ps-excel-action-primary',disabled:state.busy||state.needsReview},state.busy?'Saving…':schedule?'Save schedule':dispatch?'Confirm dispatch':'Confirm ready for dispatch'))),
        !state.busy&&h('footer',null,h('button',{type:'button',onClick:reload},state.needsReview?'Reload latest status':'Refresh status'),state.phase!=='confirm'&&h('button',{type:'button',onClick:close},'Close'))));
    };
  }
  return {parseLink,manualReady,siteLoad,createController,createComponent};
});
