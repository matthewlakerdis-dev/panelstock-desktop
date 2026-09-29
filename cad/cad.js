/* CAD drafts never enter PanelStock's stock mutation queue. */
(()=>{'use strict';
const API='https://panelstock-reports.matthewlakerdis.workers.dev';
const $=id=>document.getElementById(id),KEY='panelstock:cad:session:v1';
let session=null,spec=null,result=null,busy=false,previewURL=null,version=0;
const panels=[];let panelIndex=-1;
const navigator=document.createElement('div');navigator.className='panel-navigator';navigator.innerHTML='<button id="previouspanel" type="button" aria-label="Previous panel">←</button><div><strong id="panelcount">No panels</strong><span id="panelsource"></span></div><button id="nextpanel" type="button" aria-label="Next panel">→</button>';
$('questions').before(navigator);
const deletePanelButton=document.createElement('button');deletePanelButton.type='button';deletePanelButton.id='deletepanel';projectIcon(deletePanelButton,'Delete panel','M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7');navigator.append(deletePanelButton);
deletePanelButton.onclick=()=>{
 if(busy||panelIndex<0)return;
 const target=panels[panelIndex],name=spec?.panelId||target.name||'this panel';
 const dialog=document.createElement('dialog');dialog.className='project-picker';
 const header=document.createElement('header');header.className='project-picker-header';
 const title=document.createElement('h2');title.textContent='Delete '+name+'?';
 const message=document.createElement('p');message.textContent='This removes the panel, its saved outline edits and generated drawing from this project. Original uploaded files and existing CNC tracker entries are kept.';
 header.append(title,message);const footer=document.createElement('footer');footer.className='project-picker-footer';
 const cancel=document.createElement('button');cancel.type='button';cancel.textContent='Keep panel';
 const apply=document.createElement('button');apply.type='button';apply.className='danger';apply.textContent='Delete panel';
 const close=()=>{dialog.close();dialog.remove();deletePanelButton.focus();};cancel.onclick=close;dialog.oncancel=e=>{e.preventDefault();close();};
 apply.onclick=()=>{if(busy)return;const index=panels.indexOf(target);if(index<0){close();return;}rememberPanel();panels.splice(index,1);panelIndex=-1;spec=null;result=null;
 if(previewURL){URL.revokeObjectURL(previewURL);previewURL=null;}
 if(panels.length)selectPanel(Math.min(index,panels.length-1));else{PanelMeasuredOutline.show(null);invalidate();$('edges').replaceChildren();$('panelid').value='';$('folds').value='';$('questions').replaceChildren();quantityInput.value='1';updateNavigator();}
 queueProjectSave();close();notice(name+' deleted from the project.');};
 footer.append(cancel,apply);dialog.append(header,footer);document.body.append(dialog);dialog.showModal();cancel.focus();
};
let projectId=null,projectName='Untitled project',projectTimer=null,projectSaveChain=Promise.resolve(),projectRevision=0,projectDirty=false;
const cloudRevisions=new Map();
function warnPendingProjectSave(event){
 if(!projectDirty)return;
 event.preventDefault();event.returnValue='';
}
window.addEventListener('beforeunload',warnPendingProjectSave);

const projectBar=document.createElement('section');projectBar.innerHTML='<div class="row"><input id="projectname" type="hidden" value="Untitled project"><label>Project<select id="cadprojectselect"><option value="">Select a project</option></select></label><label>Order number<input id="cadordernumber" maxlength="50" placeholder="e.g. 7"></label><button id="saveproject" type="button">Save project</button><button id="openproject" type="button">Open project</button><button id="newproject" type="button">New project</button></div><label class="cad-project-notes">Additional information<textarea id="cadadditionalinfo" rows="2" maxlength="4000" placeholder="Drawing notes, location or special instructions"></textarea></label><p id="cadprojectliststatus" role="status"></p><p id="projectstatus" role="status">Projects save to your account, with a copy kept on this device.</p>';
$('workspace').prepend(projectBar);
let cadProjectOptions=[];
function projectDetails(){const select=$('cadprojectselect'),option=select.selectedOptions[0];return {projectId:option?.dataset.projectId||'',projectName:select.value||'',orderNumber:$('cadordernumber').value.trim(),additionalInfo:$('cadadditionalinfo').value};}
function fillProjectOptions(selected=''){
 const select=$('cadprojectselect');select.replaceChildren(new Option('Select a project',''));
 for(const p of cadProjectOptions){const option=new Option(p.name,p.name);option.dataset.projectId=p.id||'';select.append(option);}
 if(selected&&!cadProjectOptions.some(p=>p.name===selected)){const option=new Option(selected,selected);select.append(option);}
 select.value=selected;
}
function restoreProjectDetails(data={}){
 const match=String(data.name||'').match(/^(.*?)\s*[-–]\s*order\s+(.+)$/i),details=data.projectDetails||{};
 const name=details.projectName||(match?match[1].trim():data.name==='Untitled project'?'':data.name||'');
 fillProjectOptions(name);$('cadordernumber').value=details.orderNumber||(match?match[2].trim():'');$('cadadditionalinfo').value=details.additionalInfo||'';
 if(details.projectId&&$('cadprojectselect').selectedOptions[0])$('cadprojectselect').selectedOptions[0].dataset.projectId=details.projectId;
}
function updateProjectDetails(){const d=projectDetails();$('projectname').value=(d.projectName+(d.orderNumber?' - Order '+d.orderNumber:'')).slice(0,100)||'Untitled project';queueProjectSave();}
$('cadprojectselect').onchange=updateProjectDetails;$('cadordernumber').oninput=updateProjectDetails;
async function loadProjectOptions(){const owner=projectOwner();try{const data=await api('/projects');if(owner!==projectOwner())return;cadProjectOptions=(data.projects||[]).filter(p=>p.active!==false);const previous=projectDetails();fillProjectOptions(previous.projectName);if(previous.projectId&&$('cadprojectselect').selectedOptions[0])$('cadprojectselect').selectedOptions[0].dataset.projectId=previous.projectId;$('cadprojectliststatus').textContent=cadProjectOptions.length?'':'No active projects available. Add one in Projects.';}catch(error){if(owner===projectOwner())$('cadprojectliststatus').textContent='Project list unavailable: '+error.message;}}

let projectRetryTimer=null,projectRetryAttempt=0;
const retrySaveButton=document.createElement('button');retrySaveButton.type='button';retrySaveButton.textContent='Retry save';retrySaveButton.hidden=true;retrySaveButton.className='project-retry';$('projectstatus').after(retrySaveButton);const saveBackupButton=document.createElement('button');saveBackupButton.type='button';saveBackupButton.textContent='Download backup';saveBackupButton.hidden=true;saveBackupButton.className='project-retry';saveBackupButton.title='Download a project copy including sketches and drawings';saveBackupButton.onclick=()=>backupButton.click();retrySaveButton.after(saveBackupButton);const saveStatusRow=document.createElement('div');saveStatusRow.className='project-save-status-row';$('projectstatus').before(saveStatusRow);saveStatusRow.append($('projectstatus'),retrySaveButton,saveBackupButton);
function accountSaveErrorMessage(error){
 const message=String(error?.message||'Unknown error');
 if(message==='Invalid original PDFs.')return 'The original-file list was rejected. Reload the app and retry saving; if it persists, download a backup.';
 if(/100 MB/.test(message))return 'This project exceeds the 100 MB account-save limit. Download a backup before splitting it into smaller projects.';
 if(/Invalid original PDF reference/.test(message))return 'A panel has a missing original-file link. Download a backup before changing its source file.';
 if(/Failed to fetch|NetworkError|network request failed/i.test(message))return 'Could not reach account storage. Check your connection and retry.';
 return message;
}
function projectSaveStatus(state,text){$('projectstatus').dataset.state=state;$('projectstatus').textContent=text;retrySaveButton.hidden=!['offline','error','retrying'].includes(state);saveBackupButton.hidden=!['offline','error','retrying'].includes(state);}
function retryProjectSave(owner,id,delay){
 clearTimeout(projectRetryTimer);projectRetryTimer=setTimeout(()=>{
  if(projectOwner()!==owner||projectId!==id||!projectDirty)return;
  if(busy){retryProjectSave(owner,id,1000);return;}
  projectSaveStatus('retrying','Retrying account save…');saveProject().catch(()=>{});
 },delay);
}
retrySaveButton.onclick=()=>{projectRetryAttempt=0;saveProject().catch(()=>{});};
window.addEventListener('online',()=>{if(projectDirty&&projectOwner())retryProjectSave(projectOwner(),projectId,250);});
window.addEventListener('offline',()=>{if(projectDirty){projectSaveStatus('offline','Offline — keeping changes on this device.');queueProjectSave();}});
function projectIcon(button,label,path){
 button.classList.add('project-icon-button');button.title=label;button.setAttribute('aria-label',label);
 button.innerHTML='<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="'+path+'"/></svg>';
}
projectIcon($('generate'),'Generate drawing','M14 2H4v20h16V8l-6-6ZM14 2v6h6M10 11l5 3-5 3v-6Z');
projectIcon($('save'),'Save draft','M4 3h13l4 4v14H3V3h1ZM7 3v6h9V3M7 21v-8h10v8');
projectIcon($('download'),'Download DXF','M14 2H4v20h16V8l-6-6ZM14 2v6h6M12 11v7m-3-3 3 3 3-3');
function updateCombineIcon(){
 const button=$('downloadall'),count=generatedDrawings().length;
 projectIcon(button,'Combine drawings ('+count+')','M8 8h13v13H8V8ZM16 8V3H3v13h5');
 button.classList.add('drawing-combine-button');
 const badge=document.createElement('span');badge.className='drawing-count-badge';badge.setAttribute('aria-hidden','true');badge.textContent=count;button.append(badge);
}
for(const [id,label,path] of [
 ['saveproject','Save project','M5 3h12l4 4v14H3V3h2ZM7 3v6h10V3M7 21v-8h10v8M14 5v2'],
 ['openproject','Open project','M3 10V5h6l2 2h9v3M3 10h19l-4 10H2l1-10Z'],
 ['newproject','New project','M14 2H4v20h16V8l-6-6ZM14 2v6h6M12 12v6M9 15h6']
]){
 projectIcon($(id),label,path);
}
const quantityLabel=document.createElement('label');quantityLabel.textContent='Panel quantity';const quantityInput=document.createElement('input');quantityInput.id='panelquantity';quantityInput.type='number';quantityInput.min='1';quantityInput.max='9999';quantityInput.step='1';quantityInput.value='1';quantityLabel.append(quantityInput);$('panelid').closest('label').after(quantityLabel);
quantityInput.onchange=()=>{const value=Number(quantityInput.value);if(!Number.isInteger(value)||value<1||value>9999){quantityInput.value=String(panels[panelIndex]?.quantity||1);notice('Enter a whole panel quantity from 1 to 9,999.');return;}if(panelIndex>=0){panels[panelIndex].quantity=value;queueProjectSave();}};
const backupButton=document.createElement('button');backupButton.type='button';backupButton.textContent='Download backup';const restoreButton=document.createElement('button');restoreButton.type='button';restoreButton.textContent='Restore backup';const backupInput=document.createElement('input');backupInput.type='file';backupInput.accept='.json,application/json';backupInput.hidden=true;projectBar.querySelector('.row').append(backupButton,restoreButton);projectBar.append(backupInput);
projectIcon(backupButton,'Download backup','M12 3v12m-4-4 4 4 4-4M4 16v5h16v-5');
projectIcon(restoreButton,'Restore backup','M12 16V4m-4 4 4-4 4 4M4 16v5h16v-5');
const sourcePdfButton=document.createElement('button');sourcePdfButton.type='button';sourcePdfButton.hidden=true;
projectIcon(sourcePdfButton,'Download original PDF','M14 2H4v20h16V8l-6-6ZM14 2v6h6M12 11v7m-3-3 3 3 3-3');navigator.append(sourcePdfButton);
const projectPdfBox=document.createElement('section');projectPdfBox.className='project-pdf-source';projectPdfBox.hidden=true;
const projectPdfTitle=document.createElement('strong'),projectPdfHint=document.createElement('p'),projectPdfPreview=document.createElement('iframe'),highlightPdfButton=document.createElement('button');
projectPdfPreview.title='Project sketch preview';highlightPdfButton.type='button';highlightPdfButton.className='primary';projectIcon(highlightPdfButton,'Highlight panels','M8 3H3v5M16 3h5v5M21 16v5h-5M8 21H3v-5M7 7h10v10H7V7Z');projectPdfHint.textContent='Your file is loaded. Highlight panels to draw selection boxes and add more sketches.';projectPdfBox.append(projectPdfTitle,projectPdfHint,projectPdfPreview,highlightPdfButton);$('file').closest('label').after(projectPdfBox);
let displayedProjectPdf=null,projectPdfUrl=null,uploadedSketchFiles=[];
function updateProjectPdf(){
 const panel=panels[panelIndex]?.sourcePdf||panels[panelIndex]?.file?panels[panelIndex]:panels.find(p=>p.sourcePdf||p.file),file=uploadedSketchFiles[0]||panel?.sourcePdf||panel?.file||null;
 highlightPdfButton.disabled=busy||!file||panels.length>=30;projectPdfBox.hidden=false;projectPdfBox.classList.toggle('empty',!file);projectPdfBox.title=file?'':'Upload a PDF or image first to highlight panels.';highlightPdfButton.title=file?'Draw boxes around panels to add them':'Upload a PDF or image first to highlight panels.';projectPdfPreview.hidden=!file;projectPdfHint.textContent=file?'Your file is loaded. Highlight panels to draw selection boxes and add more sketches.':'Upload a PDF or image to highlight the panels you want to add.';if(!file)projectPdfTitle.textContent='Highlight panels';
 if(file===displayedProjectPdf)return;displayedProjectPdf=file;
 projectPdfPreview.removeAttribute('src');if(projectPdfUrl)URL.revokeObjectURL(projectPdfUrl);projectPdfUrl=null;
 if(file){projectPdfTitle.textContent=file.name||panel?.sourcePdfName||'Original file';projectPdfUrl=URL.createObjectURL(file);projectPdfPreview.src=projectPdfUrl;}
}
highlightPdfButton.onclick=async()=>{if(busy||!displayedProjectPdf)return;const file=displayedProjectPdf;let added=false;await run(async()=>{
 const selected=await PanelPdfSelection.open(uploadedSketchFiles.length?uploadedSketchFiles:[file],30-panels.length);if(!selected.length)return;
 rememberPanel();const first=panels.length;selected.forEach(sketch=>panels.push({file:sketch,sourcePdf:sketch.sourcePdf,sourcePdfName:sketch.sourcePdf?.name,name:sketch.name,spec:null,result:null,reviewed:false}));panelIndex=-1;selectPanel(first);queueProjectSave();added=true;
 });if(added)$('analyse').click();};
function updateSourcePdfButton(){const panel=panels[panelIndex];sourcePdfButton.hidden=!panel?.sourcePdf;sourcePdfButton.title=panel?.sourcePdf?'Download original PDF: '+(panel.sourcePdfName||panel.sourcePdf.name||'Original.pdf'):'Download original PDF';updateProjectPdf();}
sourcePdfButton.onclick=()=>{const panel=panels[panelIndex];if(panel?.sourcePdf)download(panel.sourcePdf,'application/pdf',panel.sourcePdfName||panel.sourcePdf.name||'Original.pdf');};
const projectHistoryButton=document.createElement('button');projectHistoryButton.type='button';projectIcon(projectHistoryButton,'Project version history','M3 11a9 9 0 1 1 2.7 7M3 4v7h7M12 7v5l3 2');projectBar.querySelector('.row').append(projectHistoryButton);
projectHistoryButton.onclick=()=>run(async()=>{await saveProject();if(projectId)await showProjectHistory({projectId,name:projectName},projectOwner());else notice('Save a project before opening its history.');});
backupButton.onclick=()=>run(async()=>{if(!panels.length&&!uploadedSketchFiles.length)throw Error('Upload a file before downloading a backup.');rememberPanel();const data=PanelCadProjects.snapshot(panels,panelIndex,$('projectname').value,uploadedSketchFiles,projectDetails());const text=await PanelCadProjects.backup(data);if(new Blob([text]).size>150*1024*1024)throw Error('This project exceeds the 150 MB backup limit.');download(text,'application/json',combinedFilename(data.name).replace(/\.dxf$/i,'-backup.json'));notice('Project backup downloaded, including sketches and generated drawings.');});
restoreButton.onclick=()=>{backupInput.value='';backupInput.click();};
backupInput.onchange=()=>run(async()=>{const file=backupInput.files[0];if(!file)return;if(file.size>150*1024*1024)throw Error('Choose a project backup smaller than 150 MB.');const data=PanelCadProjects.restore(await file.text());await saveProject();const owner=projectOwner();if(!owner)throw Error('Sign in before restoring a project.');const id=crypto.randomUUID();uploadedSketchFiles=data.uploadedFiles||[];data.name=(data.name+' (restored)').slice(0,100);await PanelCadProjects.save(owner,id,data);panels.length=0;panels.push(...data.panels);panelIndex=-1;spec=null;result=null;projectId=id;projectName=data.name;$('projectname').value=projectName;restoreProjectDetails(data);projectRevision++;projectDirty=false;selectPanel(data.index);notice('Backup restored as a separate project. Review fabrication readiness before downloading drawings.');});
function projectOwner(){return session?.username?PanelCadProjects.ownerKey(API,session.username):null;}
function queueProjectSave(){
 if(!projectOwner()||(!panels.length&&!uploadedSketchFiles.length&&!projectId))return;
 projectDirty=true;projectRevision++;clearTimeout(projectTimer);
 projectSaveStatus('pending','Changes waiting to save…');
 projectTimer=setTimeout(()=>{if(!busy)saveProject().catch(()=>{});else queueProjectSave();},700);
}
async function saveProject(){
 clearTimeout(projectTimer);clearTimeout(projectRetryTimer);const owner=projectOwner();if(!owner||(!panels.length&&!uploadedSketchFiles.length&&!projectId))return;
 rememberPanel();projectName=$('projectname').value.trim()||'Untitled project';projectId||=crypto.randomUUID();
 const id=projectId,revision=projectRevision,data=PanelCadProjects.snapshot(panels,panelIndex,projectName,uploadedSketchFiles,projectDetails());
 projectSaveStatus('saving','Saving project…');let localSaved=false;
 const task=projectSaveChain.catch(()=>{}).then(async()=>{
  await PanelCadProjects.save(owner,id,data);
  localSaved=true;
  if(projectOwner()!==owner)return;
  if(window.navigator.onLine===false){const error=Error('You are offline.');error.offline=true;throw error;}
  const request=(...args)=>{if(projectOwner()!==owner)throw Error('Your account changed during saving. The browser copy is retained.');return api(...args);};
  const progress=text=>{if(projectOwner()===owner&&projectId===id)projectSaveStatus('saving',text);};let response;
  try{response=await PanelCadProjects.saveCloud(data,id,cloudRevisions.get(owner+'|'+id)||0,request,progress,{scope:owner});}
  catch(error){if(!error.conflict)throw error;
   const copyId=crypto.randomUUID();data.name=(data.name+' (device copy)').slice(0,100);
   response=await PanelCadProjects.saveCloud(data,copyId,0,request,progress);
   await PanelCadProjects.save(owner,copyId,data);cloudRevisions.set(owner+'|'+copyId,response.revision);
   if(projectOwner()===owner&&projectId===id){projectId=copyId;projectName=data.name;$('projectname').value=data.name;if(projectRevision===revision)projectDirty=false;projectRetryAttempt=0;projectSaveStatus('saved','Saved to your account as a separate device copy.');notice('Another device changed this project. Your changes were saved as a separate device copy.');}return;
  }
  cloudRevisions.set(owner+'|'+id,response.revision);
 });projectSaveChain=task;
 try{await task;if(projectOwner()===owner&&projectId===id&&projectRevision===revision){projectDirty=false;projectRetryAttempt=0;projectSaveStatus('saved','Saved to your account at '+new Date().toLocaleTimeString()+'.');}}
 catch(error){if(projectOwner()===owner&&projectId===id){
  projectDirty=true;const offline=error.offline||window.navigator.onLine===false;
  const canRetry=localSaved&&!offline&&(!error.status||error.status===429||error.status>=500)&&projectRetryAttempt<5;
  const delay=Math.min(30000,2000*2**projectRetryAttempt);
  projectSaveStatus(offline?'offline':canRetry?'retrying':'error',offline?(localSaved?'Offline — saved on this device. Account saving resumes when you reconnect.':'Offline — could not save on this device. Keep this page open and download a backup.'):'Account save failed: '+accountSaveErrorMessage(error)+(localSaved?' Saved on this device.':' Keep this page open and download a backup.')+(canRetry?' Retrying in '+delay/1000+' seconds.':''));
  if(canRetry){projectRetryAttempt++;retryProjectSave(owner,id,delay);}
 }throw error;}
}
function pickProject(items){return new Promise(resolve=>{
 const dialog=document.createElement('dialog');dialog.className='project-picker';dialog.setAttribute('aria-labelledby','project-picker-title');
 const header=document.createElement('header');header.className='project-picker-header';
 const eyebrow=document.createElement('p');eyebrow.className='project-picker-eyebrow';eyebrow.textContent='YOUR WORKSPACE';
 const title=document.createElement('h2');title.id='project-picker-title';title.textContent='Open saved project';
 const description=document.createElement('p');description.textContent='Open an account project from any device, or a copy saved on this device.';header.append(eyebrow,title,description);dialog.append(header);
 const list=document.createElement('div');list.className='project-picker-list';list.setAttribute('role','group');list.setAttribute('aria-label','Saved projects');let selected=0;
 items.forEach((p,i)=>{const card=document.createElement('div');card.className='project-picker-card';const radio=document.createElement('input');radio.type='radio';radio.name='saved-project';radio.value=String(i);radio.checked=i===0;radio.setAttribute('aria-label',p.name);radio.onchange=()=>{selected=i;};card.onclick=()=>{radio.checked=true;selected=i;};
 const details=document.createElement('span');details.className='project-picker-details';const name=document.createElement('strong');name.textContent=p.name;
 const meta=document.createElement('span');meta.textContent=(p.cloud?'Account · ':'This device · ')+(p.panelCount??p.panels.length)+' panel'+((p.panelCount??p.panels.length)===1?'':'s')+' · Saved '+new Date(p.updatedAt).toLocaleString('en-AU',{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'});if(p.copies?.length>1||p.deviceCopies?.length>1)meta.textContent+=' · Copies combined by order';details.append(name,meta);card.append(radio,details);list.append(card);});dialog.append(list);
 const footer=document.createElement('footer');footer.className='project-picker-footer';const open=document.createElement('button');open.textContent='Open project';open.className='primary';open.type='button';open.disabled=!items.length;const cancel=document.createElement('button');cancel.textContent='Cancel';cancel.type='button';footer.append(cancel,open);dialog.append(footer);
 const close=value=>{dialog.close();dialog.remove();resolve(value);};
 Array.from(list.children).forEach((card,i)=>{const history=document.createElement('button');history.type='button';projectIcon(history,'Version history: '+items[i].name,'M3 11a9 9 0 1 1 2.7 7M3 4v7h7M12 7v5l3 2');history.classList.add('project-card-history');history.onclick=e=>{e.stopPropagation();close({action:'history',item:items[i]});};card.append(history);});
 const actions=document.createElement('div');actions.className='project-management-actions';for(const [action,label,path] of [['rename','Rename','M16 3l5 5M4 16 16 4a3.5 3.5 0 0 1 5 5L9 21H4v-5ZM13 21h8'],['duplicate','Duplicate','M9 9h12v12H9V9ZM15 9V3H3v12h6'],['delete','Delete','M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7']]){const button=document.createElement('button');button.type='button';button.disabled=!items.length;if(action==='delete')button.className='danger';projectIcon(button,label,path);button.onclick=()=>close({action,item:items[selected]});actions.append(button);}footer.before(actions);
 open.onclick=()=>close({action:'open',item:items[selected]});cancel.onclick=()=>close(null);dialog.oncancel=e=>{e.preventDefault();close(null);};document.body.append(dialog);dialog.showModal();
});}
function projectActionDialog(action,item){return new Promise(resolve=>{
 const dialog=document.createElement('dialog');dialog.className='project-picker project-action-dialog';const header=document.createElement('header');header.className='project-picker-header';const title=document.createElement('h2');title.textContent=action==='delete'?'Delete project?':action==='rename'?'Rename project':'Duplicate project';header.append(title);dialog.append(header);
 const content=document.createElement('div');content.className='project-picker-list';const description=document.createElement('p');description.textContent=action==='delete'?'Delete “'+item.name+'”'+(item.cloud?' from your account and this device?':' from this device?')+' Download a backup first if you want to keep it.':action==='duplicate'?'Enter a different order name. Copies with the same order name are combined into version history.':'Enter a name for this project.';content.append(description);
 const input=document.createElement('input');input.maxLength=100;input.value=(item.name+(action==='duplicate'?' - new order':'')).slice(0,100);if(action!=='delete'){const label=document.createElement('label');label.textContent='Project name';label.append(input);content.append(label);}dialog.append(content);
 const footer=document.createElement('footer');footer.className='project-picker-footer';const cancel=document.createElement('button');cancel.textContent='Cancel';const submit=document.createElement('button');submit.textContent=action==='delete'?'Delete project':action==='rename'?'Save name':'Create copy';submit.className=action==='delete'?'danger':'primary';footer.append(cancel,submit);dialog.append(footer);
 const close=value=>{dialog.close();dialog.remove();resolve(value);};cancel.onclick=()=>close(null);dialog.oncancel=e=>{e.preventDefault();close(null);};submit.onclick=()=>{if(action!=='delete'&&!input.value.trim()){input.focus();return;}close(action==='delete'?true:input.value.trim());};input.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();submit.click();}};document.body.append(dialog);dialog.showModal();if(action==='delete')cancel.focus();else{input.focus();input.select();}
});}
async function manageSavedProject(action,item,owner){
 if(action==='history'){if(!item.cloud){notice('Connect and save this order to your account to view its history.');return;}await showProjectHistory(item,owner);return;}
 const value=await projectActionDialog(action,item);if(value===null||projectOwner()!==owner)return;
 const request=(...args)=>{if(projectOwner()!==owner)throw Error('Your account changed. Open the project list again.');return api(...args);};
 const id=item.projectId;
 if(action==='delete'){
  if(item.cloud)await request('/cad/projects/'+id+'/delete',{revision:item.revision});
  let localError=null;try{await PanelCadProjects.remove(owner,id);}catch(error){if(!item.cloud)throw error;localError=error;}cloudRevisions.delete(owner+'|'+id);
  if(projectId===id){clearTimeout(projectTimer);clearTimeout(projectRetryTimer);panels.length=0;panelIndex=-1;spec=null;result=null;projectId=null;projectName='Untitled project';$('projectname').value=projectName;restoreProjectDetails();projectDirty=false;projectRevision++;PanelMeasuredOutline.show(null);invalidate();$('edges').replaceChildren();$('panelid').value='';$('questions').replaceChildren();updateNavigator();projectSaveStatus('saved','Project deleted. Start a new project when ready.');}
  notice(localError?'Account project deleted. The browser copy could not be removed; delete that device copy separately.':'Project deleted.');return;
 }
 if(action==='rename'){
  if(item.cloud&&projectId===id&&(projectDirty||cloudRevisions.get(owner+'|'+id)!==item.revision))throw Error('Open the latest account copy before renaming this project. Your unsaved changes remain on this device.');
  let response;if(item.cloud)response=await request('/cad/projects/'+id+'/rename',{revision:item.revision,name:value});
  if(response)cloudRevisions.set(owner+'|'+id,response.revision);
  if(projectId===id){projectName=value;$('projectname').value=value;projectSaveStatus(item.cloud?'saved':'pending',item.cloud?'Project renamed in your account.':'Project renamed on this device.');}
  const local=(await PanelCadProjects.list(owner)).find(p=>p.projectId===id);if(local)await PanelCadProjects.save(owner,id,{...local,name:value,updatedAt:Date.now()});
  notice('Project renamed.');return;
 }
 const data=item.cloud?await PanelCadProjects.restoreCloud(await request('/cad/projects/'+id),id,request):PanelCadProjects.snapshot(item.panels,item.index,item.name,item.uploadedFiles,item.projectDetails);
 data.name=value;const copyId=crypto.randomUUID();await PanelCadProjects.save(owner,copyId,data);
 if(item.cloud){const response=await PanelCadProjects.saveCloud(data,copyId,0,request);cloudRevisions.set(owner+'|'+copyId,response.revision);}
 notice('Project duplicated as “'+value+'”.');
}
$('saveproject').onclick=()=>run(()=>saveProject());
$('openproject').onclick=()=>run(async()=>{
 try{await saveProject();}catch{notice('Current changes remain on this device. Select a saved project below.');}
 const owner=projectOwner();if(!owner)return;
 while(owner===projectOwner()){
 const local=await PanelCadProjects.list(owner);let remote=[],connected=false;
 try{remote=(await api('/cad/projects')).projects.map(p=>({...p,cloud:true}));connected=true;}catch{notice('Account projects are unavailable. Showing this device’s copies.');}
 if(connected){
  const request=(...args)=>{if(projectOwner()!==owner)throw Error('Your account changed.');return api(...args);};
  for(const group of PanelCadProjects.mergeSaved(remote,local)){
   if(group.name.toLowerCase()==='untitled project'||(!group.deviceCopies.length&&group.copies.length<2))continue;
   try{
    const combined=await PanelCadProjects.combineCopies(group,request,text=>notice('Combining order copies. '+text));
    for(const copy of group.deviceCopies){copy.importedTo=combined.projectId;copy.importedAt=copy.updatedAt;await PanelCadProjects.save(owner,copy.projectId,copy);}
    if([...group.copies,...group.deviceCopies].some(p=>p.projectId===projectId)&&!projectDirty&&cloudRevisions.get(owner+'|'+projectId)!==combined.revision){
     const response=await request('/cad/projects/'+combined.projectId),data=await PanelCadProjects.restoreCloud(response,combined.projectId,request);applyOpenedProject(data,combined.projectId);cloudRevisions.set(owner+'|'+combined.projectId,response.revision);
    }
   }catch(error){notice('Some copies could not be combined yet: '+error.message);}
  }
  remote=(await request('/cad/projects')).projects.map(p=>({...p,cloud:true}));
 }
 const items=PanelCadProjects.mergeSaved(remote,local);if(!items.length){notice('No saved projects yet.');return;}
 const choice=await pickProject(items);if(!choice||owner!==projectOwner())return;
 if(!['open','openlocal'].includes(choice.action)){try{await manageSavedProject(choice.action,choice.item,owner);}catch(error){notice(error.conflict?'This project changed on another device. The list has been refreshed; choose it again.':error.message);}continue;}
 let saved=choice.item;
 if(saved.cloud){const id=saved.projectId,request=(...args)=>{if(projectOwner()!==owner)throw Error('Your account changed while opening the project.');return api(...args);},response=await request('/cad/projects/'+id);saved={...await PanelCadProjects.restoreCloud(response,id,request),projectId:id};cloudRevisions.set(owner+'|'+id,response.revision);}
 else {saved={...saved,projectId:crypto.randomUUID(),name:(saved.name+' (device copy)').slice(0,100)};}
 if(owner!==projectOwner())return;
 applyOpenedProject(saved,saved.projectId);notice('Project opened. Sketches and generated drawings restored.');
 return;
 }
});
function applyOpenedProject(saved,id){uploadedSketchFiles=saved.uploadedFiles||[];panels.length=0;panels.push(...saved.panels);panelIndex=-1;spec=null;result=null;projectId=id;projectName=saved.name;$('projectname').value=projectName;restoreProjectDetails(saved);projectRevision++;projectDirty=false;selectPanel(Math.max(0,Math.min(saved.index||0,panels.length-1)));updateNavigator();}
async function showProjectHistory(item,owner){
 const request=(...args)=>{if(projectOwner()!==owner)throw Error('Your account changed.');return api(...args);},base='/cad/projects/'+item.projectId;
 const history=await request(base+'/versions');
 const choice=await new Promise(resolve=>{
  const dialog=document.createElement('dialog');dialog.className='project-picker';const header=document.createElement('header');header.className='project-picker-header';const title=document.createElement('h2');title.textContent='Version history';const subtitle=document.createElement('p');subtitle.textContent=item.name+' · Last 50 saved versions, plus all imported copies.';header.append(title,subtitle);dialog.append(header);
  const list=document.createElement('div');list.className='project-picker-list';let selected=history.versions[0];
  if(!selected){const empty=document.createElement('p');empty.textContent='No earlier versions yet. Your next changed save will keep the current version here.';list.append(empty);}
  history.versions.forEach((version,index)=>{const label=document.createElement('label');label.className='project-picker-card';const radio=document.createElement('input');radio.type='radio';radio.name='project-version';radio.checked=index===0;radio.onchange=()=>{selected=version;};const details=document.createElement('span');details.className='project-picker-details';const time=document.createElement('strong');time.textContent=new Date(version.updatedAt).toLocaleString('en-AU');const text=document.createElement('span');text.textContent=version.label+' · '+version.panelCount+' panels';details.append(time,text);label.append(radio,details);list.append(label);});dialog.append(list);
  const footer=document.createElement('footer');footer.className='project-picker-footer';const close=document.createElement('button');close.textContent='Close';const preview=document.createElement('button');preview.textContent='Preview';preview.disabled=!selected;const restore=document.createElement('button');restore.textContent='Restore version';restore.className='primary';restore.disabled=!selected;footer.append(close,preview,restore);dialog.append(footer);
  const finish=value=>{dialog.close();dialog.remove();resolve(value);};close.onclick=()=>finish(null);dialog.oncancel=e=>{e.preventDefault();finish(null);};preview.onclick=()=>finish({action:'preview',version:selected});restore.onclick=()=>{if(restore.dataset.confirmed!=='yes'){restore.dataset.confirmed='yes';restore.textContent='Confirm restore';subtitle.textContent='Your current project will remain in history. Restore the selected version?';return;}finish({action:'restore',version:selected});};list.addEventListener('change',()=>{delete restore.dataset.confirmed;restore.textContent='Restore version';});document.body.append(dialog);dialog.showModal();
 });
 if(!choice)return;
 if(choice.action==='restore'){
  await request(base+'/restore',{revision:history.revision,versionId:choice.version.id});
  const response=await request(base),data=await PanelCadProjects.restoreCloud(response,item.projectId,request);applyOpenedProject(data,item.projectId);cloudRevisions.set(owner+'|'+item.projectId,response.revision);await PanelCadProjects.save(owner,item.projectId,data);notice('Earlier version restored. The previous current version remains in history.');return;
 }
 const response=await request(base+'/versions/'+choice.version.id),data=await PanelCadProjects.restoreCloud(response,item.projectId,(path,body)=>request(path.replace(base+'/chunks/',base+'/versions/'+choice.version.id+'/'),body));
 await previewProjectVersion(data,choice.version);
}
function previewProjectVersion(data,version){return new Promise(resolve=>{
 const dialog=document.createElement('dialog');dialog.className='project-picker';const header=document.createElement('header');header.className='project-picker-header';const title=document.createElement('h2');title.textContent=data.name;const caption=document.createElement('p');caption.textContent='Saved '+new Date(version.updatedAt).toLocaleString('en-AU')+' · Read-only preview';header.append(title,caption);dialog.append(header);const list=document.createElement('div');list.className='project-picker-list';const urls=[];
 for(const panel of data.panels){const section=document.createElement('section');const heading=document.createElement('h3');heading.textContent=panel.spec?.panelId||panel.name||'Panel';section.append(heading);if(panel.result?.svg){const image=document.createElement('img'),url=URL.createObjectURL(new Blob([panel.result.svg],{type:'image/svg+xml'}));urls.push(url);image.src=url;image.alt=heading.textContent+' saved drawing';image.style.cssText='width:100%;max-height:440px;object-fit:contain';section.append(image);}else{const text=document.createElement('p');text.textContent='Sketch saved; drawing not generated.';section.append(text);}list.append(section);}dialog.append(list);const footer=document.createElement('footer');footer.className='project-picker-footer';const close=document.createElement('button');close.textContent='Close preview';footer.append(close);dialog.append(footer);const finish=()=>{urls.forEach(url=>URL.revokeObjectURL(url));dialog.close();dialog.remove();resolve();};close.onclick=finish;dialog.oncancel=e=>{e.preventDefault();finish();};document.body.append(dialog);dialog.showModal();
});}
$('newproject').onclick=()=>run(async()=>{
 await saveProject();uploadedSketchFiles=[];panels.length=0;panelIndex=-1;spec=null;result=null;projectId=null;projectName='Untitled project';quantityInput.value='1';$('projectname').value=projectName;restoreProjectDetails();projectRevision++;projectDirty=false;
 PanelMeasuredOutline.show(null);invalidate();$('edges').replaceChildren();$('panelid').value='';$('questions').replaceChildren();updateNavigator();notice('New project ready. Add a sketch to begin.');$('projectstatus').textContent='Projects save to your account, with a copy kept on this device.';
});
$('workspace').addEventListener('input',queueProjectSave);$('workspace').addEventListener('change',queueProjectSave);
window.addEventListener('beforeunload',e=>{if(projectDirty){e.preventDefault();e.returnValue='';}});

function generatedDrawings(){return panels.map((p,i)=>i===panelIndex?result:p.result).filter(r=>r?.dxf);}
function updateNavigator(){deletePanelButton.disabled=busy||panelIndex<0;window.dispatchEvent(new CustomEvent('panel-sketch-reference',{detail:{file:panels[panelIndex]?.file||null,name:panels[panelIndex]?.spec?.panelId||panels[panelIndex]?.name||'Panel sketch'}}));updateSourcePdfButton();if($('downloadall')){$('downloadall').disabled=busy||!generatedDrawings().length;updateCombineIcon();} $('panelcount').textContent=panels.length?'Panel '+(panelIndex+1)+' of '+panels.length:'No panels';$('panelsource').textContent=panels[panelIndex]?.name||'';$('previouspanel').disabled=busy||panelIndex<=0;$('nextpanel').disabled=busy||panelIndex>=panels.length-1;}
function rememberPanel(){if(panelIndex<0)return;const p=panels[panelIndex];if(spec)spec.panelId=$('panelid').value.trim();Object.assign(p,{spec,result,reviewed:!!result,message:$('notice').textContent});}
function selectPanel(index){if(index<0||index>=panels.length)return;rememberPanel();panelIndex=index;const p=panels[index];spec=p.spec||null;
 if(previewURL){URL.revokeObjectURL(previewURL);previewURL=null;}
 if(spec)renderSpec();else{PanelMeasuredOutline.show(null);invalidate();$('edges').replaceChildren();$('panelid').value='';$('folds').value='';renderQuestions();}
 quantityInput.value=String(p.quantity||1);result=p.result||null;
 if(result){previewURL=URL.createObjectURL(new Blob([result.svg],{type:'image/svg+xml'}));$('preview').src=previewURL;$('preview').hidden=false;renderDrawingChecks(result);}
 $('download').disabled=!result;notice(p.error||p.message||'Upload a sketch and highlight the panel to read it.');updateNavigator();}
function addPanel(draft,name){rememberPanel();panels.push({spec:draft,name,reviewed:false});panelIndex=-1;selectPanel(panels.length-1);}
$('previouspanel').onclick=()=>{if(!busy)selectPanel(panelIndex-1);};$('nextpanel').onclick=()=>{if(!busy)selectPanel(panelIndex+1);};
updateNavigator();
const codes=['B','S','NT','RE','FE','CR'],directions=['right','up','left','down'];
function notice(message,error=false){const box=$('notice');box.classList.toggle('cad-error-message',error);box.setAttribute('role',error?'alert':'status');box.textContent=message;}
function renderDrawingChecks(drawing){
 const box=$('validation');box.replaceChildren();const v=drawing.validation||{};
 const title=document.createElement('strong');title.textContent='Drawing checks';box.append(title);
 const list=document.createElement('ul');
 const checks=v.checks||['Generate again to run the latest drawing checks.'];
 for(const message of checks){const item=document.createElement('li');item.textContent=message;list.append(item);}box.append(list);
 const counts=document.createElement('p');counts.textContent=(v.holes??0)+' holes · '+(v.routes??0)+' route lines · '+(v.stiffeners?.length??(v.stiffener?1:0))+' stiffeners';box.append(counts);
 for(const warning of v.warnings||[]){const p=document.createElement('p');p.textContent=warning;p.style.color='#8a4b13';box.append(p);}
 const audit=document.createElement('details');audit.className='measurement-audit';const heading=document.createElement('summary');const rows=v.measurements||[],mismatches=rows.filter(r=>r.status==='mismatch').length;heading.textContent='Measurement check'+(mismatches?' · '+mismatches+' need attention':rows.length?' · '+rows.length+' measurements':'');audit.append(heading);audit.open=mismatches>0;
 const help=document.createElement('p');help.textContent=rows.length?'All values are in mm. Actual values use unrounded geometry. Calculated rows show measured differences, without an independently verified deduction.':'Regenerate this drawing to include the measurement check.';audit.append(help);
 if(rows.length){const wrap=document.createElement('div');wrap.className='tablewrap';const table=document.createElement('table');const thead=document.createElement('thead'),head=document.createElement('tr');for(const label of ['Measurement','Sketch','Deduction','Expected','Actual','Check']){const th=document.createElement('th');th.textContent=label;head.append(th);}thead.append(head);table.append(thead);const tbody=document.createElement('tbody');const number=value=>Number.isFinite(value)?String(Number(value.toFixed(3))):'—';for(const row of rows){const tr=document.createElement('tr');if(row.status==='mismatch')tr.className='measurement-mismatch';for(const value of [row.label,number(row.site),number(row.deduction),number(row.expected),number(row.actual),row.status==='pass'?'Matches':row.status==='mismatch'?'Mismatch':'Calculated']){const td=document.createElement('td');td.textContent=value;tr.append(td);}tbody.append(tr);}table.append(tbody);wrap.append(table);audit.append(wrap);}box.append(audit);
}
function invalidate(){const errorBox=$('generation-error');if(errorBox)errorBox.hidden=true;version++;result=null;updateNavigator();$('download').disabled=true;$('preview').hidden=true;$('validation').textContent='Generate a new preview after reviewing your changes.';}
async function api(path,body){const token=session?.token;const response=await fetch(API+path,{method:body?'POST':'GET',headers:{...(token?{Authorization:'Bearer '+token}:{}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),cache:'no-store',signal:AbortSignal.timeout(95000)});const data=await response.json();if(response.status===401){session=null;sessionStorage.removeItem(KEY);showSession();}if(!response.ok){const error=Error(data.error||'Request failed');error.conflict=data.conflict===true;error.status=response.status;throw error;}return data;}
function showSession(){if(!session){uploadedSketchFiles=[];clearTimeout(projectTimer);projectId=null;projectDirty=false;$('projectname').value='Untitled project';cadProjectOptions=[];restoreProjectDetails();PanelMeasuredOutline.show(null);panels.length=0;panelIndex=-1;updateNavigator();spec=null;invalidate();$('edges').replaceChildren();$('panelid').value='';$('folds').value='';$('questions').replaceChildren();if(previewURL){URL.revokeObjectURL(previewURL);previewURL=null;}}$('login').hidden=!!session;$('workspace').hidden=!session;$('signout').hidden=!session;$('account').textContent=session?.username||'';}
async function run(action){if(busy)return;busy=true;for(const b of document.querySelectorAll('button'))b.disabled=true;notice('Working…');try{await action();}catch(e){notice(e.name==='TimeoutError'?'This request timed out. Please retry.':e.message||'Could not reach the server.',true);}finally{busy=false;for(const b of document.querySelectorAll('button'))b.disabled=false;$('download').disabled=!result;updateNavigator();queueProjectSave();}}
function edgeRow(edge,index){const tr=document.createElement('tr');tr.dataset.sections=JSON.stringify(edge.sections||[]);const name=document.createElement('input');name.value=edge.name||'Edge '+(index+1);name.maxLength=60;name.setAttribute('aria-label','Edge name');
 const fields=[name,...[directions,codes].map((options,j)=>{const select=document.createElement('select');select.setAttribute('aria-label',j?'Edge type':'Edge direction');for(const option of options){const el=document.createElement('option');el.value=option;el.textContent=option;select.append(el);}select.value=edge[j?'code':'direction'];return select;}),...['site','finished'].map(key=>{const input=document.createElement('input');input.type='number';input.min='.001';input.max='10000';input.step='any';input.value=edge[key]??'';input.setAttribute('aria-label',key+' length in mm');return input;})];
 for(const field of fields){const td=document.createElement('td');td.append(field);tr.append(td);field.addEventListener('input',()=>{const keys=['name','direction','code','site','finished'];const j=fields.indexOf(field);edge[keys[j]]=j>2?(field.value===''?null:Number(field.value)):field.value;if(j===2&&edge.sections){edge.sections.forEach(s=>s.code=edge.code);tr.dataset.sections=JSON.stringify(edge.sections);}invalidate();if([1,2,3].includes(j))recalculateEditedOutline();renderQuestions();});}
 const tagLabel=document.createElement('label');tagLabel.className='edge-with-tag';tagLabel.textContent='With tag';const tagCheck=document.createElement('input');tagCheck.type='checkbox';tagCheck.checked=edge.code==='FE'&&!!edge.withTag;tagLabel.prepend(tagCheck);tagLabel.hidden=edge.code!=='FE';fields[2].parentElement.append(tagLabel);fields[2].addEventListener('change',()=>{tagLabel.hidden=edge.code!=='FE';if(edge.code!=='FE'){edge.withTag=false;tagCheck.checked=false;}});tagCheck.onchange=()=>{edge.withTag=tagCheck.checked;if(edge.sections)edge.sections.forEach(s=>s.withTag=edge.withTag);invalidate();queueProjectSave();};
 const td=document.createElement('td'),remove=document.createElement('button');remove.className='remove-edge';remove.setAttribute('aria-label','Remove edge '+(index+1));remove.title='Remove edge';remove.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18M9 6V4h6v2M5 6l1 14h12l1-14M10 10v6M14 10v6"/></svg>';remove.onclick=()=>{spec.edges.splice(index,1);recalculateOutline(spec);renderSpec();};td.append(remove);tr.append(td);return tr;}
function recalculateOutline(draft){
 if(draft.correctionDraft){draft.unsupported=true;draft.edges=[];return false;}
 if(draft.measuredEdges){
  const oldRestriction='Measured diagonal outlines currently support horizontal internal folds.',oldNote='Fold marks saved; machining mixed or angled fold orientations is not yet supported.';
  const errors=PanelMeasuredOutline.validate(draft);
  if(!errors.length&&draft.calculationError===oldRestriction&&(draft.questions||[]).every(q=>q===oldNote||q==='Review the written measurements and marked folds before generating.')){draft.unsupported=false;draft.questions=(draft.questions||[]).filter(q=>q!==oldNote);}
  draft.validationErrors=errors;draft.calculationError=errors.join(' ');return true;
 }
 const legacyFoldNote='Vertical or diagonal folds are marked and saved. Their deductions and machining geometry still need review before generation.';
 if(draft.unsupported&&draft.directionSource==='manual-sketch-trace'&&(draft.questions||[]).includes(legacyFoldNote)&&draft.foldLines?.length&&draft.foldLines.every(f=>Math.abs(f.start.x-f.end.x)<.001&&Math.abs(f.start.y-f.end.y)>.001)&&!(draft.siteFolds||[]).length){
  const migrated=structuredClone(draft);migrated.unsupported=false;
  migrated.questions=migrated.questions.filter(q=>q!==legacyFoldNote);
  recalculateOutline(migrated);
  if(!migrated.calculationError){Object.assign(draft,migrated);return true;}
 }

 const lines=draft.foldLines||[],vertical=lines.filter(f=>Math.abs(f.start.x-f.end.x)<.001&&Math.abs(f.start.y-f.end.y)>.001);
 if(vertical.length){
  if(vertical.length!==lines.length||(draft.siteFolds||[]).length){draft.calculationError='Combined fold orientations need review.';return true;}
  const rotated=structuredClone(draft),turn={right:'up',up:'left',left:'down',down:'right'};
  delete rotated.foldLines;rotated.siteFolds=[...new Set(vertical.map(f=>f.start.x))].sort((a,b)=>a-b);
  rotated.edges.forEach(e=>e.direction=turn[e.direction]);recalculateOutline(rotated);
  draft.calculationError=rotated.calculationError;
  if(!rotated.calculationError){draft.edges.forEach((e,i)=>e.finished=rotated.edges[i].finished);draft.verticalFolds=rotated.folds;draft.folds=[];}
  return true;
 }

 initialiseSiteFolds(draft);
 const es=draft.edges,v={right:[1,0],up:[0,1],left:[-1,0],down:[0,-1]},tags=['B','S','NT','RE'];
 draft.calculationError='Complete a valid closed outline to recalculate. Existing measurements have been kept.';
 if(!Array.isArray(draft.siteFolds)){draft.calculationError='Enter the original site fold heights to recalculate this older draft.';return true;}
 if(draft.unsupported||es.length<4||es.length>32)return true;
 let x=0,y=0;const points=[];
 for(const e of es){if(!v[e.direction]||!codes.includes(e.code)||typeof e.site!=='number'||!Number.isFinite(e.site)||e.site<.001||e.site>10000)return true;points.push([x,y]);x+=v[e.direction][0]*e.site;y+=v[e.direction][1]*e.site;}
 if(Math.hypot(x,y)>.001)return true;
 let area=0;
 for(let i=0;i<es.length;i++){const a=v[es[(i+es.length-1)%es.length].direction],b=v[es[i].direction],p=points[i],q=points[(i+1)%es.length];if(a[0]*b[0]+a[1]*b[1]!==0)return true;area+=p[0]*q[1]-q[0]*p[1];}
 if(area<=0)return true;
 const shifted=points.map((p,i)=>{const prev=es[(i+es.length-1)%es.length],cur=es[i],a=v[prev.direction],b=v[cur.direction],da=tags.includes(prev.code)?1:0,db=tags.includes(cur.code)?1:0;return [p[0]-(a[1]?a[1]*da:b[1]*db),p[1]+(a[0]?a[0]*da:b[0]*db)];});
 const folds=[...draft.siteFolds].sort((a,b)=>a-b),minY=Math.min(...points.map(p=>p[1])),height=Math.max(...points.map(p=>p[1]))-minY;
 if(folds.length>12||new Set(folds).size!==folds.length||folds.some(f=>typeof f!=='number'||!Number.isFinite(f)||f<.001||f>height-.001)){draft.calculationError='Enter distinct site fold heights inside the panel (at most 12).';return true;}
 for(const f of folds){const level=minY+f;
  const crossing=es.filter((e,i)=>{const a=points[i],b=points[(i+1)%es.length];return level>Math.min(a[1],b[1])&&level<Math.max(a[1],b[1]);});
  if(points.some(p=>Math.abs(p[1]-level)<.001)||crossing.length<2||crossing.length%2||crossing.some(e=>!tags.includes(e.code))){draft.calculationError='Internal folds must cross material and end at tagged vertical sides, away from corners.';return true;}
 }
 const bottomShift=shifted[0][1]-points[0][1];
 const finishedFolds=folds.map((f,i)=>Number((f-bottomShift-1-2*i).toFixed(6)));
 shifted.forEach((p,i)=>p[1]-=2*folds.filter(f=>points[i][1]>minY+f).length);
 const lengths=es.map((e,i)=>{const p=shifted[i],q=shifted[(i+1)%es.length],u=v[e.direction];return Number(((q[0]-p[0])*u[0]+(q[1]-p[1])*u[1]).toFixed(6));});
 if(lengths.some(n=>n<.001||n>10000||!Number.isFinite(n)))return true;
 if(folds.length){const finishedHeight=Math.max(...shifted.map(p=>p[1]))-Math.min(...shifted.map(p=>p[1])),levels=[0,...finishedFolds,finishedHeight];if(levels.some((n,i)=>i&&n-levels[i-1]<=.001)){draft.calculationError='Fold deductions leave an empty or reversed panel section.';return true;}}
 draft.calculationError='';draft.folds=finishedFolds;es.forEach((e,i)=>e.finished=lengths[i]);return true;
}
function initialiseSiteFolds(draft){
 if(Array.isArray(draft.siteFolds))return;
 if(!(draft.folds||[]).length){draft.siteFolds=[];return;}
 if(draft.dimensionSource==='site-outline-1mm-fold-allowance')draft.siteFolds=[...draft.folds].sort((a,b)=>a-b).map((f,i)=>Number((f+2*(i+1)).toFixed(6)));
 else draft.calculationError='Enter the original site fold heights to recalculate this older draft.';
}
function recalculateEditedOutline(){
 recalculateOutline(spec);
 const inputs=$('edges').querySelectorAll('input[aria-label="finished length in mm"]');
 spec.edges.forEach((e,i)=>{if(inputs[i])inputs[i].value=e.finished??'';});
 notice(!spec.calculationError?'Finished dimensions recalculated. Review them before generating.':'Existing measurements kept. Resolve the panel checks to recalculate.');
}
function currentIssues(draft){
 if(draft.measuredEdges)return PanelMeasuredOutline.validate(draft);
 const issues=[],valid=v=>typeof v==='number'&&Number.isFinite(v)&&v>=.001&&v<=10000;
 if(draft.calculationError){const check=structuredClone(draft);recalculateOutline(check);if(check.calculationError)issues.push(check.calculationError);}
 if(!/^[A-Za-z0-9][A-Za-z0-9 _.-]{0,59}$/.test(draft.panelId||''))issues.push('Enter a panel ID using letters, numbers, spaces or hyphens.');
 if(!Array.isArray(draft.edges)||draft.edges.length<4||draft.edges.length>32)return [...issues,'Use 4 to 32 perimeter edges.'];
 const vectors={right:[1,0],up:[0,1],left:[-1,0],down:[0,-1]};
 for(const key of ['site','finished']){
  let x=0,y=0,complete=true;
  draft.edges.forEach((e,i)=>{if(!valid(e[key])){issues.push('Edge '+(i+1)+' '+key+' must be between 0.001 and 10000 mm.');complete=false;}if(!vectors[e.direction]||!codes.includes(e.code)){complete=false;return;}if(valid(e[key])){x+=vectors[e.direction][0]*e[key];y+=vectors[e.direction][1]*e[key];}});
  if(complete&&Math.hypot(x,y)>.001)issues.push(key+' dimensions do not close: horizontal difference '+Number(x.toFixed(3))+', vertical difference '+Number(y.toFixed(3))+' mm.');
 }
 if(draft.unsupported)issues.push('This reading contains unsupported or uncertain geometry. Review the original reading notes; a field edit alone does not clear that flag.');
 return issues;
}
function renderQuestions(){
 $('folds').dataset.finishedFolds=JSON.stringify(spec?.folds||[]);$('folds').dataset.foldLines=JSON.stringify(spec?.foldLines||[]);
 $('questions').replaceChildren();if(!spec){$('questions').hidden=true;return;}
 const issues=currentIssues({...spec,panelId:$('panelid').value.trim()}),notes=spec.questions||[];
 const foldNotes=spec.folds?.length&&Array.isArray(spec.siteFolds)?['Finished fold heights from bottom: '+spec.folds.join(', ')+' mm.']:[];
 // Retain validation data for red field highlights without the summary box.
 $('questions').hidden=true;
 for(const [title,items] of [['Current panel checks',issues],['Calculated folds',foldNotes],['Original sketch-reading notes (not updated by edits)',notes]]){
  if(!items.length)continue;const h=document.createElement('strong');h.textContent=title;$('questions').append(h);
  for(const item of items){const p=document.createElement('p');p.textContent=item;$('questions').append(p);}
 }
}
function renderSpec(){if(spec.measuredEdges)recalculateOutline(spec);PanelMeasuredOutline.show(spec);if(spec.measuredEdges){invalidate();$("panelid").value=spec.panelId||"";$("edges").replaceChildren();renderQuestions();return;}recalculateOutline(spec);invalidate();$('panelid').value=spec.panelId||'';$('folds').value=(spec.siteFolds||[]).join(', ');$('folds').setAttribute('aria-label','Site fold heights from bottom (mm)');const label=document.querySelector('label[for=folds]');if(label)label.textContent='Site fold heights from bottom (mm)';$('edges').replaceChildren(...spec.edges.map(edgeRow));renderQuestions();}
function example(){return {panelId:'Z3-130',edges:[['Bottom','right','NT',700,698],['Lower right','up','B',300,298],['Right shoulder','left','S',150,150],['Right stem','up','RE',200,200],['Top','left','RE',400,398],['Left stem','down','RE',200,200],['Left shoulder','left','S',150,150],['Lower left','down','B',300,298]].map(([name,direction,code,site,finished])=>({name,direction,code,site,finished})),folds:[],questions:[],unsupported:false};}
function collect(){if(!spec)throw Error('Load a sketch or start a panel first.');return {...spec,panelId:$('panelid').value.trim(),reviewed:!!result};}
function download(data,type,filename){const url=URL.createObjectURL(new Blob([data],{type}));const a=document.createElement('a');a.href=url;a.download=filename;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);}
$('loginform').onsubmit=e=>{e.preventDefault();run(async()=>{const form=new FormData(e.target);const data=await api('/login',{username:form.get('username'),pin:form.get('pin')});if(data.mustChangePin)throw Error('Set your new PIN in the main PanelStock app, then return here.');session=data;sessionStorage.setItem(KEY,JSON.stringify(data));e.target.reset();await verify();notice('Signed in. Load a sketch or start with a test panel.');});};
async function verify(){const data=await api('/session');if(!data.isAdmin&&data.taskAccess?.['factory.cad']!==true){session=null;sessionStorage.removeItem(KEY);showSession();throw Error('This account needs Panel CAD access.');}session={...session,...data};showSession();await loadProjectOptions();}
$('signout').onclick=()=>run(async()=>{await saveProject();try{await api('/logout',{});}finally{session=null;sessionStorage.removeItem(KEY);spec=null;invalidate();$('edges').replaceChildren();$('file').value='';showSession();notice('Signed out.');}});
$('example').onclick=()=>{addPanel(example(),'Z3-130 test');notice('Z3-130 loaded. Review the details before generating.');};
$('blank').onclick=()=>{const draft={panelId:'',edges:['right','up','left','down'].map((direction,i)=>({name:['Bottom','Right','Top','Left'][i],direction,code:'B',site:null,finished:null})),folds:[],questions:[],unsupported:false};addPanel(draft,'New rectangle');notice('Enter the site and finished lengths.');};
for(const id of ['panelid','folds'])$(id).addEventListener('input',()=>{invalidate();if(id==='panelid'&&spec)spec.panelId=$('panelid').value;if(id==='folds'&&spec){const text=$('folds').value.trim();spec.siteFolds=text?text.split(',').map(x=>x.trim()===''?NaN:Number(x.trim())):[];recalculateEditedOutline();}renderQuestions();});
async function correctOutline(file){if(panelIndex<0)addPanel(spec,file.name);panels[panelIndex].file=file;const original=panels[panelIndex].correctionRecovery||spec;const corrected=await PanelOutlineCorrection.open(file,original,async outline=>{const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=reject;reader.readAsDataURL(file);});const response=await api('/cad/analyse',{filename:file.name,mime:file.type,data,outline});if(!response.spec?.edges||response.spec.edges.length!==outline.edges.length||response.spec.edges.some((e,i)=>e.start?.x!==outline.edges[i].start.x||e.start?.y!==outline.edges[i].start.y))throw Error('The reader did not preserve your traced corners. Your entries have been kept.');return response.spec;},draft=>{const p=panels[panelIndex];if(p){p.correctionRecovery=draft;projectDirty=true;projectRevision++;saveProject().catch(()=>{});}});if(!corrected)return;delete panels[panelIndex].correctionRecovery;recalculateOutline(corrected);spec=corrected;const p=panels[panelIndex];if(p){p.error=null;p.file=file;p.spec=spec;p.result=null;p.reviewed=false;}else{addPanel(spec,file.name);}renderSpec();rememberPanel();notice('Corrected outline applied. Review dimensions, folds and edge types before generating.');}
projectIcon($('correctoutline'),'Correct outline on sketch','M6 4h10M4 6v12M6 20h5M2 2h4v4H2ZM16 2h4v4h-4ZM2 18h4v4H2ZM12 21l1-5 7-7 3 3-7 7-4 2ZM18 11l3 3');
$('correctoutline').onclick=()=>{if(busy)return;const file=panels[panelIndex]?.file;if(file)run(()=>correctOutline(file));else $('correctionsketch').click();};
$('correctionsketch').onchange=()=>{const file=$('correctionsketch').files[0];$('correctionsketch').value='';if(file)run(async()=>{if(!['image/png','image/jpeg'].includes(file.type)||file.size>6*1024*1024)throw Error('Choose a PNG or JPEG sketch up to 6 MB.');await correctOutline(file);});};
$('file').multiple=true;
const uploadFileButton=document.createElement('button');uploadFileButton.type='button';uploadFileButton.className='project-upload-button';uploadFileButton.textContent='Upload file';uploadFileButton.setAttribute('aria-label','Upload PDF or sketch image');uploadFileButton.onclick=()=>{if(!busy)$('file').click();};const fileLabel=$('file').closest('label');fileLabel.hidden=true;fileLabel.before(uploadFileButton);
$('file').onchange=async()=>{if(busy)return;const files=[...$('file').files];if(!files.length)return;await run(async()=>{
 for(const file of files){const pdf=file.type==='application/pdf'||/\.pdf$/i.test(file.name);if(!pdf&&!['image/png','image/jpeg'].includes(file.type))throw Error('Choose PDF, PNG or JPEG files.');if(file.size>(pdf?25:6)*1024*1024)throw Error(file.name+': maximum '+(pdf?25:6)+' MB per file.');}
 uploadedSketchFiles=files;updateProjectPdf();queueProjectSave();notice(files.length===1?'File loaded. Click Highlight panels when ready.':files.length+' files loaded. Click Highlight panels when ready.');
 });$('file').value='';};
$('analyse').hidden=true;
$('analyse').onclick=()=>run(async()=>{rememberPanel();const pending=panels.filter(p=>p.file&&!p.spec);if(!pending.length)throw Error('Choose one or more new sketch files first.');let completed=0,failed=0;
 for(const p of pending){if(!session)break;notice('Reading '+(completed+failed+1)+' of '+pending.length+': '+p.name);try{const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=reject;reader.readAsDataURL(p.file);});const response=await api('/cad/analyse',{filename:p.file.name,mime:p.file.type,data});p.spec=response.spec;p.error=null;p.message='Sketch read. Review dimensions and edge types.';completed++;}catch(e){if(!session)throw e;p.error=e.name==='TimeoutError'?'This request timed out. Upload the sketch again and highlight the panel to retry.':e.message||'Could not read this sketch. Upload the sketch again and highlight the panel to retry.';p.message=p.error;failed++;}}
 if(!session)return;const target=panelIndex;panelIndex=-1;selectPanel(target);notice(panels[target]?.error||completed+' sketches read'+(failed?'; '+failed+' could not be read. Use the arrows to review. Upload and highlight any failed panels again to retry.':'. Use the arrows to review each panel.'));});
function generationErrorBox(){let box=$('generation-error');if(!box){box=document.createElement('div');box.id='generation-error';box.className='cad-error-message';box.setAttribute('role','alert');box.style.cssText='white-space:pre-line;margin:12px 0;padding:12px 16px;border-left:4px solid #b42318;background:#fff2f0;color:#8a1c13;border-radius:6px';$('generate').parentElement.insertAdjacentElement('afterend',box);}return box;}
$('generate').onclick=()=>run(async()=>{const errorBox=generationErrorBox();errorBox.hidden=true;errorBox.textContent='';result=null;$('preview').hidden=true;$('download').disabled=true;try{const request=PanelSketchComponents.prepareGeneration({...collect(),reviewed:true});recalculateOutline(request);const issues=currentIssues(request);if(issues.length)throw Error(issues.join('\n'));const v=version;const generated=await api('/cad/generate',request);if(version!==v)throw Error('Details changed. Generate a fresh drawing.');result=generated;panels[panelIndex].generatedSpec=drawingSpecKey(collect());if(previewURL)URL.revokeObjectURL(previewURL);previewURL=URL.createObjectURL(new Blob([result.svg],{type:'image/svg+xml'}));$('preview').src=previewURL;$('preview').hidden=false;renderDrawingChecks(result);notice('Drawing ready. Check the preview before downloading.');}catch(error){const reason=error.name==='TimeoutError'?'The drawing request timed out. Please try again.':error.message||'The server could not be reached. Check your connection and try again.';errorBox.textContent='Drawing could not be generated.\n'+reason;errorBox.hidden=false;$('validation').textContent='No drawing generated. See the reason above.';errorBox.scrollIntoView({block:'nearest',behavior:'smooth'});throw error;}});
$('download').onclick=()=>{if(result)download(result.dxf,'application/dxf',result.filename);};
function chooseCombinedDrawings(){return new Promise(resolve=>{
 const dialog=document.createElement('dialog');dialog.className='combine-picker';const header=document.createElement('header'),body=document.createElement('div'),footer=document.createElement('footer');body.className='combine-body';dialog.append(header,body,footer);
 const title=document.createElement('h2');title.textContent='Choose drawings to combine';title.id='combine-title';dialog.setAttribute('aria-labelledby',title.id);header.append(title);
 const info=document.createElement('p');info.textContent='Selected drawings will be spaced apart in one DXF.';header.append(info);
 const all=document.createElement('button'),none=document.createElement('button');all.type=none.type='button';all.textContent='Select all';none.textContent='Select none';const toolbar=document.createElement('div');toolbar.className='combine-toolbar';toolbar.append(all,none);body.append(toolbar);
 const list=document.createElement('div');list.className='combine-list';body.append(list);
 const entries=[];
 panels.forEach((panel,i)=>{
  const drawing=i===panelIndex?result:panel.result;
  const row=document.createElement('div');row.className='combine-row';const choice=document.createElement('label');choice.className='combine-choice';
  const input=document.createElement('input');input.type='checkbox';input.checked=!!drawing?.dxf;input.disabled=!drawing?.dxf;input.style.cssText='width:16px;height:16px;min-height:0;padding:0;margin:0;flex:0 0 16px';
  const caption=document.createElement('span');caption.textContent=(i+1)+'. '+(panel.spec?.panelId||drawing?.filename||panel.name||'Panel');
  choice.append(input,caption);row.append(choice);if(!drawing?.dxf){row.classList.add('is-unavailable');const reason=document.createElement('small');reason.textContent='Generate drawing first';caption.append(document.createElement('br'),reason);}list.append(row);if(drawing?.dxf){const entry={input,drawing,row,buttons:[]};entries.push(entry);for(const [text,step] of [['↑',-1],['↓',1]]){const button=document.createElement('button');button.type='button';button.textContent=text;button.className='combine-move';entry.buttons.push(button);button.title=step<0?'Move up':'Move down';button.setAttribute('aria-label',(step<0?'Move up ':'Move down ')+caption.textContent);button.onclick=e=>{e.preventDefault();const from=entries.indexOf(entry),to=from+step;if(to<0||to>=entries.length)return;[entries[from],entries[to]]=[entries[to],entries[from]];entries.forEach(e=>list.append(e.row));list.querySelectorAll('.is-unavailable').forEach(r=>list.append(r));update();button.focus();};row.append(button);}}input.onchange=update;
 });
 const gapLabel=document.createElement('label');gapLabel.textContent='Gap between drawings (mm)';const gap=document.createElement('input');gap.type='number';gap.min='20';gap.max='2000';gap.value='250';gapLabel.append(gap);gapLabel.className='combine-gap';body.append(gapLabel);
 const previewButton=document.createElement('button');previewButton.type='button';previewButton.textContent='Preview layout';footer.append(previewButton);
 const preview=document.createElement('img');preview.alt='Combined DXF layout';preview.style.cssText='width:100%;max-height:50vh;object-fit:contain';preview.hidden=true;body.append(preview);
 let cached=null,previewUrl=null,revision=0,previewBusy=false;
 const count=document.createElement('p');count.setAttribute('aria-live','polite');count.className='combine-status';footer.prepend(count);
 const apply=document.createElement('button'),cancel=document.createElement('button');apply.type=cancel.type='button';apply.textContent='Download selected';apply.className='primary';cancel.textContent='Cancel';footer.append(cancel,apply);
 function update(){entries.forEach((entry,i)=>{entry.buttons[0].disabled=i===0;entry.buttons[1].disabled=i===entries.length-1;entry.row.classList.toggle('is-selected',entry.input.checked);});revision++;cached=null;preview.hidden=true;const n=entries.filter(e=>e.input.checked).length;count.textContent=n+' drawing'+(n===1?'':'s')+' selected. Preview the layout before downloading.';apply.disabled=true;previewButton.disabled=!n||previewBusy;}
 gap.oninput=update;
 previewButton.onclick=async()=>{if(previewBusy)return;const spacing=Number(gap.value);if(!gap.value||!Number.isFinite(spacing)||spacing<20||spacing>2000){count.textContent='Enter a gap from 20 to 2000 mm.';return;}const version=revision;previewBusy=true;previewButton.disabled=true;apply.disabled=true;count.textContent='Preparing layout…';try{const payload=combinedPayload(entries.filter(e=>e.input.checked).map(e=>e.drawing));const drawing=await api('/cad/generate',{...payload,gap:spacing,preview:true});if(version!==revision||!dialog.isConnected)return;if(!drawing.svg)throw Error('The layout preview is unavailable.');cached=drawing;if(previewUrl)URL.revokeObjectURL(previewUrl);previewUrl=URL.createObjectURL(new Blob([drawing.svg],{type:'image/svg+xml'}));preview.src=previewUrl;preview.hidden=false;count.textContent=drawing.panelCount+' drawings ready. Download uses this exact layout.';apply.disabled=false;}catch(error){if(dialog.isConnected)count.textContent=error.message||'Could not prepare the layout.';}finally{previewBusy=false;previewButton.disabled=!entries.some(e=>e.input.checked);}};
 function close(value){revision++;if(previewUrl)URL.revokeObjectURL(previewUrl);dialog.close();dialog.remove();resolve(value);}
 all.onclick=()=>{entries.forEach(e=>e.input.checked=true);update();};none.onclick=()=>{entries.forEach(e=>e.input.checked=false);update();};
 apply.onclick=()=>{if(cached)close(cached);};cancel.onclick=()=>close(null);dialog.oncancel=e=>{e.preventDefault();close(null);};
 document.body.append(dialog);update();dialog.showModal();
});}
function batchSummary(items){
 const roundLength=length=>Number.isFinite(length)?Math.ceil(length/5)*5:length;
 const panelCounts=new Map(),lengthCounts=new Map();let stiffeners=0,unknownLengths=0;const tags=[];let missingTags=0;
 for(const item of items){
  const quantity=Number.isInteger(item.quantity)&&item.quantity>0?item.quantity:1;
  panelCounts.set(item.name,(panelCounts.get(item.name)||0)+quantity);
  const v=item.drawing.validation||{};
  if(!Array.isArray(v.fabricationTags))missingTags++;else for(const tag of v.fabricationTags)tags.push([item.name,tag.edge,tag.type,roundLength(tag.length),tag.quantity*quantity]);
  for(const plan of v.stiffeners||(v.stiffener?[v.stiffener]:[])){
   stiffeners+=quantity;const length=plan.length??(plan.start&&plan.end?Math.hypot(plan.end[0]-plan.start[0],plan.end[1]-plan.start[1]):null);
   if(!Number.isFinite(length)||length<=0){unknownLengths+=quantity;continue;}
   const key=roundLength(length);lengthCounts.set(key,(lengthCounts.get(key)||0)+quantity);
  }
 }
 return {panels:[...panelCounts],lengths:[...lengthCounts].sort((a,b)=>a[0]-b[0]),count:items.length,panelQuantity:[...panelCounts.values()].reduce((a,b)=>a+b,0),stiffeners,unknownLengths,tags,missingTags};
}
function printDrawingSummary(content,title){
 const popup=window.open('','_blank','width=900,height=800');
 if(!popup){notice('Allow pop-ups for PanelStock, then select Print summary again.');return;}
 popup.opener=null;const doc=popup.document;doc.title=title;
 const style=doc.createElement('style');style.textContent='@page{size:A4;margin:16mm}body{font:12pt Arial,sans-serif;color:#111;margin:24px;line-height:1.4}h2{font-size:20pt;overflow-wrap:anywhere}h3{font-size:14pt;margin-top:24px;break-after:avoid}table{width:100%;border-collapse:collapse;margin:12px 0 24px}th,td{text-align:left;padding:8px;border-bottom:1px solid #aaa;overflow-wrap:anywhere}th{background:#eee}thead{display:table-header-group}tr{break-inside:avoid}p{font-size:10pt}button{padding:10px 18px;margin-bottom:16px}.summary-eyebrow{font-size:9pt;letter-spacing:2px}.summary-project{font-size:13pt}.summary-stats{display:flex;gap:32px;margin:20px 0}.summary-stats strong{font-size:20pt;display:block}.summary-stats span{font-size:10pt}.summary-number{text-align:right;font-variant-numeric:tabular-nums}.summary-warning{border-left:3px solid #777;padding:8px}.summary-note{color:#555}.summary-section{margin-top:24px}@media print{body{margin:0}button{display:none}}';doc.head.append(style);
 const heading=doc.createElement('p');heading.textContent='PanelStock · Prepared '+new Date().toLocaleString('en-AU',{timeZone:'Australia/Brisbane'})+' (Brisbane)';doc.body.append(heading);
 for(const child of content.children){if(child.tagName==='BUTTON'||child.classList.contains('summary-footer'))continue;const copy=doc.importNode(child,true);copy.querySelectorAll('button').forEach(b=>b.remove());doc.body.append(copy);}
 const print=doc.createElement('button');print.textContent='Print / Save as PDF';print.onclick=()=>{popup.focus();popup.print();};doc.body.prepend(print);
 popup.focus();popup.setTimeout(()=>popup.print(),150);
}
const summaryButton=document.createElement('button');summaryButton.type='button';projectIcon(summaryButton,'Drawing summary','M8 4H5v18h14V4h-3M9 2h6v4H9V2ZM8 10h8M8 14h8M8 18h5');$('downloadall').after(summaryButton);
summaryButton.onclick=()=>{
 if(busy)return;const items=panels.flatMap((p,i)=>{const drawing=i===panelIndex?result:p.result;return drawing?.dxf?[{name:p.spec?.panelId||p.name||drawing.filename,quantity:p.quantity||1,drawing}]:[];});
 const summary=batchSummary(items),dialog=document.createElement('dialog');dialog.className='drawing-summary';dialog.setAttribute('aria-labelledby','drawing-summary-title');
 const header=document.createElement('header');header.className='summary-header';
 const eyebrow=document.createElement('p');eyebrow.className='summary-eyebrow';eyebrow.textContent='FABRICATION';header.append(eyebrow);
 const title=document.createElement('h2');title.id='drawing-summary-title';title.textContent='Drawing summary';header.append(title);
 const project=document.createElement('p');project.className='summary-project';project.textContent=$('projectname').value.trim()||'Untitled project';header.append(project);dialog.append(header);
 const body=document.createElement('div');body.className='summary-body';dialog.append(body);
 const stats=document.createElement('div');stats.className='summary-stats';
 for(const [value,label] of [[summary.panelQuantity,'Panels'],[summary.tags.reduce((n,t)=>n+Number(t[4]||0),0),'Tag pieces'],[summary.stiffeners,'Stiffeners']]){const card=document.createElement('div'),number=document.createElement('strong'),caption=document.createElement('span');number.textContent=value;caption.textContent=label;card.append(number,caption);stats.append(card);}body.append(stats);
 const warning=text=>{const p=document.createElement('p');p.className='summary-warning';p.textContent=text;body.append(p);};
 if(panels.length>summary.count)warning((panels.length-summary.count)+' panels have not been generated and are not included.');
 if(summary.missingTags)warning('Regenerate '+summary.missingTags+' drawing'+(summary.missingTags===1?'':'s')+' to include their fabrication tags.');
 if(summary.unknownLengths)warning(summary.unknownLengths+' stiffener lengths are unavailable. Regenerate those drawings.');
 const addTable=(heading,columns,rows,numeric=[])=>{const section=document.createElement('section');section.className='summary-section';const h=document.createElement('h3');h.textContent=heading;section.append(h);if(!rows.length){const empty=document.createElement('p');empty.textContent='No '+heading.toLowerCase()+' to list.';section.append(empty);}else{const wrap=document.createElement('div');wrap.className='summary-table-wrap';const table=document.createElement('table'),head=document.createElement('tr');for(const [i,text] of columns.entries()){const th=document.createElement('th');th.scope='col';th.textContent=text;if(numeric.includes(i))th.className='summary-number';head.append(th);}const thead=document.createElement('thead');thead.append(head);table.append(thead);const tbody=document.createElement('tbody');for(const row of rows){const tr=document.createElement('tr');for(const [i,text] of row.entries()){const td=document.createElement('td');td.textContent=String(text);if(numeric.includes(i))td.className='summary-number';tr.append(td);}tbody.append(tr);}table.append(tbody);wrap.append(table);section.append(wrap);}body.append(section);return section;};
 const tags=addTable('Fabrication tags',['Panel ID','Section','Type','Cut length (mm)','Qty'],summary.tags,[1,3,4]);
 const tagNote=document.createElement('p');tagNote.className='summary-note';tagNote.textContent='B/S and FE with-tag pieces include 5 mm beyond each end hole. Separate pieces are listed for each uninterrupted span.';tags.append(tagNote);
 const grid=document.createElement('div');grid.className='summary-grid';body.append(grid);
 grid.append(addTable('Stiffeners',['Cut length (mm)','Qty'],summary.lengths,[0,1]),addTable('Panels',['Panel ID','Quantity'],summary.panels,[1]));
 const note=document.createElement('p');note.className='summary-note';note.textContent='Cut lengths rounded up to 5 mm. Quantities include all copies of generated panels; matching panel IDs are grouped. DXF downloads contain one drawing per selected panel entry. Review dimensions before fabrication.';body.append(note);
 const footer=document.createElement('footer');footer.className='summary-footer';
 const print=document.createElement('button');print.type='button';print.className='primary';print.textContent='Print / Save PDF';print.onclick=()=>printDrawingSummary(dialog,project.textContent+' — drawing summary');
 const close=document.createElement('button');close.type='button';close.textContent='Close';close.onclick=()=>dialog.close();dialog.onclose=()=>dialog.remove();footer.append(close,print);dialog.append(footer);document.body.append(dialog);dialog.showModal();

};
function fabricationReadiness(panel,issues=[]){
 const reasons=[];const drawing=panel.result,v=drawing?.validation||{};
 if(!panel.spec)reasons.push('Read or complete the sketch.');
 if(panel.correctionRecovery)reasons.push('Apply or review the saved outline edits.');
 if(!drawing?.dxf)reasons.push(panel.generatedSpec?'Details changed or generation failed. Generate a fresh drawing.':'Generate a drawing.');
 if(panel.generatedSpec&&panel.spec&&panel.generatedSpec!==drawingSpecKey(panel.spec))reasons.push('Details changed since generation. Generate a fresh drawing.');
 if(!panel.reviewed)reasons.push('Review the panel dimensions and edge types.');
 reasons.push(...issues);
 if(drawing?.dxf){
  if(!Array.isArray(v.checks)||!v.checks.length)reasons.push('Regenerate to run the latest drawing checks.');
  if(!Array.isArray(v.fabricationTags))reasons.push('Regenerate to calculate fabrication tags.');
  if(!Array.isArray(v.stiffeners)&&!Object.hasOwn(v,'stiffener'))reasons.push('Regenerate to check stiffener requirements.');
  for(const plan of v.stiffeners||(v.stiffener?[v.stiffener]:[])){const length=plan.length??(plan.start&&plan.end?Math.hypot(plan.end[0]-plan.start[0],plan.end[1]-plan.start[1]):null);if(!Number.isFinite(length)||length<=0){reasons.push('Regenerate to calculate missing stiffener lengths.');break;}}
  for(const row of v.measurements||[]){if(row.status==='mismatch')reasons.push(row.label+': generated measurement does not match the expected value.');}
  reasons.push(...(v.warnings||[]).filter(warning=>warning!=='Test drawing: tooling width and depth remain unspecified.'&&!/^Holes omitted where required spacing cannot fit: sections [\d, ]+\.$/.test(warning)));
 }
 return [...new Set(reasons)];
}
function drawingSpecKey(value){const copy={...value};delete copy.reviewed;return JSON.stringify(copy);}
const readinessButton=document.createElement('button');readinessButton.type='button';projectIcon(readinessButton,'Fabrication readiness','M8 4H5v18h14V4h-3M9 2h6v4H9V2ZM8 14l3 3 5-6');summaryButton.after(readinessButton);
readinessButton.onclick=()=>{
 if(busy)return;rememberPanel();
 const finderKey=projectId||panels[0]||'empty',preferences=panelFinderPreferences.get(finderKey)||{query:'',status:'all'};
 const rows=panels.map((p,index)=>{let issues=[];try{if(p.spec)issues=currentIssues(structuredClone(p.spec));}catch{issues=['Review the panel geometry.'];}return {p,index,reasons:fabricationReadiness(p,issues)};});
 const ready=rows.filter(row=>!row.reasons.length).length,attention=rows.length-ready;
 const dialog=document.createElement('dialog');dialog.className='drawing-summary readiness-dialog';dialog.setAttribute('aria-labelledby','readiness-title');
 const header=document.createElement('header');header.className='summary-header';
 const title=document.createElement('h2');title.id='readiness-title';title.textContent='Fabrication readiness';
 const count=document.createElement('p');count.className='readiness-overview';count.textContent=!rows.length?'Add a panel to begin.':attention?ready+' of '+rows.length+' panels ready · '+attention+' need attention':'All '+ready+' panels ready';
 header.append(title,count);
 if(rows.length){const progress=document.createElement('progress');progress.max=rows.length;progress.value=ready;progress.setAttribute('aria-label','Panels ready for fabrication');header.append(progress);}
 dialog.append(header);
 const body=document.createElement('div');body.className='summary-body';
 for(const {p,index,reasons} of [...rows].sort((a,b)=>Number(!!b.reasons.length)-Number(!!a.reasons.length)||a.index-b.index)){
  const card=document.createElement('section');card.className='readiness-card'+(reasons.length?' needs-attention':'');
  const top=document.createElement('div');top.className='readiness-row';
  const identity=document.createElement('div');identity.className='readiness-identity';
  const heading=document.createElement('h3');heading.textContent=p.spec?.panelId||p.name||'Panel '+(index+1);
  const meta=document.createElement('span');meta.className='readiness-meta';meta.textContent='Panel '+(index+1)+' · Qty '+(p.quantity||1)+(index===panelIndex?' · Current panel':'');
  identity.append(heading,meta);
  const badge=document.createElement('span');badge.className='readiness-badge';badge.textContent=reasons.length?'Needs attention':'✓ Ready';
  const jump=document.createElement('button');jump.type='button';jump.className='readiness-open';jump.textContent=reasons.length?'Review':'Open';jump.setAttribute('aria-label',(reasons.length?'Review ':'Open ')+heading.textContent);
  jump.onclick=()=>{dialog.close();selectPanel(index);$('correctoutline').scrollIntoView({block:'center',behavior:'smooth'});$('correctoutline').focus({preventScroll:true});};
  top.append(identity,badge,jump);card.append(top);
  if(reasons.length){const list=document.createElement('ul');for(const reason of reasons){const li=document.createElement('li');li.textContent=reason;list.append(li);}card.append(list);}
  body.append(card);
 }
 dialog.append(body);
 const footer=document.createElement('footer');footer.className='summary-footer';const close=document.createElement('button');close.type='button';close.textContent='Close';close.onclick=()=>dialog.close();footer.append(close);dialog.append(footer);dialog.onclose=()=>dialog.remove();document.body.append(dialog);dialog.showModal();
};
function nextAttentionPanel(rows,current){
 const position=rows.findIndex(row=>row.index===current);
 const ordered=position<0?rows:[...rows.slice(position+1),...rows.slice(0,position)];
 return ordered.find(row=>row.reasons.length&&row.index!==current)||null;
}
function sortPanelRows(rows,order){
 return [...rows].sort((a,b)=>order==='id'?String(a.p.spec?.panelId||a.p.name||'').localeCompare(String(b.p.spec?.panelId||b.p.name||''),undefined,{numeric:true,sensitivity:'base'})||a.index-b.index:order==='attention'?(Number(b.reasons.length>0)-Number(a.reasons.length>0))||a.index-b.index:a.index-b.index);
}
function filterPanelRows(rows,query,status){
 const term=String(query||'').trim().toLowerCase(),compact=value=>String(value||'').toLowerCase().replace(/[\s_-]+/g,''),idTerm=compact(term);
 return rows.filter(row=>(!term||([row.p.spec?.panelId,row.p.name,row.p.file?.name].some(value=>String(value||'').toLowerCase().includes(term))||(!!idTerm&&compact(row.p.spec?.panelId).includes(idTerm))))&&(status==='all'||(status==='generated'&&!!row.p.result?.dxf)||(status==='ungenerated'&&!row.p.result?.dxf)||(status==='attention'&&row.reasons.length>0)||(status==='ready'&&row.reasons.length===0)));
}
const findPanelsButton=document.createElement('button');findPanelsButton.type='button';projectIcon(findPanelsButton,'Find panel','M21 21l-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z');navigator.append($('correctoutline'),findPanelsButton,sourcePdfButton);
const panelFinderPreferences=new Map();
findPanelsButton.title='Find panel (/)';findPanelsButton.setAttribute('aria-keyshortcuts','/');
document.addEventListener('keydown',event=>{
 if(event.defaultPrevented||event.repeat||event.isComposing||event.altKey||event.ctrlKey||event.metaKey||event.key!=='/')return;
 if(busy||document.querySelector('dialog[open]')||event.target.closest('input,textarea,select,[contenteditable=true]'))return;
 event.preventDefault();findPanelsButton.click();
});

findPanelsButton.onclick=()=>{
 if(busy)return;rememberPanel();
 const finderKey=projectId||panels[0]||'empty',preferences=panelFinderPreferences.get(finderKey)||{query:'',status:'all'};
 const rows=panels.map((p,index)=>{let issues=[];try{if(p.spec)issues=currentIssues(structuredClone(p.spec));}catch{issues=['Review geometry.'];}return {p,index,reasons:fabricationReadiness(p,issues)};});
 const dialog=document.createElement('dialog');dialog.className='project-picker panel-finder';dialog.setAttribute('aria-labelledby','panel-finder-title');
 const header=document.createElement('header');header.className='project-picker-header';const title=document.createElement('h2');title.id='panel-finder-title';title.textContent='Find a panel';header.append(title);
 const controls=document.createElement('div');controls.className='panel-finder-controls';const searchLabel=document.createElement('label');searchLabel.textContent='Panel ID or filename';const search=document.createElement('input');search.type='search';search.placeholder='Search panels…';searchLabel.append(search);
 const filterLabel=document.createElement('label');filterLabel.textContent='Show';const filter=document.createElement('select');for(const [value,text] of [['all','All panels'],['ready','Ready'],['generated','Generated'],['ungenerated','Not generated'],['attention','Needs attention']])filter.append(new Option(text,value));filterLabel.append(filter);const sortLabel=document.createElement('label');sortLabel.textContent='Sort';const sort=document.createElement('select');for(const [value,text] of [['original','Original order'],['id','Panel ID'],['attention','Needs attention first']])sort.append(new Option(text,value));sortLabel.append(sort);controls.append(searchLabel,filterLabel,sortLabel);header.append(controls);dialog.append(header);
 const jumpRow=document.createElement('div');jumpRow.className='panel-number-jump';const jumpLabel=document.createElement('label');jumpLabel.textContent='Panel number';const jumpInput=document.createElement('input');jumpInput.type='number';jumpInput.min='1';jumpInput.max=String(rows.length);jumpInput.step='1';jumpInput.placeholder='1–'+rows.length;jumpLabel.append(jumpInput);const jumpButton=document.createElement('button');jumpButton.type='button';jumpButton.textContent='Go';jumpButton.disabled=!rows.length;const jumpStatus=document.createElement('span');jumpStatus.setAttribute('role','status');const jump=()=>{const number=Number(jumpInput.value);if(!jumpInput.value.trim()||!Number.isInteger(number)||number<1||number>rows.length){jumpStatus.textContent='Enter a panel number from 1 to '+rows.length+'.';jumpInput.focus();return;}dialog.close();selectPanel(number-1);$('panelid').scrollIntoView({block:'center',behavior:'smooth'});$('panelid').focus({preventScroll:true});};jumpButton.onclick=jump;jumpInput.onkeydown=event=>{if(event.key==='Enter'){event.preventDefault();jump();}};jumpRow.append(jumpLabel,jumpButton,jumpStatus);header.append(jumpRow);
 const list=document.createElement('div');list.className='project-picker-list';dialog.append(list);
 const footer=document.createElement('footer');footer.className='project-picker-footer';const count=document.createElement('span');count.setAttribute('role','status');count.setAttribute('aria-live','polite');const close=document.createElement('button');close.type='button';close.textContent='Close';close.onclick=()=>dialog.close();const nextAttention=document.createElement('button');nextAttention.type='button';nextAttention.textContent='Next needing attention';nextAttention.title='Open the next panel with unresolved review issues';nextAttention.onclick=()=>{const next=nextAttentionPanel(sortPanelRows(rows,sort.value),panelIndex);if(!next)return;dialog.close();selectPanel(next.index);$('panelid').scrollIntoView({block:'center',behavior:'smooth'});$('panelid').focus({preventScroll:true});notice(next.reasons.join(' '));};footer.append(count,nextAttention,close);dialog.append(footer);
 const render=()=>{for(const option of filter.options){const labels={all:'All panels',ready:'Ready',generated:'Generated',ungenerated:'Not generated',attention:'Needs attention'};option.textContent=labels[option.value]+' ('+filterPanelRows(rows,'',option.value).length+')';}nextAttention.disabled=!nextAttentionPanel(sortPanelRows(rows,sort.value),panelIndex);list.replaceChildren();const matches=sortPanelRows(filterPanelRows(rows,search.value,filter.value),sort.value);const remaining=rows.filter(row=>row.reasons.length).length;count.textContent=matches.length+' of '+rows.length+' panels'+(rows.length?' · '+(remaining?remaining+' need attention':'All panels ready'):'');nextAttention.title=remaining===0?'All panels are ready':nextAttention.disabled?'The current panel is the only one needing attention':'Open the next panel with unresolved review issues';for(const {p,index,reasons} of matches){const button=document.createElement('button');button.type='button';button.className='panel-finder-item';button.dataset.current=String(index===panelIndex);if(index===panelIndex)button.setAttribute('aria-current','true');const name=document.createElement('strong');name.textContent=p.spec?.panelId||p.name||'Panel '+(index+1);const detail=document.createElement('span');detail.className='panel-finder-meta';detail.textContent='Panel '+(index+1)+' · Qty '+(p.quantity||1)+(index===panelIndex?' · Current panel':'');const badge=document.createElement('span');badge.className='panel-finder-badge '+(reasons.length?'needs-review':'is-ready');badge.textContent=reasons.length?'Needs attention':'Ready';const source=document.createElement('span');source.className='panel-finder-source';source.textContent=p.file?.name||p.name||'';source.title=source.textContent;button.append(name,detail,badge,source);if(reasons.length){const reason=document.createElement('span');reason.className='panel-finder-reason';reason.textContent=reasons[0]+(reasons.length>1?' (+'+(reasons.length-1)+' more)':'');reason.title=reasons.join('\n');badge.title=reasons.join('\n');button.append(reason);}button.onclick=()=>{dialog.close();selectPanel(index);$('panelid').scrollIntoView({block:'center',behavior:'smooth'});$('panelid').focus({preventScroll:true});};list.append(button);if(reasons.length){const actions=document.createElement('details');actions.className='panel-attention-actions';const summary=document.createElement('summary');summary.textContent='Review issues ('+reasons.length+')';actions.append(summary);for(const reason of reasons){const action=document.createElement('button');action.type='button';action.textContent=reason;action.onclick=()=>{dialog.close();selectPanel(index);const target=/outline|sketch|geometry|constraint/i.test(reason)?$('correctoutline'):/generat/i.test(reason)?$('generate'):/Review the panel dimensions/i.test(reason)?$('panelid'):$('panelid');target.scrollIntoView({block:'center',behavior:'smooth'});target.focus({preventScroll:true});notice(reason);};actions.append(action);}list.append(actions);}if(p.correctionRecovery){const discard=document.createElement('button');discard.type='button';discard.className='panel-draft-discard';discard.textContent='Discard saved outline edits';discard.title='Keep the current panel outline and remove its saved correction draft';discard.onclick=()=>{discard.hidden=true;const confirmation=document.createElement('div');confirmation.className='panel-draft-confirm';confirmation.setAttribute('role','group');confirmation.setAttribute('aria-label','Discard saved outline edits');const message=document.createElement('p');message.textContent='Discard saved outline edits for '+(p.spec?.panelId||p.name||'this panel')+'? Your current outline and generated drawing will be kept.';const keep=document.createElement('button');keep.type='button';keep.textContent='Keep edits';keep.onclick=()=>{confirmation.remove();discard.hidden=false;discard.focus();};const apply=document.createElement('button');apply.type='button';apply.className='danger';apply.textContent='Discard edits';apply.onclick=()=>{delete p.correctionRecovery;const row=rows.find(row=>row.index===index);row.reasons=row.reasons.filter(reason=>reason!=='Apply or review the saved outline edits.');queueProjectSave();render();search.focus();};confirmation.append(message,keep,apply);discard.after(confirmation);keep.focus();};list.append(discard);}}if(!matches.length){const empty=document.createElement('p');const hiddenMatches=filter.value!=='all'?filterPanelRows(rows,search.value,'all').length:0;empty.textContent=!rows.length?'Add a sketch or panel to begin.':hiddenMatches?hiddenMatches+' matching panel'+(hiddenMatches===1?' is':'s are')+' hidden by the status filter.':'No panels match this search. Try a different panel ID or filename.';list.append(empty);if(rows.length){const reset=document.createElement('button');reset.type='button';reset.textContent=hiddenMatches?'Show matching panels':'Clear search and filters';reset.onclick=()=>{if(!hiddenMatches)search.value='';filter.value='all';rememberFinder();search.focus();};list.append(reset);}}};
 dialog.addEventListener('keydown',event=>{
  if(event.altKey||event.ctrlKey||event.metaKey||!['ArrowDown','ArrowUp','Home','End','Enter'].includes(event.key))return;
  const onSearch=event.target===search,onResult=event.target.matches('.panel-finder-item');
  if(!onSearch&&!onResult)return;
  if(onSearch&&['Home','End','ArrowUp'].includes(event.key))return;
  const items=[...list.querySelectorAll('.panel-finder-item')];if(!items.length)return;
  if(event.key==='Enter'){if(onSearch){event.preventDefault();items[0].click();}return;}
  event.preventDefault();const current=items.indexOf(event.target);
  const next=event.key==='Home'?0:event.key==='End'?items.length-1:event.key==='ArrowDown'?Math.min(current+1,items.length-1):Math.max(current-1,0);
  items[next].focus({preventScroll:true});items[next].scrollIntoView({block:'nearest'});
 });
 search.setAttribute('aria-describedby','panel-finder-keyboard-help');
 const keyboardHelp=document.createElement('p');keyboardHelp.id='panel-finder-keyboard-help';keyboardHelp.className='small';keyboardHelp.textContent='Use ↓ to browse results, then Enter to open a panel.';header.append(keyboardHelp);
 search.value=preferences.query;filter.value=preferences.status;sort.value=preferences.sort||'original';
 const rememberFinder=()=>{panelFinderPreferences.set(finderKey,{query:search.value,status:filter.value,sort:sort.value});render();};
 const clear=document.createElement('button');clear.type='button';clear.textContent='Clear filters';clear.onclick=()=>{search.value='';filter.value='all';rememberFinder();search.focus();};const finderTools=document.createElement('details');finderTools.className='panel-finder-tools';const toolsTitle=document.createElement('summary');toolsTitle.textContent='More options';finderTools.append(toolsTitle);const toolActions=document.createElement('div');toolActions.className='panel-finder-tool-actions';toolActions.append(clear);finderTools.append(toolActions,jumpRow);header.append(finderTools);const showCurrent=document.createElement('button');showCurrent.type='button';showCurrent.textContent='Show current panel';showCurrent.disabled=panelIndex<0;showCurrent.onclick=()=>{search.value='';filter.value='all';rememberFinder();const current=list.querySelector('[data-current=true]');if(current){current.focus({preventScroll:true});current.scrollIntoView({block:'nearest',behavior:'smooth'});}};toolActions.append(showCurrent);
 search.oninput=rememberFinder;filter.onchange=rememberFinder;sort.onchange=rememberFinder;dialog.onclose=()=>{panelFinderPreferences.set(finderKey,{query:search.value,status:filter.value,sort:sort.value,scrollTop:list.scrollTop});dialog.remove();};render();document.body.append(dialog);dialog.showModal();search.focus({preventScroll:true});list.scrollTop=preferences.scrollTop||0;
};
function combinedFilename(name){
 const clean=String(name||'').trim().replace(/\.dxf$/i,'').replace(/[<>:"/\\|?*\x00-\x1f]/g,'_').replace(/[. ]+$/g,'').slice(0,100);
 return (clean||'Untitled project')+'.dxf';
}
function combinedPayload(drawings){
  if(drawings.length>30)throw Error('Choose no more than 30 drawings for one combined download.');
  const payload={drawings:drawings.map(r=>r.dxf)};
  if(new TextEncoder().encode(JSON.stringify(payload)).length>10*1024*1024)throw Error('These drawings are too large for one combined download. Select fewer drawings and try again.');
  return payload;
}
const sheetPlanButton=document.createElement('button');sheetPlanButton.type='button';projectIcon(sheetPlanButton,'Plan on SOH sheets','M2 3h20v18H2V3ZM5 6h6v12H5V6ZM14 6h5v5h-5V6ZM14 14h5v4h-5v-4Z');$('downloadall').after(sheetPlanButton);
sheetPlanButton.onclick=()=>run(async()=>{rememberPanel();if(!generatedDrawings().length)throw Error('Generate a panel drawing first.');await PanelSheetPlanner.open({canSendCnc:!!(session?.isAdmin||session?.taskAccess?.['factory.cnc']===true),projectName:$('projectname').value,orderNumber:projectDetails().orderNumber,jobReference:projectDetails().projectName,request:api,download,panels:panels.map((p,i)=>({name:p.spec?.panelId||p.name||'Panel',quantity:p.quantity||1,direction:p.spec?.panelDirection,dxf:(i===panelIndex?result:p.result)?.dxf}))});});
$('downloadall').onclick=()=>run(async()=>{if(!generatedDrawings().length)throw Error('Generate a drawing first.');const combined=await chooseCombinedDrawings();if(!combined){notice('Combined download cancelled.');return;}download(combined.dxf,'application/dxf',combinedFilename($('projectname').value));notice(combined.panelCount+' selected drawings downloaded in one DXF.');});

$('save').onclick=()=>{try{download(JSON.stringify({...collect(),reviewed:false},null,2),'application/json',($('panelid').value.replace(/[^a-z0-9_-]/gi,'_')||'panel')+'-draft.json');notice('Draft downloaded.');}catch(e){notice(e.message);}};
$('import').onchange=()=>run(async()=>{const file=$('import').files[0];if(!file||file.size>128*1024)throw Error('Choose a panel draft smaller than 128 KB.');const data=JSON.parse(await file.text());if(data.correctionDraft?(!Array.isArray(data.outlineSections)||data.outlineSections.length>32||!data.outlineSections.every(s=>s?.start&&Number.isFinite(s.start.x)&&Number.isFinite(s.start.y))):data.measuredEdges?PanelMeasuredOutline.validate(data).length:(!Array.isArray(data.edges)||data.edges.length<4||data.edges.length>32||!data.edges.every(e=>e&&codes.includes(e.code)&&directions.includes(e.direction))))throw Error('Invalid panel draft.');addPanel(data,file.name);notice('Draft loaded. Review it before generating.');});
(async()=>{for(const key of (window.parent!==window?['panelstock:session:v2']:[KEY,'panelstock:session:v2','panelstock:site-orders:session:v1'])){try{const saved=JSON.parse(sessionStorage.getItem(key)||'null');if(saved?.token&&saved.expiresAt>Date.now()){session=saved;break;}}catch{}}showSession();if(session)await run(async()=>{await verify();const saved=await PanelCadProjects.list(projectOwner()).catch(()=>[]);notice(saved.length?'Ready. Select Open project to restore your saved work.':'Ready. Upload a sketch or load a test panel.');});})();
})();





