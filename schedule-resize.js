(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.PanelStockScheduleResize=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 const minutes=value=>{const parts=String(value||'').split(':').map(Number);return parts.length===2&&parts.every(Number.isFinite)?parts[0]*60+parts[1]:null;};
 const time=value=>String(Math.floor(value/60)).padStart(2,'0')+':'+String(value%60).padStart(2,'0');
 function resizedTimes(entry,edge,deltaMinutes,bounds){
  const first=bounds.startHour*60,last=bounds.endHour*60,start=minutes(entry.startTime)??first,end=minutes(entry.endTime)??Math.min(last,start+60);
  const lower=edge==='start'?first:Math.ceil(Math.max(first+30,start+30)/30)*30,upper=edge==='start'?Math.floor(Math.min(last-30,end-30)/30)*30:last;
  if(!['start','end'].includes(edge)||lower>upper)return null;
  const next=Math.max(lower,Math.min(upper,Math.round(((edge==='start'?start:end)+deltaMinutes)/30)*30));return {startTime:time(edge==='start'?next:start),endTime:time(edge==='end'?next:end)};
 }
 function createController({onCommit,document:doc=globalThis.document,window:win=globalThis.window}){
  let drag=null,suppressed=null;
  const consumeClick=id=>!!suppressed&&suppressed.id===id&&Date.now()<suppressed.until;
  function cleanup(restore=true){if(!drag)return null;const state=drag;drag=null;doc.removeEventListener('pointermove',move);doc.removeEventListener('pointerup',finish);doc.removeEventListener('pointercancel',cancel);doc.removeEventListener('keydown',key);win.removeEventListener('blur',cancel);state.handle.removeEventListener('lostpointercapture',cancel);if(restore){state.card.style.left=state.left;state.card.style.width=state.width;}state.tip.remove();try{state.handle.releasePointerCapture?.(state.pointerId);}catch{}suppressed={id:state.entry.id,until:Date.now()+700};return state;}
  function cancel(event){if(event?.pointerId!==undefined&&drag&&event.pointerId!==drag.pointerId)return;cleanup();}
  function key(event){if(event.key==='Escape'){event.preventDefault();cancel();}}
  function move(event){if(!drag||event.pointerId!==drag.pointerId)return;event.preventDefault();const dx=event.clientX-drag.x;if(!drag.moved&&Math.abs(dx)<3)return;drag.moved=true;drag.next=resizedTimes(drag.entry,drag.edge,dx/drag.laneWidth*(drag.bounds.endHour-drag.bounds.startHour)*60,drag.bounds);if(!drag.next)return;
   const start=minutes(drag.next.startTime),end=minutes(drag.next.endTime),span=(drag.bounds.endHour-drag.bounds.startHour)*60,left=(start-drag.bounds.startHour*60)/span*100,width=Math.min(100-left,(end-start)/span*100);drag.card.style.left='calc('+left+'% + 3px)';drag.card.style.width='calc('+width+'% - 6px)';drag.tip.style.display='block';drag.tip.textContent=drag.next.startTime+' – '+drag.next.endTime;drag.tip.style.left=Math.max(8,Math.min(win.innerWidth-160,event.clientX+12))+'px';drag.tip.style.top=Math.max(8,event.clientY-38)+'px';
  }
  function finish(event){if(!drag||event.pointerId!==drag.pointerId)return;move(event);const state=cleanup();if(!state?.moved||!state.next)return;const next=state.next,old=resizedTimes(state.entry,state.edge,0,state.bounds);const original=state.edge==='start'?(state.entry.startTime||time(state.bounds.startHour*60)):(state.entry.endTime||old?.endTime);if(next[state.edge==='start'?'startTime':'endTime']===original)return;Promise.resolve(onCommit(state.entry,{edge:state.edge,time:next[state.edge==='start'?'startTime':'endTime'],...next})).catch(()=>{});}
  function begin(event,entry,edge,bounds){if(event.button!==undefined&&event.button!==0||event.isPrimary===false)return;event.preventDefault();event.stopPropagation();cleanup();const handle=event.currentTarget,card=handle.closest('[data-schedule-card]'),lane=card?.parentElement,rect=lane?.getBoundingClientRect();if(!card||!rect?.width||!resizedTimes(entry,edge,0,bounds))return;
   const tip=doc.createElement('div');tip.setAttribute('role','status');tip.setAttribute('data-resize-preview','');Object.assign(tip.style,{display:'none',position:'fixed',zIndex:'100',pointerEvents:'none',background:'#0f172a',color:'white',fontSize:'13px',fontWeight:'600',padding:'6px 10px',borderRadius:'6px'});doc.body.appendChild(tip);drag={entry,edge,bounds,handle,card,pointerId:event.pointerId,x:event.clientX,laneWidth:rect.width,left:card.style.left,width:card.style.width,tip,moved:false,next:null};suppressed={id:entry.id,until:Date.now()+700};
   doc.addEventListener('pointermove',move,{passive:false});doc.addEventListener('pointerup',finish);doc.addEventListener('pointercancel',cancel);doc.addEventListener('keydown',key);win.addEventListener('blur',cancel);handle.addEventListener('lostpointercapture',cancel);try{handle.setPointerCapture?.(event.pointerId);}catch{}
  }
  return {begin,consumeClick,destroy:()=>cleanup()};
 }
 return {resizedTimes,createController};
});
