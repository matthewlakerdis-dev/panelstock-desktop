(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 else {root.PanelStockTrackerHandoff=api;api.boot(root);}
})(typeof window==='object'?window:globalThis,function(){
 'use strict';
 const actions=['ready','dispatch','schedule','drawn','pdf'];
 function validLink(value){return value&&typeof value.id==='string'&&/^[a-zA-Z0-9-]{16,100}$/.test(value.id)&&actions.includes(value.action)?{id:value.id,action:value.action}:null;}
 function readLink(href){try{const p=new URL(href).searchParams;if(p.has('orderPdf')&&p.has('orderAction'))return null;return validLink(p.has('orderPdf')?{id:p.get('orderPdf'),action:'pdf'}:{id:p.get('orderId'),action:p.get('orderAction')});}catch{return null;}}
 function createCoordinator({channel,peerId,canReceive=true,timeout=1500,setTimer=setTimeout,clearTimer=clearTimeout}){
  let handler=null,disposed=false,sequence=0;const pending=new Map(),offered=new Map();
  const send=value=>{if(!disposed)channel.postMessage({...value,from:peerId});};
  const eligible=link=>{try{return canReceive&&!!handler?.canOpen(link);}catch{return false;}};
  function receive(event){
   const data=event.data;if(disposed||!data||data.from===peerId||typeof data.from!=='string'||data.from.length>100||typeof data.requestId!=='string'||!/^[a-zA-Z0-9-]{1,100}$/.test(data.requestId))return;
   const link=validLink(data.link);
   if(data.type==='probe'&&link&&eligible(link)){
    if(offered.size>=16)return;const key=data.from+':'+data.requestId;offered.set(key,{link,deadline:Math.min(Number(data.deadline)||Date.now()+timeout,Date.now()+timeout)});setTimer(()=>offered.delete(key),timeout*2);
    send({type:'offer',requestId:data.requestId,to:data.from});
   }else if(data.type==='offer'&&data.to===peerId){
    const request=pending.get(data.requestId);if(!request||request.target)return;request.target=data.from;send({type:'open',requestId:data.requestId,to:data.from,link:request.link});
   }else if(data.type==='open'&&data.to===peerId&&link){
    const key=data.from+':'+data.requestId,offer=offered.get(key);offered.delete(key);
    if(!offer||Date.now()>offer.deadline||offer.link.id!==link.id||offer.link.action!==link.action||!eligible(link))return;
    try{if(handler.open(link)!==false)send({type:'ack',requestId:data.requestId,to:data.from});}catch{}
   }else if(data.type==='ack'&&data.to===peerId){const request=pending.get(data.requestId);if(request&&request.target===data.from){pending.delete(data.requestId);clearTimer(request.timer);request.resolve(true);}}
  }
  channel.addEventListener('message',receive);
  return {
   register(next){handler=next;return()=>{if(handler===next)handler=null;};},
   launch(value){const link=validLink(value);if(!link||disposed)return Promise.resolve(false);const requestId=peerId+'-'+(++sequence);return new Promise(resolve=>{const timer=setTimer(()=>{pending.delete(requestId);resolve(false);},timeout);pending.set(requestId,{link,resolve,timer,target:''});send({type:'probe',requestId,link,deadline:Date.now()+timeout});});},
   dispose(){disposed=true;handler=null;channel.removeEventListener('message',receive);channel.close();for(const request of pending.values()){clearTimer(request.timer);request.resolve(false);}pending.clear();offered.clear();}
  };
 }
 function boot(root){
  const api=root.PanelStockTrackerHandoff;if(!root.BroadcastChannel)return;
  let channel;try{channel=new root.BroadcastChannel('panelstock-tracker-handoff-v1');}catch{return;}
  const original=new URL(root.location.href),incoming=readLink(original.href),peerId=root.crypto?.randomUUID?.()||String(Date.now())+'-'+Math.random().toString(16).slice(2);
  const coordinator=createCoordinator({channel,peerId,canReceive:!incoming});api.register=coordinator.register;
  let leaving=false;root.addEventListener('pagehide',event=>{leaving=true;if(!event.persisted)coordinator.dispose();});root.addEventListener('pageshow',()=>{leaving=false;});
  if(!incoming||original.searchParams.get('trackerTab')==='here')return;
  // A temporary relay tab must never start an editing session or flush an outbox.
  // The desktop bootstrap waits for this decision before loading its session client.
  api.relayTab=true;
  if(root.PanelStockExcelActions)root.PanelStockExcelActions.link=null;
  const fallback=new URL(original);fallback.searchParams.set('trackerTab','here');api.pending=true;
  let status='Checking for an open PanelStock tab…';
  function show(){if(!root.document.body)return;let panel=root.document.getElementById('panelstock-tracker-handoff');if(!panel){panel=root.document.createElement('section');panel.id='panelstock-tracker-handoff';panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');panel.tabIndex=-1;Object.assign(panel.style,{position:'fixed',inset:'0',zIndex:'2147483646',background:'#f8fafc',color:'#0f172a',padding:'48px 24px',fontFamily:'system-ui,sans-serif'});const heading=root.document.createElement('h1');heading.textContent='PanelStock';const message=root.document.createElement('p');message.dataset.handoffStatus='';const link=root.document.createElement('a');link.href=fallback.href;link.textContent='Open in this tab instead';panel.append(heading,message,link);root.document.body.appendChild(panel);panel.focus();panel.addEventListener('keydown',event=>{if(event.key==='Tab'){event.preventDefault();link.focus();}});}const app=root.document.getElementById('root');if(app){app.inert=true;app.setAttribute('aria-hidden','true');}panel.querySelector('[data-handoff-status]').textContent=status;}
  root.document.addEventListener('DOMContentLoaded',show,{once:true});show();
  api.settled=coordinator.launch(incoming).then(handled=>{api.pending=false;api.handled=handled;if(leaving)return handled;if(handled){status='Opened in an existing PanelStock tab. You can close this temporary tab.';show();try{root.close();}catch{}}else root.location.replace(fallback.href);return handled;});
 }
 return {validLink,readLink,createCoordinator,boot};
});
