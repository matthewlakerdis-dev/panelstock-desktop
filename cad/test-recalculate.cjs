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
const rectangle=()=>({siteFolds:[100],folds:[],edges:['right','up','left','down'].map((direction,i)=>({direction,code:i%2?'B':'S',site:i%2?850:1500,finished:null}))});
const r=rectangle();context.recalculateOutline(r);assert.deepEqual(Array.from(r.folds),[98]);assert.deepEqual(r.edges.map(e=>e.finished),[1498,846,1498,846]);
for(let i=0;i<5;i++)context.recalculateOutline(r);assert.deepEqual(Array.from(r.folds),[98]);
r.siteFolds=[100,400];context.recalculateOutline(r);assert.deepEqual(Array.from(r.folds),[98,396]);assert.equal(r.edges[1].finished,844);
r.siteFolds=[];context.recalculateOutline(r);assert.equal(r.edges[1].finished,848);assert.equal(r.folds.length,0);
for(const folds of [[100,100],[0],[850],[1],[100,101],[NaN]]){r.siteFolds=folds;context.recalculateOutline(r);assert.ok(r.calculationError);assert.ok(r.edges.every(e=>e.finished===null));}
const old=rectangle();delete old.siteFolds;old.folds=[98];old.dimensionSource='site-outline-1mm-fold-allowance';context.recalculateOutline(old);assert.deepEqual(Array.from(old.siteFolds),[100]);assert.deepEqual(Array.from(old.folds),[98]);
const unknown=rectangle();delete unknown.siteFolds;unknown.folds=[98];context.recalculateOutline(unknown);assert.ok(unknown.calculationError);assert.ok(unknown.edges.every(e=>e.finished===null));
const stepped=JSON.parse(JSON.stringify(draft));stepped.siteFolds=[100];stepped.edges[0].code='B';context.recalculateOutline(stepped);assert.ok(stepped.calculationError);
assert.ok(source.includes('if(fields.indexOf(field)>=1&&fields.indexOf(field)<=3)recalculateEditedOutline()'));
console.log('PASS: step recovery, fold edits/removal, repeat calculations, migration and invalid fold checks.');

