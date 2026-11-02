(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.PanelStockWorkspaces=api;
})(typeof window==='object'?window:globalThis,function(){
  'use strict';
  function hold(locks,name){
    return new Promise((resolve,reject)=>{
      let request;
      request=locks.request(name,{ifAvailable:true},lock=>{
        if(!lock){resolve(null);return;}
        return new Promise(done=>resolve({release:()=>{done();return Promise.resolve(request);}}));
      });
      Promise.resolve(request).catch(reject);
    });
  }
  // Each page owns a durable workspace. A short selection lock prevents two
  // pages from recovering the same closed page's pending work at startup.
  async function acquire({locks,storage,sessionStorage,key,legacyLock,owner,read,uuid=()=>crypto.randomUUID()}){
    if(!locks)throw Error('This browser cannot coordinate saved changes. Use an up-to-date browser.');
    const registryKey=key+':workspaces',tabKey=key+':workspace';
    return locks.request(legacyLock+':workspace-selection',{mode:'exclusive'},async()=>{
      let keys;
      try{keys=JSON.parse(storage.getItem(registryKey)||'[]');}catch{throw Error('Saved workspaces could not be read. Keep existing pages open and retry.');}
      if(!Array.isArray(keys))throw Error('Saved workspaces could not be read.');
      const valid=value=>value===key||typeof value==='string'&&value.startsWith(key+':tab:')&&/^[a-zA-Z0-9-]{16,100}$/.test(value.slice(key.length+5));
      keys=[...new Set([key,...keys.filter(valid)])];
      const preferred=sessionStorage.getItem(tabKey),candidates=valid(preferred)?[preferred,...keys.filter(value=>value!==preferred)]:keys;
      const lockName=value=>value===key?legacyLock:legacyLock+':'+value.slice(key.length+5);
      const claim=async(value,recover)=>{
        const lease=await hold(locks,lockName(value));if(!lease)return null;
        try{
          const raw=await read(value);
          // Unavailable IndexedDB data must not be replaced with an empty queue.
          if(raw===undefined){await lease.release();return null;}
          const state=raw?JSON.parse(raw):null,pending=!!(state?.queue?.length||state?.draft);
          if(pending&&owner&&state.owner&&state.owner!==owner||recover&&!pending){await lease.release();return null;}
          sessionStorage.setItem(tabKey,value);storage.setItem(registryKey,JSON.stringify(keys));
          return {key:value,release:lease.release};
        }catch(error){await lease.release();throw error;}
      };
      // Recover this page after reload, or orphaned pending changes, first.
      for(const value of candidates){const selected=await claim(value,true);if(selected)return selected;}
      // Reuse an idle workspace once all recoverable pending work is checked.
      for(const value of candidates){const selected=await claim(value,false);if(selected)return selected;}
      for(let attempt=0;attempt<16;attempt++){
        const value=key+':tab:'+uuid();if(keys.includes(value)||!valid(value))continue;
        const lease=await hold(locks,lockName(value));if(!lease)continue;
        try{keys.push(value);storage.setItem(registryKey,JSON.stringify(keys));sessionStorage.setItem(tabKey,value);return {key:value,release:lease.release};}
        catch(error){lease.release();throw error;}
      }
      throw Error('A separate workspace could not be opened. Retry this page.');
    });
  }
  function scopedStorage(storage,key,workspace,prefixes=[]){
    const mapped=name=>name===key?workspace:workspace!==key&&prefixes.some(prefix=>name.startsWith(prefix))?name+':workspace:'+workspace.slice(key.length+5):name;
    return {getItem:name=>storage.getItem(mapped(name)),setItem:(name,value)=>storage.setItem(mapped(name),value),removeItem:name=>storage.removeItem(mapped(name))};
  }
  return {acquire,scopedStorage};
});
