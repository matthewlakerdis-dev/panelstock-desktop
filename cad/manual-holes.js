(function(root){
 'use strict';
 function valid(hole){return ['x','y','diameter'].every(k=>typeof hole[k]==='number'&&Number.isFinite(hole[k]))&&hole.diameter>0;}
 function open({layout,holes=[],onApply}){
  let draft=holes.map(h=>({...h})),selected=draft.length?0:-1,pendingReference='origin';
  const previous=document.activeElement,dialog=document.createElement('dialog');dialog.className='combine-picker manual-hole-dialog';dialog.setAttribute('aria-labelledby','manual-hole-title');
  const header=document.createElement('header');const title=document.createElement('h2');title.id='manual-hole-title';title.textContent='Manual holes';
  const help=document.createElement('p');help.textContent='Click the panel to add a hole, then adjust its offsets and diameter. Click a numbered corner dot or fold endpoint dot to choose the offset reference, then click the panel to add a hole. Positive X goes right and positive Y goes up; use negative values for left or down. Changing the reference keeps the hole in place. All values are in mm.';header.append(title,help);
  const body=document.createElement('div');body.className='manual-hole-body';
  const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');svg.setAttribute('role','img');svg.setAttribute('aria-label','Panel with manual holes. Use Add hole to place a hole without a mouse.');
  const points=layout.cut,xs=points.map(p=>p[0]),ys=points.map(p=>p[1]),minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys),span=Math.max(maxX-minX,maxY-minY),margin=span*.06;
  svg.setAttribute('viewBox',[minX-margin,-maxY-margin,maxX-minX+2*margin,maxY-minY+2*margin].join(' '));
  const side=document.createElement('div'),list=document.createElement('select');list.size=5;list.setAttribute('aria-label','Manual holes');
  const references=[{id:'origin',label:'Bottom-left reference',point:layout.origin}];
  const face=layout.face||[];face.forEach((point,i)=>{if(i===face.length-1&&point[0]===face[0][0]&&point[1]===face[0][1])return;references.push({id:'corner-'+i,label:'Corner '+(i+1),point});});
  (layout.folds||[]).forEach((fold,i)=>{[fold[0],fold[fold.length-1]].forEach((point,j)=>references.push({id:'fold-'+i+'-'+j,label:'Fold '+(i+1)+' — endpoint '+(j+1),point}));});
  const reference=document.createElement('select'),referenceLabel=document.createElement('label');referenceLabel.textContent='Measure offsets from';reference.setAttribute('aria-label','Hole offset reference');for(const ref of references)reference.add(new Option(ref.label,ref.id));referenceLabel.append(reference);side.append(referenceLabel);
  function activeReference(){return references.find(r=>r.id===(draft[selected]?.reference||pendingReference))||references[0];}
  reference.onchange=()=>{pendingReference=reference.value;if(selected>=0)draft[selected].reference=reference.value;render();};
  const fields={};
  for(const [key,label]of [['x','X offset (mm)'],['y','Y offset (mm)'],['diameter','Diameter (mm)']]){const wrap=document.createElement('label');wrap.textContent=label;const input=document.createElement('input');input.type='number';input.step='any';if(key==='diameter')input.min='0.01';wrap.append(input);side.append(wrap);fields[key]=input;input.oninput=()=>{if(selected<0)return;const axis=key==='x'?0:key==='y'?1:-1;draft[selected][key]=input.value===''?NaN:Number(input.value)+(axis<0?0:activeReference().point[axis]-layout.origin[axis]);render(false);};}
  side.prepend(list);const add=document.createElement('button');add.type='button';add.textContent='Add hole';const remove=document.createElement('button');remove.type='button';remove.textContent='Remove hole';const actions=document.createElement('div');actions.className='row';actions.append(add,remove);side.append(actions);
  const status=document.createElement('p');status.setAttribute('role','status');side.append(status);body.append(svg,side);
  const footer=document.createElement('footer'),cancel=document.createElement('button'),apply=document.createElement('button');cancel.textContent='Cancel';apply.textContent='Apply and generate';apply.className='primary';footer.append(cancel,apply);dialog.append(header,body,footer);
  function element(tag,attrs){const node=document.createElementNS(ns,tag);for(const [k,v]of Object.entries(attrs))node.setAttribute(k,String(v));svg.append(node);return node;}
  function line(points,colour,dashed=false){element('polyline',{points:points.map(p=>p[0]+','+(-p[1])).join(' '),fill:'none',stroke:colour,'stroke-width':1.2,'vector-effect':'non-scaling-stroke',...(dashed?{'stroke-dasharray':'5 4'}:{})});}
  function render(fill=true){
   svg.replaceChildren();element('polygon',{points:points.map(p=>p[0]+','+(-p[1])).join(' '),fill:'#f2f7f9',stroke:'#169148','stroke-width':1.5,'vector-effect':'non-scaling-stroke'});
   for(const path of layout.routes||[])line(path,'#d63c34');for(const path of layout.stiffeners||[])line(path,'#94a3b8',true);
   for(const h of layout.automaticHoles||[])element('circle',{cx:h.x,cy:-h.y,r:h.diameter/2,fill:'none',stroke:'#42a6c6','stroke-width':1,'vector-effect':'non-scaling-stroke'});
   const [ox,oy]=layout.origin;const anchor=activeReference();reference.value=anchor.id;reference.disabled=false;const [rx,ry]=anchor.point;line([[rx-span*.018,ry],[rx+span*.018,ry]],'#c47713');line([[rx,ry-span*.018],[rx,ry+span*.018]],'#c47713');const anchorText=element('text',{x:rx+span*.015,y:-ry-span*.015,fill:'#9b5d09','font-size':span*.018});anchorText.textContent=anchor.label;if(selected>=0&&valid(draft[selected]))line([[rx,ry],[ox+draft[selected].x,ry],[ox+draft[selected].x,oy+draft[selected].y]],'#c47713',true);line([[ox-span*.012,oy],[ox+span*.012,oy]],'#64748b');line([[ox,oy-span*.012],[ox,oy+span*.012]],'#64748b');
   list.replaceChildren();draft.forEach((h,i)=>{const option=new Option('Hole '+(i+1)+(valid(h)?' - '+h.diameter+' mm':''),String(i));list.add(option);if(!valid(h))return;const x=ox+h.x,y=oy+h.y,colour=i===selected?'#135a7a':'#a047bb';element('circle',{cx:x,cy:-y,r:h.diameter/2,fill:'none',stroke:colour,'stroke-width':2,'vector-effect':'non-scaling-stroke'});const hit=element('circle',{cx:x,cy:-y,r:Math.max(h.diameter/2,span*.012),fill:'transparent',stroke:'none'});hit.style.cursor='pointer';hit.onclick=e=>{e.stopPropagation();selected=i;render();};const text=element('text',{x:x+span*.01,y:-y-span*.01,fill:colour,'font-size':span*.018});text.textContent=String(i+1);text.style.pointerEvents='none';});
   for(const ref of references.filter(r=>r.id!=='origin')){
    const [x,y]=ref.point,chosen=anchor.id===ref.id;
    const dot=element('circle',{cx:x,cy:-y,r:span*.005,fill:chosen?'#c47713':'white',stroke:chosen?'#9b5d09':'#356477','stroke-width':1.5,'vector-effect':'non-scaling-stroke'});
    const label=element('text',{x:x+span*.01,y:-y-span*.01,fill:'#254a5b','font-size':span*.013});label.textContent=ref.id.startsWith('corner-')?ref.label.replace('Corner ',''):ref.label.replace('Fold ','F').replace(' — endpoint ','.');label.style.pointerEvents='none';
    const hit=element('circle',{cx:x,cy:-y,r:span*.009,fill:'transparent',role:'button',tabindex:0,'aria-label':'Measure from '+ref.label,'aria-pressed':String(chosen)});hit.style.cursor='pointer';
    const choose=()=>{pendingReference=ref.id;if(selected>=0)draft[selected].reference=ref.id;render();};
    hit.onclick=e=>{e.stopPropagation();choose();};hit.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();e.stopPropagation();choose();}};
   }

   list.value=String(selected);if(fill)for(const key of Object.keys(fields))fields[key].value=selected>=0&&Number.isFinite(draft[selected][key])?Math.round((draft[selected][key]-(key==='diameter'?0:anchor.point[key==='x'?0:1]-layout.origin[key==='x'?0:1]))*1000000)/1000000:'';
   for(const input of Object.values(fields))input.disabled=selected<0;remove.disabled=selected<0;add.disabled=draft.length>=200;apply.disabled=draft.some(h=>!valid(h));status.textContent=apply.disabled?'Enter valid offsets and a diameter greater than zero.':'Cuts, routes and hole clearances are checked when you generate.';
  }
  function addAt(x,y){if(draft.length>=200)return;const ref=activeReference().id;draft.push({...(ref==='origin'?{}:{reference:ref}),x:Math.round(x*100)/100,y:Math.round(y*100)/100,diameter:selected>=0&&valid(draft[selected])?draft[selected].diameter:3});selected=draft.length-1;render();fields.x.focus();}
  svg.onclick=e=>{const matrix=svg.getScreenCTM();if(!matrix)return;const point=new DOMPoint(e.clientX,e.clientY).matrixTransform(matrix.inverse());addAt(point.x-layout.origin[0],-point.y-layout.origin[1]);};
  add.onclick=()=>addAt((minX+maxX)/2-layout.origin[0],(minY+maxY)/2-layout.origin[1]);remove.onclick=()=>{draft.splice(selected,1);selected=Math.min(selected,draft.length-1);render();};list.onchange=()=>{selected=Number(list.value);render();};
  const close=()=>{dialog.close();dialog.remove();previous?.focus();};cancel.onclick=close;dialog.oncancel=e=>{e.preventDefault();close();};apply.onclick=()=>{if(draft.some(h=>!valid(h)))return;const result=draft.map(h=>({...h}));close();onApply(result);};
  document.body.append(dialog);render();dialog.showModal();add.focus();
 }
 root.PanelManualHoles={open,valid};
})(typeof window==='undefined'?globalThis:window);
