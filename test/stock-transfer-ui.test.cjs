const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

test('Web conversion uses the full-panel picker and entered output dimensions',()=>{
  const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
  const start=html.indexOf('  function TransferPage('),end=html.indexOf('  function DispatchPage(',start),source=html.slice(start,end);
  assert.match(source,/ItemPicker/);
  assert.match(source,/offcuts:\[\]/);
  assert.match(source,/Length \(mm\)/);
  assert.match(source,/Width \(mm\)/);
  assert.match(source,/output\.length/);
  assert.match(source,/output\.width/);
  assert.match(source,/onClick:submit/);
  assert.match(source,/===true/);
  assert.match(source,/setSource\(null\)/);
  assert.match(source,/setSourceQty\("1"\)/);
  assert.match(source,/setOutputs\(\[\{length:"",width:"",qty:"1"\}\]\)/);
  assert.doesNotMatch(source,/Select size/);
});
