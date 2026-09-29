const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(__dirname+'/../cad/cad.js','utf8');
test('normal save recomputes readiness for every panel instead of keeping stale metadata',()=>{
 const line=source.split('\n').find(line=>line.includes('const id=projectId,revision=projectRevision,data=PanelCadProjects.snapshot'));
 const panels=[{ready:true,drawingReadiness:{version:1,ready:false}},{ready:false,drawingReadiness:{version:1,ready:true}}];
 const calls=[];
 const c={projectId:'id',projectRevision:1,panels,panelIndex:0,projectName:'Order 7',uploadedSketchFiles:[],projectDetails:()=>({orderNumber:'7'}),panelDrawingReadiness:p=>{calls.push(p);return {version:1,ready:p.ready};},PanelCadProjects:{snapshot:(ps,index,name,files,details,readiness)=>ps.map(p=>({...p,drawingReadiness:readiness(p)}))}};
 vm.runInNewContext(line+';saved=data;',c);
 assert.equal(calls.length,2);assert.equal(c.saved[0].drawingReadiness.ready,true);assert.equal(c.saved[1].drawingReadiness.ready,false);
});
