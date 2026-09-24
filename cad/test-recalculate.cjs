const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(process.argv[2]||require('node:path').join(__dirname,'cad.js'),'utf8');
const context={codes:['B','S','NT','RE','FE','CR']};vm.createContext(context);
vm.runInContext(source.slice(source.indexOf('function recalculateOutline('),source.indexOf('function recalculateEditedOutline(')),context);
const draft={folds:[],edges:['right','up','up','up','left','down'].map((direction,i)=>({direction,code:['B','S','S','S','S','B'][i],site:[800,400,150,300,650,700][i],finished:1}))};
const values=()=>draft.edges.map(e=>e.finished);
context.recalculateOutline(draft);assert.deepEqual(values(),[null,null,null,null,null,null]);
draft.edges[2].direction='left';context.recalculateOutline(draft);assert.deepEqual(values(),[798,398,150,300,648,698]);
draft.edges[0].site=801;context.recalculateOutline(draft);assert.ok(values().every(v=>v===null));
draft.edges[0].site=800;draft.unsupported=true;context.recalculateOutline(draft);assert.ok(values().every(v=>v===null));
draft.unsupported=false;draft.edges[0].code='FE';context.recalculateOutline(draft);assert.ok(values().every(v=>v===null));
draft.folds=[98];draft.edges[0].finished=777;assert.equal(context.recalculateOutline(draft),false);assert.equal(draft.edges[0].finished,777);
assert.ok(source.includes('if(fields.indexOf(field)>=1&&fields.indexOf(field)<=3)recalculateEditedOutline()'));
console.log('PASS: corrected step recalculates; invalid outlines clear stale values; uncertain/FE geometry blocked; folded drafts preserved.');

