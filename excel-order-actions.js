(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.PanelStockExcelActions={...api,link:api.parseLink(root.location.href)};
})(typeof window==='object'?window:globalThis,function(){
  'use strict';
  const active=['submitted','approved','ordered','in_stock'];
  const normalize=value=>String(value||'').trim().toLowerCase();
  function parseLink(href){
    try{const params=new URL(href).searchParams,id=params.has('orderPdf')?params.get('orderPdf'):params.get('orderId'),action=params.has('orderPdf')?'pdf':params.get('orderAction');
      return /^[a-zA-Z0-9-]{16,100}$/.test(id||'')&&['ready','dispatch','schedule','drawn','pdf'].includes(action)?{id,action}:null;
    }catch{return null;}
  }
  const manualReady=order=>active.includes(order.status)&&!['panels','gate'].includes(normalize(order.orderType));
  const drawingOrder=order=>['panels','gate'].includes(normalize(order.orderType));
  const drawn=order=>normalize(order.orderType)==='gate'?order.manualProduction?.stages?.drawn==='complete':(typeof order.manualDrawing?.drawn==='boolean'?order.manualDrawing.drawn:order.drawingProgress?.drawn)===true;
  const siteLoad=load=>['waiting','ready_for_site'].includes(load.status)&&load.readyForSite===true;
  function createController({link,client,baseUrl,onChange,uuid=()=>crypto.randomUUID()}){
    const owner=client.username;
    let version=0,disposed=false,locked=false;
    let state={phase:'loading',busy:false,order:null,loads:[],selected:null,error:'',message:'',needsReview:false,mutationId:uuid(),dispatchDefaults:{}};
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
        if(link.action==='pdf'){
          const {order}=await request('/orders/'+encodeURIComponent(link.id));
          if(generation!==version||!current())return;publish({order,phase:'pdf',message:''});
        }else if(link.action==='schedule'){
          const actor=await request('/session');
          if(generation!==version||!current())return;
          if(actor.isAdmin!==true){publish({phase:'blocked',message:'Only administrators can schedule deliveries.'});return;}
          const {order}=await request('/orders/'+encodeURIComponent(link.id));
          if(generation!==version||!current())return;
          if(['dispatched','cancelled'].includes(order.status))publish({order,phase:'blocked',message:'This order is already '+order.status+' and cannot be rescheduled.'});
          else publish({order,phase:'confirm',message:''});
        }else if(link.action==='drawn'){
          const actor=await request('/session');
          if(generation!==version||!current())return;
          if(!actor.isAdmin&&!actor.taskAccess?.['site.orders.manage']){publish({phase:'blocked',message:'Site order management access is required to mark an order drawn.'});return;}
          const {order}=await request('/orders/'+encodeURIComponent(link.id));
          if(generation!==version||!current())return;
          if(['dispatched','cancelled'].includes(order.status))publish({order,phase:'blocked',message:'This order is already '+order.status+' and cannot be marked drawn.'});
          else if(!drawingOrder(order))publish({order,phase:'blocked',message:'Mark drawn is only available for panel and gate orders.'});
          else if(drawn(order))publish({order,phase:'done',message:'This order is already marked Drawn. Use Refresh All in Excel to update the tracker.'});
          else publish({order,phase:'confirm',message:''});
        }else if(link.action==='ready'){
          const {order}=await request('/orders/'+encodeURIComponent(link.id));
          if(generation!==version||!current())return;
          if(order.status==='completed')publish({order,phase:'done',message:'This order is already Ready for dispatch.'});
          else if(['dispatched','cancelled'].includes(order.status))publish({order,phase:'blocked',message:'This order is already '+order.status+'.'});
          else if(!manualReady(order))publish({order,phase:'blocked',message:'Readiness for panels and gates is set by production and QA. Complete the required checks in PanelStockHQ.'});
          else publish({order,phase:'confirm',message:''});
        }else{
          const data=await request('/dispatch/orders'),{orders}=data;
          if(generation!==version||!current())return;
          const order=orders.find(value=>value.id===link.id);
          if(!order){publish({phase:'blocked',message:'This order is no longer ready for dispatch, or is unavailable to your account.'});return;}
          if(order.status==='dispatched'){publish({order,phase:'done',message:'This order has been dispatched. Use Refresh All in Excel to update the tracker.'});return;}
          if(!order.ready){publish({order,phase:'blocked',message:'This order is no longer ready for dispatch.'});return;}
          if(order.usesPanelLoads){
            const panelData=await request('/dispatch/panels'),{loads}=panelData;
            if(generation!==version||!current())return;
            const matching=loads.filter(load=>normalize(load.project)===normalize(order.project)&&normalize(load.orderNumber)===normalize(order.orderNumber));
            publish({order,loads:matching,phase:'loads',dispatchDefaults:panelData});
          }else publish({order,phase:'confirm',message:'',mutationId:uuid(),dispatchDefaults:data});
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
      if(link.action==='ready'&&!manualReady(state.order)||link.action==='drawn'&&(!drawingOrder(state.order)||drawn(state.order)||['dispatched','cancelled'].includes(state.order.status))||panel&&!siteLoad(state.selected||{}))return false;
      const delivery=Object.fromEntries(['destination','transport','driver','notes'].filter(key=>Object.hasOwn(details,key)).map(key=>[key,details[key]]));
      let gateAreaM2;
      if(link.action==='drawn'&&normalize(state.order.orderType)==='gate'){
        const area=details.areaM2??state.order.manualProduction?.areaM2;
        gateAreaM2=typeof area==='number'||typeof area==='string'?Number(area):NaN;
        if(!Number.isFinite(gateAreaM2)||gateAreaM2<=0||gateAreaM2>99999){publish({error:'Enter the total Gate area greater than 0 and up to 99999 m².'});return false;}
      }
      locked=true;publish({busy:true,error:''});
      try{
        if(link.action==='schedule'){
          const clear=details.clearSchedule===true,date=clear?'':details.scheduledDeliveryDate,time=clear?'':details.scheduledDeliveryTime||'';
          const parsed=typeof date==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(date)?new Date(date+'T12:00:00Z'):null;
          if(!clear&&(!parsed||!Number.isFinite(parsed.getTime())||parsed.toISOString().slice(0,10)!==date))throw Error('Choose a valid scheduled delivery date.');
          if(typeof time!=='string'||time&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(time))throw Error('Choose a valid delivery time or leave it blank.');
          const result=await request('/orders/'+encodeURIComponent(link.id)+'/delivery',{scheduledDeliveryDate:date,scheduledDeliveryTime:time,expectedUpdatedAt:state.order.updatedAt||state.order.createdAt||''});
          publish({phase:'done',message:(result.unchanged?'Delivery schedule is unchanged.':clear?'Delivery schedule cleared.':'Delivery scheduled.')+' Use Refresh All in Excel to update the tracker.'});
        }else if(link.action==='drawn'){
          const gate=normalize(state.order.orderType)==='gate';
          await request('/orders/'+encodeURIComponent(link.id)+(gate?'/progress':'/drawing'),{...(gate?{stages:{drawn:'complete'},areaM2:gateAreaM2}:{drawn:true}),expectedUpdatedAt:state.order.updatedAt||state.order.createdAt||''});
          publish({phase:'done',message:'Order marked Drawn.'+(gate?' Gate items are now queued for QA.':'')+' Use Refresh All in Excel to update the tracker.'});
        }else if(link.action==='ready'){
          await request('/orders/'+encodeURIComponent(link.id)+'/status',{status:'completed',expectedUpdatedAt:state.order.updatedAt||state.order.createdAt||''});
          publish({phase:'done',message:'Order marked Ready for dispatch. Use Refresh All in Excel to update the tracker.'});
        }else if(panel){
          await request('/dispatch/panels',{...delivery,id:state.selected.id,action:'dispatch',destinationType:'site'});
          locked=false;
          publish({message:'Load dispatched. The order becomes Dispatched once every load has been sent to site.'});
          await load();
        }else{
          await request('/dispatch/orders',{...delivery,id:link.id,expectedUpdatedAt:state.order.updatedAt||state.order.createdAt||'',mutationId:state.mutationId});
          publish({phase:'done',message:'Order dispatched. Use Refresh All in Excel to update the tracker.'});
        }
        return true;
      }catch(error){publish({error:error.message,needsReview:error.status===409||panel||['ready','drawn'].includes(link.action)});return false;}
      finally{locked=false;publish({busy:false});}
    }
    return {load,selectLoad,submit,get state(){return state;},dispose(){disposed=true;version++;}};
  }
  function dispatchFormDefaults(data={},order={},load=null){
    const vehicles=data.dispatchVehicles||[],drivers=data.dispatchDrivers||[],driver=drivers.find(user=>user.username===data.dispatchDefaultDriver);
    return {vehicles,drivers,details:{destination:load?.siteAddress||order.siteAddress||'',transport:vehicles[0]||'',transportChoice:vehicles.length?'vehicle:0':'external',driver:driver?.displayName||driver?.username||'',driverChoice:driver?'user:'+driver.username:drivers.length?'':'external',notes:''}};
  }
  function createComponent(React,client,baseUrl,initialLink){
    const {createElement:h,useState,useEffect,useRef}=React;
    return function ExcelOrderAction({username}){
      const [link,setLink]=useState(initialLink?.action==='pdf'?null:initialLink),[pdf,setPdf]=useState({url:'',owner:'',error:''}),[closed,setClosed]=useState(false),[state,setState]=useState({phase:'loading',busy:true}),[dispatchOptions,setDispatchOptions]=useState({vehicles:[],drivers:[]}),[details,setDetails]=useState({destination:'',transport:'',driver:'',notes:'',scheduledDeliveryDate:'',scheduledDeliveryTime:'',areaM2:''});
      const controller=useRef(null),dialog=useRef(null),handoffClaim=useRef(false);
      useEffect(()=>{
        if(!link||!username||closed)return;
        let formKey='';
        const instance=createController({link,client,baseUrl,onChange:next=>{
          setState({...next,owner:username});
          if(link.action==='dispatch'&&next.phase==='confirm'){
            const key=next.selected?.id||next.order.id;
            if(key!==formKey){formKey=key;const defaults=dispatchFormDefaults(next.dispatchDefaults,next.order,next.selected);setDispatchOptions(defaults);setDetails(defaults.details);}
          }
        }});controller.current=instance;void instance.load();
        return()=>{instance.dispose();controller.current=null;};
      },[username,closed,link]);
      useEffect(()=>{
        if(typeof window==='undefined'||!window.PanelStockTrackerHandoff?.register)return;
        if(!link||closed)handoffClaim.current=false;
        return window.PanelStockTrackerHandoff.register({
          canOpen:()=>!!username&&client.username===username&&!handoffClaim.current&&(!link||closed)&&(!link||!state.busy),
          open:next=>{handoffClaim.current=true;setState({phase:'loading',busy:true,owner:username});setPdf({url:'',owner:'',error:''});setClosed(false);setLink({...next});try{window.focus();}catch{}return true;}
        });
      },[username,link,closed,state.busy]);
      useEffect(()=>{
        if(link?.action!=='pdf'||state.phase!=='pdf'||closed||!username)return;
        let live=true;const owner=username;setPdf({url:'',owner,error:''});
        void (async()=>{try{
          const response=await client.apiFetch(baseUrl+'/orders/'+encodeURIComponent(link.id)+'/pdf-link',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'}),data=await response.json();
          if(!response.ok)throw Error(data.error||'The order PDF could not be opened.');
          if(!/^[a-f0-9]{64}$/.test(data.pdfToken||''))throw Error('The order PDF link could not be verified.');
          if(!live||client.username!==owner)return;const previewUrl=baseUrl+'/orders/'+encodeURIComponent(link.id)+'/pdf?ticket='+encodeURIComponent(data.pdfToken);setPdf({url:previewUrl,owner,error:''});
        }catch(error){if(live&&client.username===owner)setPdf({url:'',owner,error:error.message});}})();
        return()=>{live=false;};
      },[username,link,state.phase,closed]);
      useEffect(()=>{
        if(link?.action==='schedule'&&state.phase==='confirm'&&state.order)setDetails(current=>({...current,scheduledDeliveryDate:state.order.scheduledDeliveryDate||'',scheduledDeliveryTime:state.order.scheduledDeliveryTime||''}));
        if(link?.action==='drawn'&&normalize(state.order?.orderType)==='gate'&&state.phase==='confirm')setDetails(current=>({...current,areaM2:state.order.manualProduction?.areaM2??''}));
      },[state.order,state.phase]);
      useEffect(()=>{if(!closed&&link&&username)dialog.current?.focus();},[closed,username]);
      if(!link||!username||closed||state.owner&&state.owner!==username)return null;
      const close=()=>{if(!state.busy)setClosed(true);};
      const reload=()=>{void controller.current?.load();};
      const keyDown=event=>{
        if(event.key==='Escape'){event.preventDefault();close();}
        if(event.key==='Tab'){
          const controls=[...dialog.current.querySelectorAll('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),a[href],iframe')];
          const first=controls[0],last=controls[controls.length-1];
          if(event.shiftKey&&(document.activeElement===first||document.activeElement===dialog.current)){event.preventDefault();last?.focus();}
          else if(!event.shiftKey&&(document.activeElement===last||document.activeElement===dialog.current)){event.preventDefault();first?.focus();}
        }
      };
      const heading=link.action==='pdf'?'Order PDF':link.action==='drawn'?'Mark drawn':link.action==='schedule'?'Schedule delivery':link.action==='ready'?'Mark ready for dispatch':'Dispatch to site';
      const confirm=state.phase==='confirm',dispatch=link.action==='dispatch',schedule=link.action==='schedule',drawing=link.action==='drawn';
      return h('div',{className:'ps-excel-action-backdrop'},h('section',{className:'ps-excel-action'+(link.action==='pdf'?' ps-excel-action-pdf':''),role:'dialog','aria-modal':true,'aria-label':heading,tabIndex:-1,ref:dialog,onKeyDown:keyDown},
        h('header',null,h('div',null,h('small',null,'Production Tracker'),h('h2',null,heading)),h('button',{type:'button',disabled:state.busy,onClick:close,'aria-label':'Close order action'},'Close')),
        state.order&&h('p',{className:'ps-excel-action-order'},'Order #'+state.order.orderNumber+' · '+state.order.project),
        state.phase==='loading'&&h('p',{role:'status'},'Checking the latest order status…'),
        state.message&&h('p',{role:'status'},state.message),
        state.error&&h('p',{role:'alert',className:'ps-excel-action-error'},state.error),
        state.phase==='pdf'&&h('div',null,pdf.owner===username&&pdf.error?h('p',{role:'alert',className:'ps-excel-action-error'},pdf.error):pdf.owner===username&&pdf.url?h('div',null,h('p',null,'Use the PDF toolbar to print or download.'),h('iframe',{src:pdf.url,title:'Site order PDF',referrerPolicy:'no-referrer',className:'ps-excel-order-pdf'})):h('p',{role:'status'},'Loading order PDF…')),
        state.phase==='loads'&&h('div',null,h('p',null,'Choose a load to dispatch to site. Production, coating and QA checks apply to each load.'),
          !state.loads.length&&h('p',null,'No panel loads are available for this order.'),
          state.loads.map(load=>h('article',{key:load.id,className:'ps-excel-action-load'},h('div',null,h('strong',null,load.project+' · Order '+load.orderNumber),h('p',null,(load.items?.length||load.panelIds?.length||0)+' panels · '+(load.status==='dispatched_to_site'?'Dispatched to site':siteLoad(load)?'Ready for site':'Waiting for production / coating / QA'))),siteLoad(load)&&h('button',{type:'button',disabled:state.busy,onClick:()=>controller.current?.selectLoad(load.id)},'Dispatch this load')))),
        confirm&&h('form',{onSubmit:event=>{event.preventDefault();void controller.current?.submit(details);}},
          !dispatch&&!schedule&&!drawing&&h('p',null,'Confirm that this order is ready for dispatch. This will update its status in PanelStockHQ.'),
          drawing&&h('p',null,normalize(state.order.orderType)==='gate'?'Confirm the drawings for this gate order are complete. Each gate item will be sent to the QA Centre; QA approval will update dispatch readiness automatically.':'Confirm the drawings for this panel order are complete.'),
          drawing&&normalize(state.order.orderType)==='gate'&&h('label',null,'Total Gate area (m²) ',h('span',{style:{color:'#dc2626'},'aria-hidden':true},'*'),h('input',{name:'areaM2',type:'number',required:true,min:'0.000001',max:'99999',step:'any',value:details.areaM2,disabled:state.busy,onChange:event=>{const value=event.target.value;setDetails(current=>({...current,areaM2:value}));}})),
          schedule&&h('div',null,
            h('p',null,'Requested delivery: '+(state.order.requestedDeliveryDate?state.order.requestedDeliveryDate.split('-').reverse().join('/'):'Not set')),
            h('label',null,'Scheduled delivery date',h('input',{type:'date',required:true,value:details.scheduledDeliveryDate,disabled:state.busy,onChange:event=>{const value=event.target.value;setDetails(current=>({...current,scheduledDeliveryDate:value}));}})),
            h('label',null,'Delivery time (optional)',h('input',{type:'time',value:details.scheduledDeliveryTime,disabled:state.busy,onChange:event=>{const value=event.target.value;setDetails(current=>({...current,scheduledDeliveryTime:value}));}}))),
          dispatch&&h('div',null,state.selected&&h('p',null,'Dispatching the selected panel load to site.'),
            h('label',null,'Site address',h('input',{required:true,maxLength:300,value:details.destination,disabled:state.busy,onChange:event=>{const value=event.target.value;setDetails(current=>({...current,destination:value}));}})),
            h('label',null,'Vehicle / transport company',h('select',{required:true,value:details.transportChoice,disabled:state.busy,onChange:event=>{const value=event.target.value;setDetails(current=>({...current,transportChoice:value,transport:value==='external'?'':dispatchOptions.vehicles[Number(value.slice(8))]||''}));}},dispatchOptions.vehicles.map((vehicle,index)=>h('option',{key:vehicle,value:'vehicle:'+index},vehicle)),h('option',{value:'external'},'Other vehicle / transport'))),
            details.transportChoice==='external'&&h('label',null,'Other vehicle / transport company',h('input',{required:true,maxLength:300,value:details.transport,disabled:state.busy,onChange:event=>{const value=event.target.value;setDetails(current=>({...current,transport:value}));}})),
            h('label',null,'Driver',h('select',{required:true,value:details.driverChoice,disabled:state.busy,onChange:event=>{const value=event.target.value,user=dispatchOptions.drivers.find(item=>'user:'+item.username===value);setDetails(current=>({...current,driverChoice:value,driver:user?(user.displayName||user.username):''}));}},h('option',{value:'',disabled:true},'Choose driver'),dispatchOptions.drivers.map(user=>h('option',{key:user.username,value:'user:'+user.username},user.displayName||user.username)),h('option',{value:'external'},'Other / external driver'))),
            details.driverChoice==='external'&&h('label',null,'Other driver name',h('input',{required:true,maxLength:300,value:details.driver,disabled:state.busy,onChange:event=>{const value=event.target.value;setDetails(current=>({...current,driver:value}));}})),
            h('label',null,'Notes (optional)',h('textarea',{maxLength:5000,rows:3,value:details.notes,disabled:state.busy,onChange:event=>{const value=event.target.value;setDetails(current=>({...current,notes:value}));}}))),
          h('footer',null,h('button',{type:'button',disabled:state.busy,onClick:close},'Cancel'),schedule&&state.order.scheduledDeliveryDate&&h('button',{type:'button',disabled:state.busy||state.needsReview,onClick:()=>{void controller.current?.submit({...details,clearSchedule:true});}},'Clear schedule'),h('button',{type:'submit',className:'ps-excel-action-primary',disabled:state.busy||state.needsReview},state.busy?'Saving…':drawing?'Confirm drawn':schedule?'Save schedule':dispatch?'Confirm dispatch':'Confirm ready for dispatch'))),
        !state.busy&&h('footer',null,h('button',{type:'button',onClick:reload},state.needsReview?'Reload latest status':'Refresh status'),state.phase!=='confirm'&&h('button',{type:'button',onClick:close},'Close'))));
    };
  }
  return {parseLink,manualReady,siteLoad,createController,dispatchFormDefaults,createComponent};
});
