(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.PanelStockScheduleMove=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 const minutes=value=>{const m=/^(\d{2}):(\d{2})$/.exec(value||'');return m?Number(m[1])*60+Number(m[2]):null;};
 const time=value=>String(Math.floor(value/60)).padStart(2,'0')+':'+String(value%60).padStart(2,'0');
 function movedTimes(entry,start,bounds){
  const from=minutes(entry.startTime)??bounds.startHour*60,to=minutes(entry.endTime)??Math.min(bounds.endHour*60,from+60),duration=to-from;
  const first=bounds.startHour*60,last=Math.floor((bounds.endHour*60-duration)/30)*30;
  if(duration<=0||last<first)return null;
  const next=Math.max(first,Math.min(last,Math.round(start/30)*30));return {startTime:time(next),endTime:time(next+duration)};
 }
 function createController({onCommit,onHoverDay=()=>{},document:doc=globalThis.document,window:win=globalThis.window}){
  let drag=null,suppressed=null,frame=null;
  function cleanup(){if(!drag)return null;const state=drag;drag=null;doc.removeEventListener('pointermove',move);doc.removeEventListener('pointerup',finish);doc.removeEventListener('pointercancel',cancel);doc.removeEventListener('keydown',key);win.removeEventListener('blur',cancel);state.card.removeEventListener('lostpointercapture',cancel);if(frame!==null)win.cancelAnimationFrame(frame);frame=null;state.card.style.opacity=state.opacity;state.card.style.pointerEvents=state.pointerEvents;state.tip.remove();try{state.card.releasePointerCapture?.(state.pointerId);}catch{}if(state.moved)suppressed={id:state.entry.id,until:Date.now()+700};return state;}
  function cancel(event){if(event?.pointerId!==undefined&&drag&&event.pointerId!==drag.pointerId)return;cleanup();}
  function key(event){if(event.key==='Escape'){event.preventDefault();cancel();}}
  function preview(){
   if(!drag?.moved)return;
   const target=doc.elementFromPoint(drag.x,drag.y),lane=target?.closest('[data-schedule-lane]'),day=target?.closest('[data-schedule-date-target]');
   drag.next=null;
   if(lane){const rect=lane.getBoundingClientRect(),start=drag.bounds.startHour*60+(drag.x-rect.left)/rect.width*(drag.bounds.endHour-drag.bounds.startHour)*60-drag.offset;const times=movedTimes(drag.entry,start,drag.bounds);if(times)drag.next={...times,date:lane.dataset.scheduleDate,assignedUsername:lane.dataset.schedulePerson};}
   else if(day){const times=movedTimes(drag.entry,minutes(drag.entry.startTime)??drag.bounds.startHour*60,drag.bounds);if(times)drag.next={...times,date:day.dataset.scheduleDateTarget,assignedUsername:drag.entry.assignedUsername};if(drag.hoverDay!==day.dataset.scheduleDateTarget){drag.hoverDay=day.dataset.scheduleDateTarget;onHoverDay(drag.hoverDay);}}
   drag.tip.style.display='block';drag.tip.textContent=drag.next?`${drag.next.date} · ${drag.next.startTime} – ${drag.next.endTime}${lane?' · '+(lane.dataset.schedulePersonName||''):''}`:'Move over a schedule row or day';drag.tip.style.left=Math.max(8,Math.min(win.innerWidth-290,drag.x+12))+'px';drag.tip.style.top=Math.max(8,drag.y-42)+'px';
  }
  function scroll(){frame=null;if(!drag?.moved)return;const region=doc.querySelector('[data-schedule-scroll]');if(region){const r=region.getBoundingClientRect();if(drag.y>=r.top&&drag.y<=r.bottom){const direction=drag.x>r.right-40?1:drag.x<r.left+40?-1:0;if(direction){region.scrollLeft+=direction*18;preview();}}}frame=win.requestAnimationFrame(scroll);}
  function move(event){if(!drag||event.pointerId!==drag.pointerId)return;drag.x=event.clientX;drag.y=event.clientY;if(!drag.moved&&Math.hypot(drag.x-drag.startX,drag.y-drag.startY)<6)return;event.preventDefault();if(!drag.moved){drag.moved=true;drag.card.style.opacity='.4';drag.card.style.pointerEvents='none';frame=win.requestAnimationFrame(scroll);}preview();}
  function finish(event){if(!drag||event.pointerId!==drag.pointerId)return;move(event);const state=cleanup();if(!state?.moved||!state.next)return;const next=state.next;if(['date','assignedUsername','startTime','endTime'].every(key=>next[key]===state.entry[key]))return;Promise.resolve(onCommit(state.entry,next)).catch(()=>{});}
  function begin(event,entry,bounds){
   if(event.button!==undefined&&event.button!==0||event.isPrimary===false||event.target.closest('[data-resize-edge]'))return;
   cleanup();const card=event.currentTarget,lane=card.closest('[data-schedule-lane]'),rect=lane?.getBoundingClientRect();if(!rect?.width)return;
   const start=minutes(entry.startTime)??bounds.startHour*60;if(!movedTimes(entry,start,bounds))return;
   const tip=doc.createElement('div');tip.setAttribute('role','status');tip.setAttribute('data-move-preview','');Object.assign(tip.style,{display:'none',position:'fixed',zIndex:'100',pointerEvents:'none',background:'#0f172a',color:'white',fontSize:'13px',padding:'6px 10px',borderRadius:'6px'});doc.body.appendChild(tip);
   drag={entry,bounds,card,tip,pointerId:event.pointerId,startX:event.clientX,startY:event.clientY,x:event.clientX,y:event.clientY,offset:(event.clientX-rect.left)/rect.width*(bounds.endHour-bounds.startHour)*60-(start-bounds.startHour*60),opacity:card.style.opacity,pointerEvents:card.style.pointerEvents,moved:false,next:null};
   doc.addEventListener('pointermove',move,{passive:false});doc.addEventListener('pointerup',finish);doc.addEventListener('pointercancel',cancel);doc.addEventListener('keydown',key);win.addEventListener('blur',cancel);card.addEventListener('lostpointercapture',cancel);try{card.setPointerCapture?.(event.pointerId);}catch{}
  }
  return {begin,destroy:()=>cleanup(),consumeClick:id=>!!suppressed&&suppressed.id===id&&Date.now()<suppressed.until};
 }
 return {movedTimes,createController};
});
