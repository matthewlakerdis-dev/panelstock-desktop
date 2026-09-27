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
async function remove(owner,id){if(!owner||!id)throw Error('Sign in before deleting a project.');await transaction('readwrite',s=>s.delete(owner+'|'+id));}
async function backup(data){
 const clean=snapshot(data.panels,data.index,data.name);
 for(const panel of clean.panels){if(panel.file){const file=panel.file,bytes=new Uint8Array(await file.arrayBuffer());let binary='';for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));panel.file={name:file.name||'sketch',type:file.type,data:btoa(binary)};}}
 return JSON.stringify({format:'panelstock-project',version:1,project:clean});
}
function restore(text){
 if(text.length>150*1024*1024)throw Error('Choose a project backup smaller than 150 MB.');
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
const CLOUD_LIMIT=100*1024*1024,CHUNK_SIZE=1024*1024;
let cloudClientId=null;
async function hashBytes(value){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',value)),b=>b.toString(16).padStart(2,'0')).join('');}
function toBase64(bytes){let binary='';for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));return btoa(binary);}
async function packCloud(data){
 const project=snapshot(data.panels,data.index,data.name),chunks=new Map();delete project.updatedAt;let total=0;
 async function asset(blob){
  total+=blob.size;if(total>CLOUD_LIMIT)throw Error('Account projects must be 100 MB or smaller.');
  const result={size:blob.size,chunks:[]};
  for(let offset=0;offset<blob.size;offset+=CHUNK_SIZE){const part=blob.slice(offset,offset+CHUNK_SIZE),hash=await hashBytes(await part.arrayBuffer());result.chunks.push({hash,size:part.size});chunks.set(hash,part);}
  return result;
 }
 for(const panel of project.panels){
  if(panel.file){const file=panel.file;panel.file={name:file.name||'sketch',type:file.type,asset:await asset(file)};}
  if(panel.result)panel.result=await asset(new Blob([JSON.stringify(panel.result)],{type:'application/json'}));
 }
 const manifest={format:'panelstock-cloud-project',version:2,project},metadataSize=new Blob([JSON.stringify(manifest)]).size;
 if(metadataSize>2*1024*1024)throw Error('Project details are too large. Split this project into smaller projects.');
 if(total+metadataSize>CLOUD_LIMIT)throw Error('Account projects must be 100 MB or smaller.');
 return {manifest,chunks,size:total+metadataSize};
}
async function saveCloud(data,id,revision,request,progress=()=>{}){
 progress('Preparing project…');const packed=await packCloud(data),base='/cad/projects/'+id;
 cloudClientId||=crypto.randomUUID();
 const prepared=await request(base+'/prepare',{revision,manifest:packed.manifest,clientId:cloudClientId});if(prepared.saved)return prepared;let completed=0;
 for(const hash of prepared.missing){
  const part=packed.chunks.get(hash);if(!part)throw Error('The project save response was invalid. Retry saving.');
  progress('Saving changed files '+(++completed)+' of '+prepared.missing.length+'…');
  await request(base+'/upload/'+prepared.uploadId+'/'+hash,{data:toBase64(new Uint8Array(await part.arrayBuffer()))});
 }
 progress('Finishing account save…');return request(base+'/commit',{uploadId:prepared.uploadId});
}
async function restoreCloud(response,id,request){
 if(!response.manifest)return restore(response.project);
 const manifest=response.manifest;
 if(manifest.format!=='panelstock-cloud-project'||manifest.version!==2||!Array.isArray(manifest.project?.panels)||manifest.project.panels.length>30)throw Error('Unsupported saved project.');
 const data=structuredClone(manifest.project);let total=new Blob([JSON.stringify(manifest)]).size;
 async function asset(value){
  if(!value||!Number.isSafeInteger(value.size)||value.size<0||!Array.isArray(value.chunks)||value.chunks.length>101||(total+=value.size)>CLOUD_LIMIT)throw Error('Invalid saved project size.');
  const parts=[];let size=0;
  for(const chunk of value.chunks){
   if(!/^[a-f0-9]{64}$/.test(chunk.hash)||!Number.isInteger(chunk.size)||chunk.size<1||chunk.size>CHUNK_SIZE)throw Error('Invalid saved project file.');
   const result=await request('/cad/projects/'+id+'/chunks/'+chunk.hash),raw=atob(result.data),bytes=Uint8Array.from(raw,c=>c.charCodeAt(0));
   if(bytes.length!==chunk.size||await hashBytes(bytes)!==chunk.hash)throw Error('A saved file could not be verified. Open the project again.');
   parts.push(bytes);size+=bytes.length;
  }
  if(size!==value.size)throw Error('Incomplete saved project file.');return new Blob(parts);
 }
 for(const panel of data.panels){
  if(panel.file){const file=panel.file;if(!['image/png','image/jpeg','application/pdf'].includes(file.type)||file.asset.size>25*1024*1024)throw Error('Unsupported saved sketch.');panel.file=new File([await asset(file.asset)],file.name,{type:file.type});}
  if(panel.result){panel.result=JSON.parse(await (await asset(panel.result)).text());if(typeof panel.result.dxf!=='string'||typeof panel.result.svg!=='string')throw Error('Invalid saved drawing.');}
 }
 return snapshot(data.panels,Number.isInteger(data.index)?Math.max(0,Math.min(data.index,data.panels.length-1)):0,data.name);
}
window.PanelCadProjects={ownerKey,snapshot,save,list,remove,backup,restore,packCloud,saveCloud,restoreCloud};
})();
