/* Resumable pack processing. No stock deduction and no machine/toolpath execution. */
(()=>{'use strict';
const normal=value=>String(value||'').trim().toLowerCase();
function specKey(spec){const value={...spec};delete value.reviewed;return JSON.stringify(value);}
function drawingIssues(result){
 const v=result?.validation,issues=[];
 if(!result?.dxf||!result?.svg||!v||v.closedCut!==true)issues.push('Drawing is missing or its cut outline is not closed.');
 if(!Array.isArray(v?.checks)||!v.checks.length)issues.push('Drawing checks are missing.');
 for(const check of v?.checks||[])if(check.status&&check.status!=='pass')issues.push(check.label||'A drawing check failed.');
 for(const row of v?.measurements||[])if(row.status!=='pass')issues.push(row.label+': measurement check failed.');
 for(const warning of v?.warnings||[])if(warning!=='Test drawing: tooling width and depth remain unspecified.')issues.push(warning);
 if(!Array.isArray(v?.fabricationTags)||!Array.isArray(v?.stiffeners))issues.push('Fabrication checks are incomplete.');
 return issues;
}
function inventoryPanels(pages,runId){
 const items=[],seen=new Set();
 for(const page of pages){
  if(!page.verified)continue;
  for(const group of page.groups||[])for(const panel of group.panels){
   const key=normal(panel.id);
   if(seen.has(key))throw Error('Panel '+panel.id+' appears more than once in the pack. Resolve the repeated ID before scheduling.');
   seen.add(key);
   const spec=structuredClone(group.spec);spec.panelId=panel.id;
   items.push({name:panel.id,quantity:panel.quantity,spec,file:page.previewFile||page.file,sourcePdf:page.original,sourcePdfName:page.original.name,automationRunId:runId,reviewed:false});
  }
 }
 if(items.length>30)throw Error('This pack contains '+items.length+' distinct panels. The current workspace limit is 30; nothing has been scheduled.');
 return items;
}
function stockFor(data,settings,planner){return planner.availableStock(data).filter(item=>planner.groupKey(item)===settings.stockKey);}
function firstSheet(data,settings){return 1+Math.max(0,...(data.cncPanels||[]).filter(p=>normal(p.jobReference)===normal(settings.projectName)&&normal(p.orderNumber)===normal(settings.orderNumber)).map(p=>Number(p.sheetNumber)).filter(Number.isSafeInteger));}
function ensureNotScheduled(data,panels,settings){
 const names=new Set(panels.flatMap(p=>Array.from({length:p.quantity},(_,i)=>normal(p.name+(i?' (copy '+(i+1)+')':'')))));
 if((data.cncPanels||[]).some(p=>normal(p.jobReference)===normal(settings.projectName)&&normal(p.orderNumber)===normal(settings.orderNumber)&&names.has(normal(p.panelNumber))))throw Error('Some panels from this order are already in the CNC tracker. Nothing was added.');
}
async function base64(file){const bytes=new Uint8Array(await file.arrayBuffer());let binary='';for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));return btoa(binary);}
async function process(job,{request,save,planner,progress=()=>{},sync=()=>{},cancelled=()=>false,wait=ms=>new Promise(resolve=>setTimeout(resolve,ms))}){
 const checkpoint=async()=>{await save(job);sync(job);};
 const checkCancel=()=>{if(cancelled())throw Error('Paused. Your completed steps are saved; use Resume to continue.');};
 const transientReadError=error=>/Drawing reader timed out|OpenAI rate limit reached|Cannot reach OpenAI or the request timed out|OpenAI service request failed \(HTTP 50[234]\)/i.test(error.message);
 const readPage=async (payload,page)=>{
  page.readJobs||={};const mode=payload.mode;
  for(let attempt=0;;attempt++){
   checkCancel();
   if(!page.readJobs[mode]){page.readJobs[mode]={id:crypto.randomUUID(),started:false};await checkpoint();}
   const ref=page.readJobs[mode];
   try{
    for(let poll=0;poll<160;poll++){
     checkCancel();
     const value=await request('/cad/analyse',ref.started?{jobAction:'poll',jobId:ref.id}:{...payload,jobAction:'start',jobId:ref.id});
     if(!value.jobState)return value; // Compatible with the previous server during rollout.
     if(value.jobState==='completed'){delete page.readJobs[mode];return value.result;}
     if(value.jobState==='failed'||value.jobState==='expired'){delete page.readJobs[mode];await checkpoint();throw Error(value.error);}
     if(!['running','busy'].includes(value.jobState))throw Error('Unexpected drawing job status. Resume to check this reading.');
     if(value.jobState==='running'&&!ref.started){ref.started=true;await checkpoint();}
     progress(value.jobState==='busy'?'Drawing reader is busy with other pages. Waiting for a free slot…':'Reading this page in the background. '+(mode==='pack-verify'?'Checking the independent second reading…':'Extracting dimensions, folds and holes…'));
     for(let second=0;second<5;second++){checkCancel();await wait(1000);}
    }
    throw Error('This reading is taking longer than expected. Resume to check its saved job.');
   }catch(error){
    if(!transientReadError(error)||attempt>=3)throw error;
    const seconds=[20,40,60][attempt];progress(error.message+' Retrying in '+seconds+' seconds…');
    for(let elapsed=0;elapsed<seconds;elapsed++){checkCancel();await wait(1000);}
   }
  }
 };
 if(job.sent){sync(job);progress('Already sent to the CNC tracker.');return job;}
 const submit=async()=>{await checkpoint();try{await request('/mutations',job.packet);}catch(error){if([400,403,409,422].includes(error.status)){delete job.packet;await checkpoint();}throw error;}job.sent=true;await checkpoint();};
 // A saved submission is always retried verbatim, including its mutation ID.
 if(job.packet){progress('Checking the saved CNC submission…');await submit();return job;}
 // Re-read unsent pages after reader changes; never invalidate an in-flight submission.
 if(job.readerRevision!=='independent-v2'){
  for(const page of job.pages){if(page.readerVersion==='independent-v2')continue;delete page.inventory;delete page.independentInventory;page.verified=false;page.groups=[];page.issues=[];page.notes=[];}
  job.readerRevision='independent-v2';await checkpoint();
 }
 job.exceptions=[];
 for(let i=0;i<job.pages.length;i++){
  checkCancel();const page=job.pages[i];if(page.verified)continue;
  progress('Reading and checking page '+(i+1)+' of '+job.pages.length+'…');
  try{
   const upload={filename:page.file.name,mime:page.file.type,data:await base64(page.file)};
   if(page.issues?.length){if(!page.retryable)delete page.inventory;delete page.independentInventory;page.groups=[];page.notes=[];page.issues=[];page.retryable=false;}
   if(!page.inventory){const reading=await readPage({...upload,mode:'pack-read',policy:job.settings.policy},page);page.inventory=reading.inventory;page.readerVersion=reading.readerVersion;page.readerModel=reading.readerModel;if(reading.sourceImage?.startsWith('data:image/png;base64,')&&reading.sourceImage.length<12*1024*1024){const bytes=Uint8Array.from(atob(reading.sourceImage.split(',')[1]),c=>c.charCodeAt(0));page.previewFile=new File([bytes],page.file.name.replace(/\.[^.]+$/,'')+'.png',{type:'image/png'});}await checkpoint();}
   checkCancel();
   const checked=await readPage({...upload,mode:'pack-verify',inventory:page.inventory,policy:job.settings.policy},page);
   page.independentInventory=checked.independentInventory;page.notes=checked.notes||[];
   page.issues=checked.issues||[];page.verified=checked.verified===true&&!page.issues.length;page.groups=checked.groups||[];
   if(!page.verified&&!page.issues.length)page.issues=['Page verification did not pass.'];
  }catch(error){page.issues=[error.message||'Page could not be read.'];page.retryable=transientReadError(error)||!!Object.keys(page.readJobs||{}).length;}
  await checkpoint();
 }
 checkCancel();
 job.exceptions=job.pages.flatMap((p,i)=>(p.issues||[]).map(issue=>'Page '+(i+1)+': '+issue));
 const extracted=inventoryPanels(job.pages,job.id),previous=new Map((job.panels||[]).map(p=>[normal(p.name),p]));
 job.panels=extracted.map(p=>{const old=previous.get(normal(p.name));return old&&specKey(old.spec)===specKey(p.spec)?old:p;});
 await checkpoint();
 if(job.exceptions.length)throw Error('Some pages need attention. No panels have been scheduled.');
 if(!job.panels.length)throw Error('No aluminium panels were found.');
 for(let i=0;i<job.panels.length;i++){
  checkCancel();const panel=job.panels[i];if(panel.result&&!drawingIssues(panel.result).length)continue;
  progress('Generating '+panel.name+' ('+(i+1)+' of '+job.panels.length+')…');
  try{
   panel.result=await request('/cad/generate',{...panel.spec,reviewed:true});
   const issues=drawingIssues(panel.result);if(issues.length)throw Error(issues.join(' '));
   panel.generatedSpec=specKey(panel.spec);panel.reviewed=true;panel.error=null;panel.message='Automatically read and checked against the source page.';
  }catch(error){panel.result=null;panel.reviewed=false;panel.error=error.message;job.exceptions.push(panel.name+': '+error.message);}
  await checkpoint();
 }
 if(job.exceptions.length)throw Error('Some drawings need attention. No panels have been scheduled.');
 checkCancel();progress('Checking stock and arranging the panels…');
 const data=await request('/data'),stock=stockFor(data,job.settings,planner);
 ensureNotScheduled(data,job.panels,job.settings);
 if(!stock.length)throw Error('No unallocated stock matches the selected material, thickness and finish.');
 for(const panel of job.panels){
  const manufacturing=panel.spec.packManufacturing;
  if(!manufacturing||Number(manufacturing.thickness)!==Number(stock[0].thickness))throw Error(panel.name+': stock thickness does not match.');
  if(normal(manufacturing.finish)!==normal(stock[0].color)&&!(job.settings.powderCoat&&['milled','mill','mill finish','milled finish'].includes(normal(stock[0].color))))throw Error(panel.name+': the required finish differs from the selected stock.');
 }
 job.plan=await request('/cad/generate',{sheetPlan:true,panels:job.panels.map(p=>({name:p.name,quantity:p.quantity,direction:p.spec.panelDirection,dxf:p.result.dxf})),stock:stock.map(s=>({id:s.id,type:s.type,sku:s.sku,material:s.material,color:s.color,thickness:s.thickness,width:s.width,height:s.height,quantity:s.quantity}))});
 await checkpoint();
 if(job.plan.unplaced?.length){job.exceptions=job.plan.unplaced.map(p=>p.name+(p.copy>1?' (copy '+p.copy+')':'')+': could not fit available stock.');await checkpoint();throw Error('Not all panels fit. No panels have been scheduled.');}
 checkCancel();progress('Adding the planned panels to the CNC tracker…');
 const fresh=await request('/data');ensureNotScheduled(fresh,job.panels,job.settings);
 job.firstSheet=firstSheet(fresh,job.settings);
 job.packet=planner.trackerPacket(job.plan,fresh,job.settings.orderNumber,job.settings.projectName,job.firstSheet);
 await checkpoint(); // Must succeed before any external mutation.
 await submit();progress(job.panels.length+' panels planned and sent to the CNC tracker.');return job;
}
async function journal(mode,id,value){
 const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('panelstock-pack-runs',1);r.onupgradeneeded=()=>r.result.createObjectStore('runs');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
 try{return await new Promise((resolve,reject)=>{const tx=db.transaction('runs',mode),r=value===undefined?tx.objectStore('runs').get(id):tx.objectStore('runs').put(value,id);tx.oncomplete=()=>resolve(r.result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('Could not save progress.'));});}finally{db.close();}
}
async function hash(value){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',value)),b=>b.toString(16).padStart(2,'0')).join('');}
async function open({files,owner,request,projectName,orderNumber,canSendCnc,sync,existing=[],download}){
 if(!canSendCnc)throw Error('CNC tracker access is required to process a complete drawing pack.');
 if(!files.length)throw Error('Upload a drawing pack first.');
 if(!projectName||!orderNumber)throw Error('Select a project and enter its order number first.');
 const data=await request('/data'),planner=window.PanelSheetPlanner;
 const stock=[...planner.availableStock(data),...(data.variants||[]),...(data.offcuts||[])].filter(s=>/^(solid )?alumin(i)?um$/i.test(String(s.material||'').trim())&&s.color&&Number(s.thickness)>0).map(s=>({...s,thickness:Number(s.thickness)})),groups=new Map(stock.map(s=>[planner.groupKey(s),s]));
 if(!groups.size)throw Error('Add aluminium stock before processing a pack.');
 const dialog=document.createElement('dialog');dialog.className='combine-picker';dialog.style.width='min(960px,95vw)';
 const header=document.createElement('header'),title=document.createElement('h2');title.textContent='Process drawing pack';header.append(title);
 const intro=document.createElement('p');intro.textContent='Read every page, generate checked aluminium drawings, plan available sheets and add pending CNC entries. Up to 30 distinct panel IDs. CFC backing pieces are excluded.';header.append(intro);
 const body=document.createElement('div');body.className='combine-body';
 const label=document.createElement('label');label.textContent='Raw aluminium stock';const select=document.createElement('select');select.append(new Option('Choose material, thickness and finish',''));
 for(const [key,s]of groups)select.append(new Option(s.material+' · '+s.thickness+' mm · '+s.color,key));label.append(select);
 const preferred=[...groups].filter(([key,s])=>Number(s.thickness)===3&&['milled','mill','mill finish','milled finish'].includes(normal(s.color)));if(preferred.length===1)select.value=preferred[0][0];
 const directionLabel=document.createElement('label');directionLabel.textContent='When no direction arrow is drawn';const direction=document.createElement('select');direction.append(new Option('Flag for attention','required'),new Option('Non-directional material — allow a right-facing layout','non-directional'));directionLabel.append(direction);direction.value='non-directional';
 const coatLabel=document.createElement('label'),coat=document.createElement('input');coat.type='checkbox';coat.checked=true;coat.style.cssText='width:18px;height:18px;min-height:18px;flex:0 0 18px;margin:0;padding:0';coatLabel.style.cssText='display:flex;align-items:center;gap:10px;margin:16px 0';coatLabel.append(coat,document.createTextNode(' Use mill-finish stock for the specified powder-coated finish'));
 select.onchange=()=>{const s=groups.get(select.value);if(s&&Number(s.thickness)!==3)direction.value='required';};
 const allowance=document.createElement('p');allowance.textContent='Fold allowance: 1 mm per side, using the existing drawing rules. Written dimensions stay unchanged.';
 const status=document.createElement('p');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 const exceptions=document.createElement('ul'),downloads=document.createElement('div');
 body.append(label,directionLabel,coatLabel,allowance,status,exceptions,downloads);
 const footer=document.createElement('footer'),start=document.createElement('button'),close=document.createElement('button');start.textContent='Process drawing pack';start.className='primary';close.textContent='Close';footer.append(start,close);dialog.append(header,body,footer);document.body.append(dialog);dialog.showModal();
 const report=document.createElement('button');report.textContent='View check report';report.disabled=true;footer.prepend(report);report.onclick=()=>{const view=document.createElement('dialog'),content=document.createElement('pre'),done=document.createElement('button');view.style.cssText='width:min(960px,95vw);max-height:90vh';content.style.cssText='white-space:pre-wrap;max-height:70vh;overflow:auto';content.textContent=JSON.stringify({settings:job.settings,sent:job.sent,exceptions:job.exceptions,drawings:(job.panels||[]).map(p=>({name:p.name,quantity:p.quantity,reviewed:p.reviewed,error:p.error,checks:drawingIssues(p.result),validation:p.result?.validation})),plan:job.plan?{gap:job.plan.gap,stockChanged:job.plan.stockChanged,unplaced:job.plan.unplaced,sheets:job.plan.sheets.map(s=>({number:s.number,stock:s.stock,panels:s.panels,utilisation:s.utilisation}))}:null,pages:job.pages.map(p=>({name:p.file.name,readerVersion:p.readerVersion,readerModel:p.readerModel,verified:p.verified,issues:p.issues,notes:p.notes,inventory:p.inventory,independentInventory:p.independentInventory,groups:p.groups}))},null,2);const heading=document.createElement('h2');heading.textContent='Drawing pack checks';const summary=document.createElement('p');summary.textContent=job.pages.filter(p=>p.verified).length+' of '+job.pages.length+' pages checked · '+job.panels.length+' panels · '+(job.plan?.sheets?.length||0)+' sheets';const pageList=document.createElement('ul');for(const page of job.pages){const row=document.createElement('li');row.textContent=page.file.name+': '+(page.verified?'Checked':page.issues?.length?page.issues.join(' '):'Waiting for check');pageList.append(row);}const details=document.createElement('details'),detailTitle=document.createElement('summary');detailTitle.textContent='Detailed readings and measurements';details.append(detailTitle,content);done.textContent='Close report';done.onclick=()=>{view.close();view.remove();};view.append(heading,summary,pageList,details,done);document.body.append(view);view.showModal();};
 let working=false,paused=false,job=null,key=null;
 const render=()=>{exceptions.replaceChildren();for(const message of job?.exceptions||[]){const row=document.createElement('li');row.textContent=message;exceptions.append(row);}downloads.replaceChildren();for(const [i,sheet]of (job?.plan?.sheets||[]).entries()){const button=document.createElement('button');button.textContent='Download sheet '+((job.firstSheet||1)+i);button.onclick=()=>download(sheet.dxf,'application/dxf',projectName.replace(/[^a-z0-9_-]/gi,'_')+'-order-'+orderNumber.replace(/[^a-z0-9_-]/gi,'_')+'-sheet-'+((job.firstSheet||1)+i)+'.dxf');downloads.append(button);}};
 const setStatus=message=>{status.textContent=message;};
 const finished=new Promise(resolve=>{close.onclick=()=>{if(working){paused=true;close.disabled=true;setStatus('Pausing after the current request…');return;}dialog.close();dialog.remove();resolve();};dialog.oncancel=e=>{e.preventDefault();close.click();};});
 start.onclick=async()=>{
  if(working||job?.sent)return;
  if(!select.value){setStatus('Choose the raw stock to use for this pack.');return;}
  working=true;paused=false;status.classList.remove('cad-error-message');start.disabled=true;close.textContent='Pause';select.disabled=direction.disabled=coat.disabled=true;
  try{
   if(!job){
    const item=groups.get(select.value),settings={projectName,orderNumber,stockKey:select.value,powderCoat:coat.checked,policy:{thickness:item.thickness,foldAllowance:'current-1mm',missingDirection:direction.value}};
    const hashes=[];for(const file of files)hashes.push(await hash(await file.arrayBuffer()));
    key=owner+'|'+await hash(new TextEncoder().encode(JSON.stringify({hashes,settings})));
    job=await journal('readonly',key);
    if(!job){const pages=[];for(const original of files){if(original.type==='application/pdf'){for(const page of await splitPanelPdf(original,30-pages.length))pages.push({file:new File([page.bytes],page.name,{type:'application/pdf'}),original});}else pages.push({file:original,original});if(pages.length>30)throw Error('Use up to 30 pages per pack.');}job={id:crypto.randomUUID(),settings,pages,panels:[],exceptions:[],sent:false};}
    if(existing.length&&existing.some(p=>p.automationRunId!==job.id||!job.panels.some(saved=>saved.name===p.name&&specKey(saved.spec)===specKey(p.spec)))){job=null;throw Error('Start an empty CAD project to process this pack. Existing or manually edited panels will not be replaced.');}
   }
   if(!globalThis.navigator?.locks)throw Error('This browser cannot safely lock a pack run. Use a current browser to process automatically.');
   await navigator.locks.request('panelstock-pack:'+key,{ifAvailable:true},async lock=>{if(!lock)throw Error('This pack is already processing in another tab.');const latest=await journal('readonly',key);if(latest)job=latest;await process(job,{request,planner,save:value=>journal('readwrite',key,value),sync:value=>{sync(value);render();report.disabled=false;},progress:setStatus,cancelled:()=>paused});});
   setStatus(job.panels.length+' panel'+(job.panels.length===1?'':'s')+' sent to CNC on '+job.plan.sheets.length+' sheet'+(job.plan.sheets.length===1?'':'s')+'. Stock is deducted when cutting is completed.');
  }catch(error){status.classList.add('cad-error-message');setStatus(error.message||'Pack processing failed.');render();}
  finally{working=false;close.disabled=false;close.textContent='Close';start.disabled=!!job?.sent;start.textContent=job?.sent?'Sent to CNC':'Resume';if(!job)select.disabled=direction.disabled=coat.disabled=false;}
 };
 await finished;
}
const api={process,inventoryPanels,drawingIssues,firstSheet,ensureNotScheduled,open};
if(typeof module!=='undefined')module.exports=api;
if(typeof window!=='undefined')window.PanelAutomaticPack=api;
})();




