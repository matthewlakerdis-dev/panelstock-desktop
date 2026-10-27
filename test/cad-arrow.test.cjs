const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'../cad/cad.js'),'utf8');
function fixture(imported=false){
 const controls=Object.fromEntries(['paneldirection','preview'].map(id=>[id,{value:'down'}]));
 const calls=[];
 const context=vm.createContext({panels:[{}],panelIndex:0,drawingSpecKey:value=>JSON.stringify(value),busy:false,spec:{panelId:'Panel 1',panelDirection:'right',importedDxf:imported},result:{dxf:'original',svg:'original preview',validation:{source:'approved-dxf'}},previewURL:null,Blob,URL:{createObjectURL:()=> 'preview-url',revokeObjectURL:()=>{}},$:id=>controls[id],api:async(path,body)=>{calls.push(body);return {dxf:'updated',svg:'updated preview',panelDirection:body.panelDirection};},rememberPanel:()=>calls.push('remember'),renderDrawingChecks:()=>{},notice:()=>{},queueProjectSave:()=>calls.push('save')});
 context.run=async action=>{try{await action();context.queueProjectSave();}catch(e){context.error=e;}};
 context.invalidate=()=>{context.result=null;calls.push('invalidate');};
 vm.runInContext(source.slice(source.indexOf('async function setPanelArrow('),source.indexOf("$('paneldirection').onchange="))+';globalThis.setArrow=setPanelArrow;',context);
 return {context,controls,calls};
}
test('manual arrow change invalidates the old drawing and persists the panel direction',async()=>{
 const {context,calls}=fixture();await context.setArrow('down');
 assert.equal(context.spec.panelDirection,'down');assert.equal(context.result,null);assert.deepEqual(calls,['invalidate','remember','save']);
});
test('imported arrow updates the actual drawing and retains validation provenance',async()=>{
 const {context,controls,calls}=fixture(true);await context.setArrow('down');
 assert.equal(calls[0].panelArrow,true);assert.equal(calls[0].dxf,'original');assert.equal(calls[0].panelDirection,'down');
 assert.equal(context.spec.panelDirection,'down');assert.equal(context.spec.directionReviewed,true);assert.equal(context.panels[0].generatedSpec,JSON.stringify(context.spec));assert.equal(context.result.dxf,'updated');assert.equal(context.result.validation.source,'approved-dxf');assert.equal(controls.preview.hidden,false);
});
test('failed imported update retains the previous direction and downloadable DXF',async()=>{
 const {context,controls,calls}=fixture(true);context.api=async()=>{throw Error('service unavailable');};await context.setArrow('down');
 assert.equal(context.spec.panelDirection,'right');assert.equal(context.result.dxf,'original');assert.equal(controls.paneldirection.value,'right');assert.equal(calls.includes('remember'),false);
});
test('applying the existing imported direction still creates its missing annotation',async()=>{
 const {context,calls}=fixture(true);await context.setArrow('right');assert.equal(calls[0].panelDirection,'right');assert.equal(context.result.dxf,'updated');
});
