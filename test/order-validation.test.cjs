const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8'),start=source.indexOf('  function validateSiteOrderForm('),end=source.indexOf('  function ModernDatePicker(',start);
function fixture(first,{valid=false,descriptions=[]}={}){
 const calls=[],context={requestAnimationFrame:fn=>fn()};vm.runInNewContext(source.slice(start,end)+'globalThis.validate=validateSiteOrderForm;',context);
 const form={classList:{add:()=>{}},querySelectorAll:()=>descriptions,checkValidity:()=>valid,querySelector:()=>first};
 return {validate:()=>context.validate(form),calls};
}
test('Site Order validation focuses and centres the first invalid field',()=>{
 const calls=[],first={isConnected:true,hasAttribute:()=>false,scrollIntoView:options=>calls.push(['scroll',options.block]),focus:options=>calls.push(['focus',options.preventScroll])};
 assert.equal(fixture(first).validate(),false);assert.deepEqual(calls,[['scroll','center'],['focus',true]]);
});
test('a missing date targets the visible calendar button',()=>{
 let focused=false,scrolled=false;const button={isConnected:true,scrollIntoView(){scrolled=true;},focus(){focused=true;}},hidden={hasAttribute:()=>true,parentElement:{querySelector:()=>button}};
 assert.equal(fixture(hidden).validate(),false);assert.equal(focused,true);assert.equal(scrolled,true);
});
test('valid forms do not move focus and optional blank descriptions remain optional',()=>{
 const descriptions=[{value:''},{value:'ANGLE'}];assert.equal(fixture(null,{valid:true,descriptions}).validate(),true);assert.equal(descriptions[0].required,false);assert.equal(descriptions[1].required,false);
 const empty=[{value:'   '},{value:''}];fixture(null,{descriptions:empty}).validate();assert.equal(empty[0].required,true);assert.equal(empty[0].pattern,'.*\\S.*');assert.equal(empty[1].required,false);
});
