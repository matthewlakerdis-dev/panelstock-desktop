/* Manual dimensions use finished drawing coordinates and are exported by the server. */
window.PanelDimensionPlacement={open(data){return new Promise(resolve=>{
 const ns='http://www.w3.org/2000/svg',el=(name,attrs={})=>{const e=document.createElementNS(ns,name);for(const [k,v] of Object.entries(attrs))e.setAttribute(k,v);return e;};
 const dialog=document.createElement('dialog');dialog.style.cssText='width:min(1100px,95vw);max-height:95vh;border:0;border-radius:12px;padding:20px';
 dialog.innerHTML='<h2>Place dimensions</h2><p>Select two highlighted points, then click where the measurement should sit.</p><label>Measurement <select><option value="aligned">Along the two points</option><option value="x">Horizontal</option><option value="y">Vertical</option></select></label><div class="dimension-actions"><button type="button" data-action="zoom-in">Zoom in</button> <button type="button" data-action="zoom-out">Zoom out</button> <button type="button" data-action="fit">Fit</button> <button type="button" data-action="undo">Undo last</button> <button type="button" data-action="clear">Clear dimensions</button></div><p role="status"></p><div class="dimension-canvas"></div><div><button type="button" data-action="apply">Apply dimensions</button> <button type="button" data-action="cancel">Cancel</button></div>';
 const svg=el('svg',{role:'img','aria-label':'Select two finished drawing points to dimension'});svg.style.cssText='width:100%;height:60vh;background:#f7fafc;touch-action:none';dialog.querySelector('.dimension-canvas').append(svg);
 const points=data.points,dimensions=structuredClone(data.dimensions||[]);let selected=[],zoom=1,view;
 const xs=points.map(p=>p[0]),ys=points.map(p=>-p[1]),margin=Math.max(100,(Math.max(...xs)-Math.min(...xs))*.12);
 const bounds=[Math.min(...xs)-margin,Math.min(...ys)-margin,Math.max(...xs)-Math.min(...xs)+margin*2,Math.max(...ys)-Math.min(...ys)+margin*2];view=bounds.slice();
 const status=dialog.querySelector('[role=status]'),axis=dialog.querySelector('select');
 const line=(a,b,color='#315f70')=>el('line',{x1:a[0],y1:-a[1],x2:b[0],y2:-b[1],stroke:color,'stroke-width':1.5,'vector-effect':'non-scaling-stroke'});
 function draw(){svg.replaceChildren();svg.setAttribute('viewBox',view.join(' '));
  for(const p of data.primitives){if(p.center)svg.append(el('circle',{cx:p.center[0],cy:-p.center[1],r:p.radius,fill:'none',stroke:'#008ca8','stroke-width':1,'vector-effect':'non-scaling-stroke'}));else svg.append(el(p.closed?'polygon':'polyline',{points:p.points.map(q=>q[0]+','+-q[1]).join(' '),fill:p.closed?'#edf3f5':'none',stroke:p.layer==='ROUTE'?'#c77417':'#315f70','stroke-width':1.5,'vector-effect':'non-scaling-stroke'}));}
  for(const d of dimensions){const [a,b]=[d.p1,d.p2],dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy),u=d.axis==='x'?[1,0]:d.axis==='y'?[0,1]:[dx/length,dy/length],n=[-u[1],u[0]],off=(d.base[0]-a[0])*n[0]+(d.base[1]-a[1])*n[1],aa=[a[0]+off*n[0],a[1]+off*n[1]],bb=[aa[0]+(dx*u[0]+dy*u[1])*u[0],aa[1]+(dx*u[0]+dy*u[1])*u[1]];
   svg.append(line(a,aa),line(b,bb),line(aa,bb));const text=el('text',{x:(aa[0]+bb[0])/2,y:-(aa[1]+bb[1])/2-8,'text-anchor':'middle','font-size':22,fill:'#182f39',stroke:'#f7fafc','stroke-width':5,'paint-order':'stroke'});text.textContent=Number(Math.abs(dx*u[0]+dy*u[1]).toFixed(2));svg.append(text);
  }
  const radius=view[2]/Math.max(svg.clientWidth,500)*5;
  points.forEach((p,i)=>{const c=el('circle',{cx:p[0],cy:-p[1],r:radius,fill:selected.includes(i)?'#df6e13':'white',stroke:'#315f70','stroke-width':1.5,'vector-effect':'non-scaling-stroke'});c.style.cursor='pointer';c.onclick=e=>{if(selected.length===2)return;e.stopPropagation();if(selected.includes(i))return;selected.push(i);draw();};svg.append(c);});
  status.textContent=selected.length===2?'Click to place the measurement.':selected.length===1?'Select the second point.':'Select the first point.';
 }
 svg.onclick=e=>{if(selected.length!==2)return;const matrix=svg.getScreenCTM();if(!matrix)return;const p=new DOMPoint(e.clientX,e.clientY).matrixTransform(matrix.inverse()),a=points[selected[0]],b=points[selected[1]],kind=axis.value;
  if((kind==='x'&&Math.abs(a[0]-b[0])<.001)||(kind==='y'&&Math.abs(a[1]-b[1])<.001)){status.textContent='These points have no distance in that direction. Choose another measurement direction.';return;}
  if(dimensions.length>=100){status.textContent='Use up to 100 dimensions.';return;}dimensions.push({p1:a.slice(),p2:b.slice(),base:[p.x,-p.y],axis:kind});selected=[];draw();};
 function finish(value){dialog.close();dialog.remove();resolve(value);}
 dialog.addEventListener('cancel',e=>{e.preventDefault();finish(null);});
 dialog.onclick=e=>{const action=e.target.dataset.action;if(!action)return;if(action==='apply')finish(dimensions);else if(action==='cancel')finish(null);else if(action==='undo'){if(selected.length)selected=[];else dimensions.pop();draw();}else if(action==='clear'){dimensions.length=0;selected=[];draw();}else{zoom=action==='fit'?1:Math.max(1,Math.min(8,zoom*(action==='zoom-in'?1.4:1/1.4)));const w=bounds[2]/zoom,h=bounds[3]/zoom;view=[bounds[0]+(bounds[2]-w)/2,bounds[1]+(bounds[3]-h)/2,w,h];draw();}};
 svg.onwheel=e=>{if(!e.ctrlKey)return;e.preventDefault();const p=new DOMPoint(e.clientX,e.clientY).matrixTransform(svg.getScreenCTM().inverse()),factor=e.deltaY<0?.85:1/.85;view=[p.x+(view[0]-p.x)*factor,p.y+(view[1]-p.y)*factor,view[2]*factor,view[3]*factor];draw();};
 document.body.append(dialog);dialog.showModal();draw();
 });}};

