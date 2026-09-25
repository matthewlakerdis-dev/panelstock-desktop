/* Written dimensions determine size; traced points determine travel only. */
(()=>{'use strict';
const sign=n=>n<0?-1:1;
function kind(a,b){const x=Math.abs(b.x-a.x),y=Math.abs(b.y-a.y);return y<=x*.05?'horizontal':x<=y*.05?'vertical':'sloping';}
function build(points,values,folds=[],constraints={}){
 let x=0,y=0;const ps=[];
 const edges=values.map((v,i)=>{const a=points[i],b=points[(i+1)%points.length],k=v.kind||kind(a,b);ps.push({x,y});
 const w=k==='vertical'?0:k==='horizontal'?v.site:v.width,h=k==='horizontal'?0:k==='vertical'?v.site:v.height;
 if(!Number.isFinite(w)||!Number.isFinite(h)||w<0||h<0||w>10000||h>10000||Math.hypot(w,h)<.001||!['B','S','NT','RE','FE','CR'].includes(v.code))throw Error('Check section '+(i+1)+' written measurements and tag.');
 const dx=sign(b.x-a.x)*w,dy=sign(a.y-b.y)*h;x+=dx;y+=dy;return {dx,dy,code:v.code};});
 if(Math.hypot(x,y)>.001)throw Error('The written measurements leave a gap of '+Number(Math.abs(x).toFixed(3))+' mm across and '+Number(Math.abs(y).toFixed(3))+' mm vertically. Check the section measurements.');
 return {measuredEdges:edges,measuredFolds:folds.map(f=>{if(!ps[f.from]||!ps[f.to])throw Error('Check fold endpoints.');return {start:{...ps[f.from]},end:{...ps[f.to]},startPoint:f.from,endPoint:f.to};}),rightAngles:constraints.rightAngles||[],reliefEnds:constraints.reliefEnds||[]};
}
function restore(d){
 if(!d?.measuredEdges)return null;
 let x=0,y=0;const ps=d.measuredEdges.map(e=>{const p={x,y};x+=e.dx;y+=e.dy;return p;});
 const xs=ps.map(p=>p.x),ys=ps.map(p=>p.y),minX=Math.min(...xs),maxY=Math.max(...ys),scale=800/Math.max(Math.max(...xs)-minX,maxY-Math.min(...ys),1);
 const points=d.outlineSections?.length===ps.length?d.outlineSections.map(s=>({...s.start})):ps.map(p=>({x:100+(p.x-minX)*scale,y:100+(maxY-p.y)*scale}));
 const values=d.measuredEdges.map(e=>({code:e.code,kind:e.dx===0?'vertical':e.dy===0?'horizontal':'sloping',site:e.dx===0?Math.abs(e.dy):Math.abs(e.dx),width:Math.abs(e.dx),height:Math.abs(e.dy)}));
 const folds=(d.measuredFolds||[]).map(f=>({from:Number.isInteger(f.startPoint)?f.startPoint:ps.findIndex(p=>Math.hypot(p.x-f.start.x,p.y-f.start.y)<.001),to:Number.isInteger(f.endPoint)?f.endPoint:ps.findIndex(p=>Math.hypot(p.x-f.end.x,p.y-f.end.y)<.001)}));
 return {points,values,folds};
}
window.PanelSketchComponents={kind,build,restore};
})();
