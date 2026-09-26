/* Written dimensions determine size; traced points determine travel only. */
(()=>{'use strict';
const sign=n=>n<0?-1:1;
function resolve(points,values,folds=[],constraints={}){
 const result=values.map(v=>({...v})),notes=[];
 for(const axis of ['x','y']){
  const unknown=[],components=result.map((v,i)=>{
   const a=points[i],b=points[(i+1)%points.length],k=v.kind||kind(a,b);
   const key=k==='sloping'?(axis==='x'?'width':'height'):'site';
   if((axis==='x'&&k==='vertical')||(axis==='y'&&k==='horizontal'))return 0;
   if(v['calculate'+key]){unknown.push({i,key});return null;}
   if(!Number.isFinite(v[key])||v[key]<0)throw Error('Enter section '+(i+1)+' '+key+' or choose Calculate.');
   const direction=axis==='x'?(v.xSign??sign(b.x-a.x)):(v.ySign??sign(a.y-b.y));return direction*v[key];
  });

  const equation=indices=>[...unknown.map(u=>indices.includes(u.i)?1:0),-indices.reduce((sum,i)=>sum+(components[i]??0),0)];
  const rows=[equation(result.map((_,i)=>i))];
  for(const c of constraints.rightAngles||[]){const f=folds[c.fold],e=result[c.edge];if(!f||!e)continue;const ek=e.kind||kind(points[c.edge],points[(c.edge+1)%points.length]);
   if(!((axis==='y'&&ek==='vertical')||(axis==='x'&&ek==='horizontal')))continue;
   const indices=[];for(let i=f.from;i!==f.to;i=(i+1)%points.length){indices.push(i);if(indices.length>points.length)throw Error('Check fold endpoints.');}rows.push(equation(indices));
  }
  for(const original of constraints.measurementConstraints||[]){
   let c=original;
   if(c.fold!=null||c.edge!=null){
    const f=c.edge!=null?{from:c.edge,to:(c.edge+1)%points.length}:folds[c.fold];
    if(!Number.isInteger(c.edge??c.fold)||!f||![f.from,f.to,c.from].every(i=>Number.isInteger(i)&&i>=0&&i<points.length)||!["x","y"].includes(c.axis))throw Error('Check the corner-to-line constraint.');
    c={...c,to:f.from};
    if(c.axis===axis){const indices=[];for(let i=f.from;i!==f.to;i=(i+1)%points.length)indices.push(i);rows.push(equation(indices));}
   }

   if((c.direction!=null&&![1,-1].includes(c.direction))||!['x','y'].includes(c.axis)||!Number.isInteger(c.from)||!Number.isInteger(c.to)||c.from<0||c.to<0||c.from>=points.length||c.to>=points.length||c.from===c.to||!Number.isFinite(c.value)||c.value<=0||c.value>10000)throw Error('Check the constraint measurement and its two corners.');
   if(c.axis!==axis)continue;
   const indices=[];for(let i=c.from;i!==c.to;i=(i+1)%points.length)indices.push(i);
   const row=equation(indices),a=points[c.from],b=points[c.to];
   row[row.length-1]+=(c.direction??sign(axis==='x'?b.x-a.x:a.y-b.y))*c.value;rows.push(row);
  }
  if(!unknown.length){
   if(rows.slice(1).some(row=>Math.abs(row.at(-1))>.001))throw Error('Written measurements conflict with a marked right angle or constraint measurement. Your entries have been kept.');
   continue;
  }
  let r=0;const pivots=[];
  for(let col=0;col<unknown.length;col++){const pivot=rows.findIndex((row,i)=>i>=r&&Math.abs(row[col])>1e-9);if(pivot<0)continue;[rows[r],rows[pivot]]=[rows[pivot],rows[r]];const divisor=rows[r][col];rows[r]=rows[r].map(n=>n/divisor);for(let j=0;j<rows.length;j++){if(j===r)continue;const factor=rows[j][col];rows[j]=rows[j].map((n,k)=>n-factor*rows[r][k]);}pivots.push(col);r++;}
  if(rows.some(row=>row.slice(0,-1).every(n=>Math.abs(n)<1e-8)&&Math.abs(row.at(-1))>.001))throw Error('Written measurements conflict with a marked right angle or constraint measurement. Your entries have been kept.');
  if(pivots.length!==unknown.length&&!constraints.partial)throw Error('More than one missing '+(axis==='x'?'across':'rise/drop')+' measurement remains. Enter another written dimension or mark the fold and its 90° junction.');
  pivots.forEach((col,j)=>{if(rows[j].slice(0,-1).some((n,k)=>k!==col&&Math.abs(n)>1e-8))return;const {i,key}=unknown[col],n=rows[j].at(-1),a=points[i],b=points[(i+1)%points.length];if(Math.abs(n)>10000)throw Error('Calculated measurement exceeds 10000 mm.');if(key==='site'&&(Math.abs(n)<.001||sign(n)!==sign(axis==='x'?b.x-a.x:a.y-b.y)))throw Error('Section '+(i+1)+' cannot be calculated without reversing or collapsing the traced line. Check the supplied dimensions.');result[i][key]=Math.abs(n);result[i][axis==='x'?'xSign':'ySign']=sign(n);notes.push('Section '+(i+1)+' '+key+': '+Number(Math.abs(n).toFixed(3))+' mm, calculated from the other measurements'+(rows.length>1?' and marked right angles':'')+'.');});
 }
 return {values:result,notes};
}
function infer(points,values,folds=[],constraints={}){
 const prepared=values.map((v,i)=>{const copy={...v},k=v.kind||kind(points[i],points[(i+1)%points.length]);delete copy.inferredMeasurements;for(const [key,value] of Object.entries(v.inferredMeasurements||{}))if(copy[key]===value)copy[key]=null;for(const key of ['site','width','height'])delete copy['calculate'+key];for(const key of k==='sloping'?['width','height']:['site'])if(copy[key]==null)copy['calculate'+key]=true;return copy;});
 // A direct distance constraint owns its single intervening axis measurement.
 // Keep multi-edge spans fixed unless existing unknowns already identify a solution.
 for(const c of constraints.measurementConstraints||[]){
  if(c.fold!=null||c.edge!=null)continue;
  if(!['x','y'].includes(c.axis)||!Number.isInteger(c.from)||!points[c.from])continue;
  const f=c.fold!=null?folds[c.fold]:null,targets=f?[f.from,f.to]:[c.to],paths=[];
  for(const to of targets){if(!Number.isInteger(to)||!points[to]||to===c.from)continue;
   for(const [start,end] of [[c.from,to],[to,c.from]]){
    const active=[];let count=0;
    for(let i=start;i!==end;i=(i+1)%points.length){count++;const v=prepared[i],k=v.kind||kind(points[i],points[(i+1)%points.length]);
     if((c.axis==='x'&&k==='vertical')||(c.axis==='y'&&k==='horizontal'))continue;
     active.push({i,key:k==='sloping'?(c.axis==='x'?'width':'height'):'site'});
    }
    if(active.length===1)paths.push({...active[0],count});
   }
  }
  paths.sort((a,b)=>a.count-b.count);
  if(paths.length&& !paths.some(p=>p.count===paths[0].count&&p.i!==paths[0].i)){
   const {i,key}=paths[0];prepared[i][key]=null;prepared[i]['calculate'+key]=true;
  }
 }
 let solved;
 try{solved=resolve(points,prepared,folds,{...constraints,partial:true});}
 catch(error){
  // A snapped trace is approximate. Only relax one unmarked, unlocked axis
  // when the written dimensions and fold constraints identify it uniquely.
  if(!constraints.rightAngles?.length&&!constraints.measurementConstraints?.length)throw error;
  let baseline;try{baseline=resolve(points,prepared,folds,{...constraints,measurementConstraints:[],partial:true}).values;}catch(_){baseline=prepared;}
  const candidates=[];
  baseline.forEach((v,i)=>{
   const k=v.kind||kind(points[i],points[(i+1)%points.length]);
   if(!['horizontal','vertical'].includes(k)||v.shapeExplicit||!Number.isFinite(v.site))return;
   if((constraints.rightAngles||[]).some(c=>c.edge===i)||(constraints.edgeRightAngles||[]).some(c=>c===i||c===(i+1)%points.length))return;
   const major=k==='horizontal'?'width':'height',minor=k==='horizontal'?'height':'width';
   const trial=prepared.map(e=>({...e}));
   trial[i]={...v,kind:'sloping',[major]:v.site,[minor]:null,['calculate'+minor]:true};delete trial[i].calculatesite;if(prepared[i].calculatesite)trial[i]['calculate'+major]=true;
   try{
    const result=resolve(points,trial,folds,{...constraints,partial:true}),edge=result.values[i];
    if(!Number.isFinite(edge[minor])||edge[minor]<.001||edge[minor]>edge[major]*.05)return;
    if(result.values.some(e=>(e.kind==='sloping'?['width','height']:['site']).some(key=>!Number.isFinite(e[key]))))return;
    build(points,result.values,folds,constraints);
    candidates.push({result,trial,i});
   }catch(_){}
  });
  if(candidates.length!==1)throw error;
  const chosen=candidates[0];solved=chosen.result;prepared.splice(0,prepared.length,...chosen.trial);
  solved.notes.push('Section '+(chosen.i+1)+' has a slight slope calculated from the written dimensions and marked right angles.');
 }
 solved.values.forEach((v,i)=>{const inferred={};for(const key of ['site','width','height'])if(prepared[i]['calculate'+key]&&Number.isFinite(v[key]))inferred[key]=v[key];if(Object.keys(inferred).length)v.inferredMeasurements=inferred;});
 const remaining=solved.values.reduce((n,v,i)=>n+((v.kind||kind(points[i],points[(i+1)%points.length]))==='sloping'?['width','height']:['site']).filter(key=>v[key]==null).length,0);for(const v of solved.values)for(const key of ['site','width','height'])delete v['calculate'+key];
 return {...solved,remaining};
}
function mergeReadMeasurements(values,edges){
 return values.map((value,i)=>{
  const v={...value},e=edges[i]||{};
  for(const key of ['site','width','height']){
   if(v[key]!=null||v.manualMeasurements?.[key])continue;
   if(Number.isFinite(e[key])&&e[key]>=(key==='site'?.001:0)&&e[key]<=10000){
    v[key]=e[key];v.readMeasurements={...v.readMeasurements,[key]:e[key]};
   }
  }
  if(!v.code&&['B','S','NT','RE','FE','CR'].includes(e.code))v.code=e.code;
  return v;
 });
}
function prepareGeneration(draft){
 if(draft.correctionDraft)throw Error('Apply the corrected outline before generating.');
 if(!draft.measuredEdges||!draft.outlineSections?.length)return draft;
 const points=draft.outlineSections.map(s=>({...s.start})),values=draft.outlineSections.map(s=>({...s}));
 const folds=draft.markedFolds||restore(draft).folds;
 const solved=infer(points,values,folds,draft);
 if(solved.remaining)throw Error(solved.remaining+' measurements need another dimension or constraint before generating.');
 return {...draft,...build(points,solved.values,folds,draft),outlineSections:points.map((start,i)=>({...solved.values[i],start})),calculationError:''};
}
function kind(a,b){const x=Math.abs(b.x-a.x),y=Math.abs(b.y-a.y);return y<=x*.05?'horizontal':x<=y*.05?'vertical':'sloping';}
function build(points,values,folds=[],constraints={}){
 values=resolve(points,values,folds,constraints).values;
 let x=0,y=0;const ps=[];
 const edges=values.map((v,i)=>{const a=points[i],b=points[(i+1)%points.length],k=v.kind||kind(a,b);ps.push({x,y});
 const w=k==='vertical'?0:k==='horizontal'?v.site:v.width,h=k==='horizontal'?0:k==='vertical'?v.site:v.height;
 if(!Number.isFinite(w)||!Number.isFinite(h)||w<0||h<0||w>10000||h>10000||Math.hypot(w,h)<.001||!['B','S','NT','RE','FE','CR'].includes(v.code))throw Error('Check section '+(i+1)+' written measurements and tag.');
 const dx=(v.xSign??sign(b.x-a.x))*w,dy=(v.ySign??sign(a.y-b.y))*h;x+=dx;y+=dy;return {dx,dy,code:v.code};});
 if(Math.hypot(x,y)>.001)throw Error('The written measurements leave a gap of '+Number(Math.abs(x).toFixed(3))+' mm across and '+Number(Math.abs(y).toFixed(3))+' mm vertically. Check the section measurements.');
 for(const c of constraints.measurementConstraints||[]){if(c.fold==null&&c.edge==null)continue;
  const f=c.edge!=null?{from:c.edge,to:(c.edge+1)%ps.length}:folds[c.fold],a=ps[f?.from],b=ps[f?.to],p=ps[c.from];if(!a||!b||!p)throw Error('Check the corner-to-line constraint.');
  const dx=b.x-a.x,dy=b.y-a.y,length2=dx*dx+dy*dy,t=((p.x-a.x)*dx+(p.y-a.y)*dy)/length2;
  if(!Number.isFinite(t)||t<-.000001||t>1.000001)throw Error('The perpendicular measurement falls outside its selected line.');
 }
 return {measuredEdges:edges,measuredFolds:folds.map(f=>{if(!ps[f.from]||!ps[f.to])throw Error('Check fold endpoints.');return {start:{...ps[f.from]},end:{...ps[f.to]},startPoint:f.from,endPoint:f.to};}),rightAngles:constraints.rightAngles||[],reliefEnds:constraints.reliefEnds||[],measurementConstraints:constraints.measurementConstraints||[]};
}
function restore(d){
 if(!d?.measuredEdges)return null;
 let x=0,y=0;const ps=d.measuredEdges.map(e=>{const p={x,y};x+=e.dx;y+=e.dy;return p;});
 const xs=ps.map(p=>p.x),ys=ps.map(p=>p.y),minX=Math.min(...xs),maxY=Math.max(...ys),scale=800/Math.max(Math.max(...xs)-minX,maxY-Math.min(...ys),1);
 const points=d.outlineSections?.length===ps.length?d.outlineSections.map(s=>({...s.start})):ps.map(p=>({x:100+(p.x-minX)*scale,y:100+(maxY-p.y)*scale}));
 const values=d.measuredEdges.map((e,i)=>({xSign:sign(e.dx),ySign:sign(e.dy),code:e.code,kind:e.dx===0?'vertical':e.dy===0?'horizontal':'sloping',site:e.dx===0?Math.abs(e.dy):Math.abs(e.dx),width:Math.abs(e.dx),height:Math.abs(e.dy),...d.outlineSections?.[i]}));
 const folds=(d.measuredFolds||[]).map(f=>({from:Number.isInteger(f.startPoint)?f.startPoint:ps.findIndex(p=>Math.hypot(p.x-f.start.x,p.y-f.start.y)<.001),to:Number.isInteger(f.endPoint)?f.endPoint:ps.findIndex(p=>Math.hypot(p.x-f.end.x,p.y-f.end.y)<.001)}));
 return {points,values,folds};
}
window.PanelSketchComponents={kind,build,restore,resolve,infer,mergeReadMeasurements,prepareGeneration};
})();

