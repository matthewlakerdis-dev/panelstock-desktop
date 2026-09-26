const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const context={window:{}};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../cad/sketch-components.js'),'utf8'),context);
const api=context.window.PanelSketchComponents;
const points=[{x:0,y:100},{x:100,y:100},{x:100,y:0},{x:0,y:0}];
const values=[{kind:'horizontal',site:100},{kind:'vertical',site:100},{kind:'horizontal',site:100},{kind:'vertical',site:100}];
test('measurement provenance is accurate and never invents entered status for old drafts',()=>{
 assert.equal(api.measurementSource({site:100},'site'),'Saved measurement');
 assert.equal(api.measurementSource({site:null,manualMeasurements:{site:true}},'site'),'Missing');
 assert.equal(api.measurementSource({site:100,readMeasurements:{site:100}},'site'),'Read from sketch');
 assert.equal(api.measurementSource({site:100,inferredMeasurements:{site:100}},'site'),'Calculated');
 assert.equal(api.measurementSource({site:100,manualMeasurements:{site:true},inferredMeasurements:{site:100}},'site'),'Entered');
});
test('direct constraint conflict names only the involved span and retains values',()=>{
 const before=JSON.stringify(values);
 assert.throws(()=>api.resolve(points,values,[],{measurementConstraints:[{from:0,to:1,axis:'x',value:90}]}),e=>{
  assert.match(e.message,/horizontal.*constraint 1.*sections 1\./);
  assert.deepEqual(Array.from(e.conflict.edges),[0]);
  assert.deepEqual(Array.from(e.conflict.constraints),[0]);return true;
 });
 assert.equal(JSON.stringify(values),before);
});
test('conflicts after elimination retain both contradictory constraint references',()=>{
 const missing=values.map((v,i)=>i===0?{...v,site:null,calculatesite:true}:v);
 assert.throws(()=>api.resolve(points,missing,[],{measurementConstraints:[{from:0,to:1,axis:'x',value:90},{from:0,to:1,axis:'x',value:80}]}),e=>{
  assert.equal(e.conflict.axis,'x');assert.ok(e.conflict.constraints.length);assert.ok(e.conflict.edges.includes(0));return true;
 });
});
test('right angle conflict identifies its fold',()=>{
 assert.throws(()=>api.resolve(points,values,[{from:0,to:2}],{rightAngles:[{fold:0,edge:1,end:1}]}),e=>{
  assert.equal(e.conflict.axis,'y');assert.deepEqual(Array.from(e.conflict.folds),[0]);return true;
 });
});

