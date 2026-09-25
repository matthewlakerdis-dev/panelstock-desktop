/* Visual controls delegate to the existing, validated edge editor. */
(()=>{'use strict';
const table=document.querySelector('.tablewrap'),rows=document.getElementById('edges');
const details=document.createElement('details');details.className='edge-details';
const summary=document.createElement('summary');summary.textContent='Show all edge details';
table.before(details);details.append(summary,table);
const host=document.createElement('div');host.className='visual-editor';details.before(host);
host.innerHTML='<div class="drawing-space"><div class="drawing-heading"><div><span class="editor-eyebrow">PANEL WORKSPACE</span><strong>Edit your panel</strong></div><span class="editor-hint">Select a dimension or edge to edit</span></div><div class="drawing-canvas"><svg viewBox="0 0 760 540" aria-label="Interactive site outline"></svg><div class="edge-inspector" hidden><div class="inspector-heading"><h3>Selected edge</h3><button type="button" class="close-editor" aria-label="Close edge editor">×</button></div><div class="edge-controls"></div><p class="small">Changes update the outline automatically.</p></div></div><div class="drawing-footer"><p class="drawing-status" role="status"></p><span>Site · Finished (mm)</span></div><div class="edge-picker" hidden></div></div>';
const svg=host.querySelector('svg'),picker=host.querySelector('.edge-picker'),controls=host.querySelector('.edge-controls'),status=host.querySelector('.drawing-status');
let selected=0,editing=false;const inspector=host.querySelector('.edge-inspector');host.querySelector('.close-editor').onclick=()=>{editing=false;inspector.hidden=true;};host.addEventListener('keydown',e=>{if(e.key==='Escape'){editing=false;inspector.hidden=true;}});
document.addEventListener('pointerdown',e=>{if(editing&&!inspector.contains(e.target)){editing=false;inspector.hidden=true;}},true);
const ns='http://www.w3.org/2000/svg';
function el(tag,attrs,text){const n=document.createElementNS(ns,tag);for(const [k,v] of Object.entries(attrs))n.setAttribute(k,v);if(text!==undefined)n.textContent=text;return n;}
function fields(){return [...rows.children].map(r=>[...r.querySelectorAll('input,select')]);}
const warning=document.createElement('dialog');warning.className='measurement-warning';warning.setAttribute('aria-labelledby','measurement-warning-title');
warning.innerHTML='<h3 id="measurement-warning-title">Check these measurements</h3><ul></ul><button type="button" class="primary">Back to drawing</button>';
document.body.append(warning);warning.querySelector('button').onclick=()=>warning.close();
let lastWarning='';
function measurementErrors(all){
 const bad=all.map(()=>new Set()),messages=[],vectors={right:[1,0],up:[0,1],left:[-1,0],down:[0,-1]};
 for(const column of [3,4]){let x=0,y=0,complete=true;const label=column===3?'Site':'Finished';
 all.forEach((f,i)=>{const n=Number(f[column].value),v=vectors[f[1].value];if(f[column].value===''||!Number.isFinite(n)||n<.001||n>10000){bad[i].add(column);messages.push(f[0].value+': '+label.toLowerCase()+' length must be between 0.001 and 10000 mm.');complete=false;}else if(v){x+=v[0]*n;y+=v[1]*n;}});
 if(complete)for(const [axis,gap] of [[0,x],[1,y]])if(Math.abs(gap)>.001){all.forEach((f,i)=>{if(vectors[f[1].value]?.[axis])bad[i].add(column);});messages.push(label+' outline has a '+Math.abs(Number(gap.toFixed(3)))+' mm '+(axis?'vertical':'horizontal')+' gap. Check the highlighted lengths or directions; more than one edge could be responsible.');}
 }
 const extra=[...document.querySelectorAll('#questions p')].map(p=>p.textContent).filter(t=>/fold/i.test(t)&&!/Finished fold heights|assumed|Original/i.test(t));
 const folds=document.getElementById('folds');folds.setAttribute('aria-invalid',String(extra.length>0));messages.push(...extra);
 all.forEach((f,i)=>[3,4].forEach(j=>f[j].setAttribute('aria-invalid',String(bad[i].has(j)))));
 controls.querySelectorAll('[data-field]').forEach(f=>f.setAttribute('aria-invalid',String(bad[selected]?.has(Number(f.dataset.field))||false)));
 return {bad,messages:[...new Set(messages)]};
}
function showMeasurementWarning(){const errors=measurementErrors(fields()),key=errors.messages.join('\n');if(!key){lastWarning='';if(warning.open)warning.close();return;}if(key===lastWarning)return;lastWarning=key;const list=warning.querySelector('ul');list.replaceChildren(...errors.messages.map(message=>{const li=document.createElement('li');li.textContent=message;return li;}));if(!warning.open)warning.showModal();}
// Explain errors after a committed edit, rather than interrupting each keystroke.
host.addEventListener('change',showMeasurementWarning);rows.addEventListener('change',showMeasurementWarning);document.getElementById('folds').addEventListener('change',showMeasurementWarning);
document.getElementById('generate').addEventListener('click',showMeasurementWarning);
function choose(i){selected=i;editing=true;render(true);controls.querySelector('input[type=number]')?.focus();}
function render(rebuild=true){
 const all=fields();selected=Math.max(0,Math.min(selected,all.length-1));svg.replaceChildren();picker.replaceChildren();
 if(rebuild)controls.replaceChildren();
 if(!all.length){inspector.hidden=true;status.textContent='Load a sketch or start a rectangle to begin.';return;}
 const errors=measurementErrors(all);if(!errors.messages.length){lastWarning='';if(warning.open)warning.close();}
 let x=0,y=0,complete=true;const vectors={right:[1,0],up:[0,1],left:[-1,0],down:[0,-1]};
 const points=[[0,0]],segments=[];
 all.forEach((f,i)=>{const value=Number(f[3].value),valid=f[3].value!==''&&Number.isFinite(value)&&value>0;complete=complete&&valid;const v=vectors[f[1].value]||[1,0],len=valid?value:100;const a=[x,y];x+=v[0]*len;y+=v[1]*len;segments.push({a,b:[x,y],f,i});points.push([x,y]);
 const b=document.createElement('button');b.type='button';b.textContent=(i+1)+'. '+f[0].value;b.setAttribute('aria-pressed',String(i===selected));b.onclick=()=>choose(i);picker.append(b);});
 const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]),minX=Math.min(...xs),minY=Math.min(...ys),w=Math.max(...xs)-minX,h=Math.max(...ys)-minY,scale=Math.min(540/Math.max(w,1),340/Math.max(h,1));
 const map=p=>[380+(p[0]-minX-w/2)*scale,270-(p[1]-minY-h/2)*scale];
 const labelBoxes=[],codeBoxes=[];let extent={left:0,top:0,right:760,bottom:540};
 const overlaps=(a,b)=>a.x<b.x+b.w+8&&a.x+a.w+8>b.x&&a.y<b.y+b.h+8&&a.y+a.h+8>b.y;
 function reserve(box){extent.left=Math.min(extent.left,box.x-24);extent.top=Math.min(extent.top,box.y-24);extent.right=Math.max(extent.right,box.x+box.w+24);extent.bottom=Math.max(extent.bottom,box.y+box.h+24);}
 const screenSegments=segments.map(s=>({a:map(s.a),b:map(s.b)}));
 function touchesOutline(box){return screenSegments.some(s=>{const x=Math.min(s.a[0],s.b[0]),y=Math.min(s.a[1],s.b[1]);return overlaps(box,{x:x-2,y:y-2,w:Math.abs(s.b[0]-s.a[0])+4,h:Math.abs(s.b[1]-s.a[1])+4});});}
 function inside(px,py){let yes=false;for(let i=0,j=points.length-1;i<points.length;j=i++){const a=map(points[i]),b=map(points[j]);if((a[1]>py)!==(b[1]>py)&&px<(b[0]-a[0])*(py-a[1])/(b[1]-a[1])+a[0])yes=!yes;}return yes;}
 const closed=complete&&Math.hypot(x,y)<.001;
 if(closed)svg.append(el('polygon',{points:points.map(p=>map(p).join(',')).join(' '),fill:'#e6f0f3',stroke:'none'}));
 const foldValues=document.getElementById('folds').value.trim();
 if(closed&&all.length===4&&foldValues)foldValues.split(',').map(Number).filter(n=>Number.isFinite(n)&&n>0&&n<h).forEach(n=>{const a=map([minX,minY+n]),b=map([minX+w,minY+n]);svg.append(el('line',{x1:a[0],y1:a[1],x2:b[0],y2:b[1],stroke:'#b96c26','stroke-width':2,'stroke-dasharray':'7 5'}),el('text',{x:a[0]+10,y:a[1]-8,fill:'#915119','font-size':15},'Fold '+n+' mm'));});
 segments.forEach(({a,b,f,i})=>{const p=map(a),q=map(b),active=i===selected,g=el('g',{role:'button',tabindex:'0','aria-label':f[0].value+', '+f[3].value+' millimetres, '+f[2].value,'aria-pressed':String(active),class:'outline-edge'});g.append(el('line',{x1:p[0],y1:p[1],x2:q[0],y2:q[1],stroke:active?'#155e75':'#6c8793','stroke-width':active?7:3}),el('line',{x1:p[0],y1:p[1],x2:q[0],y2:q[1],stroke:'transparent','stroke-width':24}));g.onclick=()=>choose(i);g.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();choose(i);}};svg.append(g);
 const mx=(p[0]+q[0])/2,my=(p[1]+q[1])/2,dx=q[0]-p[0],dy=q[1]-p[1],len=Math.hypot(dx,dy)||1;
 const nx=-dy/len,ny=dx/len;
 const dimension=(f[3].value||'—')+' · '+(f[4].value||'—'),badgeWidth=Math.max(64,dimension.length*9+20),vertical=Math.abs(dy)>Math.abs(dx);
 let offset=36,lx,ly,box;
 for(let lane=0;lane<40;lane++){offset=36+lane*24;lx=mx+nx*offset;ly=my+ny*offset;box={x:lx-(vertical?12:badgeWidth/2),y:ly-(vertical?badgeWidth/2:12),w:vertical?24:badgeWidth,h:vertical?badgeWidth:24};if(!labelBoxes.some(b=>overlaps(box,b))&&!touchesOutline(box))break;}
 labelBoxes.push(box);reserve(box);
 const ink=errors.bad[i].size?'#dc2626':active?'#155e75':'#94a3b8';
 const dim=el('g',{class:'dimension-lines','aria-hidden':'true','pointer-events':'none'});
 const line=(x1,y1,x2,y2)=>el('line',{x1,y1,x2,y2,stroke:ink,'stroke-width':1});
 for(const r of [p,q]){
  dim.append(line(r[0]+nx*7,r[1]+ny*7,r[0]+nx*(offset+7),r[1]+ny*(offset+7)));
  const tx=r[0]+nx*offset,ty=r[1]+ny*offset;
  dim.append(line(tx-4*dx/len-4*nx,ty-4*dy/len-4*ny,tx+4*dx/len+4*nx,ty+4*dy/len+4*ny));
 }
 dim.append(line(p[0]+nx*offset,p[1]+ny*offset,q[0]+nx*offset,q[1]+ny*offset));svg.append(dim);
 const badge=el('g',{class:'dimension-badge',role:'button',tabindex:'0','aria-label':'Edit '+f[0].value+': site '+(f[3].value||'unresolved')+' mm, finished '+(f[4].value||'unresolved')+' mm',transform:'translate('+lx+' '+ly+')'+(Math.abs(dy)>Math.abs(dx)?' rotate(-90)':'')});

 badge.classList.toggle('has-error',errors.bad[i].size>0);
 const measureText=el('text',{x:0,y:0,'text-anchor':'middle','dominant-baseline':'middle','font-size':15,'font-weight':active?600:400});
 measureText.append(el('tspan',{fill:errors.bad[i].has(3)?'#dc2626':active?'#155e75':'#475569'},f[3].value||'—'),el('tspan',{fill:'#94a3b8'},' · '),el('tspan',{fill:errors.bad[i].has(4)?'#dc2626':active?'#155e75':'#475569'},f[4].value||'—'));
 badge.append(el('rect',{x:-badgeWidth/2,y:-12,width:badgeWidth,height:24,rx:3,fill:errors.bad[i].size?'#fff1f2':'#f8fafc',stroke:'none'}),measureText);

 badge.onclick=()=>choose(i);badge.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();choose(i);}};svg.append(badge);
 const code=el('g',{class:'edge-code',role:'button',tabindex:'0','aria-label':'Edit '+f[0].value+' edge type '+f[2].value});
 let cx=mx-nx*22,cy=my-ny*22;
 for(const depth of [22,34,12,46]){let found=false;for(const fraction of [.5,.35,.65,.2,.8]){const tx=p[0]+dx*fraction-nx*depth,ty=p[1]+dy*fraction-ny*depth,b={x:tx-18,y:ty-14,w:36,h:28};if((!closed||[[b.x,b.y],[b.x+b.w,b.y],[b.x,b.y+b.h],[b.x+b.w,b.y+b.h]].every(v=>inside(...v)))&&!codeBoxes.some(v=>overlaps(b,v))){cx=tx;cy=ty;found=true;break;}}if(found)break;}
 codeBoxes.push({x:cx-18,y:cy-14,w:36,h:28});
 code.append(el('rect',{x:cx-18,y:cy-14,width:36,height:28,rx:4,fill:'transparent'}),el('text',{x:cx,y:cy,'text-anchor':'middle','dominant-baseline':'middle',fill:active?'#155e75':'#526c7a','font-size':15,'font-weight':600},f[2].value));
 const editCode=()=>{choose(i);controls.querySelector('select[data-field="2"]')?.focus();};code.onclick=editCode;code.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();editCode();}};svg.append(code);
 if(active&&editing&&rebuild){inspector.style.left=Math.max(2,Math.min(58,lx/760*100-12))+'%';inspector.style.top=Math.max(3,Math.min(30,ly/540*100-8))+'%';}
 });
 const viewWidth=extent.right-extent.left,viewHeight=extent.bottom-extent.top;svg.setAttribute('viewBox',[extent.left,extent.top,viewWidth,viewHeight].join(' '));svg.style.aspectRatio=viewWidth+' / '+viewHeight;
 if(editing&&rebuild&&labelBoxes[selected]){const anchor=labelBoxes[selected];inspector.style.left=Math.max(2,Math.min(58,(anchor.x-extent.left)/viewWidth*100-12))+'%';inspector.style.top=Math.max(3,Math.min(30,(anchor.y-extent.top)/viewHeight*100-8))+'%';}
 inspector.hidden=!editing;
 status.textContent=!complete?'Enter missing site lengths. The outline uses placeholder lengths until all measurements are supplied.':closed?'Site outline closes · Dimensions in mm':'Outline is open — check lengths and directions.';
 if(!rebuild){const fs=controls.querySelectorAll('input,select');fs.forEach(f=>{if(document.activeElement!==f)f.value=all[selected][Number(f.dataset.field)].value;});return;}
 host.querySelector('h3').textContent='Edge '+(selected+1)+' · '+all[selected][0].value;
 const advanced=document.createElement('details');advanced.className='edge-advanced';const toggle=document.createElement('summary');toggle.textContent='Advanced: outline direction';advanced.append(toggle);
 ['Edge name','Direction','Edge type','Site length (mm)','Finished length (mm)'].forEach((title,j)=>{const original=all[selected][j],label=document.createElement('label'),input=original.cloneNode(true);label.textContent=title;if(j===0)label.className='wide-field';input.value=original.value;input.dataset.field=String(j);input.setAttribute('aria-label',title);input.addEventListener('input',()=>{original.value=input.value;original.dispatchEvent(new Event('input',{bubbles:true}));});label.append(input);(j===1?advanced:controls).append(label);});
 const help=document.createElement('p');help.className='small';help.textContent='Change this only to correct which way the edge runs around the outline.';advanced.append(help);controls.append(advanced);measurementErrors(all);
}
rows.addEventListener('input',()=>render(false));
details.addEventListener('toggle',()=>render(true));
document.getElementById('folds').addEventListener('input',()=>render(false));
new MutationObserver(()=>{editing=false;render(true);}).observe(rows,{childList:true});
render();
})();