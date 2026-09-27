/* Browser-local CAD projects. Tokens are never stored with drawing data. */
(()=>{'use strict';
function ownerKey(api,username){return api+'|'+String(username||'').trim().toLowerCase();}
function snapshot(panels,index,name){
 return {version:1,name:name.trim()||'Untitled project',updatedAt:Date.now(),index,panels:structuredClone(panels.map(p=>({name:p.name,quantity:p.quantity||1,file:p.file,spec:p.spec,result:p.result,reviewed:p.reviewed,message:p.message,error:p.error,correctionRecovery:p.correctionRecovery,generatedSpec:p.generatedSpec})))};
}
function open(){return new Promise((resolve,reject)=>{const r=indexedDB.open('panelstock-cad-projects',1);r.onupgradeneeded=()=>r.result.createObjectStore('projects',{keyPath:'id'});r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
async function transaction(mode,action){const db=await open();try{return await new Promise((resolve,reject)=>{const tx=db.transaction('projects',mode),r=action(tx.objectStore('projects'));tx.oncomplete=()=>resolve(r.result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('Project save interrupted.'));});}finally{db.close();}}
async function save(owner,id,data){if(!owner||!id)throw Error('Sign in before saving a project.');await transaction('readwrite',s=>s.put({...data,id:owner+'|'+id,owner,projectId:id}));}
async function list(owner){return (await transaction('readonly',s=>s.getAll())).filter(p=>p.owner===owner).sort((a,b)=>b.updatedAt-a.updatedAt);}
async function backup(data){
 const clean=snapshot(data.panels,data.index,data.name);
 for(const panel of clean.panels){if(panel.file){const file=panel.file,bytes=new Uint8Array(await file.arrayBuffer());let binary='';for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));panel.file={name:file.name||'sketch',type:file.type,data:btoa(binary)};}}
 return JSON.stringify({format:'panelstock-project',version:1,project:clean});
}
function restore(text){
 if(text.length>100*1024*1024)throw Error('Choose a project backup smaller than 100 MB.');
 const source=JSON.parse(text),data=source.project;
 if(source.format!=='panelstock-project'||source.version!==1||!data||typeof data.name!=='string'||!Array.isArray(data.panels)||!data.panels.length||data.panels.length>30)throw Error('This is not a supported PanelStock project backup.');
 for(const panel of data.panels){
  if(!panel||typeof panel!=='object'||Array.isArray(panel)||(panel.spec!=null&&(typeof panel.spec!=='object'||Array.isArray(panel.spec))))throw Error('The backup contains invalid panel details.');
  if(panel.quantity!==undefined&&(!Number.isInteger(panel.quantity)||panel.quantity<1||panel.quantity>9999))throw Error('The backup contains an invalid panel quantity.');
  if(panel.result&&(typeof panel.result.dxf!=='string'||typeof panel.result.svg!=='string'))throw Error('The backup contains an invalid drawing.');
  if(panel.file){const file=panel.file;if(typeof file.name!=='string'||typeof file.data!=='string'||!['image/png','image/jpeg','application/pdf'].includes(file.type))throw Error('The backup contains an unsupported sketch.');let binary;try{binary=atob(file.data);}catch{throw Error('The backup contains damaged sketch data.');}if(binary.length>25*1024*1024)throw Error('A sketch in this backup is too large.');panel.file=new File([Uint8Array.from(binary,c=>c.charCodeAt(0))],file.name,{type:file.type});}
 }
 return snapshot(data.panels,Number.isInteger(data.index)?Math.max(0,Math.min(data.index,data.panels.length-1)):0,data.name);
}
window.PanelCadProjects={ownerKey,snapshot,save,list,backup,restore};
})();

