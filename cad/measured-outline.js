/* Explicit measured components; sketch pixels are never converted to mm. */
(()=>{'use strict';
const dirs={right:[1,0],left:[-1,0],up:[0,1],down:[0,-1]},codes=['B','S','NT','RE','FE','CR'];
function points(d){let x=0,y=0;return d.measuredEdges.map(e=>{const p={x,y};x+=Number(e.dx);y+=Number(e.dy);return p;});}
function resolveFolds(d){const ps=points(d);for(const f of d.measuredFolds||[]){if(Number.isInteger(f.startPoint)&&ps[f.startPoint])f.start={...ps[f.startPoint]};if(Number.isInteger(f.endPoint)&&ps[f.endPoint])f.end={...ps[f.endPoint]};}return d;}
function splitEdge(d,i){
 const ps=points(d),edge=d.measuredEdges[i],a=ps[i],f=.5;
 for(const key of ['rightAngles','reliefEnds'])for(const c of d[key]||[]){if(c.edge>i)c.edge++;else if(c.edge===i){const fold=d.measuredFolds[c.fold],p=c.end?fold?.end:fold?.start;if(p&&((p.x-a.x)*edge.dx+(p.y-a.y)*edge.dy)>(edge.dx**2+edge.dy**2)*f)c.edge++;}}
 for(const fold of d.measuredFolds||[])for(const key of ['startPoint','endPoint'])if(Number.isInteger(fold[key])&&fold[key]>i)fold[key]++;
 d.measuredEdges.splice(i,1,{...edge,dx:edge.dx*f,dy:edge.dy*f},{...edge,dx:edge.dx*(1-f),dy:edge.dy*(1-f)});resolveFolds(d);return d;
}
function validate(d){
 const errors=[],edges=d.measuredEdges;if(!Array.isArray(edges)||edges.length<3||edges.length>64)return ['Use 3 to 64 measured edges.'];
 const good=v=>typeof v==='number'&&Number.isFinite(v)&&Math.abs(v)<=10000;
 edges.forEach((e,i)=>{if(!good(e.dx)||!good(e.dy)||Math.hypot(e.dx,e.dy)<.001||!codes.includes(e.code))errors.push('Check edge '+(i+1)+' measurements and tag.');});
 if(errors.length)return errors;
 const ps=points(d),x=edges.reduce((s,e)=>s+e.dx,0),y=edges.reduce((s,e)=>s+e.dy,0);
 if(Math.hypot(x,y)>.001)errors.push('Outline gap: '+Number(x.toFixed(3))+' mm horizontal, '+Number(y.toFixed(3))+' mm vertical.');
 if(ps.reduce((s,p,i)=>{const q=ps[(i+1)%ps.length];return s+p.x*q.y-q.x*p.y;},0)<=0)errors.push('Trace counterclockwise, starting towards the right along the bottom.');
 (d.measuredFolds||[]).forEach((f,i)=>{if(!f.start||!f.end||![f.start.x,f.start.y,f.end.x,f.end.y].every(good)||Math.hypot(f.end.x-f.start.x,f.end.y-f.start.y)<.001)errors.push('Check fold '+(i+1)+' endpoints.');else if(Math.abs(f.start.y-f.end.y)>.001&&Math.abs(f.start.x-f.end.x)>.001)errors.push('Measured outlines support parallel horizontal or vertical internal folds.');});
 if((d.measuredFolds||[]).some(f=>f.start&&f.end&&Math.abs(f.start.x-f.end.x)>.001)&&(d.measuredFolds||[]).some(f=>f.start&&f.end&&Math.abs(f.start.y-f.end.y)>.001))errors.push('Measured outlines support parallel horizontal or vertical internal folds.');
 for(const c of d.rightAngles||[]){const f=d.measuredFolds?.[c.fold],e=edges[c.edge];if(!f||!e||![0,1].includes(c.end)){errors.push('Check the marked 90° junction.');continue;}
 const a=ps[c.edge],b=ps[(c.edge+1)%ps.length],p=c.end?f.end:f.start,v={x:f.end.x-f.start.x,y:f.end.y-f.start.y};
 const length=Math.hypot(e.dx,e.dy),t=((p.x-a.x)*e.dx+(p.y-a.y)*e.dy)/(length*length);
 if(t<-.000001||t>1.000001||Math.abs((p.x-a.x)*e.dy-(p.y-a.y)*e.dx)/length>.001)errors.push('Fold '+(c.fold+1)+' does not meet selected edge '+(c.edge+1)+'.');
 else if(Math.abs(v.x*e.dx+v.y*e.dy)/(Math.hypot(v.x,v.y)*length)>1e-8)errors.push('Fold '+(c.fold+1)+' must meet edge '+(c.edge+1)+' at 90°.');}
 return [...new Set(errors)];
}
function draw(svg,d,onPoint){
 const ns='http://www.w3.org/2000/svg',make=(tag,attrs,text)=>{const e=document.createElementNS(ns,tag);Object.entries(attrs).forEach(([k,v])=>e.setAttribute(k,v));if(text!==undefined)e.textContent=text;return e;};
 svg.replaceChildren();const ps=points(d);if(!ps.length||ps.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y)))return;
 const xs=ps.map(p=>p.x),ys=ps.map(p=>p.y),x0=Math.min(...xs),y0=Math.min(...ys),w=Math.max(...xs)-x0,h=Math.max(...ys)-y0,height=Math.max(550,ps.length*26+80),scale=Math.min(340/Math.max(w,1),(height-100)/Math.max(h,1));
 const left=(760-w*scale)/2,bottom=(height+h*scale)/2,map=p=>[left+(p.x-x0)*scale,bottom-(p.y-y0)*scale];svg.setAttribute('viewBox','0 0 760 '+height);
 svg.append(make('polygon',{points:ps.map(p=>map(p).join(',')).join(' '),fill:'#e6f0f3',stroke:'#2d6074','stroke-width':2}));
 for(const f of d.measuredFolds||[]){if(!f.start||!f.end)continue;const a=map(f.start),b=map(f.end);svg.append(make('line',{x1:a[0],y1:a[1],x2:b[0],y2:b[1],stroke:'#ba7728','stroke-width':2,'stroke-dasharray':'8 5'}));}
 const fmt=n=>String(Number(Math.abs(n).toFixed(2))),occupied=[];
 ps.forEach((p,i)=>{
  const a=map(p),b=map(ps[(i+1)%ps.length]),e=d.measuredEdges[i],length=Math.hypot(b[0]-a[0],b[1]-a[1]);if(!length)return;
  const u=[(b[0]-a[0])/length,(b[1]-a[1])/length],n=[-u[1],u[0]],text=(Math.abs(e.dx)<.001?fmt(e.dy):Math.abs(e.dy)<.001?fmt(e.dx):fmt(e.dx)+' × '+fmt(e.dy))+' · '+e.code;
  let angle=Math.atan2(u[1],u[0])*180/Math.PI;if(angle>90)angle-=180;if(angle<-90)angle+=180;
  const textWidth=text.length*7.2+12,radians=angle*Math.PI/180,bw=Math.abs(Math.cos(radians))*textWidth+Math.abs(Math.sin(radians))*18,bh=Math.abs(Math.sin(radians))*textWidth+Math.abs(Math.cos(radians))*18;
  let offset=18,c,rect;
  for(let level=0;level<ps.length+1;level++){c=[(a[0]+b[0])/2+n[0]*offset,(a[1]+b[1])/2+n[1]*offset];rect=[c[0]-bw/2,c[1]-bh/2,c[0]+bw/2,c[1]+bh/2];if(!occupied.some(r=>rect[0]<r[2]+8&&rect[2]>r[0]-8&&rect[1]<r[3]+8&&rect[3]>r[1]-8))break;offset+=14;}occupied.push(rect);
  const start=[a[0]+n[0]*offset,a[1]+n[1]*offset],end=[b[0]+n[0]*offset,b[1]+n[1]*offset];
  const line=(a,b)=>svg.append(make('line',{x1:a[0],y1:a[1],x2:b[0],y2:b[1],stroke:'#334c59','stroke-width':1,'pointer-events':'none'}));
  for(const point of [a,b])line([point[0]+n[0]*5,point[1]+n[1]*5],[point[0]+n[0]*(offset+6),point[1]+n[1]*(offset+6)]);
  const gap=textWidth/2,outer=length<textWidth+20;
  if(outer){line([start[0]-u[0]*12,start[1]-u[1]*12],[end[0]+u[0]*12,end[1]+u[1]*12]);}else{line(start,[c[0]-u[0]*gap,c[1]-u[1]*gap]);line([c[0]+u[0]*gap,c[1]+u[1]*gap],end);}
  for(const [tip,sign]of [[start,1],[end,-1]]){const inward=sign*(outer?-1:1);svg.append(make('polygon',{points:[tip,[tip[0]+u[0]*inward*7+n[0]*2.5,tip[1]+u[1]*inward*7+n[1]*2.5],[tip[0]+u[0]*inward*7-n[0]*2.5,tip[1]+u[1]*inward*7-n[1]*2.5]].map(p=>p.join(',')).join(' '),fill:'#334c59','pointer-events':'none'}));}
  const edge=make('line',{x1:a[0],y1:a[1],x2:b[0],y2:b[1],stroke:'#007b9e','stroke-width':4,opacity:0,'pointer-events':'none'}),label=make('text',{x:0,y:0,transform:'translate('+c.join(' ')+') rotate('+angle+')','text-anchor':'middle','dominant-baseline':'middle','font-size':13,fill:'#173f52',stroke:'#f7fafc','stroke-width':4,'paint-order':'stroke fill',tabindex:0,role:'button','aria-label':text+'. Highlight matching edge'},text);
  svg.append(edge,label);label.onmouseenter=label.onfocus=()=>edge.setAttribute('opacity',1);label.onmouseleave=label.onblur=()=>edge.setAttribute('opacity',0);label.onclick=()=>edge.setAttribute('opacity',edge.getAttribute('opacity')==='1'?0:1);
 });
 const orientation={right:0,down:90,left:180,up:270},angle=orientation[d.panelDirection]??0;
 const identity=make('g',{transform:'translate(380 '+(height/2)+') rotate('+angle+') scale(0.6)','pointer-events':'none'});
 identity.append(make('text',{x:0,y:-10,'text-anchor':'middle','font-size':22,'font-weight':700,fill:'#173f52',stroke:'#e6f0f3','stroke-width':4,'paint-order':'stroke fill'},d.panelId||''));
 if(d.panelDirection in orientation)identity.append(make('path',{d:'M-35 12H35M23 2L35 12L23 22',fill:'none',stroke:'#23627c','stroke-width':3,'stroke-linecap':'round','stroke-linejoin':'round'}));
 svg.append(identity);
 ps.forEach((p,i)=>{const [x,y]=map(p),g=make('g',onPoint?{role:'button',tabindex:0,'aria-label':'Point '+(i+1)}:{}),number=make('text',{x:x+8,y:y-9,'font-size':13,fill:'#14394a',visibility:'hidden'},i+1);
  g.append(make('title',{},'Point '+(i+1)),make('circle',{cx:x,cy:y,r:10,fill:'transparent'}),make('circle',{cx:x,cy:y,r:3,fill:'white',stroke:'#2d6074'}),number);
  const select=()=>{svg.querySelectorAll('[data-point-number]').forEach(e=>e.setAttribute('visibility','hidden'));number.setAttribute('visibility','visible');onPoint?.(i);};number.setAttribute('data-point-number',i);g.onclick=select;g.onfocus=()=>number.setAttribute('visibility','visible');g.onblur=()=>number.setAttribute('visibility','hidden');g.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();select();}};svg.append(g);
 });
 const bounds=svg.getBBox();svg.setAttribute('viewBox',[bounds.x-24,bounds.y-24,bounds.width+48,bounds.height+48].join(' '));
}
function legacyFolds(d){
 if(d?.foldLines?.length)return structuredClone(d.foldLines);
 if(!d?.siteFolds?.length)return [];
 let x=0,y=0;const ps=(d.edges||[]).map(e=>{const p={x,y},v=dirs[e.direction]||[0,0];x+=v[0]*(e.site||0);y+=v[1]*(e.site||0);return p;}),folds=[];
 for(const level of d.siteFolds){const xs=[];ps.forEach((a,i)=>{const b=ps[(i+1)%ps.length];if(level>Math.min(a.y,b.y)&&level<Math.max(a.y,b.y))xs.push(a.x+(level-a.y)*(b.x-a.x)/(b.y-a.y));});xs.sort((a,b)=>a-b);for(let i=0;i+1<xs.length;i+=2)folds.push({start:{x:xs[i],y:level},end:{x:xs[i+1],y:level}});}
 return folds;
}
function fromDraft(d){if(d?.measuredEdges)return {...structuredClone(d),measuredFolds:structuredClone(d.measuredFolds||[]),rightAngles:structuredClone(d.rightAngles||[]),reliefEnds:structuredClone(d.reliefEnds||[])};return {panelId:d?.panelId||'',panelDirection:d?.panelDirection||'none',measuredEdges:(d?.edges||[{direction:'right',site:1000,code:'B'},{direction:'up',site:800,code:'B'},{direction:'left',site:1000,code:'B'},{direction:'down',site:800,code:'B'}]).map(e=>({dx:(dirs[e.direction]?.[0]||0)*(e.site||0),dy:(dirs[e.direction]?.[1]||0)*(e.site||0),code:e.code||'B'})),measuredFolds:legacyFolds(d),rightAngles:[],reliefEnds:[],reviewed:false};}
async function open(original,file){return new Promise(resolve=>{
 const d=fromDraft(original),dialog=document.createElement('dialog');dialog.className='outline-correction measured-dialog';
 dialog.innerHTML='<header><h2>Measured outline</h2><button data-cancel>Close</button></header><p>Enter the written horizontal and vertical distances between points. Right and up are positive; left and down are negative. Sloping edge length is calculated from both distances.</p><div class="trace-layout"><div><svg aria-label="Measured panel outline"></svg><button data-mark>Mark fold between two points</button><p data-mark-status></p><img data-reference alt="Original sketch" style="max-width:100%"></div><div><label>Panel ID<input data-id></label><label>Arrow<select data-arrow></select></label><div data-edges></div><button data-add>Add edge</button><h3>Folds and marked corners</h3><div data-folds></div></div></div><p role="status" data-status></p><footer><button data-cancel-bottom>Cancel</button><button data-apply>Apply measured outline</button></footer>';
 document.body.append(dialog);const q=s=>dialog.querySelector(s),svg=q('svg');let marking=false,start=null,url;
 if(file){url=URL.createObjectURL(file);q('[data-reference]').src=url;}else q('[data-reference]').hidden=true;
 q('[data-id]').value=d.panelId;for(const v of ['none','up','down','left','right']){const o=new Option(v,v);q('[data-arrow]').append(o);}q('[data-arrow]').value=d.panelDirection;
 const finish=value=>{if(url)URL.revokeObjectURL(url);dialog.close();dialog.remove();resolve(value);};
 function update(){resolveFolds(d);draw(svg,d,i=>{if(!marking)return;if(start===null){start=i;q('[data-mark-status]').textContent='Choose the other endpoint.';}else if(start!==i){d.measuredFolds.push({startPoint:start,endPoint:i});start=null;marking=false;resolveFolds(d);foldFields();update();q('[data-mark-status]').textContent='Fold added.';}});q('[data-status]').textContent=validate(d).join(' ');}
 function selectEdge(value,change,none){const select=document.createElement('select');select.append(new Option(none,''));d.measuredEdges.forEach((e,i)=>select.append(new Option('Edge '+(i+1)+' ('+e.code+')',String(i))));select.value=value===undefined?'':String(value);select.onchange=()=>change(select.value===''?undefined:Number(select.value));return select;}
 function foldFields(){const host=q('[data-folds]');host.replaceChildren();d.measuredFolds.forEach((f,i)=>{const box=document.createElement('fieldset'),title=document.createElement('legend');title.textContent='Fold '+(i+1);box.append(title);
 for(const endpoint of [0,1]){const label=document.createElement('label');label.textContent=(endpoint?'End':'Start')+' — 90° to side ';const c=d.rightAngles.find(c=>c.fold===i&&c.end===endpoint);label.append(selectEdge(c?.edge,edge=>{d.rightAngles=d.rightAngles.filter(c=>c.fold!==i||c.end!==endpoint);if(edge!==undefined)d.rightAngles.push({fold:i,end:endpoint,edge});update();},'No right-angle mark'));box.append(label);
 const relief=document.createElement('label');relief.textContent=(endpoint?'End':'Start')+' relief through tag ';const r=d.reliefEnds.find(r=>r.fold===i&&r.end===endpoint);relief.append(selectEdge(r?.edge,edge=>{d.reliefEnds=d.reliefEnds.filter(r=>r.fold!==i||r.end!==endpoint);if(edge!==undefined)d.reliefEnds.push({fold:i,end:endpoint,edge});update();},'Normal side relief'));box.append(relief);}
 const remove=document.createElement('button');remove.textContent='Remove fold';remove.onclick=()=>{d.measuredFolds.splice(i,1);for(const key of ['rightAngles','reliefEnds'])d[key]=d[key].filter(c=>c.fold!==i).map(c=>({...c,fold:c.fold>i?c.fold-1:c.fold}));foldFields();update();};box.append(remove);host.append(box);});}
 function edgeFields(){const host=q('[data-edges]');host.replaceChildren();d.measuredEdges.forEach((e,i)=>{const box=document.createElement('fieldset'),title=document.createElement('legend');title.textContent='Edge '+(i+1);box.append(title);for(const [key,text]of [['dx','Horizontal mm'],['dy','Vertical mm']]){const label=document.createElement('label');label.textContent=text;const input=document.createElement('input');input.type='number';input.step='any';input.value=e[key];input.oninput=()=>{e[key]=input.value===''?null:Number(input.value);update();};label.append(input);box.append(label);}const select=document.createElement('select');select.setAttribute('aria-label','Edge '+(i+1)+' tag');codes.forEach(c=>select.append(new Option(c,c)));select.value=e.code;select.onchange=()=>{e.code=select.value;update();};box.append(select);const split=document.createElement('button');split.textContent='Add point on this edge';split.onclick=()=>{if(d.measuredEdges.length>=64)return;splitEdge(d,i);edgeFields();foldFields();update();};box.append(split);host.append(box);});}
 q('[data-mark]').onclick=()=>{marking=!marking;start=null;q('[data-mark-status]').textContent=marking?'Choose two numbered points. Add separate edge sections where a fold meets a side.':'';};
 q('[data-add]').onclick=()=>{if(d.measuredEdges.length>=64)return;d.measuredEdges.push({dx:0,dy:0,code:'B'});edgeFields();foldFields();update();};
 q('[data-cancel]').onclick=q('[data-cancel-bottom]').onclick=()=>finish(null);dialog.oncancel=e=>{e.preventDefault();finish(null);};
 q('[data-apply]').onclick=()=>{resolveFolds(d);const errors=validate(d);if(errors.length){q('[data-status]').textContent=errors.join(' ');return;}d.panelId=q('[data-id]').value.trim();d.panelDirection=q('[data-arrow]').value;d.reviewed=false;finish(d);};
 edgeFields();foldFields();update();dialog.showModal();
});}
function addPreviewZoom(host,svg){
 const initial=svg.getAttribute('viewBox').split(' ').map(Number),controls=document.createElement('div');controls.style.cssText='display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:8px 0';
 const status=document.createElement('span');status.textContent='100%';status.setAttribute('aria-live','polite');
 let view=[...initial],drag=null;
 const paint=()=>{svg.setAttribute('viewBox',view.join(' '));status.textContent=Math.round(initial[2]/view[2]*100)+'%';};
 const zoom=(factor,cx=view[0]+view[2]/2,cy=view[1]+view[3]/2)=>{const width=Math.max(initial[2]/8,Math.min(initial[2],view[2]/factor)),ratio=width/view[2];view=[cx-(cx-view[0])*ratio,cy-(cy-view[1])*ratio,width,view[3]*ratio];paint();};
 for(const [label,action]of [['Zoom in',()=>zoom(1.3)],['Zoom out',()=>zoom(1/1.3)],['Fit panel',()=>{view=[...initial];paint();}]]){const button=document.createElement('button');button.type='button';button.textContent=label;button.onclick=action;controls.append(button);}controls.append(status);host.insertBefore(controls,svg);
 svg.style.touchAction='none';svg.style.cursor='grab';
 svg.addEventListener('wheel',e=>{if(!e.ctrlKey)return;e.preventDefault();const p=new DOMPoint(e.clientX,e.clientY).matrixTransform(svg.getScreenCTM().inverse());zoom(e.deltaY<0?1.15:1/1.15,p.x,p.y);},{passive:false});
 svg.addEventListener('pointerdown',e=>{if(e.button!==0||e.target.closest('[role=button]'))return;drag={x:e.clientX,y:e.clientY,view:[...view],inverse:svg.getScreenCTM().inverse()};svg.setPointerCapture(e.pointerId);svg.style.cursor='grabbing';});
 svg.addEventListener('pointermove',e=>{if(!drag)return;const a=new DOMPoint(drag.x,drag.y).matrixTransform(drag.inverse),b=new DOMPoint(e.clientX,e.clientY).matrixTransform(drag.inverse);view=[drag.view[0]+a.x-b.x,drag.view[1]+a.y-b.y,...drag.view.slice(2)];paint();});
 const stop=()=>{drag=null;svg.style.cursor='grab';};svg.addEventListener('pointerup',stop);svg.addEventListener('pointercancel',stop);
 const hint=document.createElement('p');hint.className='small';hint.textContent='Zoom with the buttons or Ctrl + scroll. Drag to pan. Hover or select a dimension to highlight its edge.';host.append(hint);
}
function show(d){let host=document.getElementById('measured-panel-view');if(!host){host=document.createElement('div');host.id='measured-panel-view';}const table=document.querySelector('.tablewrap');const anchor=table.closest('.edge-details')||table;anchor.before(host);document.body.classList.toggle('has-measured-outline',!!d?.measuredEdges);host.hidden=!d?.measuredEdges;if(host.hidden)return;host.replaceChildren();const title=document.createElement('h3');title.textContent='Measured panel outline';const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.style.cssText='width:100%;max-height:620px;background:#f7fafc';host.append(title,svg);draw(svg,d);addPreviewZoom(host,svg);const note=document.createElement('p');note.textContent='Horizontal and vertical measurements define the shape. Finished dimensions are calculated in the generated preview.';host.append(note);}
window.PanelMeasuredOutline={points,resolveFolds,splitEdge,validate,fromDraft,open,show};
})();

