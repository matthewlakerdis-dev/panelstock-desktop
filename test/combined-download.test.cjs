const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm'),path=require('path');
const source=fs.readFileSync(path.join(__dirname,'../cad/cad.js'),'utf8');
const fn=source.slice(source.indexOf('function generatedDrawings()'),source.indexOf('function updateNavigator()'));
const payloadContext={TextEncoder};
vm.runInNewContext(source.slice(source.indexOf('function combinedPayload('),source.indexOf('const sheetPlanButton=')),payloadContext);
test('combined payload allows normal files and rejects oversized batches clearly',()=>{
 assert.equal(payloadContext.combinedPayload([{dxf:'example'}]).drawings[0],'example');
 assert.throws(()=>payloadContext.combinedPayload(Array(31).fill({dxf:'x'})),/no more than 30/);
 assert.throws(()=>payloadContext.combinedPayload([{dxf:'x'.repeat(10*1024*1024)}]),/Select fewer/);
});
test('combined download uses current results and excludes stale current panel',()=>{const c={panels:[{result:{dxf:'old'}},{result:{dxf:'second'}},{result:null}],panelIndex:0,result:null};vm.runInNewContext(fn,c);assert.equal(c.generatedDrawings().length,1);assert.equal(c.generatedDrawings()[0].dxf,'second');c.result={dxf:'new'};assert.equal(c.generatedDrawings().length,2);assert.equal(c.generatedDrawings()[0].dxf,'new');});
