const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const start=source.indexOf('    function orderItemKeyDown('),end=source.indexOf('    function openPanel(',start);
function setup({items=[{quantity:1,description:'ANGLE'}],mode='new',receipts=[],quantity='1',description='ANGLE',validQuantity=true,validDescription=true,next=false}={}){
 let panel={mode,order:{items,receipts}},focused='',prevented=false;
 const field=(name,value,valid)=>({value,reportValidity:()=>valid,focus:()=>{focused=name;}});
 const fields={number:field('quantity',quantity,validQuantity),text:field('description',description,validDescription)};
 const nextRow={hasAttribute:name=>name==='data-order-item',querySelector:()=>({focus:()=>{focused='next';}})};
 const row={querySelector:selector=>fields[selector.includes('number')?'number':'text'],nextElementSibling:next?nextRow:null};
 const context={panel,itemFocusIndex:{current:null},setPanel:fn=>{panel=fn(panel);}};
 vm.runInNewContext(source.slice(start,end)+'globalThis.handle=orderItemKeyDown;',context);
 return {press(overrides={}){prevented=false;context.handle({key:'Enter',target:{tagName:'INPUT'},currentTarget:row,preventDefault:()=>{prevented=true;},...overrides},0);},get panel(){return panel;},get focused(){return focused;},get prevented(){return prevented;},get pendingFocus(){return context.itemFocusIndex.current;}};
}
test('Enter appends one blank item, preserves current values and requests focus without submitting',()=>{
 const form=setup();form.press();assert.equal(form.prevented,true);assert.deepEqual(JSON.parse(JSON.stringify(form.panel.order.items)),[{quantity:1,description:'ANGLE'},{quantity:1,description:''}]);assert.equal(form.pendingFocus,1);
});
test('Enter moves to an existing next line instead of adding another',()=>{
 const form=setup({next:true,items:[{quantity:1,description:'ANGLE'},{quantity:2,description:'BOLT'}]});form.press();assert.equal(form.focused,'next');assert.equal(form.panel.order.items.length,2);assert.equal(form.pendingFocus,null);
});
test('incomplete or invalid item focuses the field instead of adding or submitting',()=>{
 for(const options of [{quantity:''},{validQuantity:false},{description:'   '},{validDescription:false}]){
  const form=setup(options);form.press();assert.equal(form.prevented,true);assert.equal(form.panel.order.items.length,1);assert.equal(form.focused,'quantity' in options||'validQuantity' in options?'quantity':'description');
 }
});
test('held Enter cannot append rows and IME composition is left intact',()=>{
 const held=setup();held.press({repeat:true});assert.equal(held.prevented,true);assert.equal(held.panel.order.items.length,1);
 for(const composition of [{isComposing:true},{nativeEvent:{isComposing:true}},{keyCode:229},{nativeEvent:{keyCode:229}}]){const form=setup();form.press(composition);assert.equal(form.prevented,false);assert.equal(form.panel.order.items.length,1);}
});
test('other keys and buttons keep native behavior; read-only and received items cannot change',()=>{
 for(const overrides of [{key:'Tab'},{target:{tagName:'BUTTON'}}]){const form=setup();form.press(overrides);assert.equal(form.prevented,false);assert.equal(form.panel.order.items.length,1);}
 for(const options of [{mode:'view'},{receipts:[{id:'receipt'}]}]){const form=setup(options);form.press();assert.equal(form.panel.order.items.length,1);assert.equal(form.pendingFocus,null);}
});
