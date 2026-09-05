(function(root) {
  'use strict';

  const FIELDS=['variants','offcuts','catalog','reasons','transactions','photos','cncPanels'];
  const OUTBOX_KEY='panelstock:outbox:v2';
  const LEGACY_KEY='panelstock:pendingSync';
  const copy=v=>JSON.parse(JSON.stringify(v));
  const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
  const mapping=(field,value)=>field==='photos'?(value||{}):Object.fromEntries((value||[]).map(v=>[v.id,v]));
  const sortCncPanels=value=>[...(value||[])].sort((a,b)=>{
    const left=String(a?.sheetNumber??'').trim();
    const right=String(b?.sheetNumber??'').trim();
    if(!left||!right){
      if(left===right)return 0;
      return left?-1:1;
    }
    return left.localeCompare(right,'en',{numeric:true,sensitivity:'base'});
  });
  const prepareView=view=>{
    const next=copy(view);
    if(Array.isArray(next?.cncPanels))next.cncPanels=sortCncPanels(next.cncPanels);
    return next;
  };

  class IndexedOutboxStorage {
    constructor(fallback,notify=()=>{}){this.fallback=fallback;this.notify=notify;this.value=null;this.db=null;this.writes=Promise.resolve();}
    async ready(){
      if(!root.indexedDB){this.value=this.fallback.getItem(OUTBOX_KEY);return this;}
      try{
        this.db=await new Promise((resolve,reject)=>{const request=root.indexedDB.open('panelstock-sync',1);request.onupgradeneeded=()=>request.result.createObjectStore('state');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
        const saved=await new Promise((resolve,reject)=>{const request=this.db.transaction('state').objectStore('state').get(OUTBOX_KEY);request.onsuccess=()=>resolve(request.result??null);request.onerror=()=>reject(request.error);});
        const legacy=this.fallback.getItem(OUTBOX_KEY);this.value=saved??legacy;
        if(saved==null&&legacy!=null){this.setItem(OUTBOX_KEY,legacy);await this.flushWrites();}
        if(saved!=null)this.fallback.removeItem(OUTBOX_KEY);
      }catch(error){this.db=null;this.value=this.fallback.getItem(OUTBOX_KEY);this.notify('storage','Reliable device storage could not be opened. Pending changes will use limited browser storage.');}
      return this;
    }
    getItem(key){return key===OUTBOX_KEY?this.value:this.fallback.getItem(key);}
    setItem(key,value){
      if(key!==OUTBOX_KEY){this.fallback.setItem(key,value);return;}
      this.value=value;
      if(!this.db){this.fallback.setItem(key,value);return;}
      this.writes=this.writes.then(()=>new Promise((resolve,reject)=>{const tx=this.db.transaction('state','readwrite');tx.objectStore('state').put(value,key);tx.oncomplete=()=>{this.fallback.removeItem(key);resolve();};tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);})).catch(()=>{try{this.fallback.setItem(key,this.value);}catch{}this.notify('storage','Reliable device storage failed. Pending changes were preserved in limited browser storage.');});
    }
    removeItem(key){
      if(key!==OUTBOX_KEY){this.fallback.removeItem(key);return Promise.resolve();}
      this.value=null;this.fallback.removeItem(key);
      if(!this.db)return Promise.resolve();
      this.writes=this.writes.then(()=>new Promise((resolve,reject)=>{const tx=this.db.transaction('state','readwrite');tx.objectStore('state').delete(key);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);}));return this.writes;
    }
    flushWrites(){return this.writes;}
    async read(key){await this.flushWrites();if(!this.db)return key===SESSION?null:this.fallback.getItem(key);return new Promise((resolve,reject)=>{const request=this.db.transaction('state').objectStore('state').get(key);request.onsuccess=()=>resolve(request.result??null);request.onerror=()=>reject(request.error);});}
    async write(key,value){if(!this.db){if(key!==SESSION)this.fallback.setItem(key,value);return;}await new Promise((resolve,reject)=>{const tx=this.db.transaction('state','readwrite');tx.objectStore('state').put(value,key);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});}
    async delete(key){if(!this.db){this.fallback.removeItem(key);return;}await new Promise((resolve,reject)=>{const tx=this.db.transaction('state','readwrite');tx.objectStore('state').delete(key);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});}
  }

  class Outbox {
    constructor(storage,send,notify=()=>{}) {
      this.storage=storage;
      this.send=send;
      this.notify=notify;
      this.running=null;
      this.timer=false;
      this.state=JSON.parse(storage.getItem(OUTBOX_KEY)||'null')||{owner:null,view:null,queue:[],draft:null,blocked:null};
      if(this.state.blocked==='Dimensions must be positive numbers')this.state.blocked=null;
    }

    save(next) {
      try {
        this.storage.setItem(OUTBOX_KEY,JSON.stringify(next));
      } catch {
        this.notify('storage','Device storage is full. No further edits can be saved. Export pending changes.');
        throw Error('Device storage is full; pending changes were not saved.');
      }
      this.state=next;
      this.notify(next.blocked?'conflict':next.queue.length||next.draft?'offline':'synced',next.blocked);
    }

    pending(){return this.state.queue.length>0||!!this.state.draft;}

    snapshot(remote,owner) {
      if(this.pending()) {
        if(this.state.owner!==owner)throw Error('Pending changes belong to another user. Log in as '+this.state.owner+'.');
        return prepareView(this.state.view);
      }
      if(this.state.owner===owner && this.state.view && remote.revision<this.state.view.revision)return prepareView(this.state.view);
      const view=prepareView(remote);
      this.save({owner,view,queue:[],draft:null,blocked:null});
      return copy(view);
    }

    stage(fields,owner,rendered) {
      if(!this.state.view || this.state.owner!==owner)throw Error('Load stock after logging in before editing.');
      if(this.state.blocked)throw Error(this.state.blocked);
      const next=copy(this.state);
      if(!next.draft)next.draft={before:copy(next.view),fields:{}};
      for(const field of FIELDS) {
        if(fields[field]!==undefined && !(field in next.draft.fields) && rendered?.[field]!==undefined)next.draft.before[field]=copy(rendered[field]);
      }
      for(const field of FIELDS) {
        if(fields[field]!==undefined){
          const value=field==='cncPanels'?sortCncPanels(fields[field]):copy(fields[field]);
          next.draft.fields[field]=value;
          next.view[field]=copy(value);
        }
      }
      this.save(next);
      if(!this.timer){
        this.timer=true;
        queueMicrotask(()=>{this.timer=false;this.finalize();void this.flush(owner);});
      }
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
      next.draft=null;
      this.save(next);
    }

    clearBlocked() {
      if(!this.state.blocked)return;
      this.save({...this.state,blocked:null});
    }

    flush(owner) {
      if(this.running)return this.running;
      this.running=this.drain(owner).finally(()=>{this.running=null;});
      return this.running;
    }

    async drain(owner) {
      this.finalize();
      if(this.state.owner!==owner||this.state.blocked)return false;
      while(this.state.queue.length) {
        await this.storage.flushWrites?.();
        const packet=this.state.queue[0];
        this.notify('syncing');
        let res;
        try {
          res=await this.send(packet,owner);
        } catch {
          this.notify('offline');
          return false;
        }
        if(!res.ok) {
          if([400,403,409,413,422,426].includes(res.status)) {
            const error=await res.json().catch(()=>({}));
            this.save({...this.state,blocked:error.error||'Pending changes require review.'});
          } else {
            this.notify(res.status===401?'login':'offline');
          }
          return false;
        }
        const result=await res.json();
        const next=copy(this.state);
        next.queue=next.queue.filter(p=>p.mutationId!==packet.mutationId);
        next.view.revision=Math.max(next.view.revision||0,result.revision||0);
        next.blocked=null;
        this.save(next);
        await this.storage.flushWrites?.();
      }
      return true;
    }
  }

  if(typeof module!=='undefined')module.exports={Outbox,IndexedOutboxStorage};
  if(!root.document)return;
  if('serviceWorker'in navigator)navigator.serviceWorker.register('/push-sw.js',{updateViaCache:'none'}).catch(()=>{});

  const nativeArraySort=Array.prototype.sort;
  Array.prototype.sort=function(compareFn){
    const isCncPanelArray=this.length>1&&this.every(row=>row&&typeof row==='object'&&'orderNumber' in row&&'sheetNumber' in row&&'panelNumber' in row);
    const isUploadedAtSort=typeof compareFn==='function'&&Function.prototype.toString.call(compareFn).includes('uploadedAt');
    if(isCncPanelArray&&isUploadedAtSort){
      return nativeArraySort.call(this,(a,b)=>{
        const sheet=String(a.sheetNumber??'').trim().localeCompare(String(b.sheetNumber??'').trim(),'en',{numeric:true,sensitivity:'base'});
        if(sheet)return sheet;
        return String(a.panelNumber??'').trim().localeCompare(String(b.panelNumber??'').trim(),'en',{numeric:true,sensitivity:'base'});
      });
    }
    return nativeArraySort.call(this,compareFn);
  };

  const collapsedCncSheets=new Set();
  const initializedCncSheets=new Set();
  let cncEnhanceQueued=false;
  const leafElements=rootNode=>[...rootNode.querySelectorAll('*')].filter(el=>el.children.length===0&&el.textContent.trim());
  const findPanelCard=meta=>{
    let node=meta.parentElement;
    while(node&&node!==document.body){
      const completeButtons=[...node.querySelectorAll('button')].filter(button=>button.textContent.trim()==='Complete panel');
      if(completeButtons.length===1)return node;
      node=node.parentElement;
    }
    return null;
  };
  const addMobileSheetGroups=()=>{
    document.querySelectorAll('[data-panelstock-sheet-heading="mobile"]').forEach(el=>el.remove());
    for(const meta of leafElements(document)){
      const match=meta.textContent.trim().match(/^Sheet\s+(.+?)\s*[·•]\s*Panel\s+(.+)$/i);
      if(!match)continue;
      const card=findPanelCard(meta);
      if(!card)continue;
      const sheet=match[1].trim(),panel=match[2].trim();
      const orderLeaf=leafElements(card).find(el=>/^Order\s+/i.test(el.textContent.trim()));
      const order=orderLeaf?.textContent.trim()||card.dataset.panelstockOrder||'Order';
      card.dataset.panelstockCncCard='1';card.dataset.panelstockSheet=sheet;card.dataset.panelstockOrder=order;
      if(orderLeaf){orderLeaf.textContent='Panel '+panel;orderLeaf.style.fontWeight='700';orderLeaf.style.paddingLeft='12px';}
      meta.style.display='none';
    }
    const parents=new Set([...document.querySelectorAll('[data-panelstock-cnc-card="1"]')].map(card=>card.parentElement).filter(Boolean));
    for(const parent of parents){
      const cards=[...parent.children].filter(el=>el.dataset?.panelstockCncCard==='1');
      const sheets=[];for(const card of cards)if(!sheets.includes(card.dataset.panelstockSheet))sheets.push(card.dataset.panelstockSheet);
      for(const sheet of sheets){
        const sheetCards=cards.filter(card=>card.dataset.panelstockSheet===sheet);if(!sheetCards.length)continue;
        const order=sheetCards[0].dataset.panelstockOrder||'Order',key=order+'|'+sheet;
        const heading=document.createElement('button');heading.type='button';heading.dataset.panelstockSheetHeading='mobile';heading.style.cssText='width:100%;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 14px;margin:8px 0;border:1px solid #e2e8f0;border-radius:10px;background:#f8fafc;color:#334155;font:700 14px system-ui;text-align:left';
        const label=document.createElement('span');label.textContent='Sheet '+sheet;
        const right=document.createElement('span');right.style.cssText='color:#64748b;font-weight:600';
        if(!initializedCncSheets.has(key)){collapsedCncSheets.add(key);initializedCncSheets.add(key);}
        const update=()=>{const closed=collapsedCncSheets.has(key);right.textContent=sheetCards.length+' panel'+(sheetCards.length===1?'':'s')+(closed?' ▸':' ▾');for(const card of sheetCards)card.style.display=closed?'none':'';};
        heading.onclick=()=>{collapsedCncSheets.has(key)?collapsedCncSheets.delete(key):collapsedCncSheets.add(key);update();};
        heading.append(label,right);parent.insertBefore(heading,sheetCards[0]);update();
      }
    }
  };
  const addDesktopSheetGroups=()=>{
    document.querySelectorAll('tr[data-panelstock-sheet-heading="desktop"]').forEach(el=>el.remove());
    for(const table of document.querySelectorAll('table')){
      const headers=[...table.querySelectorAll('thead th')].map(th=>th.textContent.trim().toLowerCase());
      const sheetIndex=headers.indexOf('sheet'),panelIndex=headers.indexOf('panel');if(sheetIndex<0||panelIndex<0)continue;
      const rows=[...table.querySelectorAll('tbody > tr')].filter(row=>!row.dataset.panelstockSheetHeading);let previousSheet=null;
      for(const row of rows){
        const cells=[...row.children],sheet=cells[sheetIndex]?.textContent.trim();if(!sheet||sheet===previousSheet)continue;previousSheet=sheet;
        const group=document.createElement('tr');group.dataset.panelstockSheetHeading='desktop';
        const cell=document.createElement('td');cell.colSpan=Math.max(cells.length,1);cell.style.cssText='padding:9px 16px;background:#f8fafc;border-top:1px solid #e2e8f0;border-bottom:1px solid #e2e8f0;color:#334155;font:700 13px system-ui';cell.textContent='Sheet '+sheet;
        group.appendChild(cell);row.parentElement.insertBefore(group,row);
      }
    }
  };
  const enhanceCncHierarchy=()=>{addMobileSheetGroups();addDesktopSheetGroups();};
  const queueCncEnhance=()=>{if(cncEnhanceQueued)return;cncEnhanceQueued=true;requestAnimationFrame(()=>{cncEnhanceQueued=false;enhanceCncHierarchy();});};
  new MutationObserver(records=>{
    const external=records.some(record=>[...record.addedNodes,...record.removedNodes].some(node=>node.nodeType===1&&!node.dataset?.panelstockSheetHeading));
    if(external)queueCncEnhance();
  }).observe(document.documentElement,{childList:true,subtree:true});
  queueMicrotask(queueCncEnhance);

  const SESSION='panelstock:session:v2';
  let session=null,workerUrl='',status='synced',message='',lockGranted=false,lockDenied=false,liveSocket=null,liveRetry=1000,liveTimer=null;
  try{session=JSON.parse(sessionStorage.getItem(SESSION)||'null');}catch{}
  if(session?.expiresAt<=Date.now()){session=null;sessionStorage.removeItem(SESSION);}

  let outbox;
  const announce=(s,m='')=>{
    status=s;
    message=m;
    root.dispatchEvent(new CustomEvent('panelstock-sync',{detail:{status:s,message:m}}));
    renderNotice();
  };

  const apiFetch=async(url,options={})=>{
    const absolute=new URL(url,location.href);
    if(!workerUrl || absolute.origin!==new URL(workerUrl).origin)throw Error('Unapproved API destination');
    const headers=new Headers(options.headers||{});
    headers.delete('Authorization');
    if(session?.token)headers.set('Authorization','Bearer '+session.token);
    const res=await fetch(url,{...options,headers,cache:'no-store',signal:options.signal||AbortSignal.timeout(20000)});
    if(['/login','/set-pin'].includes(absolute.pathname) && res.ok){
      const result=await res.clone().json();
      if(result.token){
        session={token:result.token,username:result.username,isAdmin:result.isAdmin,taskAccess:result.taskAccess||{},expiresAt:result.expiresAt};
        sessionStorage.setItem(SESSION,JSON.stringify(session));
        await durableStorage.write(SESSION,JSON.stringify(session));
      }
    }
    if(res.status===401 && !['/login','/set-pin'].includes(absolute.pathname)){
      session=null;
      sessionStorage.removeItem(SESSION);
      void durableStorage.delete(SESSION);
      root.dispatchEvent(new Event('panelstock-session-expired'));
      announce('login','Session expired. Log in again; pending changes are retained.');
    }
    return res;
  };
  const startLive=async()=>{
    clearTimeout(liveTimer);if(!root.WebSocket||!session||!workerUrl||liveSocket?.readyState===WebSocket.OPEN||liveSocket?.readyState===WebSocket.CONNECTING)return;
    try{const response=await apiFetch(workerUrl+'/live-ticket'),result=await response.json();if(!response.ok||!result.ticket)throw Error();const url=new URL(workerUrl);url.protocol=url.protocol==='https:'?'wss:':'ws:';url.pathname='/live';url.search='?ticket='+encodeURIComponent(result.ticket);const socket=liveSocket=new WebSocket(url);socket.onopen=()=>{liveRetry=1000;};socket.onmessage=event=>{try{const update=JSON.parse(event.data);if(['ready','revision'].includes(update.type)&&update.revision>(outbox?.state.view?.revision||0))root.dispatchEvent(new CustomEvent('panelstock-remote-change',{detail:update}));}catch{}};socket.onclose=()=>{if(liveSocket===socket)liveSocket=null;if(session)liveTimer=setTimeout(()=>void startLive(),liveRetry=Math.min(liveRetry*2,30000));};socket.onerror=()=>socket.close();}catch{if(session)liveTimer=setTimeout(()=>void startLive(),liveRetry=Math.min(liveRetry*2,30000));}
  };

  const durableStorage=new IndexedOutboxStorage(localStorage,announce);
  const outboxReady=durableStorage.ready().then(()=>{outbox=new Outbox(durableStorage,(packet,owner)=>{
    if(!session || session.username!==owner)return Promise.resolve(new Response('{}',{status:401}));
    return apiFetch(workerUrl+'/mutations',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(packet)});
  },announce);root.PanelStock.outbox=outbox;return outbox;});

  function getLegacyPending() {
    const raw=localStorage.getItem(LEGACY_KEY);
    if(!raw)return null;
    try {
      const value=JSON.parse(raw);
      return value && typeof value==='object' && Object.keys(value).length?value:null;
    } catch {
      return {unreadable:true,raw};
    }
  }

  function pendingSummary() {
    outbox.finalize();
    const queue=outbox.state.queue||[];
    const changes=queue.flatMap(packet=>packet.changes||[]);
    const fields={};
    for(const change of changes)fields[change.field]=(fields[change.field]||0)+1;
    return {
      packets:queue.length,
      changes:changes.length,
      fields,
      draft:!!outbox.state.draft,
      owner:outbox.state.owner||null,
      blocked:outbox.state.blocked||null
    };
  }

  function makeButton(text,onClick,primary=false) {
    const button=document.createElement('button');
    button.type='button';
    button.textContent=text;
    button.style.cssText='min-height:42px;padding:10px 16px;border-radius:8px;border:1px solid '+(primary?'#155e75':'#cbd5e1')+';background:'+(primary?'#155e75':'#fff')+';color:'+(primary?'#fff':'#334155')+';font:600 14px system-ui;cursor:pointer';
    button.onclick=onClick;
    return button;
  }

  function downloadPendingBackup() {
    const legacy=getLegacyPending();
    const payload={
      format:'panelstock-pending-backup-v1',
      savedAt:new Date().toISOString(),
      browser:root.navigator?.userAgent||null,
      currentUser:session?.username||null,
      outbox:outbox.state,
      legacyPending:legacy
    };
    const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});
    const a=document.createElement('a');
    const href=URL.createObjectURL(blob);
    a.href=href;
    a.download='PanelStock-pending-changes-'+new Date().toISOString().replace(/[:.]/g,'-')+'.json';
    a.click();
    setTimeout(()=>URL.revokeObjectURL(href),5000);
  }

  function appendReview(el,legacy) {
    const details=document.createElement('details');
    details.style.cssText='margin:18px 0;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:12px 14px;color:#334155';
    const summary=document.createElement('summary');
    summary.textContent='Review pending changes';
    summary.style.cssText='cursor:pointer;font-weight:700;color:#155e75';
    details.appendChild(summary);

    const info=pendingSummary();
    const intro=document.createElement('p');
    intro.style.cssText='margin:12px 0 8px;line-height:1.5';
    if(legacy)intro.textContent='These changes were saved by an older PanelStock version. They are preserved below exactly as stored so they can be reconciled safely.';
    else intro.textContent=`${info.changes} item change${info.changes===1?'':'s'} across ${info.packets} saved batch${info.packets===1?'':'es'}.`;
    details.appendChild(intro);

    if(!legacy && Object.keys(info.fields).length) {
      const list=document.createElement('ul');
      list.style.cssText='margin:8px 0 12px;padding-left:22px';
      for(const [field,count] of Object.entries(info.fields)) {
        const li=document.createElement('li');
        li.textContent=`${field}: ${count} change${count===1?'':'s'}`;
        list.appendChild(li);
      }
      details.appendChild(list);
    }

    const pre=document.createElement('pre');
    pre.style.cssText='white-space:pre-wrap;word-break:break-word;max-height:360px;overflow:auto;background:#f8fafc;border-radius:8px;padding:12px;font:12px/1.45 ui-monospace,SFMono-Regular,Consolas,monospace;color:#334155';
    pre.textContent=JSON.stringify(legacy?legacy:outbox.state.queue,null,2);
    details.appendChild(pre);
    el.appendChild(details);
  }

  function renderNotice() {
    let el=document.getElementById('panelstock-safety-notice');
    const legacy=getLegacyPending();
    const ownerMismatch=session && outbox.pending() && outbox.state.owner!==session.username;
    const blocked=lockDenied || !!legacy || ['conflict','storage'].includes(status) || ownerMismatch;

    if(!el){
      el=document.createElement('div');
      el.id='panelstock-safety-notice';
      document.body.appendChild(el);
    }
    el.replaceChildren();

    if(!blocked){
      if(outbox.pending()){
        el.style.cssText='position:fixed;top:0;left:0;right:0;z-index:99999;background:#fff7ed;color:#7c2d12;padding:8px;text-align:center;font:14px system-ui;pointer-events:auto;display:flex;align-items:center;justify-content:center;gap:10px;flex-wrap:wrap';
        const text=document.createElement('span');
        text.textContent=status==='syncing'?'Saving pending stock changes…':message||'Changes saved on this device — waiting to sync';
        el.appendChild(text);
        if(status!=='syncing'&&session){
          el.appendChild(makeButton('Retry sync now',async event=>{
            const button=event.currentTarget;
            button.disabled=true;button.textContent='Retrying…';message='';
            outbox.clearBlocked();
            const ok=await outbox.flush(session.username);
            if(ok&&!outbox.pending()){button.textContent='Synced — reloading…';setTimeout(()=>location.reload(),350);}
            else renderNotice();
          },true));
        }
      } else {
        el.style.display='none';
      }
      return;
    }

    el.style.cssText='position:fixed;inset:0;z-index:999999;background:rgba(15,23,42,.52);padding:clamp(12px,3vw,28px);font:16px system-ui;overflow:auto;color:#334155;display:flex;align-items:flex-start;justify-content:center';
    const card=document.createElement('section');
    card.style.cssText='width:min(680px,100%);margin:clamp(8px,4vh,44px) auto;background:#fff;border:1px solid #cbd5e1;border-radius:12px;padding:clamp(18px,4vw,28px);box-shadow:0 24px 70px rgba(15,23,42,.25)';
    el.appendChild(card);

    const titleRow=document.createElement('div');
    titleRow.style.cssText='display:flex;align-items:flex-start;gap:12px;margin-bottom:20px';
    const icon=document.createElement('div');
    icon.style.cssText='width:42px;height:42px;flex:0 0 42px;display:grid;place-items:center;border-radius:9px;background:#0f172a;color:#fff;font:800 22px system-ui';
    icon.textContent='!';
    titleRow.appendChild(icon);
    const titleText=document.createElement('div');
    titleText.style.cssText='min-width:0';
    titleRow.appendChild(titleText);
    card.appendChild(titleRow);

    const heading=document.createElement('h2');
    heading.style.cssText='margin:0 0 4px;color:#0f172a;font-size:20px;line-height:1.25';
    heading.textContent=lockDenied?'PanelStock is open in another tab':'Unsynced changes are saved on this device';
    titleText.appendChild(heading);

    const p=document.createElement('p');
    p.style.cssText='margin:0;line-height:1.5;color:#64748b;font-size:14px';
    p.textContent=lockDenied
      ?'Only one PanelStock tab may edit stock at a time. Close the other tab and reload this one.'
      :legacy
        ?'These changes came from the previous app. They have not been deleted. Review or export them before deciding whether to discard them.'
        :ownerMismatch
          ?'These pending changes belong to '+outbox.state.owner+'. Log in as that user to retry the sync, or export them for review.'
          :message||'PanelStock could not safely apply one or more saved changes. Nothing has been discarded.';
    titleText.appendChild(p);

    if(lockDenied)return;

    const info=pendingSummary();
    const statusBox=document.createElement('div');
    statusBox.style.cssText='background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:12px 14px;margin:12px 0;color:#475569;font-size:14px';
    statusBox.textContent=legacy
      ?'Recovery status: previous-version changes detected'
      :`Recovery status: ${info.changes} saved change${info.changes===1?'':'s'}${info.blocked?' — server review required':' — waiting to sync'}`;
    card.appendChild(statusBox);

    appendReview(card,legacy);

    const actions=document.createElement('div');
    actions.style.cssText='display:flex;flex-wrap:wrap;gap:8px;margin-top:16px';

    if(!legacy && !ownerMismatch && session) {
      actions.appendChild(makeButton('Retry sync now',async event=>{
        const button=event.currentTarget;
        const old=button.textContent;
        button.disabled=true;
        button.textContent='Retrying…';
        outbox.clearBlocked();
        const ok=await outbox.flush(session.username);
        button.disabled=false;
        button.textContent=ok&&!outbox.pending()?'Synced — reloading…':old;
        if(ok&&!outbox.pending())setTimeout(()=>location.reload(),350);
        else renderNotice();
      },true));
    }

    actions.appendChild(makeButton('Export backup',event=>{
      downloadPendingBackup();
      event.currentTarget.textContent='Backup exported';
    }));

    actions.appendChild(makeButton('Discard local changes',()=>{
      const warning=legacy
        ?'These previous-version changes will NOT be applied to shared stock. Export a backup first if they may still be needed. Discard them now?'
        :'These unsynced changes will NOT be applied to shared stock. Export a backup first if they may still be needed. Discard them now?';
      if(!confirm(warning))return;
      localStorage.removeItem(LEGACY_KEY);
      void durableStorage.removeItem(OUTBOX_KEY).then(()=>location.reload());
    }));

    card.appendChild(actions);

    const foot=document.createElement('p');
    foot.style.cssText='margin:16px 0 0;color:#64748b;font-size:13px;line-height:1.45';
    foot.textContent=legacy
      ?'Automatic retry is not offered for previous-version data because its format cannot be proven safe for the current server. Review/export preserves it without risking duplicate or incorrect stock movements.'
      :'PanelStock keeps pending changes locally until the server acknowledges them. Closing the browser does not intentionally remove this queue.';
    card.appendChild(foot);
  }

  if(navigator.locks){
    void navigator.locks.request('panelstock-editor-v2',{ifAvailable:true},lock=>{
      if(!lock){
        lockDenied=true;
        announce('storage','PanelStock is already open in another tab. Use that tab or close it and reload.');
        return;
      }
      lockGranted=true;
      return new Promise(()=>{});
    });
  } else {
    lockGranted=false;
    queueMicrotask(()=>announce('storage','This browser cannot safely coordinate offline changes. Use an up-to-date browser.'));
  }

  root.PanelStock={
    apiFetch,
    outbox,
    async init(url){
      await outboxReady;
      workerUrl=url.replace(/\/$/,'');
      if(!session){try{session=JSON.parse(await durableStorage.read(SESSION)||'null');if(session?.expiresAt<=Date.now())session=null;if(session)sessionStorage.setItem(SESSION,JSON.stringify(session));}catch{session=null;}}
      if(!session)return null;
      try{
        const r=await apiFetch(workerUrl+'/session');
        if(!r.ok)return null;
        const user=await r.json();
        session={...session,...user};
        await durableStorage.write(SESSION,JSON.stringify(session));
        void startLive();
        return user;
      }catch{
        announce('offline','Connection needed to verify login.');
        return outbox.state.view?{username:session.username,isAdmin:!!session.isAdmin,taskAccess:session.taskAccess||{},offline:true}:null;
      }
    },
    async snapshot(){
      if(!session)return null;
      await outbox.flush(session.username);
      try{const r=await apiFetch(workerUrl+'/data');if(!r.ok)return null;return outbox.snapshot(await r.json(),session.username);}catch{announce('offline','Showing the last saved stock view. Changes will sync when connection returns.');return outbox.state.view?copy(outbox.state.view):null;}
    },
    stage(fields,rendered){
      if(getLegacyPending())throw Error('Previous-version pending changes must be reviewed before editing stock.');
      if(!lockGranted)throw Error('This tab cannot edit stock.');
      if(!session)throw Error('Please log in before editing.');
      outbox.stage(fields,session.username,rendered);
    },
    async flush(){await outboxReady;return session?outbox.flush(session.username):false;},
    async logout(){
      try{if(session)await apiFetch(workerUrl+'/logout',{method:'POST'});}
      finally{session=null;sessionStorage.removeItem(SESSION);await durableStorage.delete(SESSION);clearTimeout(liveTimer);liveSocket?.close();liveSocket=null;}
    },
    exportPending:downloadPendingBackup,
    reviewPending:()=>({legacy:getLegacyPending(),summary:pendingSummary(),outbox:copy(outbox.state)}),
    get username(){return session?.username||null;},
    get revision(){return outbox?.state.view?.revision;},
    get status(){return status;},
    get pending(){return !!outbox?.pending()||!!getLegacyPending();}
  };

  root.addEventListener('online',()=>{void root.PanelStock.flush();});
  root.addEventListener('online',()=>{void startLive();});
  root.addEventListener('beforeunload',event=>{
    if(root.PanelStock.pending){event.preventDefault();event.returnValue='';}
  });
  void outboxReady.then(renderNotice);
})(typeof window==='undefined'?globalThis:window);
