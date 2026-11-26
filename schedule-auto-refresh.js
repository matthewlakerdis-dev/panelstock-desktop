(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.PanelStockScheduleAutoRefresh=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 function createController({refresh,isBusy=()=>false,interval=2000,document:doc=globalThis.document,window:win=globalThis.window}){
  let stopped=false,running=false,timer=null,request=null;
  function schedule(){if(!stopped){win.clearTimeout(timer);timer=win.setTimeout(tick,interval);}}
  async function tick(){
   if(stopped||running)return;
   win.clearTimeout(timer);timer=null;
   if(doc.hidden||isBusy()){schedule();return;}
   running=true;request=new AbortController();
   try{await refresh(request.signal);}catch{}finally{running=false;request=null;schedule();}
  }
  function wake(){if(!doc.hidden)void tick();}
  win.addEventListener('focus',wake);win.addEventListener('online',wake);doc.addEventListener('visibilitychange',wake);schedule();
  return {refresh:tick,destroy(){stopped=true;win.clearTimeout(timer);request?.abort();win.removeEventListener('focus',wake);win.removeEventListener('online',wake);doc.removeEventListener('visibilitychange',wake);}};
 }
 return {createController};
});
