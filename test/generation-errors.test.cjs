const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../cad/cad.js'),'utf8');
const handler=source.slice(source.indexOf("$('generate').onclick="),source.indexOf("\n$('download').onclick="));
for(const [name,error,expected] of [['validation',Error('Top width conflicts with constraint.'),'Top width conflicts with constraint.'],['timeout',Object.assign(Error('timeout'),{name:'TimeoutError'}),'timed out']])test('generation shows '+name+' beside button and clears stale output',async()=>{
 const nodes={},$=id=>nodes[id]??=( {hidden:false,textContent:'',scrollIntoView(){this.scrolled=true;}} );
 const box=$('error'),context={$,generationErrorBox:()=>box,result:{dxf:'old'},run:async action=>{try{await action();}catch(_){}},collect:()=>({}),PanelSketchComponents:{prepareGeneration(){throw error;}}};
 vm.runInNewContext(handler,context);await $('generate').onclick();assert.equal(box.hidden,false);assert.ok(box.textContent.includes(expected));assert.equal(context.result,null);assert.equal($('preview').hidden,true);assert.equal(box.scrolled,true);
});

