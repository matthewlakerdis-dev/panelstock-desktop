const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'../cad/visual-editor.js'),'utf8');
function setup(){
 const buttons=['out','fit','in'].map(zoom=>({dataset:{zoom}})),handlers={},attributes={src:'old-url'},revoked=[];
 const c={sketchReady:false,sketchZoom:1,sketchFile:{},sketchUrl:'old-url',sketchRetry:{},sketchLoadStatus:{},reference:{querySelectorAll:()=>buttons},sketchScroll:{setAttribute(k,v){this[k]=v;},focus(){}},sketchImage:{addEventListener(k,v){handlers[k]=v;},getAttribute(k){return attributes[k];},removeAttribute(k){delete attributes[k];}},URL:{revokeObjectURL(url){revoked.push(url);},createObjectURL(){return 'new-url';}}};
 vm.createContext(c);
 vm.runInContext(source.slice(source.indexOf('function updateSketchControls('),source.indexOf('function zoomSketch(')),c);
 vm.runInContext(source.slice(source.indexOf('sketchRetry.onclick='),source.indexOf('const sketchZoomStatus=')),c);
 return {c,buttons,handlers,revoked};
}
test('loading disables controls and successful load restores available zoom actions',()=>{const {c,buttons,handlers}=setup();c.updateSketchControls();assert.ok(buttons.every(b=>b.disabled));handlers.load();assert.equal(c.sketchReady,true);assert.deepEqual(buttons.map(b=>b.disabled),[true,false,false]);c.sketchZoom=4;c.updateSketchControls();assert.deepEqual(buttons.map(b=>b.disabled),[false,false,true]);});
test('failure offers retry and retry reloads the source before controls re-enable',()=>{const {c,buttons,handlers,revoked}=setup();handlers.load();handlers.error();assert.equal(c.sketchReady,false);assert.equal(c.sketchRetry.hidden,false);assert.equal(c.sketchImage.hidden,true);assert.ok(buttons.every(b=>b.disabled));c.sketchRetry.onclick();assert.equal(c.sketchScroll['aria-busy'],'true');assert.equal(c.sketchRetry.hidden,true);assert.equal(c.sketchImage.src,'new-url');assert.deepEqual(revoked,['old-url']);assert.ok(buttons.every(b=>b.disabled));handlers.load();assert.equal(c.sketchImage.hidden,false);assert.equal(c.sketchLoadStatus.hidden,true);assert.equal(c.sketchScroll['aria-busy'],'false');assert.equal(buttons[2].disabled,false);});
