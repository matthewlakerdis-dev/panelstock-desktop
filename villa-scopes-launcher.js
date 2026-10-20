(function(root){
 'use strict';
 root.PanelStockVillaScopes={open:async function(workerUrl,app,view){
  view=view==='report'?'report':'manage';
  var popup=root.open('about:blank','_blank');if(popup)popup.opener=null;
  try{
   var response=await root.PanelStock.apiFetch(workerUrl.replace(/\/$/,'')+'/villa-scopes/session-ticket',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({app:app,view:view})});
   var result=await response.json();if(!response.ok||!result.ticket)throw Error(result.error||'Unable to open Villa Scopes.');
   var origin=new URL(workerUrl).origin,host=new URL(workerUrl).hostname;
   if(['cnc.panelstockhq.com','panelstock-reports.matthewlakerdis.workers.dev','safety.panelstockhq.com'].indexOf(host)>=0)origin='https://cnc.panelstockhq.com';
   var url=new URL(origin+(view==='report'?'/villa-scopes/view':'/villa-scopes'));url.searchParams.set('app',app);url.hash='ticket='+encodeURIComponent(result.ticket);
   if(popup&&!popup.closed)popup.location.replace(url.href);else root.location.assign(url.href);
  }catch(error){if(popup&&!popup.closed){popup.document.title='Villa Scopes';popup.document.body.textContent=error.message||'Unable to open Villa Scopes.';popup.document.body.setAttribute('role','alert');}else{var notice=root.document.createElement('div');notice.setAttribute('role','alert');notice.style.cssText='position:fixed;bottom:24px;left:24px;right:24px;padding:18px;background:#fff2d8;color:#735316;border:1px solid #e8c979;border-radius:8px;z-index:9999';notice.textContent=error.message||'Unable to open Villa Scopes.';var close=root.document.createElement('button');close.type='button';close.textContent='Close';close.style.cssText='margin-left:20px;min-height:44px;padding:8px 16px';close.onclick=function(){notice.remove()};notice.appendChild(close);root.document.body.appendChild(notice);}}
 }};
})(window);
