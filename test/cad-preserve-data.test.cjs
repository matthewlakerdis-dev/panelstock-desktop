const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'../cad/cad.js'),'utf8');
const context=vm.createContext({structuredClone});
vm.runInContext("const codes=['B','S','NT','RE','FE','CR'];"+source.slice(source.indexOf('function recalculateOutline('),source.indexOf('function recalculateEditedOutline('))+';globalThis.calculate=recalculateOutline;',context);
function draft(){return {panelId:'Keep me',siteFolds:[300],folds:[298],edges:['right','up','left','down'].map((direction,i)=>({direction,code:'B',site:i%2?800:1000,finished:i%2?796:998}))};}
test('incomplete and non-closing site edits retain finished measurements and folds',()=>{
 for(const value of [null,0,NaN,1100]){const d=draft(),before=d.edges.map(e=>e.finished);d.edges[0].site=value;context.calculate(d);assert.deepEqual(d.edges.map(e=>e.finished),before);assert.deepEqual(d.folds,[298]);assert.ok(d.calculationError);}
});
test('invalid fold edit retains finished dimensions and prior calculated folds',()=>{const d=draft();d.siteFolds=[900];context.calculate(d);assert.deepEqual(d.edges.map(e=>e.finished),[998,796,998,796]);assert.deepEqual(d.folds,[298]);assert.ok(d.calculationError);});
test('valid edits commit recalculated dimensions and clear calculation errors',()=>{const d=draft();d.edges[0].site=d.edges[2].site=1200;context.calculate(d);assert.deepEqual(d.edges.map(e=>e.finished),[1198,796,1198,796]);assert.equal(d.calculationError,'');assert.equal(d.panelId,'Keep me');});


test('legacy vertical-fold restriction is revalidated but diagonal restriction remains',()=>{
 const d=draft();d.siteFolds=[];d.foldLines=[{start:{x:300,y:0},end:{x:300,y:800}}];
 d.directionSource='manual-sketch-trace';d.unsupported=true;
 d.questions=['Vertical or diagonal folds are marked and saved. Their deductions and machining geometry still need review before generation.'];
 context.calculate(d);assert.equal(d.unsupported,false);assert.equal(d.calculationError,'');assert.deepEqual(d.edges.map(e=>e.finished),[996,798,996,798]);
 const bad=draft();bad.siteFolds=[];bad.directionSource='manual-sketch-trace';bad.unsupported=true;
 bad.questions=['Vertical or diagonal folds are marked and saved. Their deductions and machining geometry still need review before generation.'];
 bad.foldLines=[{start:{x:300,y:0},end:{x:500,y:800}}];context.calculate(bad);assert.equal(bad.unsupported,true);
});
