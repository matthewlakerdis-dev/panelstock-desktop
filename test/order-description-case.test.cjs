const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'../index.html'),'utf8');
test('desktop descriptions use uppercase while quantity and composing input retain their original values',()=>{
 const start=source.indexOf('    const updateItem ='),end=source.indexOf('\n',start);
 let panel={order:{items:[{quantity:'1',description:''},{quantity:'2',description:'Untouched'}]}};
 const context={setPanel:fn=>{panel=fn(panel);}};vm.runInNewContext(source.slice(start,end)+'globalThis.update=updateItem;',context);
 context.update(0,'description','aluminium angle / M6');assert.equal(panel.order.items[0].description,'ALUMINIUM ANGLE / M6');assert.equal(panel.order.items[1].description,'Untouched');
 context.update(0,'quantity','3');assert.equal(panel.order.items[0].quantity,'3');
 context.update(0,'description','angle',true);assert.equal(panel.order.items[0].description,'angle');context.update(0,'description','angle');assert.equal(panel.order.items[0].description,'ANGLE');
});
test('desktop input capitalisation preserves selections including Unicode expansion and composition',()=>{
 const start=source.indexOf('    function uppercaseOrderDescription('),end=source.indexOf('    const updateItem',start),context={};
 vm.runInNewContext(source.slice(start,end)+'globalThis.normalise=uppercaseOrderDescription;',context);
 const input={value:'straße',selectionStart:5,selectionEnd:6,selectionDirection:'forward',setSelectionRange(start,end,direction){this.selectionStart=start;this.selectionEnd=end;this.selectionDirection=direction;}};
 context.normalise({target:input});assert.equal(input.value,'STRASSE');assert.equal(input.selectionStart,6);assert.equal(input.selectionEnd,7);
 input.value='angle';context.normalise({target:input,nativeEvent:{isComposing:true}});assert.equal(input.value,'angle');
});
