/* Local sketch correction: pixels establish directions, never millimetres. */
(()=>{'use strict';
function directions(points){
 if(points.length<4||points.length>32)throw Error('Trace 4 to 32 corners.');
 const cross=(a,b,c)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
 let area=0;
 const ds=points.map((a,i)=>{const b=points[(i+1)%points.length],dx=b.x-a.x,dy=b.y-a.y;area+=a.x*b.y-b.x*a.y;
  if(Math.max(Math.abs(dx),Math.abs(dy))<1||Math.min(Math.abs(dx),Math.abs(dy))>Math.max(Math.abs(dx),Math.abs(dy))*.2)throw Error('Edge '+(i+1)+': align its corners horizontally or vertically.');
  return Math.abs(dx)>Math.abs(dy)?(dx>0?'right':'left'):(dy>0?'down':'up');});
 if(area>=0)throw Error('Start at the bottom-left corner and trace along the bottom towards the right.');
 for(let i=0;i<points.length;i++)for(let j=i+1;j<points.length;j++){
  if(j===i+1||(i===0&&j===points.length-1))continue;
  const a=points[i],b=points[(i+1)%points.length],c=points[j],d=points[(j+1)%points.length];
  const on=(p,q,r)=>Math.abs(cross(p,q,r))<.001&&r.x>=Math.min(p.x,q.x)&&r.x<=Math.max(p.x,q.x)&&r.y>=Math.min(p.y,q.y)&&r.y<=Math.max(p.y,q.y);
  if(cross(a,b,c)*cross(a,b,d)<0&&cross(c,d,a)*cross(c,d,b)<0||on(a,b,c)||on(a,b,d)||on(c,d,a)||on(c,d,b))throw Error('The outline crosses or touches itself. Move the numbered corners.');
 }
 const horizontal=d=>d==='left'||d==='right';
 if(ds.some((d,i)=>horizontal(d)===horizontal(ds[(i+1)%ds.length])))throw Error('Use one corner per turn; remove extra corners along straight edges.');
 return ds;
}
async function open(file,draft,readMeasurements){
 return new Promise((resolve,reject)=>{
 const dialog=document.createElement('dialog');dialog.className='outline-correction';
 dialog.innerHTML='<header><div><h2>Correct the sketch outline</h2><p>Click each panel-face corner, starting bottom-left towards the right. Ignore tags and internal folds. Drag numbered corners to adjust them.</p></div><button type="button" data-close aria-label="Close outline correction">×</button></header><div class="trace-layout"><div><svg viewBox="0 0 1000 1000" preserveAspectRatio="none" aria-label="Sketch with editable outline"></svg><div class="trace-tools"><button type="button" data-undo>Undo last corner</button><button type="button" data-reset>Trace again</button><button type="button" data-finish>Finish outline</button><button type="button" data-read>Read measurements from sketch</button></div></div><div class="trace-values"><p>Image positions set directions only. Enter the written site measurements in millimetres.</p><label>Panel ID<input data-id maxlength="60"></label><label>Site fold heights from bottom (mm)<input data-folds placeholder="e.g. 868"></label><label>Panel arrow direction<select data-arrow><option value="none">No arrow</option><option value="right">Right</option><option value="left">Left</option><option value="up">Up</option><option value="down">Down</option></select></label><div data-edges></div></div></div><p role="status" data-status></p><footer><button type="button" data-cancel>Cancel</button><button type="button" class="primary" data-apply>Apply corrected outline</button></footer>';
 document.body.append(dialog);const q=s=>dialog.querySelector(s),svg=q('svg'),ns='http://www.w3.org/2000/svg',url=URL.createObjectURL(file);
 let points=[],values=[],closed=false,drag=null,reading=false,disposed=false;
 q('[data-arrow]').value=draft?.panelDirection||'none';q('[data-id]').value=draft?.panelId||'';q('[data-folds]').value=(draft?.siteFolds||[]).join(', ');
 const finish=value=>{disposed=true;URL.revokeObjectURL(url);dialog.close();dialog.remove();resolve(value);};
 const status=text=>q('[data-status]').textContent=text;
 const make=(name,attrs,text)=>{const e=document.createElementNS(ns,name);for(const [k,v]of Object.entries(attrs))e.setAttribute(k,v);if(text)e.textContent=text;return e;};
 function draw(){svg.replaceChildren(make('image',{href:url,x:0,y:0,width:1000,height:1000,preserveAspectRatio:'none'}));
  if(points.length)svg.append(make('polyline',{points:points.concat(closed?[points[0]]:[]).map(p=>p.x+','+p.y).join(' '),fill:closed?'#2d607422':'none',stroke:'#23627c','stroke-width':3}));
  points.forEach((p,i)=>{const g=make('g',{'data-corner':i,tabindex:0,role:'button','aria-label':'Corner '+(i+1)});g.append(make('circle',{cx:p.x,cy:p.y,r:10,fill:'#fff',stroke:'#23627c','stroke-width':3}),make('text',{x:p.x+13,y:p.y-13,fill:'#14394a','font-size':20},String(i+1)));svg.append(g);});
 }
 function fields(){q('[data-edges]').replaceChildren();values.forEach((v,i)=>{const row=document.createElement('div');row.className='trace-edge';const label=document.createElement('label');label.textContent='Edge '+(i+1)+' → '+((i+1)%values.length+1);const input=document.createElement('input');input.type='number';input.min='.001';input.max='10000';input.step='any';input.value=v.site??'';input.placeholder='Site mm';input.setAttribute('aria-label','Edge '+(i+1)+' site mm');input.oninput=()=>v.site=input.value===''?null:Number(input.value);label.append(input);const type=document.createElement('select');type.setAttribute('aria-label','Edge '+(i+1)+' type');for(const code of ['','B','S','NT','RE','FE','CR']){const o=document.createElement('option');o.value=code;o.textContent=code||'Select type';type.append(o);}type.value=v.code||'';type.onchange=()=>v.code=type.value;row.append(label,type);q('[data-edges]').append(row);});}
 const pos=e=>{const r=svg.getBoundingClientRect();return {x:Math.max(0,Math.min(1000,(e.clientX-r.left)/r.width*1000)),y:Math.max(0,Math.min(1000,(e.clientY-r.top)/r.height*1000))};};
 svg.onpointerdown=e=>{if(reading)return;const c=e.target.closest('[data-corner]');if(c){drag=Number(c.dataset.corner);svg.setPointerCapture(e.pointerId);return;}if(closed||points.length>=32)return;let p=pos(e);if(points.length){const prev=points[points.length-1];if(Math.abs(p.x-prev.x)>Math.abs(p.y-prev.y))p.y=prev.y;else p.x=prev.x;}points.push(p);draw();};
 svg.onpointermove=e=>{if(reading)return;if(drag===null)return;points[drag]=pos(e);draw();};svg.onpointerup=svg.onpointercancel=()=>drag=null;
 svg.onkeydown=e=>{if(reading)return;const c=e.target.closest('[data-corner]');if(!c||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;e.preventDefault();const p=points[Number(c.dataset.corner)],step=e.shiftKey?10:1;p.x=Math.max(0,Math.min(1000,p.x+(e.key==='ArrowRight'?step:e.key==='ArrowLeft'?-step:0)));p.y=Math.max(0,Math.min(1000,p.y+(e.key==='ArrowDown'?step:e.key==='ArrowUp'?-step:0)));draw();svg.querySelector('[data-corner="'+c.dataset.corner+'"]').focus();};
 q('[data-undo]').onclick=()=>{if(closed){closed=false;status('Outline reopened. Existing measurements remain until you finish the new trace.');}else points.pop();draw();};
 q('[data-reset]').onclick=()=>{points=[];values=[];closed=false;fields();draw();status('Click the bottom-left panel-face corner to begin.');};
 q('[data-finish]').onclick=()=>{try{directions(points);closed=true;if(values.length!==points.length)values=points.map(()=>({site:null,code:''}));fields();draw();status('Outline traced. Confirm every edge measurement and type.');}catch(e){status(e.message);}};
 q('[data-read]').hidden=!readMeasurements;
 q('[data-read]').onclick=async()=>{try{if(!closed)throw Error('Finish tracing the outline first.');directions(points);reading=true;dialog.querySelectorAll('button,input,select').forEach(e=>e.disabled=true);status('Reading written measurements against your traced outline…');const candidate=await readMeasurements({edges:points.map(start=>({start:{...start}}))});if(disposed)return;if(candidate.unsupported)throw Error((candidate.questions||[]).join(" ")||"The sketch needs clarification. Existing entries are unchanged.");
 values.forEach((v,i)=>{const e=candidate.edges[i];if(v.site===null&&Number.isFinite(e.site)&&e.site>=.001&&e.site<=10000)v.site=e.site;if(!v.code&&['B','S','NT','RE','FE','CR'].includes(e.code))v.code=e.code;});
 if(!q('[data-id]').value)q('[data-id]').value=candidate.panelId||'';
 if(!q('[data-folds]').value&&Array.isArray(candidate.siteFolds))q('[data-folds]').value=candidate.siteFolds.join(', ');
 fields();const missing=values.filter(v=>v.site===null||!v.code).length;status((missing?missing+' edges still need measurements or types. ':'Measurements filled. ')+(candidate.questions||[]).join(' ')+' Review every value before applying.');
 }catch(e){if(!disposed)status(e.message||'Reading failed. Your trace and measurements are unchanged.');}finally{reading=false;if(!disposed)dialog.querySelectorAll('button,input,select').forEach(e=>e.disabled=false);}};
 q('[data-apply]').onclick=()=>{try{if(!closed)throw Error('Finish the outline first.');const ds=directions(points);if(values.some(v=>!v.code||!Number.isFinite(v.site)||v.site<.001||v.site>10000))throw Error('Enter a valid site measurement and type for every edge.');const folds=q('[data-folds]').value.trim()?q('[data-folds]').value.split(',').map(x=>x.trim()?Number(x):NaN):[];if(folds.some(x=>!Number.isFinite(x)||x<=0))throw Error('Enter positive fold heights separated by commas.');finish({panelId:q('[data-id]').value.trim(),panelDirection:q('[data-arrow]').value,edges:points.map((p,i)=>({name:'Edge '+(i+1),start:p,direction:ds[i],code:values[i].code,site:values[i].site,finished:null})),siteFolds:folds,folds:[],questions:['Outline and site measurements entered manually from the sketch. Review before generating.'],unsupported:false,reviewed:false,directionSource:'manual-sketch-trace'});}catch(e){status(e.message);}};
 q('[data-close]').onclick=q('[data-cancel]').onclick=()=>finish(null);dialog.oncancel=e=>{e.preventDefault();finish(null);};
 const image=new Image();image.onload=()=>{svg.style.aspectRatio=image.naturalWidth+'/'+image.naturalHeight;draw();dialog.showModal();};image.onerror=()=>{URL.revokeObjectURL(url);dialog.remove();reject(Error('Could not open the sketch image.'));};image.src=url;
 });
}
window.PanelOutlineCorrection={open,directions};
})();
