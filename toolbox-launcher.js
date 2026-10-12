(function(root){
 'use strict';
 root.PanelStockToolbox={open:async function(workerUrl,app){
  var popup=root.open('about:blank','_blank');
  if(popup)popup.opener=null;
  try{
   var response=await root.PanelStock.apiFetch(workerUrl.replace(/\/$/,'')+'/toolbox/session-ticket',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({app:app})});
   var result=await response.json();
   if(!response.ok||!result.ticket)throw new Error(result.error||'Unable to open Toolbox Talks.');
   var url=new URL(workerUrl.replace(/\/$/,'')+'/toolbox');if(app==='web')url.searchParams.set('app','web');url.hash='ticket='+encodeURIComponent(result.ticket);
   if(popup&&!popup.closed)popup.location.replace(url.href);else root.location.assign(url.href);
  }catch(error){if(popup&&!popup.closed)popup.close();root.alert(error.message||'Unable to open Toolbox Talks.');}
 }};
})(window);
