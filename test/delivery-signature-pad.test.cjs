const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'../index.html'),'utf8');
const padSource=source.slice(source.indexOf('  function mountDeliveryPad('),source.indexOf('\n  const deliveryTotals=',source.indexOf('  function mountDeliveryPad('))).trim();
function harness(pointer=true){
 const handlers=new Map(),changes=[],images=[];let blocked=false,strokes=0,restores=0;
 const node=()=>({addEventListener(type,fn){handlers.set(this.name+type,fn);},removeEventListener(type){handlers.delete(this.name+type);}});
 const window={...node(),name:'window',PointerEvent:pointer?function(){}:undefined};
 const ctx={fillRect(){},beginPath(){},moveTo(){},lineTo(){},stroke(){strokes++;},drawImage(){restores++;}};
 const canvas={...node(),name:'canvas',getContext:()=>ctx,getBoundingClientRect:()=>({left:0,top:0,width:900,height:300}),toDataURL:()=> 'data:image/png;base64,aW5r'};
 const context={window,Image:class{constructor(){images.push(this);}},canvas,onChange:value=>changes.push(value),disabled:()=>blocked};vm.createContext(context);
 const pad=vm.runInContext(padSource+';mountDeliveryPad(canvas,{onChange,disabled});',context);
 const emit=(type,x,y,node='canvas',extra={})=>handlers.get(node+type)?.({type,clientX:x,clientY:y,pointerId:7,button:0,preventDefault(){},...extra});
 return {pad,changes,images,handlers,emit,block:()=>blocked=true,strokes:()=>strokes,restores:()=>restores};
}
test('signature pad requires movement and publishes once per stroke; clear and destroy remove the signature and listeners',()=>{
 const h=harness();h.emit('pointerdown',20,20);h.emit('pointerup',20,20);assert.deepEqual(h.changes,[]);
 h.emit('pointerdown',20,20);h.emit('pointermove',60,40);h.emit('pointerup',90,50);assert.equal(h.changes.length,1);assert.ok(h.strokes()>0);
 h.pad.clear();assert.equal(h.changes.at(-1),'');h.pad.destroy();assert.equal(h.handlers.size,0);
});
test('a disabled pad cannot publish a pending stroke; late image loads cannot restore cleared or destroyed signatures',()=>{
 const h=harness();h.emit('pointerdown',10,10);h.emit('pointermove',50,30);h.block();h.emit('pointerup',80,40);assert.deepEqual(h.changes,[]);
 h.pad.setValue('data:image/png;base64,aW5r');h.pad.clear(false);h.images[0].onload();assert.equal(h.restores(),0);
 h.pad.setValue('data:image/png;base64,aW5r');h.pad.destroy();h.images[1].onload();assert.equal(h.restores(),0);
});
test('older phones use touch signing and mouse fallback without PointerEvent',()=>{
 const h=harness(false);const touch=(x,y)=>({changedTouches:[{identifier:1,clientX:x,clientY:y}]});
 h.emit('touchstart',0,0,'canvas',touch(10,10));h.emit('touchmove',0,0,'canvas',touch(70,40));h.emit('touchend',0,0,'canvas',touch(90,50));assert.equal(h.changes.length,1);
 h.emit('mousedown',20,20);h.emit('mousemove',80,40,'window');h.emit('mouseup',90,50,'window');assert.equal(h.changes.length,2);h.pad.destroy();assert.equal(h.handlers.size,0);
});
