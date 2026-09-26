/* CAD drafts never enter PanelStock's stock mutation queue. */
(()=>{'use strict';
const API='https://panelstock-reports.matthewlakerdis.workers.dev';
const $=id=>document.getElementById(id),KEY='panelstock:cad:session:v1';
let session=null,spec=null,result=null,busy=false,previewURL=null,version=0;
const panels=[];let panelIndex=-1;
const navigator=document.createElement('div');navigator.className='panel-navigator';navigator.innerHTML='<button id="previouspanel" type="button" aria-label="Previous panel">←</button><div><strong id="panelcount">No panels</strong><span id="panelsource"></span></div><button id="nextpanel" type="button" aria-label="Next panel">→</button>';
$('questions').before(navigator);
let projectId=null,projectName='Untitled project',projectTimer=null,projectSaveChain=Promise.resolve(),projectRevision=0,projectDirty=false;
const projectBar=document.createElement('section');projectBar.innerHTML='<div class="row"><label>Project name<input id="projectname" maxlength="100" value="Untitled project"></label><button id="saveproject" type="button">Save project</button><button id="openproject" type="button">Open project</button><button id="newproject" type="button">New project</button></div><p id="projectstatus" role="status">Projects save in this browser on this device.</p>';
$('workspace').prepend(projectBar);
function projectOwner(){return session?.username?PanelCadProjects.ownerKey(API,session.username):null;}
function queueProjectSave(){
 if(!projectOwner()||!panels.length)return;
 projectDirty=true;projectRevision++;clearTimeout(projectTimer);
 projectTimer=setTimeout(()=>{if(!busy)saveProject().catch(()=>{});else queueProjectSave();},700);
}
async function saveProject(){
 clearTimeout(projectTimer);const owner=projectOwner();if(!owner||!panels.length)return;
 rememberPanel();projectName=$('projectname').value.trim()||'Untitled project';projectId||=crypto.randomUUID();
 const id=projectId,revision=projectRevision,data=PanelCadProjects.snapshot(panels,panelIndex,projectName);
 $('projectstatus').textContent='Saving project…';
 const task=projectSaveChain.catch(()=>{}).then(()=>PanelCadProjects.save(owner,id,data));projectSaveChain=task;
 try{await task;if(projectOwner()===owner&&projectId===id&&projectRevision===revision){projectDirty=false;$('projectstatus').textContent='Saved in this browser at '+new Date(data.updatedAt).toLocaleTimeString()+'.';}}
 catch(error){if(projectOwner()===owner){projectDirty=true;$('projectstatus').textContent='Could not save this project. Browser storage may be full or unavailable. Keep this page open and download your drafts and drawings.';}throw error;}
}
function pickProject(items){return new Promise(resolve=>{
 const dialog=document.createElement('dialog'),title=document.createElement('h2');title.textContent='Open saved project';dialog.append(title);
 const select=document.createElement('select');select.size=Math.min(8,items.length);select.setAttribute('aria-label','Saved projects');
 items.forEach((p,i)=>select.append(new Option(p.name+' — '+p.panels.length+' panels — '+new Date(p.updatedAt).toLocaleString(),String(i))));select.value='0';dialog.append(select);
 const open=document.createElement('button');open.textContent='Open';open.type='button';const cancel=document.createElement('button');cancel.textContent='Cancel';cancel.type='button';dialog.append(open,cancel);
 const close=value=>{dialog.close();dialog.remove();resolve(value);};open.onclick=()=>close(items[Number(select.value)]);cancel.onclick=()=>close(null);dialog.oncancel=e=>{e.preventDefault();close(null);};document.body.append(dialog);dialog.showModal();
});}
$('saveproject').onclick=()=>run(()=>saveProject());
$('openproject').onclick=()=>run(async()=>{
 await saveProject();const owner=projectOwner(),items=await PanelCadProjects.list(owner);if(!items.length){notice('No projects saved in this browser yet.');return;}
 const saved=await pickProject(items);if(!saved||owner!==projectOwner())return;
 panels.length=0;panels.push(...saved.panels);panelIndex=-1;spec=null;result=null;projectId=saved.projectId;projectName=saved.name;$('projectname').value=projectName;projectRevision++;projectDirty=false;
 selectPanel(Math.max(0,Math.min(saved.index,panels.length-1)));notice('Project opened. Sketches and generated drawings restored.');
});
$('newproject').onclick=()=>run(async()=>{
 await saveProject();panels.length=0;panelIndex=-1;spec=null;result=null;projectId=null;projectName='Untitled project';$('projectname').value=projectName;projectRevision++;projectDirty=false;
 PanelMeasuredOutline.show(null);invalidate();$('edges').replaceChildren();$('panelid').value='';$('questions').replaceChildren();updateNavigator();notice('New project ready. Add a sketch to begin.');$('projectstatus').textContent='Projects save in this browser on this device.';
});
$('workspace').addEventListener('input',queueProjectSave);$('workspace').addEventListener('change',queueProjectSave);
window.addEventListener('beforeunload',e=>{if(projectDirty){e.preventDefault();e.returnValue='';}});

function generatedDrawings(){return panels.map((p,i)=>i===panelIndex?result:p.result).filter(r=>r?.dxf);}
function updateNavigator(){if($('downloadall')){$('downloadall').disabled=busy||!generatedDrawings().length;$('downloadall').textContent='Combine drawings ('+generatedDrawings().length+')';} $('panelcount').textContent=panels.length?'Panel '+(panelIndex+1)+' of '+panels.length:'No panels';$('panelsource').textContent=panels[panelIndex]?.name||'';$('previouspanel').disabled=busy||panelIndex<=0;$('nextpanel').disabled=busy||panelIndex>=panels.length-1;}
function rememberPanel(){if(panelIndex<0)return;const p=panels[panelIndex];if(spec)spec.panelId=$('panelid').value.trim();Object.assign(p,{spec,result,reviewed:$('confirmed').checked,message:$('notice').textContent});}
function selectPanel(index){if(index<0||index>=panels.length)return;rememberPanel();panelIndex=index;const p=panels[index];spec=p.spec||null;
 if(previewURL){URL.revokeObjectURL(previewURL);previewURL=null;}
 if(spec)renderSpec();else{PanelMeasuredOutline.show(null);invalidate();$('edges').replaceChildren();$('panelid').value='';$('folds').value='';renderQuestions();}
 result=p.result||null;$('confirmed').checked=!!p.reviewed;
 if(result){previewURL=URL.createObjectURL(new Blob([result.svg],{type:'image/svg+xml'}));$('preview').src=previewURL;$('preview').hidden=false;$('validation').textContent='Drawing ready for this panel.';}
 $('download').disabled=!result;notice(p.error||p.message||'Select Read sketches to read this file.');updateNavigator();}
function addPanel(draft,name){rememberPanel();panels.push({spec:draft,name,reviewed:false});panelIndex=-1;selectPanel(panels.length-1);}
$('previouspanel').onclick=()=>{if(!busy)selectPanel(panelIndex-1);};$('nextpanel').onclick=()=>{if(!busy)selectPanel(panelIndex+1);};
updateNavigator();
const codes=['B','S','NT','RE','FE','CR'],directions=['right','up','left','down'];
function notice(message){$('notice').textContent=message;}
function invalidate(){const errorBox=$('generation-error');if(errorBox)errorBox.hidden=true;version++;result=null;updateNavigator();$('download').disabled=true;$('confirmed').checked=false;$('preview').hidden=true;$('validation').textContent='Generate a new preview after reviewing your changes.';}
async function api(path,body){const token=session?.token;const response=await fetch(API+path,{method:body?'POST':'GET',headers:{...(token?{Authorization:'Bearer '+token}:{}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),cache:'no-store',signal:AbortSignal.timeout(95000)});const data=await response.json();if(response.status===401){session=null;sessionStorage.removeItem(KEY);showSession();}if(!response.ok)throw Error(data.error||'Request failed');return data;}
function showSession(){if(!session){clearTimeout(projectTimer);projectId=null;projectDirty=false;$('projectname').value='Untitled project';PanelMeasuredOutline.show(null);panels.length=0;panelIndex=-1;updateNavigator();spec=null;invalidate();$('edges').replaceChildren();$('panelid').value='';$('folds').value='';$('questions').replaceChildren();if(previewURL){URL.revokeObjectURL(previewURL);previewURL=null;}}$('login').hidden=!!session;$('workspace').hidden=!session;$('signout').hidden=!session;$('account').textContent=session?.username||'';}
async function run(action){if(busy)return;busy=true;for(const b of document.querySelectorAll('button'))b.disabled=true;notice('Working…');try{await action();}catch(e){notice(e.name==='TimeoutError'?'This request timed out. Please retry.':e.message||'Could not reach the server.');}finally{busy=false;for(const b of document.querySelectorAll('button'))b.disabled=false;$('download').disabled=!result;updateNavigator();queueProjectSave();}}
function edgeRow(edge,index){const tr=document.createElement('tr');tr.dataset.sections=JSON.stringify(edge.sections||[]);const name=document.createElement('input');name.value=edge.name||'Edge '+(index+1);name.maxLength=60;name.setAttribute('aria-label','Edge name');
 const fields=[name,...[directions,codes].map((options,j)=>{const select=document.createElement('select');select.setAttribute('aria-label',j?'Edge type':'Edge direction');for(const option of options){const el=document.createElement('option');el.value=option;el.textContent=option;select.append(el);}select.value=edge[j?'code':'direction'];return select;}),...['site','finished'].map(key=>{const input=document.createElement('input');input.type='number';input.min='.001';input.max='10000';input.step='any';input.value=edge[key]??'';input.setAttribute('aria-label',key+' length in mm');return input;})];
 for(const field of fields){const td=document.createElement('td');td.append(field);tr.append(td);field.addEventListener('input',()=>{const keys=['name','direction','code','site','finished'];const j=fields.indexOf(field);edge[keys[j]]=j>2?(field.value===''?null:Number(field.value)):field.value;if(j===2&&edge.sections){edge.sections.forEach(s=>s.code=edge.code);tr.dataset.sections=JSON.stringify(edge.sections);}invalidate();if([1,2,3].includes(j))recalculateEditedOutline();renderQuestions();});}
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
function collect(){if(!spec)throw Error('Load a sketch or start a panel first.');return {...spec,panelId:$('panelid').value.trim(),reviewed:$('confirmed').checked};}
function download(data,type,filename){const url=URL.createObjectURL(new Blob([data],{type}));const a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
$('loginform').onsubmit=e=>{e.preventDefault();run(async()=>{const form=new FormData(e.target);const data=await api('/login',{username:form.get('username'),pin:form.get('pin')});if(data.mustChangePin)throw Error('Set your new PIN in the main PanelStock app, then return here.');session=data;sessionStorage.setItem(KEY,JSON.stringify(data));e.target.reset();await verify();notice('Signed in. Load a sketch or start with a test panel.');});};
async function verify(){const data=await api('/session');if(!data.isAdmin&&data.taskAccess?.['factory.cnc']!==true){session=null;sessionStorage.removeItem(KEY);showSession();throw Error('This account needs Factory CNC access.');}session={...session,...data};showSession();}
$('signout').onclick=()=>run(async()=>{await saveProject();try{await api('/logout',{});}finally{session=null;sessionStorage.removeItem(KEY);spec=null;invalidate();$('edges').replaceChildren();$('file').value='';showSession();notice('Signed out.');}});
$('example').onclick=()=>{addPanel(example(),'Z3-130 test');notice('Z3-130 loaded. Review the details before generating.');};
$('blank').onclick=()=>{const draft={panelId:'',edges:['right','up','left','down'].map((direction,i)=>({name:['Bottom','Right','Top','Left'][i],direction,code:'B',site:null,finished:null})),folds:[],questions:[],unsupported:false};addPanel(draft,'New rectangle');notice('Enter the site and finished lengths.');};
$('addedge').onclick=()=>{if(!spec)spec={panelId:'',edges:[],folds:[],questions:[],unsupported:false};if(spec.edges.length>=32)return;spec.edges.push({name:'New edge',direction:'right',code:'B',site:null,finished:null});renderSpec();};
for(const id of ['panelid','folds'])$(id).addEventListener('input',()=>{invalidate();if(id==='panelid'&&spec)spec.panelId=$('panelid').value;if(id==='folds'&&spec){const text=$('folds').value.trim();spec.siteFolds=text?text.split(',').map(x=>x.trim()===''?NaN:Number(x.trim())):[];recalculateEditedOutline();}renderQuestions();});
async function correctOutline(file){if(panelIndex<0)addPanel(spec,file.name);panels[panelIndex].file=file;const original=panels[panelIndex].correctionRecovery||spec;const corrected=await PanelOutlineCorrection.open(file,original,async outline=>{const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=reject;reader.readAsDataURL(file);});const response=await api('/cad/analyse',{filename:file.name,mime:file.type,data,outline});if(!response.spec?.edges||response.spec.edges.length!==outline.edges.length||response.spec.edges.some((e,i)=>e.start?.x!==outline.edges[i].start.x||e.start?.y!==outline.edges[i].start.y))throw Error('The reader did not preserve your traced corners. Your entries have been kept.');return response.spec;},draft=>{const p=panels[panelIndex];if(p){p.correctionRecovery=draft;projectDirty=true;projectRevision++;saveProject().catch(()=>{});}});if(!corrected)return;delete panels[panelIndex].correctionRecovery;recalculateOutline(corrected);spec=corrected;const p=panels[panelIndex];if(p){p.error=null;p.file=file;p.spec=spec;p.result=null;p.reviewed=false;}else{addPanel(spec,file.name);}renderSpec();rememberPanel();notice('Corrected outline applied. Review dimensions, folds and edge types before generating.');}
$('correctoutline').onclick=()=>{if(busy)return;const file=panels[panelIndex]?.file;if(file)run(()=>correctOutline(file));else $('correctionsketch').click();};
$('correctionsketch').onchange=()=>{const file=$('correctionsketch').files[0];$('correctionsketch').value='';if(file)run(async()=>{if(!['image/png','image/jpeg'].includes(file.type)||file.size>6*1024*1024)throw Error('Choose a PNG or JPEG sketch up to 6 MB.');await correctOutline(file);});};
$('file').multiple=true;
$('file').onchange=async()=>{if(busy)return;const files=[...$('file').files];if(!files.length)return;let readSelection=false;await run(async()=>{
 const pdfs=[],additions=[];
 for(const file of files){
  const pdf=file.type==='application/pdf'||/\.pdf$/i.test(file.name);
  if(!pdf&&!['image/png','image/jpeg'].includes(file.type))throw Error('Choose PDF, PNG or JPEG files.');
  if(file.size>(pdf?25:6)*1024*1024)throw Error(file.name+': maximum '+(pdf?25:6)+' MB per file.');
  if(pdf)pdfs.push(file);else additions.push(file);
 }
 if(panels.length+additions.length>30)throw Error('Use up to 30 panels in one workspace.');
 if(pdfs.length){const selected=await PanelPdfSelection.open(pdfs,30-panels.length-additions.length);if(!selected.length){notice('PDF selection cancelled.');return;}additions.push(...selected);readSelection=true;}
 rememberPanel();const first=panels.length;additions.forEach(file=>panels.push({file,name:file.name,spec:null,result:null,reviewed:false}));panelIndex=-1;selectPanel(first);notice(additions.length+' panels added. Select Read sketches.');
 });$('file').value='';if(readSelection)$('analyse').click();};
$('analyse').textContent='Read sketches';
$('analyse').onclick=()=>run(async()=>{rememberPanel();const pending=panels.filter(p=>p.file&&!p.spec);if(!pending.length)throw Error('Choose one or more new sketch files first.');let completed=0,failed=0;
 for(const p of pending){if(!session)break;notice('Reading '+(completed+failed+1)+' of '+pending.length+': '+p.name);try{const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=reject;reader.readAsDataURL(p.file);});const response=await api('/cad/analyse',{filename:p.file.name,mime:p.file.type,data});p.spec=response.spec;p.error=null;p.message='Sketch read. Review dimensions and edge types.';completed++;}catch(e){if(!session)throw e;p.error=e.name==='TimeoutError'?'This request timed out. Select Read sketches to retry.':e.message||'Could not read this sketch. Select Read sketches to retry.';p.message=p.error;failed++;}}
 if(!session)return;const target=panelIndex;panelIndex=-1;selectPanel(target);notice(panels[target]?.error||completed+' sketches read'+(failed?'; '+failed+' could not be read. Use the arrows to review or retry.':'. Use the arrows to review each panel.'));});
function generationErrorBox(){let box=$('generation-error');if(!box){box=document.createElement('div');box.id='generation-error';box.setAttribute('role','alert');box.style.cssText='white-space:pre-line;margin:12px 0;padding:12px 16px;border-left:4px solid #b42318;background:#fff2f0;color:#8a1c13;border-radius:6px';$('generate').parentElement.insertAdjacentElement('afterend',box);}return box;}
$('generate').onclick=()=>run(async()=>{const errorBox=generationErrorBox();errorBox.hidden=true;errorBox.textContent='';result=null;$('preview').hidden=true;$('download').disabled=true;try{const request=PanelSketchComponents.prepareGeneration(collect());recalculateOutline(request);if(!request.reviewed)throw Error('Check the review box after reviewing your dimensions.');const issues=currentIssues(request);if(issues.length)throw Error(issues.join('\n'));const v=version;const generated=await api('/cad/generate',request);if(version!==v)throw Error('Details changed. Generate a fresh drawing.');result=generated;if(previewURL)URL.revokeObjectURL(previewURL);previewURL=URL.createObjectURL(new Blob([result.svg],{type:'image/svg+xml'}));$('preview').src=previewURL;$('preview').hidden=false;$('validation').textContent=`Closed CUT checked · ${result.validation.holes} holes · ${result.validation.routes} route lines · ${result.validation.stiffener?'Stiffener included':'No stiffener required'}`;notice('Drawing ready. Check the preview before downloading.');}catch(error){const reason=error.name==='TimeoutError'?'The drawing request timed out. Please try again.':error.message||'The server could not be reached. Check your connection and try again.';errorBox.textContent='Drawing could not be generated.\n'+reason;errorBox.hidden=false;$('validation').textContent='No drawing generated. See the reason above.';errorBox.scrollIntoView({block:'nearest',behavior:'smooth'});throw error;}});
$('download').onclick=()=>{if(result)download(result.dxf,'application/dxf',result.filename);};
function chooseCombinedDrawings(){return new Promise(resolve=>{
 const dialog=document.createElement('dialog');dialog.style.cssText='width:min(560px,90vw);max-height:85vh;border:1px solid #cbd5e1;border-radius:12px;padding:24px';
 const title=document.createElement('h2');title.textContent='Choose drawings to combine';dialog.append(title);
 const info=document.createElement('p');info.textContent='Selected drawings will be spaced apart in one DXF.';dialog.append(info);
 const all=document.createElement('button'),none=document.createElement('button');all.type=none.type='button';all.textContent='Select all';none.textContent='Select none';dialog.append(all,none);
 const list=document.createElement('div');list.style.cssText='max-height:45vh;overflow:auto;margin:16px 0';dialog.append(list);
 const entries=[];
 panels.forEach((panel,i)=>{
  const drawing=i===panelIndex?result:panel.result;
  const row=document.createElement('label');row.style.cssText='display:flex;align-items:center;gap:8px;padding:6px 0;margin:0;min-height:32px;line-height:20px';
  const input=document.createElement('input');input.type='checkbox';input.checked=!!drawing?.dxf;input.disabled=!drawing?.dxf;input.style.cssText='width:16px;height:16px;min-height:0;padding:0;margin:0;flex:0 0 16px';
  const caption=document.createElement('span');caption.textContent=(i+1)+'. '+(panel.spec?.panelId||drawing?.filename||panel.name||'Panel')+(drawing?.dxf?'':' — generate this drawing first');
  row.append(input,caption);list.append(row);if(drawing?.dxf)entries.push({input,drawing});input.onchange=update;
 });
 const count=document.createElement('p');count.setAttribute('aria-live','polite');dialog.append(count);
 const apply=document.createElement('button'),cancel=document.createElement('button');apply.type=cancel.type='button';apply.textContent='Download selected';apply.className='primary';cancel.textContent='Cancel';dialog.append(apply,cancel);
 function update(){const n=entries.filter(e=>e.input.checked).length;count.textContent=n+' drawing'+(n===1?'':'s')+' selected';apply.disabled=!n;}
 function close(value){dialog.close();dialog.remove();resolve(value);}
 all.onclick=()=>{entries.forEach(e=>e.input.checked=true);update();};none.onclick=()=>{entries.forEach(e=>e.input.checked=false);update();};
 apply.onclick=()=>close(entries.filter(e=>e.input.checked).map(e=>e.drawing));cancel.onclick=()=>close(null);dialog.oncancel=e=>{e.preventDefault();close(null);};
 document.body.append(dialog);update();dialog.showModal();
});}
function combinedPayload(drawings){
  if(drawings.length>30)throw Error('Choose no more than 30 drawings for one combined download.');
  const payload={drawings:drawings.map(r=>r.dxf)};
  if(new TextEncoder().encode(JSON.stringify(payload)).length>10*1024*1024)throw Error('These drawings are too large for one combined download. Select fewer drawings and try again.');
  return payload;
}
$('downloadall').onclick=()=>run(async()=>{if(!generatedDrawings().length)throw Error('Generate a drawing first.');const drawings=await chooseCombinedDrawings();if(!drawings){notice('Combined download cancelled.');return;}if(!drawings.length)return;notice('Combining selected drawings…');const combined=await api('/cad/generate',combinedPayload(drawings));download(combined.dxf,'application/dxf',combined.filename);notice(combined.panelCount+' selected drawings downloaded in one DXF.');});

$('save').onclick=()=>{try{download(JSON.stringify({...collect(),reviewed:false},null,2),'application/json',($('panelid').value.replace(/[^a-z0-9_-]/gi,'_')||'panel')+'-draft.json');notice('Draft downloaded.');}catch(e){notice(e.message);}};
$('import').onchange=()=>run(async()=>{const file=$('import').files[0];if(!file||file.size>128*1024)throw Error('Choose a panel draft smaller than 128 KB.');const data=JSON.parse(await file.text());if(data.correctionDraft?(!Array.isArray(data.outlineSections)||data.outlineSections.length>32||!data.outlineSections.every(s=>s?.start&&Number.isFinite(s.start.x)&&Number.isFinite(s.start.y))):data.measuredEdges?PanelMeasuredOutline.validate(data).length:(!Array.isArray(data.edges)||data.edges.length<4||data.edges.length>32||!data.edges.every(e=>e&&codes.includes(e.code)&&directions.includes(e.direction))))throw Error('Invalid panel draft.');addPanel(data,file.name);notice('Draft loaded. Review it before generating.');});
(async()=>{for(const key of (window.parent!==window?['panelstock:session:v2']:[KEY,'panelstock:session:v2','panelstock:site-orders:session:v1'])){try{const saved=JSON.parse(sessionStorage.getItem(key)||'null');if(saved?.token&&saved.expiresAt>Date.now()){session=saved;break;}}catch{}}showSession();if(session)await run(async()=>{await verify();const saved=await PanelCadProjects.list(projectOwner()).catch(()=>[]);notice(saved.length?'Ready. Select Open project to restore your saved work.':'Ready. Upload a sketch or load a test panel.');});})();
})();






