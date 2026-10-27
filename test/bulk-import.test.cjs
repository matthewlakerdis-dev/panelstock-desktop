const {test}=require('node:test'),assert=require('node:assert/strict');
const {importFiles}=require('../cad/automatic-pack.js');
const pdf=new File(['reference only'],'order.pdf',{type:'application/pdf'});
const files=[new File(['one'],'one.dxf'),new File(['two'],'two.dxf')];
const panel=name=>({name,quantity:1,spec:{panelId:name,reviewed:true},result:{dxf:'unchanged geometry',svg:'<svg/>',validation:{closedCut:true,checks:['valid'],measurements:[],warnings:[],fabricationTags:[],stiffeners:[]}}});
test('bulk import keeps PDF traceability and never reads PDF, regenerates or schedules',async()=>{
 const calls=[];const result=await importFiles({files,pdf,request:async(path,body)=>{calls.push(body);assert.equal(path,'/cad/analyse');assert.equal(body.mode,'approved-dxf');return {panels:[panel(body.filename)]};}});
 assert.equal(result.length,2);assert.equal(calls.length,2);
 for(const p of result){assert.equal(p.sourcePdf,pdf);assert.equal(p.result.dxf,'unchanged geometry');assert.ok(p.spec.sourcePdfSha256);assert.ok(p.spec.sourceDxfSha256);assert.ok(p.generatedSpec);}
});
test('duplicate IDs across files fail atomically',async()=>{await assert.rejects(importFiles({files,pdf,request:async()=>({panels:[panel('same')]})}),/Duplicate panel ID/);});
test('existing panel IDs cannot be overwritten',async()=>{await assert.rejects(importFiles({files:[files[0]],pdf,existing:[{name:'Same'}],request:async()=>({panels:[panel('same')]})}),/Duplicate panel ID/);});
test('PDF required and all file types checked before any request',async()=>{let calls=0;const request=async()=>{calls++;};await assert.rejects(importFiles({files,pdf:null,request}),/order PDF/);await assert.rejects(importFiles({files:[...files,new File(['x'],'bad.txt')],pdf,request}),/DXF up to/);assert.equal(calls,0);});

test('directional imports request explicit review instead of asserting non-directional stock',async()=>{
 let requestBody;await importFiles({files:[files[0]],pdf,request:async(_,body)=>{requestBody=body;return {panels:[panel('P-1')]};}});
 assert.equal(requestBody.nonDirectional,false);assert.equal(requestBody.reviewDirections,true);
 await importFiles({files:[files[0]],pdf,nonDirectional:true,request:async(_,body)=>{requestBody=body;return {panels:[panel('P-1')]};}});
 assert.equal(requestBody.nonDirectional,true);assert.equal(requestBody.reviewDirections,false);
});

test('non-directional batch confirms every imported panel without bypassing drawing validation',async()=>{
 const {markPanelsNonDirectional}=require('../cad/automatic-pack.js');
 const input=['A','B'].map(name=>({...panel(name),reviewed:false,spec:{panelId:name,importedDxf:true,directionReviewed:false}}));
 const original=JSON.stringify(input);const calls=[];
 const updated=await markPanelsNonDirectional(input,async(_,body)=>{calls.push(body);return {dxf:'no arrow',svg:'<svg/>'};});
 assert.equal(JSON.stringify(input),original);assert.equal(calls.length,2);
 for(const p of updated){assert.equal(p.spec.panelDirection,'none');assert.equal(p.spec.directionReviewed,true);assert.equal(p.reviewed,false);assert.equal(p.result.validation.closedCut,true);assert.ok(p.generatedSpec);}
 let count=0;await assert.rejects(markPanelsNonDirectional(input,async()=>{if(++count===2)throw Error('Unavailable');return {dxf:'updated',svg:'<svg/>'};}),/Unavailable/);
 assert.equal(JSON.stringify(input),original);
});
