(function(root) {
  'use strict';
  const FIELDS=['variants','offcuts','catalog','reasons','transactions','photos','cncPanels'];
  const copy=v=>JSON.parse(JSON.stringify(v));
  const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
  const mapping=(field,value)=>field==='photos'?(value||{}):Object.fromEntries((value||[]).map(v=>[v.id,v]));
  class Outbox {
    constructor(storage,send,notify=()=>{}) {
      this.storage=storage;this.send=send;this.notify=notify;this.running=null;this.timer=false;
      this.state=JSON.parse(storage.getItem('panelstock:outbox:v2')||'null')||{owner:null,view:null,queue:[],draft:null,blocked:null};
    }
    save(next) {
      // Never report success or send a request until the entire state is durable.
      try{this.storage.setItem('panelstock:outbox:v2',JSON.stringify(next));}
      catch{this.notify('storage','Device storage is full. No further edits can be saved. Export pending changes.');throw Error('Device storage is full; pending changes were not saved.');}
      this.state=next;this.notify(next.blocked?'conflict':next.queue.length||next.draft?'offline':'synced',next.blocked);
    }
    pending(){return this.state.queue.length>0||!!this.state.draft;}
    snapshot(remote,owner) {
      if(this.pending()) {
        if(this.state.owner!==owner)throw Error('Pending changes belong to another user. Log in as '+this.state.owner+'.');
        return copy(this.state.view);
      }
      if(this.state.owner===owner && this.state.view && remote.revision<this.state.view.revision)return copy(this.state.view);
      this.save({owner,view:copy(remote),queue:[],draft:null,blocked:null});return copy(remote);
    }
    stage(fields,owner,rendered) {
      if(!this.state.view || this.state.owner!==owner)throw Error('Load stock after logging in before editing.');
      if(this.state.blocked)throw Error(this.state.blocked);
      const next=copy(this.state);
      if(!next.draft)next.draft={before:copy(next.view),fields:{}};
      // Expectations come from the UI that the operator acted on, not a newer poll response.
      for(const field of FIELDS)if(fields[field]!==undefined && !(field in next.draft.fields) && rendered?.[field]!==undefined)next.draft.before[field]=copy(rendered[field]);
      for(const field of FIELDS)if(fields[field]!==undefined){next.draft.fields[field]=copy(fields[field]);next.view[field]=copy(fields[field]);}
      this.save(next);
      // Calls made in one UI action (stock + logTxn) become one atomic mutation.
      if(!this.timer){this.timer=true;queueMicrotask(()=>{this.timer=false;this.finalize();void this.flush(owner);});}
    }
    finalize() {
      if(!this.state.draft)return;
      const next=copy(this.state),changes=[];
      for(const [field,value] of Object.entries(next.draft.fields)) {
        const before=mapping(field,next.draft.before[field]),after=mapping(field,value);
        for(const id of new Set([...Object.keys(before),...Object.keys(after)])) {
          if(field==='transactions' && !after[id])continue;
          if(!same(before[id]||null,after[id]||null))changes.push({field,id,before:before[id]||null,after:after[id]||null});
        }
      }
      if(changes.length)next.queue.push({mutationId:crypto.randomUUID(),restoreEpoch:next.draft.before.restoreEpoch||0,changes});
      next.draft=null;this.save(next);
    }
    flush(owner) {
      if(this.running)return this.running;
      this.running=this.drain(owner).finally(()=>{this.running=null;});return this.running;
    }
    async drain(owner) {
      this.finalize();
      if(this.state.owner!==owner||this.state.blocked)return false;
      while(this.state.queue.length) {
        const packet=this.state.queue[0];this.notify('syncing');
        let res;
        try{res=await this.send(packet,owner);}catch{this.notify('offline');return false;}
        if(!res.ok) {
          if([400,403,409,413,422,426].includes(res.status)){
            const error=await res.json().catch(()=>({}));
            this.save({...this.state,blocked:error.error||'Pending changes require review.'});
          }else this.notify(res.status===401?'login':'offline');
          return false;
        }
        const result=await res.json();
        // Remove only the acknowledged immutable packet; newer packets survive.
        const next=copy(this.state);next.queue=next.queue.filter(p=>p.mutationId!==packet.mutationId);
        next.view.revision=Math.max(next.view.revision||0,result.revision||0);this.save(next);
      }
      return true;
    }
  }
  if(typeof module!=='undefined')module.exports={Outbox};
  if(!root.document)return;
  const SESSION='panelstock:session:v2';let session=null,workerUrl='',status='synced',message='',lockGranted=false,lockDenied=false;
  try{session=JSON.parse(sessionStorage.getItem(SESSION)||'null');}catch{}
  if(session?.expiresAt<=Date.now()){session=null;sessionStorage.removeItem(SESSION);}
  let outbox;
  const announce=(s,m='')=>{status=s;message=m;root.dispatchEvent(new CustomEvent('panelstock-sync',{detail:{status:s,message:m}}));renderNotice();};
  const apiFetch=async(url,options={})=>{
    const absolute=new URL(url,location.href);
    if(!workerUrl || absolute.origin!==new URL(workerUrl).origin)throw Error('Unapproved API destination');
    const headers=new Headers(options.headers||{});headers.delete('Authorization');
    if(session?.token)headers.set('Authorization','Bearer '+session.token);
    const res=await fetch(url,{...options,headers,cache:'no-store',signal:options.signal||AbortSignal.timeout(20000)});
    if(['/login','/set-pin'].includes(absolute.pathname) && res.ok){const result=await res.clone().json();if(result.token){session={token:result.token,username:result.username,isAdmin:result.isAdmin,expiresAt:result.expiresAt};sessionStorage.setItem(SESSION,JSON.stringify(session));}}
    if(res.status===401 && !['/login','/set-pin'].includes(absolute.pathname)){session=null;sessionStorage.removeItem(SESSION);root.dispatchEvent(new Event('panelstock-session-expired'));announce('login','Session expired. Log in again; pending changes are retained.');}
    return res;
  };
  outbox=new Outbox(localStorage,(packet,owner)=>{
    if(!session || session.username!==owner)return Promise.resolve(new Response('{}',{status:401}));
    return apiFetch(workerUrl+'/mutations',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(packet)});
  },announce);
  function renderNotice() {
    let el=document.getElementById('panelstock-safety-notice');
    const legacy=localStorage.getItem('panelstock:pendingSync');
    const oldPending=legacy && Object.keys(JSON.parse(legacy)).length>0;
    const blocked=lockDenied || oldPending || ['conflict','storage'].includes(status) || (session && outbox.pending() && outbox.state.owner!==session.username);
    if(!el){el=document.createElement('div');el.id='panelstock-safety-notice';document.body.appendChild(el);}
    el.replaceChildren();
    if(!blocked){
      if(outbox.pending()){el.style.cssText='position:fixed;top:0;left:0;right:0;z-index:99999;background:#fff7ed;color:#7c2d12;padding:8px;text-align:center;font:14px system-ui;pointer-events:none';el.textContent=status==='syncing'?'Saving pending stock changes…':'Changes saved on this device — waiting to sync';}
      else el.style.display='none';return;
    }
    el.style.cssText='position:fixed;inset:0;z-index:999999;background:#fff7ed;padding:40px 24px;font:16px system-ui;overflow:auto;color:#7c2d12';
    const heading=document.createElement('h2');heading.textContent='Pending changes need review';el.appendChild(heading);
    const p=document.createElement('p');p.textContent=lockDenied?'Only one PanelStock tab may edit stock at a time. Close the other tab and reload this one.':oldPending?'This device has unsent changes from the previous app. Export them for reconciliation before continuing.':message||'Log in as '+outbox.state.owner+' to handle these pending changes.';el.appendChild(p);
    if(lockDenied)return;
    const exportButton=document.createElement('button');exportButton.textContent='Export pending changes';exportButton.style.cssText='padding:12px;margin:8px';
    exportButton.onclick=()=>{const blob=new Blob([JSON.stringify({savedAt:new Date().toISOString(),outbox:outbox.state,legacyPending:oldPending?JSON.parse(legacy):null},null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='PanelStock-pending-changes.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),5000);exportButton.textContent='Exported — keep this file for review';
      if(!el.querySelector('[data-discard]')){const discard=document.createElement('button');discard.dataset.discard='true';discard.textContent='Discard local pending changes and reload shared stock';discard.style.cssText='padding:12px;margin:8px';discard.onclick=()=>{if(!confirm('Only continue after saving the export. These local changes will NOT be applied to shared stock. Discard them?'))return;localStorage.removeItem('panelstock:pendingSync');localStorage.removeItem('panelstock:outbox:v2');location.reload();};el.appendChild(discard);}};
    el.appendChild(exportButton);
  }
  // Only one editor per origin/device. Prevent two tabs from racing over localStorage.
  if(navigator.locks){void navigator.locks.request('panelstock-editor-v2',{ifAvailable:true},lock=>{if(!lock){lockDenied=true;announce('storage','PanelStock is already open in another tab. Use that tab or close it and reload.');return;}lockGranted=true;return new Promise(()=>{});});}
  else{lockGranted=false;queueMicrotask(()=>announce('storage','This browser cannot safely coordinate offline changes. Use an up-to-date browser.'));}
  root.PanelStock={
    apiFetch,outbox,
    async init(url){workerUrl=url.replace(/\/$/,'');if(!session)return null;try{const r=await apiFetch(workerUrl+'/session');if(!r.ok)return null;const user=await r.json();session={...session,...user};return user;}catch{announce('offline','Connection needed to verify login.');return null;}},
    async snapshot(){if(!session)return null;await outbox.flush(session.username);const r=await apiFetch(workerUrl+'/data');if(!r.ok)return null;return outbox.snapshot(await r.json(),session.username);},
    stage(fields,rendered){if(!lockGranted)throw Error('This tab cannot edit stock.');if(!session)throw Error('Please log in before editing.');outbox.stage(fields,session.username,rendered);},
    async flush(){return session?outbox.flush(session.username):false;},
    async logout(){try{if(session)await apiFetch(workerUrl+'/logout',{method:'POST'});}finally{session=null;sessionStorage.removeItem(SESSION);}},
    get username(){return session?.username||null;},
    get revision(){return outbox.state.view?.revision;},
    get status(){return status;},
    get pending(){return outbox.pending();}
  };
  root.addEventListener('online',()=>{void root.PanelStock.flush();});
  root.addEventListener('beforeunload',event=>{if(outbox.pending()){event.preventDefault();event.returnValue='';}});
  queueMicrotask(renderNotice);
})(typeof window==='undefined'?globalThis:window);
