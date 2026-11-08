const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'../index.html'),'utf8');
const start=source.indexOf('  function orderListTitle('),end=source.indexOf('  function groupOrdersByProject(',start),context={};
vm.runInNewContext(source.slice(start,end)+'globalThis.title=orderListTitle;',context);
test('ungrouped names include the order, project, type and actual location or Gate villa',()=>{
 const base={orderNumber:'26',project:'Notre Dame College Stage 2',orderType:'Panels',location:'C1 fascia Panels'};
 assert.equal(context.title(base),'#26 - Notre Dame College Stage 2 - Panels - C1 fascia Panels');
 assert.equal(context.title(base,true),'#26 - Panels - C1 fascia Panels');
 assert.equal(context.title({...base,orderType:'Gate',villa:'V135'},true),'#26 - Gate - V135');
 assert.equal(context.title({...base,location:'',locationNotes:'C1 fascia Panels'},true),'#26 - Panels - C1 fascia Panels');
 assert.equal(context.title({...base,orderType:'Gate',villa:'V135'}),'#26 - Notre Dame College Stage 2 - Gate - V135');
 assert.equal(context.title({...base,location:'',locationNotes:'C1 fascia Panels'}),'#26 - Notre Dame College Stage 2 - Panels - C1 fascia Panels');
});
test('Notes are not mistaken for a location on older non-panel orders',()=>{
 const order={orderNumber:'25',project:'Notre Dame College Stage 2',orderType:'Consumables',locationNotes:'Consumables',notes:'Keep dry'};
 assert.equal(context.title(order),'#25 - Notre Dame College Stage 2 - Consumables');
 assert.equal(context.title(order,true),'#25 - Consumables');
 assert.equal(context.title({...order,location:'Loading bay'}),'#25 - Notre Dame College Stage 2 - Consumables - Loading bay');
 assert.equal(context.title({orderNumber:'1',project:'Example',orderType:'Gate',locationNotes:'Old notes'}),'#1 - Example - Gate');
});
test('missing values leave no dangling separators and grouped headings omit the project',()=>{
 assert.equal(context.title({orderNumber:'7',project:'Example',orderType:'Fixings'}),'#7 - Example - Fixings');
 assert.equal(context.title({orderNumber:'7',project:'Example',orderType:''}),'#7 - Example - Other');
 const order={orderNumber:'7',project:'Example',orderType:'Gate',villa:'V12'},before=JSON.stringify(order);
 assert.equal(context.title(order,true),'#7 - Gate - V12');assert.equal(context.title({orderNumber:'7',project:'Example',orderType:'Fixings'},true),'#7 - Fixings');assert.equal(JSON.stringify(order),before);
});
