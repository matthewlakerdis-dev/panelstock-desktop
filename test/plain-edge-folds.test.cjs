const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../cad/cad.js'),'utf8');
test('plain rectangle folds recalculate horizontal and vertical dimensions',()=>{
 const c={structuredClone,codes:['FE','CR','B','S','NT','RE']};
 vm.runInNewContext(source.slice(source.indexOf('function recalculateOutline('),source.indexOf('function initialiseSiteFolds(')),c);
 c.initialiseSiteFolds=()=>{};
 for(const vertical of [false,true]){
  const draft={edges:['right','up','left','down'].map((direction,i)=>({direction,code:'FE',site:i%2?595:2500})),siteFolds:vertical?[]:[20,45],calculationError:'Internal folds must end at tagged vertical sides.'};
  if(vertical)draft.foldLines=[20,45].map(x=>({start:{x,y:0},end:{x,y:595}}));
  c.recalculateOutline(draft);
  assert.equal(draft.calculationError,'');
  assert.deepEqual(draft.edges.map(e=>e.finished),vertical?[2496,595,2496,595]:[2500,591,2500,591]);
  assert.equal(JSON.stringify(vertical?draft.verticalFolds:draft.folds),'[19,42]');
 }
});
