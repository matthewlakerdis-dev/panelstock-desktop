(function(root){
 'use strict';
 function valid(hole){return ['x','y','diameter'].every(k=>typeof hole[k]==='number'&&Number.isFinite(hole[k]))&&hole.diameter>0;}
 function open({layout,holes=[],onApply}){
  let draft=holes.map(h=>({...h})),selected=draft.length?0:-1;
  const previous=document.activeElement,dialog=document.createElement('dialog');dialog.className='combine-picker manual-hole-dialog';dialog.setAttribute('aria-labelledby','manual-hole-title');
  const header=document.createElement('header');const title=document.createElement('h2');title.id='manual-hole-title';title.textContent='Manual holes';
  const help=document.createElement('p');help.textContent='Click the panel to add a hole, then adjust its offsets and diameter. X is measured right from the leftmost finished face; Y is measured up from the lowest finished face. All values are in mm.';header.append(title,help);
  const body=document.createElement('div');body.className='manual-hole-body';
  const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');svg.setAttribute('role','img');svg.setAttribute('aria-label','Panel with manual holes. Use Add hole to place a hole without a mouse.');
  const points=layout.cut,xs=points.map(p=>p[0]),ys=points.map(p=>p[1]),minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys),span=Math.max(maxX-minX,maxY-minY),margin=span*.06;
  svg.setAttribute('viewBox',[minX-margin,-maxY-margin,maxX-minX+2*margin,maxY-minY+2*margin].join(' '));
  const side=document.createElement('div'),list=document.createElement('select');list.size=5;list.setAttribute('aria-label','Manual holes');
  const fields={};
  for(const [key,label]of [['x','X offset (mm)'],['y','Y offset (mm)'],['diameter','Diameter (mm)']]){const wrap=document.createElement('label');wrap.textContent=label;const input=document.createElement('input');input.type='number';input.step='any';if(key==='diameter')input.min='0.01';wrap.append(input);side.append(wrap);fields[key]=input;input.oninput=()=>{if(selected<0)return;draft[selected][key]=input.value===''?NaN:Number(input.value);render(false);};}
  side.prepend(list);const add=document.createElement('button');add.type='button';add.textContent='Add hole';const remove=document.createElement('button');remove.type='button';remove.textContent='Remove hole';const actions=document.createElement('div');actions.className='row';actions.append(add,remove);side.append(actions);
  const status=document.createElement('p');status.setAttribute('role','status');side.append(status);body.append(svg,side);
  const footer=document.createElement('footer'),cancel=document.createElement('button'),apply=document.createElement('button');cancel.textContent='Cancel';apply.textContent='Apply and generate';apply.className='primary';footer.append(cancel,apply);dialog.append(header,body,footer);
  function element(tag,attrs){const node=document.createElementNS(ns,tag);for(const [k,v]of Object.entries(attrs))node.setAttribute(k,String(v));svg.append(node);return node;}
  function line(points,colour,dashed=false){element('polyline',{points:points.map(p=>p[0]+','+(-p[1])).join(' '),fill:'none',stroke:colour,'stroke-width':1.2,'vector-effect':'non-scaling-stroke',...(dashed?{'stroke-dasharray':'5 4'}:{})});}
  function render(fill=true){
   svg.replaceChildren();element('polygon',{points:points.map(p=>p[0]+','+(-p[1])).join(' '),fill:'#f2f7f9',stroke:'#169148','stroke-width':1.5,'vector-effect':'non-scaling-stroke'});
   for(const path of layout.routes||[])line(path,'#d63c34');for(const path of layout.stiffeners||[])line(path,'#94a3b8',true);
   for(const h of layout.automaticHoles||[])element('circle',{cx:h.x,cy:-h.y,r:h.diameter/2,fill:'none',stroke:'#42a6c6','stroke-width':1,'vector-effect':'non-scaling-stroke'});
   const [ox,oy]=layout.origin;line([[ox-span*.012,oy],[ox+span*.012,oy]],'#64748b');line([[ox,oy-span*.012],[ox,oy+span*.012]],'#64748b');
   list.replaceChildren();draft.forEach((h,i)=>{const option=new Option('Hole '+(i+1)+(valid(h)?' - '+h.diameter+' mm':''),String(i));list.add(option);if(!valid(h))return;const x=ox+h.x,y=oy+h.y,colour=i===selected?'#135a7a':'#a047bb';element('circle',{cx:x,cy:-y,r:h.diameter/2,fill:'none',stroke:colour,'stroke-width':2,'vector-effect':'non-scaling-stroke'});const hit=element('circle',{cx:x,cy:-y,r:Math.max(h.diameter/2,span*.012),fill:'transparent',stroke:'none'});hit.style.cursor='pointer';hit.onclick=e=>{e.stopPropagation();selected=i;render();};const text=element('text',{x:x+span*.01,y:-y-span*.01,fill:colour,'font-size':span*.018});text.textContent=String(i+1);text.style.pointerEvents='none';});
   list.value=String(selected);if(fill)for(const key of Object.keys(fields))fields[key].value=selected>=0&&Number.isFinite(draft[selected][key])?draft[selected][key]:'';
   for(const input of Object.values(fields))input.disabled=selected<0;remove.disabled=selected<0;add.disabled=draft.length>=200;apply.disabled=draft.some(h=>!valid(h));status.textContent=apply.disabled?'Enter valid offsets and a diameter greater than zero.':'Cuts, routes and hole clearances are checked when you generate.';
  }
  function addAt(x,y){if(draft.length>=200)return;draft.push({x:Math.round(x*100)/100,y:Math.round(y*100)/100,diameter:selected>=0&&valid(draft[selected])?draft[selected].diameter:3});selected=draft.length-1;render();fields.x.focus();}
  svg.onclick=e=>{const matrix=svg.getScreenCTM();if(!matrix)return;const point=new DOMPoint(e.clientX,e.clientY).matrixTransform(matrix.inverse());addAt(point.x-layout.origin[0],-point.y-layout.origin[1]);};
  add.onclick=()=>addAt((minX+maxX)/2-layout.origin[0],(minY+maxY)/2-layout.origin[1]);remove.onclick=()=>{draft.splice(selected,1);selected=Math.min(selected,draft.length-1);render();};list.onchange=()=>{selected=Number(list.value);render();};
  const close=()=>{dialog.close();dialog.remove();previous?.focus();};cancel.onclick=close;dialog.oncancel=e=>{e.preventDefault();close();};apply.onclick=()=>{if(draft.some(h=>!valid(h)))return;const result=draft.map(h=>({...h}));close();onApply(result);};
  document.body.append(dialog);render();dialog.showModal();add.focus();
 }
 root.PanelManualHoles={open,valid};
})(typeof window==='undefined'?globalThis:window);
