const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../cad/cad.js'),'utf8'),c={};
vm.runInNewContext(source.slice(source.indexOf('function batchSummary('),source.indexOf('function printDrawingSummary(')),c);
test('batch summary groups panel IDs and required stiffener lengths',()=>{
 const item=(name,stiffeners)=>({name,drawing:{validation:{stiffeners}}});
 const r=c.batchSummary([item('A',[{length:1193}]),item('A',[{length:1193}]),item('B',[{start:[0,0],end:[0,639]}])]);
 assert.equal(r.count,3);assert.equal(r.stiffeners,3);assert.equal(JSON.stringify(r.panels),'[["A",2],["B",1]]');assert.equal(JSON.stringify(r.lengths),'[[640,1],[1195,2]]');
});
test('cut lengths round upward, group rounded sizes and preserve drawing data',()=>{
 const lengths=[150,150.01,153,155];
 const items=[{name:'A',drawing:{validation:{stiffeners:lengths.map(length=>({length})),fabricationTags:lengths.map(length=>({edge:1,type:'B',length,quantity:1}))}}}];
 const before=JSON.stringify(items),r=c.batchSummary(items);
 assert.equal(JSON.stringify(r.lengths),'[[150,1],[155,3]]');
 assert.equal(JSON.stringify(r.tags.map(row=>row[3])),'[150,155,155,155]');
 assert.equal(JSON.stringify(items),before);
});
test('missing length is reported rather than invented',()=>{
 const r=c.batchSummary([{name:'A',drawing:{validation:{stiffeners:[{}]}}}]);assert.equal(r.unknownLengths,1);assert.equal(r.lengths.length,0);
 assert.equal(c.batchSummary([]).count,0);
});

