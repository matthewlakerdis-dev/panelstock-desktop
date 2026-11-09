const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync(require('node:path').join(__dirname,'../index.html'),'utf8'),start=html.indexOf('  function DeliveryTimePicker('),end=html.indexOf('  function ScheduleAvatar(',start);
const createElement=(type,props,...children)=>({type,props:props||{},children:children.flat(Infinity)});
const walk=node=>!node||typeof node!=='object'?[]:[node,...(node.children||[]).flatMap(walk)];
function picker(initial='',disabled=false){
 let value=initial,changes=[];const fn=vm.runInNewContext(html.slice(start,end)+';DeliveryTimePicker',{import_react:{createElement}}),tree=()=>fn({value,disabled,onChange:next=>{value=next;changes.push(next);}}),find=match=>walk(tree()).find(match);
 return {tree,changes,value:()=>value,hour:()=>find(n=>n.props['aria-label']==='Delivery hour'),minute:()=>find(n=>n.props['aria-label']==='Delivery minute'),button:text=>find(n=>n.type==='button'&&n.children.includes(text))};
}
test('optional delivery times stay blank until chosen and clear without setting a default',()=>{
 const p=picker();assert.equal(p.value(),'');assert.equal(p.changes.length,0);assert.equal(p.hour().props.value,'');assert.equal(p.minute().props.disabled,true);assert.equal(p.button('AM').props.disabled,true);
 p.hour().props.onChange({target:{value:'7'}});assert.equal(p.value(),'07:00');assert.equal(p.minute().props.disabled,false);
 p.minute().props.onChange({target:{value:'22'}});assert.equal(p.value(),'07:22');
 p.button('Clear time').props.onClick();assert.equal(p.value(),'');assert.equal(p.minute().props.value,'');
});
test('12-hour controls preserve exact minutes and convert noon and midnight to API time',()=>{
 const p=picker('00:59');assert.equal(p.hour().props.value,12);assert.equal(p.minute().props.value,'59');assert.equal(p.button('AM').props['aria-pressed'],true);
 p.button('PM').props.onClick();assert.equal(p.value(),'12:59');p.button('AM').props.onClick();assert.equal(p.value(),'00:59');
 p.hour().props.onChange({target:{value:'11'}});p.button('PM').props.onClick();assert.equal(p.value(),'23:59');
 p.minute().props.onChange({target:{value:'01'}});assert.equal(p.value(),'23:01');
 assert.equal(p.minute().children.filter(n=>n?.type==='option'&&n.props.value!=='').length,60);
});
test('disabled delivery picker retains the saved time and disables its fieldset and period buttons',()=>{
 const p=picker('12:22',true);assert.equal(p.tree().props.disabled,true);assert.equal(p.button('PM').props['aria-pressed'],true);assert.equal(p.button('PM').props.disabled,true);assert.equal(p.button('Clear time').props.disabled,true);assert.equal(p.value(),'12:22');assert.equal(p.changes.length,0);
});
