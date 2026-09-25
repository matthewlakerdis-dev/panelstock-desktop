/* CAD drafts never enter PanelStock's stock mutation queue. */
(()=>{'use strict';
const API='https://panelstock-reports.matthewlakerdis.workers.dev';
const $=id=>document.getElementById(id),KEY='panelstock:cad:session:v1';
let session=null,spec=null,result=null,busy=false,previewURL=null,version=0;
const panels=[];let panelIndex=-1;
const navigator=document.createElement('div');navigator.className='panel-navigator';navigator.innerHTML='<button id="previouspanel" type="button" aria-label="Previous panel">←</button><div><strong id="panelcount">No panels</strong><span id="panelsource"></span></div><button id="nextpanel" type="button" aria-label="Next panel">→</button>';
$('questions').before(navigator);
function updateNavigator(){ $('panelcount').textContent=panels.length?'Panel '+(panelIndex+1)+' of '+panels.length:'No panels';$('panelsource').textContent=panels[panelIndex]?.name||'';$('previouspanel').disabled=busy||panelIndex<=0;$('nextpanel').disabled=busy||panelIndex>=panels.length-1;}
function rememberPanel(){if(panelIndex<0)return;const p=panels[panelIndex];if(spec)spec.panelId=$('panelid').value.trim();Object.assign(p,{spec,result,reviewed:$('confirmed').checked,message:$('notice').textContent});}
function selectPanel(index){if(index<0||index>=panels.length)return;rememberPanel();panelIndex=index;const p=panels[index];spec=p.spec||null;
 if(previewURL){URL.revokeObjectURL(previewURL);previewURL=null;}
 if(spec)renderSpec();else{invalidate();$('edges').replaceChildren();$('panelid').value='';$('folds').value='';renderQuestions();}
 result=p.result||null;$('confirmed').checked=!!p.reviewed;
 if(result){previewURL=URL.createObjectURL(new Blob([result.svg],{type:'image/svg+xml'}));$('preview').src=previewURL;$('preview').hidden=false;$('validation').textContent='Drawing ready for this panel.';}
 $('download').disabled=!result;notice(p.error||p.message||'Select Read sketches to read this file.');updateNavigator();}
function addPanel(draft,name){rememberPanel();panels.push({spec:draft,name,reviewed:false});panelIndex=-1;selectPanel(panels.length-1);}
$('previouspanel').onclick=()=>{if(!busy)selectPanel(panelIndex-1);};$('nextpanel').onclick=()=>{if(!busy)selectPanel(panelIndex+1);};
updateNavigator();
const codes=['B','S','NT','RE','FE','CR'],directions=['right','up','left','down'];
function notice(message){$('notice').textContent=message;}
function invalidate(){version++;result=null;$('download').disabled=true;$('confirmed').checked=false;$('preview').hidden=true;$('validation').textContent='Generate a new preview after reviewing your changes.';}
async function api(path,body){const token=session?.token;const response=await fetch(API+path,{method:body?'POST':'GET',headers:{...(token?{Authorization:'Bearer '+token}:{}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),cache:'no-store',signal:AbortSignal.timeout(95000)});const data=await response.json();if(response.status===401){session=null;sessionStorage.removeItem(KEY);showSession();}if(!response.ok)throw Error(data.error||'Request failed');return data;}
function showSession(){if(!session){panels.length=0;panelIndex=-1;updateNavigator();spec=null;invalidate();$('edges').replaceChildren();$('panelid').value='';$('folds').value='';$('questions').replaceChildren();if(previewURL){URL.revokeObjectURL(previewURL);previewURL=null;}}$('login').hidden=!!session;$('workspace').hidden=!session;$('signout').hidden=!session;$('account').textContent=session?.username||'';}
async function run(action){if(busy)return;busy=true;for(const b of document.querySelectorAll('button'))b.disabled=true;notice('Working…');try{await action();}catch(e){notice(e.name==='TimeoutError'?'This request timed out. Please retry.':e.message||'Could not reach the server.');}finally{busy=false;for(const b of document.querySelectorAll('button'))b.disabled=false;$('download').disabled=!result;updateNavigator();}}
function edgeRow(edge,index){const tr=document.createElement('tr');tr.dataset.sections=JSON.stringify(edge.sections||[]);const name=document.createElement('input');name.value=edge.name||'Edge '+(index+1);name.maxLength=60;name.setAttribute('aria-label','Edge name');
 const fields=[name,...[directions,codes].map((options,j)=>{const select=document.createElement('select');select.setAttribute('aria-label',j?'Edge type':'Edge direction');for(const option of options){const el=document.createElement('option');el.value=option;el.textContent=option;select.append(el);}select.value=edge[j?'code':'direction'];return select;}),...['site','finished'].map(key=>{const input=document.createElement('input');input.type='number';input.min='.001';input.max='10000';input.step='any';input.value=edge[key]??'';input.setAttribute('aria-label',key+' length in mm');return input;})];
 for(const field of fields){const td=document.createElement('td');td.append(field);tr.append(td);field.addEventListener('input',()=>{const keys=['name','direction','code','site','finished'];const j=fields.indexOf(field);edge[keys[j]]=j>2?(field.value===''?null:Number(field.value)):field.value;if(j===2&&edge.sections){edge.sections.forEach(s=>s.code=edge.code);tr.dataset.sections=JSON.stringify(edge.sections);}invalidate();if([1,2,3].includes(j))recalculateEditedOutline();renderQuestions();});}
 const td=document.createElement('td'),remove=document.createElement('button');remove.className='remove-edge';remove.setAttribute('aria-label','Remove edge '+(index+1));remove.title='Remove edge';remove.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18M9 6V4h6v2M5 6l1 14h12l1-14M10 10v6M14 10v6"/></svg>';remove.onclick=()=>{spec.edges.splice(index,1);recalculateOutline(spec);renderSpec();};td.append(remove);tr.append(td);return tr;}
function recalculateOutline(draft){
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
function renderSpec(){recalculateOutline(spec);invalidate();$('panelid').value=spec.panelId||'';$('folds').value=(spec.siteFolds||[]).join(', ');$('folds').setAttribute('aria-label','Site fold heights from bottom (mm)');const label=document.querySelector('label[for=folds]');if(label)label.textContent='Site fold heights from bottom (mm)';$('edges').replaceChildren(...spec.edges.map(edgeRow));renderQuestions();}
function example(){return {panelId:'Z3-130',edges:[['Bottom','right','NT',700,698],['Lower right','up','B',300,298],['Right shoulder','left','S',150,150],['Right stem','up','RE',200,200],['Top','left','RE',400,398],['Left stem','down','RE',200,200],['Left shoulder','left','S',150,150],['Lower left','down','B',300,298]].map(([name,direction,code,site,finished])=>({name,direction,code,site,finished})),folds:[],questions:[],unsupported:false};}
function collect(){if(!spec)throw Error('Load a sketch or start a panel first.');return {...spec,panelId:$('panelid').value.trim(),reviewed:$('confirmed').checked};}
function download(data,type,filename){const url=URL.createObjectURL(new Blob([data],{type}));const a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
$('loginform').onsubmit=e=>{e.preventDefault();run(async()=>{const form=new FormData(e.target);const data=await api('/login',{username:form.get('username'),pin:form.get('pin')});if(data.mustChangePin)throw Error('Set your new PIN in the main PanelStock app, then return here.');session=data;sessionStorage.setItem(KEY,JSON.stringify(data));e.target.reset();await verify();notice('Signed in. Load a sketch or start with a test panel.');});};
async function verify(){const data=await api('/session');if(!data.isAdmin&&data.taskAccess?.['factory.cnc']!==true){session=null;sessionStorage.removeItem(KEY);showSession();throw Error('This account needs Factory CNC access.');}session={...session,...data};showSession();}
$('signout').onclick=()=>run(async()=>{try{await api('/logout',{});}finally{session=null;sessionStorage.removeItem(KEY);spec=null;invalidate();$('edges').replaceChildren();$('file').value='';showSession();notice('Signed out.');}});
$('example').onclick=()=>{addPanel(example(),'Z3-130 test');notice('Z3-130 loaded. Review the details before generating.');};
$('blank').onclick=()=>{const draft={panelId:'',edges:['right','up','left','down'].map((direction,i)=>({name:['Bottom','Right','Top','Left'][i],direction,code:'B',site:null,finished:null})),folds:[],questions:[],unsupported:false};addPanel(draft,'New rectangle');notice('Enter the site and finished lengths.');};
$('addedge').onclick=()=>{if(!spec)spec={panelId:'',edges:[],folds:[],questions:[],unsupported:false};if(spec.edges.length>=32)return;spec.edges.push({name:'New edge',direction:'right',code:'B',site:null,finished:null});renderSpec();};
for(const id of ['panelid','folds'])$(id).addEventListener('input',()=>{invalidate();if(id==='panelid'&&spec)spec.panelId=$('panelid').value;if(id==='folds'&&spec){const text=$('folds').value.trim();spec.siteFolds=text?text.split(',').map(x=>x.trim()===''?NaN:Number(x.trim())):[];recalculateEditedOutline();}renderQuestions();});
async function correctOutline(file){const original=spec;const corrected=await PanelOutlineCorrection.open(file,original,async outline=>{const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=reject;reader.readAsDataURL(file);});const response=await api('/cad/analyse',{filename:file.name,mime:file.type,data,outline});if(!response.spec?.edges||response.spec.edges.length!==outline.edges.length||response.spec.edges.some((e,i)=>e.start?.x!==outline.edges[i].start.x||e.start?.y!==outline.edges[i].start.y))throw Error('The reader did not preserve your traced corners. Your entries have been kept.');return response.spec;});if(!corrected)return;recalculateOutline(corrected);spec=corrected;const p=panels[panelIndex];if(p){p.error=null;p.file=file;p.spec=spec;p.result=null;p.reviewed=false;}else{addPanel(spec,file.name);}renderSpec();rememberPanel();notice('Corrected outline applied. Review dimensions, folds and edge types before generating.');}
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
$('generate').onclick=()=>run(async()=>{const request=collect();if(!request.reviewed)throw Error('Check the review box after reviewing your dimensions.');const issues=currentIssues(request);if(issues.length)throw Error(issues[0]);const v=version;const generated=await api('/cad/generate',request);if(version!==v)throw Error('Details changed. Generate a fresh drawing.');result=generated;if(previewURL)URL.revokeObjectURL(previewURL);previewURL=URL.createObjectURL(new Blob([result.svg],{type:'image/svg+xml'}));$('preview').src=previewURL;$('preview').hidden=false;$('validation').textContent=`Closed CUT checked · ${result.validation.holes} holes · ${result.validation.routes} route lines · ${result.validation.stiffener?'Stiffener included':'No stiffener required'}`;notice('Drawing ready. Check the preview before downloading.');});
$('download').onclick=()=>{if(result)download(result.dxf,'application/dxf',result.filename);};
$('save').onclick=()=>{try{download(JSON.stringify({...collect(),reviewed:false},null,2),'application/json',($('panelid').value.replace(/[^a-z0-9_-]/gi,'_')||'panel')+'-draft.json');notice('Draft downloaded.');}catch(e){notice(e.message);}};
$('import').onchange=()=>run(async()=>{const file=$('import').files[0];if(!file||file.size>128*1024)throw Error('Choose a panel draft smaller than 128 KB.');const data=JSON.parse(await file.text());if(!Array.isArray(data.edges)||data.edges.length<4||data.edges.length>32||!data.edges.every(e=>e&&codes.includes(e.code)&&directions.includes(e.direction)))throw Error('Invalid panel draft.');addPanel(data,file.name);notice('Draft loaded. Review it before generating.');});
(async()=>{for(const key of (window.parent!==window?['panelstock:session:v2']:[KEY,'panelstock:session:v2','panelstock:site-orders:session:v1'])){try{const saved=JSON.parse(sessionStorage.getItem(key)||'null');if(saved?.token&&saved.expiresAt>Date.now()){session=saved;break;}}catch{}}showSession();if(session)await run(async()=>{await verify();notice('Ready. Upload a sketch or load a test panel.');});})();
})();
