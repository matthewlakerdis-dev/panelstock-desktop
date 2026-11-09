const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync(require('node:path').join(__dirname,'../index.html'),'utf8'),start=html.indexOf('  function DeliveryTimePicker('),end=html.indexOf('  function ScheduleAvatar(',start);
const createElement=(type,props,...children)=>({type,props:props||{},children:children.flat(Infinity)}),walk=node=>!node||typeof node!=='object'?[]:[node,...(node.children||[]).flatMap(walk)];
function picker(initial='',disabled=false){
 let value=initial,cursor=0;const changes=[],hooks=[],context={import_react:{createElement},useEffect(){},useState(initial){const index=cursor++;if(!(index in hooks))hooks[index]=initial;return [hooks[index],next=>{hooks[index]=typeof next==='function'?next(hooks[index]):next;}];},useRef(initial){const index=cursor++;return hooks[index]||(hooks[index]={current:initial});}};
 const fn=vm.runInNewContext(html.slice(start,end)+';DeliveryTimePicker',context),tree=()=>{cursor=0;return fn({value,disabled,onChange:next=>{value=next;changes.push(next);}});},find=match=>walk(tree()).find(match),label=text=>find(n=>n.props['aria-label']===text),button=text=>find(n=>n.type==='button'&&n.children.includes(text)),dial=()=>find(n=>n.props.role==='slider');
 const key=key=>dial().props.onKeyDown({key,preventDefault(){},stopPropagation(){}}),point=(number,count)=>{const angle=number/count*Math.PI*2;return {pointerId:1,button:0,clientX:100+78*Math.sin(angle),clientY:100-78*Math.cos(angle),preventDefault(){},currentTarget:{getBoundingClientRect:()=>({left:0,top:0,width:200,height:200}),focus(){},setPointerCapture(){},releasePointerCapture(){}}};};
 return {tree,changes,value:()=>value,label,button,dial,key,open(){label('Choose delivery time').props.onClick();},tap(number,count){const event=point(number,count);dial().props.onPointerDown(event);dial().props.onPointerUp(event);},point};
}
test('opening an optional clock leaves time unset until an hour is picked and clearing removes it',()=>{
 const p=picker();p.open();assert.equal(p.value(),'');assert.equal(p.changes.length,0);assert.equal(p.dial().props['aria-label'],'Delivery hour clock');assert.equal(p.label('Choose delivery minute').props.disabled,true);
 const center=p.point(0,12);center.clientX=center.clientY=100;p.dial().props.onPointerDown(center);p.dial().props.onPointerUp(center);assert.equal(p.value(),'');assert.equal(p.dial().props['aria-label'],'Delivery hour clock');
 p.tap(7,12);assert.equal(p.value(),'07:00');assert.equal(p.dial().props['aria-label'],'Delivery minute clock');p.tap(22,60);assert.equal(p.value(),'07:22');p.button('Clear time').props.onClick();assert.equal(p.value(),'');assert.equal(p.dial(),undefined);
});
test('clock preserves exact minutes and converts noon and midnight to API time',()=>{
 const p=picker('00:59');p.open();assert.equal(p.button('AM').props['aria-pressed'],true);p.button('PM').props.onClick();assert.equal(p.value(),'12:59');p.button('AM').props.onClick();assert.equal(p.value(),'00:59');
 p.tap(11,12);p.button('PM').props.onClick();assert.equal(p.value(),'23:59');p.key('ArrowRight');assert.equal(p.value(),'23:00');p.label('Next minute').props.onClick();assert.equal(p.value(),'23:01');p.label('Previous minute').props.onClick();assert.equal(p.value(),'23:00');
});
test('hour dragging changes to minutes only on release and keyboard selection never submits the form',()=>{
 const p=picker('12:22');p.open();let event=p.point(3,12);p.dial().props.onPointerDown(event);assert.equal(p.value(),'15:22');assert.equal(p.dial().props['aria-label'],'Delivery hour clock');
 event=p.point(4,12);p.dial().props.onPointerMove(event);assert.equal(p.value(),'16:22');p.dial().props.onPointerUp(event);assert.equal(p.dial().props['aria-label'],'Delivery minute clock');p.key('PageUp');assert.equal(p.value(),'16:27');p.key('Home');assert.equal(p.value(),'16:00');p.key('End');assert.equal(p.value(),'16:59');p.key('Enter');assert.equal(p.dial(),undefined);
});
test('disabled delivery clock keeps its saved value and cannot expose the interactive dial',()=>{
 const p=picker('12:22',true);assert.equal(p.tree().props.disabled,true);assert.equal(p.label('Choose delivery time').props.disabled,true);assert.equal(p.button('Clear time').props.disabled,true);assert.equal(p.value(),'12:22');assert.equal(p.changes.length,0);assert.equal(p.dial(),undefined);
});
