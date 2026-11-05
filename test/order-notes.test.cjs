const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'../index.html'),'utf8');
const start=source.indexOf('  function orderFormNotes('),end=source.indexOf('  const isGateOrder=',start),context={};
vm.runInNewContext(source.slice(start,end)+'globalThis.notes={orderFormNotes,orderNotesText};',context);
test('old note text populates the common editor without duplicating or losing saved notes',()=>{
 const fields=value=>JSON.parse(JSON.stringify(context.notes.orderFormNotes(value)));
 assert.deepEqual(fields({locationNotes:'Keep dry'}),{notes:'Keep dry',locationNotes:''});
 assert.deepEqual(fields({notes:'Keep dry',locationNotes:'Keep dry'}),{notes:'Keep dry',locationNotes:''});
 const source={notes:'a'.repeat(300),locationNotes:'b'.repeat(300)},before=JSON.stringify(source),result=fields(source);
 assert.deepEqual(result,source);assert.equal(JSON.stringify(source),before);assert.deepEqual(fields(result),result);
 assert.equal(context.notes.orderNotesText(source),'a'.repeat(300)+'\n\n'+'b'.repeat(300));
});
