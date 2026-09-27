/* Browser-local CAD projects. Tokens are never stored with drawing data. */
(()=>{'use strict';
function ownerKey(api,username){return api+'|'+String(username||'').trim().toLowerCase();}
function snapshot(panels,index,name,uploadedFiles=[]){
 return {version:1,uploadedFiles:structuredClone(uploadedFiles),name:name.trim()||'Untitled project',updatedAt:Date.now(),index,panels:structuredClone(panels.map(p=>({name:p.name,quantity:p.quantity||1,file:p.file,sourcePdf:p.sourcePdf,sourcePdfName:p.sourcePdfName||p.sourcePdf?.name,spec:p.spec,result:p.result,reviewed:p.reviewed,message:p.message,error:p.error,correctionRecovery:p.correctionRecovery,generatedSpec:p.generatedSpec})))};
}
async function packOriginals(project,encode){
 const seen=new Map(),contents=new Map(),sources=[];
 async function add(file,name,type){
  if(seen.has(file))return seen.get(file);
  const encoded=await encode(file),key=type+'|'+JSON.stringify(encoded);
  let index=contents.get(key);
  if(index===undefined){index=sources.length;contents.set(key,index);sources.push({name,type,...encoded});}
  seen.set(file,index);return index;
 }
 for(const file of project.uploadedFiles||[]){if(!(file instanceof Blob)||file.size>25*1024*1024||!['application/pdf','image/png','image/jpeg'].includes(file.type))throw Error('Invalid uploaded file.');await add(file,file.name||'Uploaded file',file.type);}
 delete project.uploadedFiles;
 for(const panel of project.panels)if(panel.sourcePdf){
  const file=panel.sourcePdf;if(!(file instanceof Blob)||file.size>25*1024*1024)throw Error('Original PDFs must be 25 MB or smaller.');
  panel.sourcePdf=await add(file,panel.sourcePdfName||file.name||'Original.pdf','application/pdf');
 }
 if(sources.length)project.pdfSources=sources;
}

function attachOriginals(project,files){
 for(const panel of project.panels)if(panel.sourcePdf!==undefined&&panel.sourcePdf!==null){
  const index=panel.sourcePdf;if(!Number.isInteger(index)||index<0||index>=files.length)throw Error('The project contains an invalid original PDF reference.');
  panel.sourcePdf=files[index];panel.sourcePdfName=project.pdfSources[index].name;
 }
 project.uploadedFiles=files;delete project.pdfSources;
}
function open(){return new Promise((resolve,reject)=>{const r=indexedDB.open('panelstock-cad-projects',1);r.onupgradeneeded=()=>r.result.createObjectStore('projects',{keyPath:'id'});r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
async function transaction(mode,action){const db=await open();try{return await new Promise((resolve,reject)=>{const tx=db.transaction('projects',mode),r=action(tx.objectStore('projects'));tx.oncomplete=()=>resolve(r.result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('Project save interrupted.'));});}finally{db.close();}}
async function save(owner,id,data){if(!owner||!id)throw Error('Sign in before saving a project.');await transaction('readwrite',s=>s.put({...data,id:owner+'|'+id,owner,projectId:id}));}
async function list(owner){return (await transaction('readonly',s=>s.getAll())).filter(p=>p.owner===owner).sort((a,b)=>b.updatedAt-a.updatedAt);}
function mergeSaved(remote,local){
 const groups=new Map(),names=new Map(remote.map(p=>[p.projectId,p.name]));
 for(const p of [...remote,...local]){const name=baseOrderName(names.get(p.projectId)||p.name),normalized=name.replace(/\s+/g,' ').toLowerCase(),key=!normalized||normalized==='untitled project'?p.projectId:normalized;if(!groups.has(key))groups.set(key,{name,copies:[],deviceCopies:[]});groups.get(key)[p.cloud?'copies':'deviceCopies'].push(p);}
 return [...groups.values()].map(group=>{group.copies.sort((a,b)=>b.updatedAt-a.updatedAt);group.deviceCopies.sort((a,b)=>b.updatedAt-a.updatedAt);const newest=group.copies[0]||group.deviceCopies[0];return {...newest,...group,localCopy:group.deviceCopies[0]};}).sort((a,b)=>b.updatedAt-a.updatedAt);
}
function baseOrderName(name){return String(name||'').trim().replace(/(?:\s*\((?:device copy|copy|restored)\))+$/i,'').trim();}
async function combineCopies(group,request,progress=()=>{}){
 let current=group.copies[0],id=current?.projectId||group.deviceCopies[0].projectId,revision=current?.revision||0;
 if(group.copies.length>1||(current&&current.name!==group.name)){const merged=await request('/cad/projects/'+id+'/merge',{revision,sources:group.copies.slice(1).map(p=>({projectId:p.projectId,revision:p.revision}))});revision=merged.revision;}
 for(const local of [...group.deviceCopies].sort((a,b)=>a.updatedAt-b.updatedAt)){
  if(current&&local.importedTo===id&&local.importedAt===local.updatedAt)continue;
  const data=snapshot(local.panels,local.index,group.name,local.uploadedFiles);data.updatedAt=local.updatedAt;
  const response=await saveCloud(data,id,revision,request,progress,{importCopy:true});revision=response.revision;
 }
 return {projectId:id,revision,cloud:true,name:group.name};
}
async function remove(owner,id){if(!owner||!id)throw Error('Sign in before deleting a project.');await transaction('readwrite',s=>s.delete(owner+'|'+id));}
async function backup(data){
 const clean=snapshot(data.panels,data.index,data.name,data.uploadedFiles);
 await packOriginals(clean,async file=>({data:toBase64(new Uint8Array(await file.arrayBuffer()))}));
 for(const panel of clean.panels){if(panel.file){const file=panel.file,bytes=new Uint8Array(await file.arrayBuffer());let binary='';for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));panel.file={name:file.name||'sketch',type:file.type,data:btoa(binary)};}}
 return JSON.stringify({format:'panelstock-project',version:clean.pdfSources?2:1,project:clean});
}
function restore(text){
 if(text.length>150*1024*1024)throw Error('Choose a project backup smaller than 150 MB.');
 const source=JSON.parse(text),data=source.project;
 if(source.format!=='panelstock-project'||![1,2].includes(source.version)||!data||typeof data.name!=='string'||!Array.isArray(data.panels)||data.panels.length>30)throw Error('This is not a supported PanelStock project backup.');
 if(data.pdfSources!==undefined&&(!Array.isArray(data.pdfSources)||data.pdfSources.length>30))throw Error('Invalid original PDFs.');
 const originals=(data.pdfSources||[]).map(file=>{if(typeof file.name!=='string'||!['application/pdf','image/png','image/jpeg'].includes(file.type)||typeof file.data!=='string'||file.data.length>4*Math.ceil(25*1024*1024/3))throw Error('Invalid original PDF.');const raw=atob(file.data);if(raw.length>25*1024*1024)throw Error('Original PDF is too large.');return new File([Uint8Array.from(raw,c=>c.charCodeAt(0))],file.name,{type:file.type});});
 for(const panel of data.panels){
  if(!panel||typeof panel!=='object'||Array.isArray(panel)||(panel.spec!=null&&(typeof panel.spec!=='object'||Array.isArray(panel.spec))))throw Error('The backup contains invalid panel details.');
  if(panel.quantity!==undefined&&(!Number.isInteger(panel.quantity)||panel.quantity<1||panel.quantity>9999))throw Error('The backup contains an invalid panel quantity.');
  if(panel.result&&(typeof panel.result.dxf!=='string'||typeof panel.result.svg!=='string'))throw Error('The backup contains an invalid drawing.');
  if(panel.file){const file=panel.file;if(typeof file.name!=='string'||typeof file.data!=='string'||!['image/png','image/jpeg','application/pdf'].includes(file.type))throw Error('The backup contains an unsupported sketch.');let binary;try{binary=atob(file.data);}catch{throw Error('The backup contains damaged sketch data.');}if(binary.length>25*1024*1024)throw Error('A sketch in this backup is too large.');panel.file=new File([Uint8Array.from(binary,c=>c.charCodeAt(0))],file.name,{type:file.type});}
 }
 attachOriginals(data,originals);
 return snapshot(data.panels,Number.isInteger(data.index)?Math.max(0,Math.min(data.index,data.panels.length-1)):0,data.name,data.uploadedFiles);
}
const CLOUD_LIMIT=100*1024*1024,CHUNK_SIZE=1024*1024;
let cloudClientId=null;const savedContent=new Map();
function projectContent(manifest){const value=structuredClone(manifest);delete value.project.index;delete value.project.updatedAt;for(const panel of value.project.panels){delete panel.message;delete panel.error;}return JSON.stringify(value);}
async function hashBytes(value){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',value)),b=>b.toString(16).padStart(2,'0')).join('');}
function toBase64(bytes){let binary='';for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));return btoa(binary);}
async function packCloud(data){
 const project=snapshot(data.panels,data.index,data.name,data.uploadedFiles),chunks=new Map();delete project.updatedAt;let total=0;
 async function asset(blob){
  total+=blob.size;if(total>CLOUD_LIMIT)throw Error('Account projects must be 100 MB or smaller.');
  const result={size:blob.size,chunks:[]};
  for(let offset=0;offset<blob.size;offset+=CHUNK_SIZE){const part=blob.slice(offset,offset+CHUNK_SIZE),hash=await hashBytes(await part.arrayBuffer());result.chunks.push({hash,size:part.size});chunks.set(hash,part);}
  return result;
 }
 await packOriginals(project,async file=>({asset:await asset(file)}));
 for(const panel of project.panels){
  if(panel.file){const file=panel.file;panel.file={name:file.name||'sketch',type:file.type,asset:await asset(file)};}
  if(panel.result)panel.result=await asset(new Blob([JSON.stringify(panel.result)],{type:'application/json'}));
 }
 const manifest={format:'panelstock-cloud-project',version:project.pdfSources?3:2,project},metadataSize=new Blob([JSON.stringify(manifest)]).size;
 if(metadataSize>2*1024*1024)throw Error('Project details are too large. Split this project into smaller projects.');
 if(total+metadataSize>CLOUD_LIMIT)throw Error('Account projects must be 100 MB or smaller.');
 return {manifest,chunks,size:total+metadataSize};
}
async function saveCloud(data,id,revision,request,progress=()=>{},options={}){
 progress('Preparing project…');const packed=await packCloud(data),base='/cad/projects/'+id;
 const cacheKey=options.scope?options.scope+'|'+id:null,content=projectContent(packed.manifest),previous=cacheKey&&savedContent.get(cacheKey);
 if(!options.importCopy&&previous?.revision===revision&&previous.content===content)return previous.response;
 function remember(response){if(cacheKey&&!options.importCopy)savedContent.set(cacheKey,{content,revision:response.revision,response});return response;}
 cloudClientId||=crypto.randomUUID();
 const imported=options.importCopy?{importId:await hashBytes(new TextEncoder().encode(JSON.stringify(packed.manifest))),sourceUpdatedAt:data.updatedAt||0}:{};
 const prepared=await request(base+'/prepare',{revision,manifest:packed.manifest,clientId:cloudClientId,...imported});if(prepared.saved)return remember(prepared);let completed=0;
 let next=0,failure=null;
 async function uploadNext(){while(!failure&&next<prepared.missing.length){
  const hash=prepared.missing[next++];
  try{const part=packed.chunks.get(hash);if(!part)throw Error('The project save response was invalid. Retry saving.');
   await request(base+'/upload/'+prepared.uploadId+'/'+hash,{data:toBase64(new Uint8Array(await part.arrayBuffer()))});
   progress('Saving changed files '+(++completed)+' of '+prepared.missing.length+'…');
  }catch(error){failure=error;}
 }}
 await Promise.all(Array.from({length:Math.min(3,prepared.missing.length)},()=>uploadNext()));
 if(failure)throw failure;
 progress('Finishing account save…');return remember(await request(base+'/commit',{uploadId:prepared.uploadId}));
}
async function restoreCloud(response,id,request){
 if(!response.manifest)return restore(response.project);
 const manifest=response.manifest;
 if(manifest.format!=='panelstock-cloud-project'||![2,3].includes(manifest.version)||!Array.isArray(manifest.project?.panels)||manifest.project.panels.length>30)throw Error('Unsupported saved project.');
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
 if(data.pdfSources!==undefined&&(!Array.isArray(data.pdfSources)||data.pdfSources.length>30))throw Error('Invalid original PDFs.');
 const originals=[];for(const file of data.pdfSources||[]){if(typeof file.name!=='string'||!['application/pdf','image/png','image/jpeg'].includes(file.type)||!file.asset||file.asset.size>25*1024*1024)throw Error('Invalid original PDF.');originals.push(new File([await asset(file.asset)],file.name,{type:file.type}));}
 for(const panel of data.panels){
  if(panel.file){const file=panel.file;if(!['image/png','image/jpeg','application/pdf'].includes(file.type)||file.asset.size>25*1024*1024)throw Error('Unsupported saved sketch.');panel.file=new File([await asset(file.asset)],file.name,{type:file.type});}
  if(panel.result){panel.result=JSON.parse(await (await asset(panel.result)).text());if(typeof panel.result.dxf!=='string'||typeof panel.result.svg!=='string')throw Error('Invalid saved drawing.');}
 }
 attachOriginals(data,originals);
 return snapshot(data.panels,Number.isInteger(data.index)?Math.max(0,Math.min(data.index,data.panels.length-1)):0,data.name,data.uploadedFiles);
}
window.PanelCadProjects={ownerKey,snapshot,save,list,mergeSaved,combineCopies,baseOrderName,remove,backup,restore,packCloud,saveCloud,restoreCloud};
})();
