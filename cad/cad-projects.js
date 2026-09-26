/* Browser-local CAD projects. Tokens are never stored with drawing data. */
(()=>{'use strict';
function ownerKey(api,username){return api+'|'+String(username||'').trim().toLowerCase();}
function snapshot(panels,index,name){
 return {version:1,name:name.trim()||'Untitled project',updatedAt:Date.now(),index,panels:structuredClone(panels.map(p=>({name:p.name,file:p.file,spec:p.spec,result:p.result,reviewed:p.reviewed,message:p.message,error:p.error,correctionRecovery:p.correctionRecovery})))};
}
function open(){return new Promise((resolve,reject)=>{const r=indexedDB.open('panelstock-cad-projects',1);r.onupgradeneeded=()=>r.result.createObjectStore('projects',{keyPath:'id'});r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
async function transaction(mode,action){const db=await open();try{return await new Promise((resolve,reject)=>{const tx=db.transaction('projects',mode),r=action(tx.objectStore('projects'));tx.oncomplete=()=>resolve(r.result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('Project save interrupted.'));});}finally{db.close();}}
async function save(owner,id,data){if(!owner||!id)throw Error('Sign in before saving a project.');await transaction('readwrite',s=>s.put({...data,id:owner+'|'+id,owner,projectId:id}));}
async function list(owner){return (await transaction('readonly',s=>s.getAll())).filter(p=>p.owner===owner).sort((a,b)=>b.updatedAt-a.updatedAt);}
window.PanelCadProjects={ownerKey,snapshot,save,list};
})();

